export interface Env {
  USER_QUEUES: DurableObjectNamespace<UserQueue>;
  DB: D1Database;
  humanlink_media: R2Bucket;
  MAX_SKEW_MS?: string;
  DEV_NOAUTH?: string;
}

type Json = Record<string, unknown>;

// Simple helpers
const json = (data: Json, init: ResponseInit = {}) =>
  new Response(JSON.stringify(data), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
    ...init,
  });

const bad = (msg: string, status = 400) => json({ ok: false, error: msg }, { status });

// Very small Ed25519 verification using WebCrypto Subtle (expects hex strings)
async function verifyEd25519Hex(
  publicKeyHex: string,
  message: string,
  signatureHex: string,
): Promise<boolean> {
  try {
    const publicKeyBytes = hexToBytes(publicKeyHex);
    const signatureBytes = hexToBytes(signatureHex);
    // Try standard WebCrypto first, then Node polyfill name if enabled
    let key: CryptoKey | null = null;
    try {
      key = await crypto.subtle.importKey(
        'raw',
        publicKeyBytes,
        { name: 'Ed25519' } as any,
        false,
        ['verify'],
      );
      const ok = await crypto.subtle.verify('Ed25519', key, signatureBytes, new TextEncoder().encode(message));
      return !!ok;
    } catch {}
    // Fallback for nodejs_compat
    key = await crypto.subtle.importKey(
      'raw',
      publicKeyBytes,
      { name: 'NODE-ED25519', namedCurve: 'NODE-ED25519' } as any,
      false,
      ['verify'],
    );
    const ok = await crypto.subtle.verify('NODE-ED25519', key, signatureBytes, new TextEncoder().encode(message));
    return !!ok;
  } catch (e) {
    return false;
  }
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) throw new Error('bad hex');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) out[i / 2] = parseInt(clean.slice(i, i + 2), 16);
  return out;
}

function nowMs() {
  return Date.now();
}

// Durable Object: per-user ordered queue
export class UserQueue {
  state: DurableObjectState;
  storage: DurableObjectStorage;

  constructor(state: DurableObjectState, _env: Env) {
    this.state = state;
    this.storage = state.storage;
  }

  // POST /enqueue -> append message, returns receipt id
  async enqueue(body: any) {
    const id = crypto.randomUUID();
    const cursor = (await this.storage.get<number>('cursor')) || 0;
    const next = cursor + 1;
    await this.storage.put(`msg:${next}`, {
      id,
      n: next,
      t: nowMs(),
      payload: body,
    });
    await this.storage.put('cursor', next);
    return { id, n: next };
  }

  // GET /queue?from=N -> list up to 100
  async list(from: number) {
    const list = await this.storage.list({ start: `msg:${from}`, end: `msg:${from + 1000}` });
    const msgs: any[] = [];
    for (const [_k, v] of list) msgs.push(v);
    msgs.sort((a, b) => a.n - b.n);
    return msgs.slice(0, 100);
  }

  // POST /ack -> deletes up to n
  async ack(n: number) {
    const list = await this.storage.list({ start: `msg:1`, end: `msg:${n}` });
    const keys = [...list.keys()];
    await this.storage.delete(keys);
    return { deleted: keys.length };
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === 'POST' && url.pathname.endsWith('/enqueue')) {
      const body = await req.json();
      const res = await this.enqueue(body);
      return json({ ok: true, ...res });
    }
    if (req.method === 'GET' && url.pathname.endsWith('/queue')) {
      const from = Number(url.searchParams.get('from') || '1');
      const msgs = await this.list(from);
      return json({ ok: true, items: msgs, next: msgs.at(-1)?.n ? msgs.at(-1).n + 1 : from });
    }
    if (req.method === 'POST' && url.pathname.endsWith('/ack')) {
      const { n } = await req.json();
      const res = await this.ack(Number(n || 0));
      return json({ ok: true, ...res });
    }
    return bad('Not found', 404);
  }
}

async function withAuth(req: Request, env: Env): Promise<{ ok: true } | Response> {
  if (env.DEV_NOAUTH === '1') {
    return { ok: true } as const;
  }
  // Minimal signature check: headers x-pk, x-sig, x-ts; body hash = SHA-256(JSON)
  const pk = req.headers.get('x-pk');
  const sig = req.headers.get('x-sig');
  const ts = req.headers.get('x-ts');
  if (!pk || !sig || !ts) return bad('missing auth headers');
  const maxSkew = Number(env.MAX_SKEW_MS || '90000');
  const skew = Math.abs(Date.now() - Number(ts));
  if (!Number.isFinite(skew) || skew > maxSkew) return bad('timestamp skew');
  const bodyText = req.method === 'GET' ? '' : await req.clone().text();
  const ok = await verifyEd25519Hex(pk, `${ts}\n${bodyText}`, sig);
  if (!ok) return bad('invalid signature', 401);
  return { ok: true } as const;
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);

    // Health
    if (url.pathname === '/' && req.method === 'GET') return json({ ok: true, service: 'humanlink-relay' });

    // Register public keys (stores in D1). Body: { uidHash, ed25519, x25519 }
    if (url.pathname === '/register' && req.method === 'POST') {
      const auth = await withAuth(req, env);
      if (!(auth as any).ok) return auth as Response;
      const body = await req.json<any>();
      if (!body?.uidHash || !body?.ed25519 || !body?.x25519) return bad('missing fields');
      await env.DB.prepare(
        `INSERT OR REPLACE INTO users_public(uid_hash, ed25519, x25519, updated_at)
         VALUES(?, ?, ?, strftime('%s','now'))`,
      ).bind(body.uidHash, body.ed25519, body.x25519).run();
      return json({ ok: true });
    }

    // Route to a recipient's queue DO: /u/:uidHash/enqueue|queue|ack
    if (url.pathname.startsWith('/u/')) {
      const [_blank, _u, uidHash, action] = url.pathname.split('/');
      if (!uidHash) return bad('uid required');
      const id = env.USER_QUEUES.idFromName(uidHash);
      const stub = env.USER_QUEUES.get(id);
      return stub.fetch(new Request(new URL(`https://do.local/${action}`, req.url).toString(), req));
    }

    // D1: invites
    if (url.pathname === '/invites/accept' && req.method === 'POST') {
      const auth = await withAuth(req, env);
      if (!(auth as any).ok) return auth as Response;
      const { code, uidHash } = await req.json<any>();
      if (!code || !uidHash) return bad('missing');
      const row = await env.DB.prepare('SELECT code, used_by FROM invites WHERE code = ?').bind(code).first();
      if (!row || (row as any).used_by) return bad('invalid_or_used', 400);
      await env.DB.batch([
        env.DB.prepare("UPDATE invites SET used_by = ?, used_at = strftime('%s','now') WHERE code = ?").bind(uidHash, code),
      ]);
      return json({ ok: true });
    }

    // R2 media upload: PUT /media/:key with encrypted blob
    if (url.pathname.startsWith('/media/') && req.method === 'PUT') {
      const auth = await withAuth(req, env);
      if (!(auth as any).ok) return auth as Response;
      const key = url.pathname.slice('/media/'.length);
      if (!key) return bad('key required');
      await env.humanlink_media.put(key, req.body as ReadableStream);
      return json({ ok: true, key });
    }

    return bad('not found', 404);
  },
};



// Supabase Edge Function: relay
// Routes via query param ?route=register|accept_invite|enqueue|queue|ack|media_presign

export const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type,x-pk,x-sig,x-ts',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
};

const json = (data: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(data), {
    headers: { 'content-type': 'application/json', ...cors },
    ...init,
  });

async function verifyEd25519Hex(pkHex: string, msg: string, sigHex: string): Promise<boolean> {
  const clean = (h: string) => (h.startsWith('0x') ? h.slice(2) : h);
  const hexToBytes = (hex: string) => new Uint8Array(hex.match(/.{1,2}/g)!.map((b) => parseInt(b, 16)));
  try {
    const pk = await crypto.subtle.importKey('raw', hexToBytes(clean(pkHex)), { name: 'Ed25519' } as any, false, [
      'verify',
    ]);
    const sig = hexToBytes(clean(sigHex));
    const ok = await crypto.subtle.verify('Ed25519', pk, sig, new TextEncoder().encode(msg));
    return !!ok;
  } catch {
    return false;
  }
}

type Supa = Awaited<ReturnType<typeof importSupa>>;
async function importSupa() {
  const mod = await import('https://esm.sh/@supabase/supabase-js@2');
  // Prefer non-reserved env names to avoid CLI skipping (no SUPABASE_ prefix)
  const url =
    Deno.env.get('PROJECT_URL') ||
    Deno.env.get('RELAY_SUPABASE_URL') ||
    Deno.env.get('SUPABASE_URL');
  const key =
    Deno.env.get('SERVICE_ROLE_KEY') ||
    Deno.env.get('RELAY_SERVICE_ROLE_KEY') ||
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) {
    throw new Error('Missing PROJECT_URL/SERVICE_ROLE_KEY for Supabase client');
  }
  return mod.createClient(url, key);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

  const url = new URL(req.url);
  const route = url.searchParams.get('route');
  const devBypass = Deno.env.get('DEV_NOAUTH') === '1';

  async function requireSig(): Promise<Response | null> {
    if (devBypass) return null;
    const ts = req.headers.get('x-ts');
    const pk = req.headers.get('x-pk');
    const sig = req.headers.get('x-sig');
    if (!ts || !pk || !sig) return json({ ok: false, error: 'missing auth headers' }, { status: 400 });
    // Basic timestamp skew enforcement
    const now = Date.now();
    const skewMs = Number(Deno.env.get('MAX_SKEW_MS') || '90000');
    const tsNum = Number(ts);
    if (!Number.isFinite(tsNum)) return json({ ok:false, error:'invalid timestamp' }, { status:400 });
    if (Math.abs(now - tsNum) > Math.max(0, skewMs)) return json({ ok:false, error:'timestamp_skew' }, { status:401 });
    const bodyText = req.method === 'GET' ? '' : await req.clone().text();
    const ok = await verifyEd25519Hex(pk, `${ts}\n${bodyText}`, sig);
    if (!ok) return json({ ok: false, error: 'invalid signature' }, { status: 401 });
    return null;
  }

  const supa = await importSupa();

  if (route === 'register' && req.method === 'POST') {
    const guard = await requireSig();
    if (guard) return guard;
    const { ed25519, x25519, uidHash } = await req.json();
    const pkHeader = req.headers.get('x-pk') || undefined;
    const key = uidHash || pkHeader; // prefer body if provided during DEV_NOAUTH
    if (!key || !ed25519 || !x25519) return json({ ok: false, error: 'missing' }, { status: 400 });
    const { error } = await supa.from('users_public').upsert({ uid_hash: key, ed25519, x25519 });
    if (error) return json({ ok: false, error: error.message }, { status: 500 });
    return json({ ok: true });
  }

  if (route === 'accept_invite' && req.method === 'POST') {
    const guard = await requireSig();
    if (guard) return guard;
    const { code, uidHash } = await req.json();
    const pkHeader = req.headers.get('x-pk') || undefined;
    const key = uidHash || pkHeader;
    if (!code || !key) return json({ ok: false, error: 'missing' }, { status: 400 });
    // Mark invite used
    const { error } = await supa.rpc('accept_invite', { p_code: code, p_uid_hash: key });
    if (error) return json({ ok: false, error: error.message }, { status: 400 });
    // Fetch created_by to auto-connect both users via contacts
    const row = await supa.from('invites').select('created_by, used_by').eq('code', code).single();
    const createdBy = row.data?.created_by as string | undefined;
    const usedBy = row.data?.used_by as string | undefined;
    if (createdBy && usedBy) {
      await supa.from('contacts').upsert({ owner_uid_hash: createdBy, peer_uid_hash: usedBy });
      await supa.from('contacts').upsert({ owner_uid_hash: usedBy, peer_uid_hash: createdBy });
    }
    return json({ ok: true });
  }

  if (route === 'enqueue' && req.method === 'POST') {
    const guard = await requireSig();
    if (guard) return guard;
    const { to, payload } = await req.json();
    const pkHeader = req.headers.get('x-pk') || undefined;
    const recipient = to || pkHeader;
    if (!recipient || !payload) return json({ ok: false, error: 'missing' }, { status: 400 });
    const { data, error } = await supa.rpc('enqueue_message', { p_recipient: recipient, p_payload: payload });
    if (error) return json({ ok: false, error: error.message }, { status: 500 });
    return json({ ok: true, n: data });
  }

  if (route === 'queue' && req.method === 'GET') {
    const guard = await requireSig();
    if (guard) return guard;
    const to = url.searchParams.get('to') || req.headers.get('x-pk') || '';
    const from = Number(url.searchParams.get('from') || '1');
    if (!to) return json({ ok: false, error: 'missing to' }, { status: 400 });
    const { data, error } = await supa.rpc('fetch_queue', { p_recipient: to, p_from: from });
    if (error) return json({ ok: false, error: error.message }, { status: 500 });
    const next = data?.length ? data[data.length - 1].n + 1 : from;
    return json({ ok: true, items: data ?? [], next });
  }

  if (route === 'ack' && req.method === 'POST') {
    const guard = await requireSig();
    if (guard) return guard;
    const { to, n } = await req.json();
    const pkHeader = req.headers.get('x-pk') || undefined;
    const recipient = to || pkHeader;
    if (!recipient || typeof n !== 'number') return json({ ok: false, error: 'missing' }, { status: 400 });
    const { data, error } = await supa.rpc('ack_queue', { p_recipient: recipient, p_upto: n });
    if (error) return json({ ok: false, error: error.message }, { status: 500 });
    return json({ ok: true, deleted: data });
  }

  if (route === 'media_presign' && req.method === 'POST') {
    const guard = await requireSig();
    if (guard) return guard;
    const { key } = await req.json();
    if (!key) return json({ ok: false, error: 'missing key' }, { status: 400 });
    const sb = supa.storage.from('media');
    const { data, error } = await sb.createSignedUploadUrl(key);
    if (error) return json({ ok: false, error: error.message }, { status: 500 });
    return json({ ok: true, url: data.signedUrl, token: data.token });
  }

  // Admin-only: generate Base32 invite codes
  if (route === 'invites_generate' && req.method === 'POST') {
    const adminToken = req.headers.get('x-admin-token');
    const expected = Deno.env.get('ADMIN_TOKEN');
    if (!expected || adminToken !== expected) {
      return json({ ok: false, error: 'unauthorized' }, { status: 401 });
    }
    const { createdBy, count = 1, bytes = 10, prefix = '' } = await req.json();
    const pkHeader = req.headers.get('x-pk') || undefined;
    const creator = createdBy || pkHeader;
    if (!creator) return json({ ok: false, error: 'missing createdBy' }, { status: 400 });

    const codes: Array<{ code: string; created_by: string }> = [];
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    const b32encode = (arr: Uint8Array) => {
      let bits = 0, value = 0, out = '';
      for (const byte of arr) {
        value = (value << 8) | byte; bits += 8;
        while (bits >= 5) { out += alphabet[(value >>> (bits - 5)) & 31]; bits -= 5; }
      }
      if (bits > 0) out += alphabet[(value << (5 - bits)) & 31];
      return out;
    };
    for (let i = 0; i < Math.max(1, Math.min(1000, Number(count))); i++) {
      const buf = new Uint8Array(Math.max(6, Math.min(32, Number(bytes))));
      crypto.getRandomValues(buf);
      let code = b32encode(buf);
      // Trim/pad to 16 chars for consistency
      if (code.length > 16) code = code.slice(0, 16);
      while (code.length < 16) code += 'A';
      codes.push({ code: `${prefix}${code}`, created_by: creator });
    }
    const { data, error } = await supa.from('invites').insert(codes).select('code');
    if (error) return json({ ok: false, error: error.message }, { status: 500 });
    return json({ ok: true, codes: (data || []).map((d: any) => d.code) });
  }

  // Profiles: get current user's profile
  if (route === 'profile_get' && req.method === 'GET') {
    const guard = await requireSig();
    if (guard) return guard;
    const uid = url.searchParams.get('uid') || req.headers.get('x-pk') || '';
    if (!uid) return json({ ok: false, error: 'missing uid' }, { status: 400 });
    const { data, error } = await supa.from('profiles').select('uid_hash, display_name, avatar_url, bio, favorites_books, favorites_movies, favorites_music').eq('uid_hash', uid).single();
    if (error && error.code !== 'PGRST116') return json({ ok: false, error: error.message }, { status: 500 });
    // Fetch users_public.updated_at (seconds) as a fallback joined_at
    const up = await supa.from('users_public').select('updated_at').eq('uid_hash', uid).single();
    let joined_at: string | null = null;
    const sec = (up.data as any)?.updated_at;
    if (typeof sec === 'number') joined_at = new Date(sec * 1000).toISOString();
    return json({ ok: true, profile: data || null, joined_at });
  }

  // Profiles: update current user's profile (display_name, avatar_url)
  if (route === 'profile_update' && req.method === 'POST') {
    const guard = await requireSig();
    if (guard) return guard;
    const uid = req.headers.get('x-pk') || '';
    if (!uid) return json({ ok: false, error: 'missing uid' }, { status: 400 });
    const { display_name, avatar_url, bio, favorites_books, favorites_movies, favorites_music } = await req.json();
    const payload: Record<string, unknown> = { uid_hash: uid };
    if (typeof display_name === 'string') payload.display_name = display_name;
    if (typeof avatar_url === 'string') payload.avatar_url = avatar_url;
    if (typeof bio === 'string') payload.bio = bio;
    if (typeof favorites_books === 'string') payload.favorites_books = favorites_books;
    if (typeof favorites_movies === 'string') payload.favorites_movies = favorites_movies;
    if (typeof favorites_music === 'string') payload.favorites_music = favorites_music;
    const { data, error } = await supa.from('profiles').upsert(payload).select('uid_hash, display_name, avatar_url').single();
    if (error) return json({ ok: false, error: error.message }, { status: 500 });
    return json({ ok: true, profile: data });
  }

  // Events: create/list/rsvp
  async function checkRate(uid: string, key: string, limit: number): Promise<boolean> {
    try {
      const now = new Date();
      const { data, error } = await (await importSupa()).rpc('rate_limit_increment', { p_uid: uid, p_key: key, p_window: now.toISOString(), p_limit: limit });
      if (error) return true; // fail-open in alpha
      return data as unknown as boolean;
    } catch { return true; }
  }

  if (route === 'events_create' && req.method === 'POST') {
    const guard = await requireSig(); if (guard) return guard;
    const owner = req.headers.get('x-pk') || '';
    if (!(await checkRate(owner, 'events_create', 60))) return json({ ok:false, error:'rate_limited' }, { status:429 });
    const { title, event_time, location, description } = await req.json();
    const { data, error } = await supa.from('events').insert({ owner_uid_hash: owner, title, event_time, location, description }).select('id').single();
    if (error) return json({ ok:false, error:error.message }, { status:500 });
    return json({ ok:true, event: data });
  }
  if (route === 'events_list' && req.method === 'GET') {
    const guard = await requireSig(); if (guard) return guard;
    const uid = req.headers.get('x-pk') || '';
    const { data, error } = await supa
      .from('events')
      .select('id, owner_uid_hash, title, event_time, location, description')
      .or(`owner_uid_hash.eq.${uid}`);
    if (error) return json({ ok:false, error:error.message }, { status:500 });
    return json({ ok:true, events: data || [] });
  }
  if (route === 'events_rsvp' && req.method === 'POST') {
    const guard = await requireSig(); if (guard) return guard;
    const uid = req.headers.get('x-pk') || '';
    const { event_id, status } = await req.json();
    const { error } = await supa.from('event_rsvps').upsert({ event_id, uid_hash: uid, status });
    if (error) return json({ ok:false, error:error.message }, { status:500 });
    return json({ ok:true });
  }

  // Events: invitations
  if (route === 'events_invite' && req.method === 'POST') {
    const guard = await requireSig(); if (guard) return guard;
    const inviter = req.headers.get('x-pk') || '';
    const { event_id, recipient_uid_hash } = await req.json();
    if (!event_id || !recipient_uid_hash) return json({ ok:false, error:'missing' }, { status:400 });
    const { error } = await supa.from('event_invites').upsert({ event_id, recipient_uid_hash, inviter_uid_hash: inviter, status:'pending' });
    if (error) return json({ ok:false, error:error.message }, { status:500 });
    return json({ ok:true });
  }
  if (route === 'event_invites_incoming' && req.method === 'GET') {
    const guard = await requireSig(); if (guard) return guard;
    const uid = req.headers.get('x-pk') || '';
    const { data, error } = await supa
      .from('event_invites')
      .select('event_id, status, created_at, events: event_id (title, event_time, location, description)')
      .eq('recipient_uid_hash', uid)
      .eq('status','pending');
    if (error) return json({ ok:false, error:error.message }, { status:500 });
    return json({ ok:true, invites: data || [] });
  }

  if (route === 'event_invites_outgoing' && req.method === 'GET') {
    const guard = await requireSig(); if (guard) return guard;
    const uid = req.headers.get('x-pk') || '';
    const { data, error } = await supa
      .from('event_invites')
      .select('event_id, status, created_at, events: event_id (title, event_time, location, description)')
      .eq('inviter_uid_hash', uid)
      .eq('status','pending');
    if (error) return json({ ok:false, error:error.message }, { status:500 });
    return json({ ok:true, invites: data || [] });
  }
  if (route === 'event_invite_cancel' && req.method === 'POST') {
    const guard = await requireSig(); if (guard) return guard;
    const uid = req.headers.get('x-pk') || '';
    const { event_id, recipient_uid_hash } = await req.json();
    if (!event_id || !recipient_uid_hash) return json({ ok:false, error:'missing' }, { status:400 });
    const { error } = await supa
      .from('event_invites')
      .delete()
      .eq('event_id', event_id)
      .eq('inviter_uid_hash', uid)
      .eq('recipient_uid_hash', recipient_uid_hash)
      .eq('status','pending');
    if (error) return json({ ok:false, error:error.message }, { status:500 });
    return json({ ok:true });
  }

  // Albums: create, add photos, list
  if (route === 'albums_create' && req.method === 'POST') {
    const guard = await requireSig(); if (guard) return guard;
    const owner = req.headers.get('x-pk') || '';
    const { name } = await req.json();
    const { data, error } = await supa.from('albums').insert({ owner_uid_hash: owner, name }).select('id').single();
    if (error) return json({ ok:false, error:error.message }, { status:500 });
    return json({ ok:true, album: data });
  }
  if (route === 'albums_add_photo' && req.method === 'POST') {
    const guard = await requireSig(); if (guard) return guard;
    const { album_id, url, tagged } = await req.json();
    const { data, error } = await supa.from('album_photos').insert({ album_id, url }).select('id').single();
    if (error) return json({ ok:false, error:error.message }, { status:500 });
    if (Array.isArray(tagged) && tagged.length) {
      await supa.from('photo_tags').insert(tagged.map((t: string)=>({ photo_id: data.id, tagged_uid_hash: t })));
    }
    return json({ ok:true, photo: data });
  }
  if (route === 'albums_list' && req.method === 'GET') {
    const guard = await requireSig(); if (guard) return guard;
    const owner = req.headers.get('x-pk') || '';
    const { data, error } = await supa
      .from('albums')
      .select('id, name, created_at, album_photos(id, url, created_at)')
      .eq('owner_uid_hash', owner)
      .order('created_at', { ascending:false });
    if (error) return json({ ok:false, error:error.message }, { status:500 });
    return json({ ok:true, albums: data || [] });
  }

  // Status updates
  if (route === 'status_create' && req.method === 'POST') {
    const guard = await requireSig(); if (guard) return guard;
    const uid = req.headers.get('x-pk') || '';
    if (!(await checkRate(uid, 'status_create', 120))) return json({ ok:false, error:'rate_limited' }, { status:429 });
    const { content, visibility = 'contacts' } = await req.json();
    const { data, error } = await supa.from('status_updates').insert({ uid_hash: uid, content, visibility }).select('id, created_at').single();
    if (error) return json({ ok:false, error:error.message }, { status:500 });
    return json({ ok:true, status: data });
  }
  if (route === 'status_list' && req.method === 'GET') {
    const guard = await requireSig(); if (guard) return guard;
    const uid = req.headers.get('x-pk') || '';
    const { data, error } = await supa
      .from('status_updates')
      .select('id, uid_hash, content, created_at, profiles:uid_hash(display_name, avatar_url)')
      .or(`uid_hash.eq.${uid}`)
      .order('created_at', { ascending:false })
      .limit(50);
    if (error) return json({ ok:false, error:error.message }, { status:500 });
    return json({ ok:true, items: data || [] });
  }

  // Status list for an arbitrary uid (deep-link profile wall)
  if (route === 'status_list_for' && req.method === 'GET') {
    const guard = await requireSig(); if (guard) return guard;
    const viewer = req.headers.get('x-pk') || '';
    const target = url.searchParams.get('uid') || '';
    if (!target) return json({ ok:false, error:'missing uid' }, { status:400 });
    let isContact = false;
    if (viewer && target && viewer !== target) {
      const c = await supa.from('contacts').select('peer_uid_hash').eq('owner_uid_hash', viewer).eq('peer_uid_hash', target).single();
      if (!c.error && c.data) isContact = true;
    }
    const { data, error } = await supa
      .from('status_updates')
      .select('id, uid_hash, content, visibility, created_at, profiles:uid_hash(display_name, avatar_url)')
      .eq('uid_hash', target)
      .order('created_at', { ascending:false })
      .limit(50);
    if (error) return json({ ok:false, error:error.message }, { status:500 });
    const filtered = (data || []).filter((r: any) => (
      r.uid_hash === viewer ? true : (r.visibility === 'public' || (r.visibility === 'contacts' && isContact))
    ));
    return json({ ok:true, items: filtered });
  }

  // Status feed: self + contacts (respect visibility)
  if (route === 'status_feed' && req.method === 'GET') {
    const guard = await requireSig(); if (guard) return guard;
    const uid = req.headers.get('x-pk') || '';
    // Fetch contacts first
    const contactsRes = await supa
      .from('contacts')
      .select('peer_uid_hash')
      .eq('owner_uid_hash', uid);
    if (contactsRes.error) return json({ ok:false, error: contactsRes.error.message }, { status:500 });
    const peers: string[] = (contactsRes.data || []).map((c: any) => c.peer_uid_hash);
    const ids = Array.from(new Set([uid, ...peers]));
    if (ids.length === 0) return json({ ok:true, items: [] });
    const offset = Math.max(0, Number(url.searchParams.get('offset') || '0'));
    const limit = Math.max(1, Math.min(100, Number(url.searchParams.get('limit') || '50')));
    const { data, error } = await supa
      .from('status_updates')
      .select('id, uid_hash, content, visibility, created_at, profiles:uid_hash(display_name, avatar_url)')
      .in('uid_hash', ids)
      .order('created_at', { ascending:false })
      .range(offset, offset + limit - 1);
    if (error) return json({ ok:false, error:error.message }, { status:500 });
    const filtered = (data || []).filter((row: any) => row.uid_hash === uid || row.visibility !== 'private').slice(0, 50);
    const next_offset = offset + (data?.length || 0);
    return json({ ok:true, items: filtered, next_offset });
  }

  // Contact requests
  if (route === 'contact_request_send' && req.method === 'POST') {
    const guard = await requireSig(); if (guard) return guard;
    const requester = req.headers.get('x-pk') || '';
    if (!(await checkRate(requester, 'contact_request_send', 60))) return json({ ok:false, error:'rate_limited' }, { status:429 });
    const { recipient_uid_hash } = await req.json();
    const { error } = await supa.from('contact_requests').insert({ requester_uid_hash: requester, recipient_uid_hash });
    if (error) return json({ ok:false, error:error.message }, { status:500 });
    return json({ ok:true });
  }
  if (route === 'contact_requests_incoming' && req.method === 'GET') {
    const guard = await requireSig(); if (guard) return guard;
    const uid = req.headers.get('x-pk') || '';
    const { data, error } = await supa
      .from('contact_requests')
      .select('id, requester_uid_hash, status, created_at, profiles:requester_uid_hash(display_name, avatar_url)')
      .eq('recipient_uid_hash', uid)
      .eq('status','pending');
    if (error) return json({ ok:false, error:error.message }, { status:500 });
    return json({ ok:true, requests: data || [] });
  }
  if (route === 'contact_requests_outgoing' && req.method === 'GET') {
    const guard = await requireSig(); if (guard) return guard;
    const uid = req.headers.get('x-pk') || '';
    const { data, error } = await supa
      .from('contact_requests')
      .select('id, recipient_uid_hash, status, created_at, profiles:recipient_uid_hash(display_name, avatar_url)')
      .eq('requester_uid_hash', uid)
      .eq('status','pending');
    if (error) return json({ ok:false, error:error.message }, { status:500 });
    return json({ ok:true, requests: data || [] });
  }
  if (route === 'contact_request_cancel' && req.method === 'POST') {
    const guard = await requireSig(); if (guard) return guard;
    const uid = req.headers.get('x-pk') || '';
    const { id } = await req.json();
    if (!id) return json({ ok:false, error:'missing id' }, { status:400 });
    const { error } = await supa
      .from('contact_requests')
      .delete()
      .eq('id', id)
      .eq('requester_uid_hash', uid)
      .eq('status','pending');
    if (error) return json({ ok:false, error:error.message }, { status:500 });
    return json({ ok:true });
  }
  if (route === 'contact_request_accept' && req.method === 'POST') {
    const guard = await requireSig(); if (guard) return guard;
    const uid = req.headers.get('x-pk') || '';
    const { id } = await req.json();
    const { data, error } = await supa.from('contact_requests').update({ status:'accepted', updated_at: new Date().toISOString() }).eq('id', id).select('requester_uid_hash, recipient_uid_hash').single();
    if (error) return json({ ok:false, error:error.message }, { status:500 });
    // add both directions to contacts
    await supa.from('contacts').upsert({ owner_uid_hash: data.requester_uid_hash, peer_uid_hash: data.recipient_uid_hash });
    await supa.from('contacts').upsert({ owner_uid_hash: data.recipient_uid_hash, peer_uid_hash: data.requester_uid_hash });
    return json({ ok:true });
  }

  // Avatars: direct upload via function (expects raw body). Bucket 'avatars' should be PUBLIC for simple display.
  if (route === 'avatar_upload' && req.method === 'PUT') {
    const guard = await requireSig();
    if (guard) return guard;
    const uid = req.headers.get('x-pk') || '';
    const filename = url.searchParams.get('filename') || 'avatar.jpg';
    if (!uid) return json({ ok: false, error: 'missing uid' }, { status: 400 });
    const path = `${uid}/${filename}`;
    const contentType = req.headers.get('content-type') || 'application/octet-stream';
    const sb = supa.storage.from('avatars');
    const { error } = await sb.upload(path, req.body as ReadableStream, { contentType, upsert: true });
    if (error) return json({ ok: false, error: error.message }, { status: 500 });
    const base = Deno.env.get('PROJECT_URL') || Deno.env.get('SUPABASE_URL') || '';
    const publicUrl = `${base}/storage/v1/object/public/avatars/${encodeURIComponent(path)}`;
    return json({ ok: true, url: publicUrl, path });
  }

  // Contacts: list
  if (route === 'contacts_list' && req.method === 'GET') {
    const guard = await requireSig(); if (guard) return guard;
    const uid = req.headers.get('x-pk') || '';
    const { data, error } = await supa
      .from('contacts')
      .select('peer_uid_hash, nickname, profiles:peer_uid_hash(display_name, avatar_url)')
      .eq('owner_uid_hash', uid);
    if (error) return json({ ok: false, error: error.message }, { status: 500 });
    return json({ ok: true, contacts: data || [] });
  }

  // Contacts: search within circle
  if (route === 'contacts_search' && req.method === 'GET') {
    const guard = await requireSig(); if (guard) return guard;
    const uid = req.headers.get('x-pk') || '';
    const q = (url.searchParams.get('q') || '').toLowerCase();
    const { data, error } = await supa
      .from('contacts')
      .select('peer_uid_hash, nickname, profiles:peer_uid_hash(display_name, avatar_url)')
      .eq('owner_uid_hash', uid);
    if (error) return json({ ok:false, error:error.message }, { status:500 });
    const filtered = (data || []).filter((c: any) => {
      const name = (c.profiles?.display_name || c.nickname || '').toLowerCase();
      return q ? (name.includes(q) || c.peer_uid_hash.toLowerCase().includes(q)) : true;
    });
    return json({ ok:true, contacts: filtered });
  }

  // Profiles: global search by display_name (alpha, simple ILIKE)
  if (route === 'profiles_search' && req.method === 'GET') {
    const guard = await requireSig(); if (guard) return guard;
    const q = (url.searchParams.get('q') || '').trim();
    if (!q) return json({ ok:true, profiles: [] });
    const { data, error } = await supa
      .from('profiles')
      .select('uid_hash, display_name, avatar_url')
      .ilike('display_name', `%${q}%`)
      .limit(20);
    if (error) return json({ ok:false, error:error.message }, { status:500 });
    return json({ ok:true, profiles: data || [] });
  }

  // Contacts: add
  if (route === 'contacts_add' && req.method === 'POST') {
    const guard = await requireSig(); if (guard) return guard;
    const uid = req.headers.get('x-pk') || '';
    const { peer_uid_hash, nickname } = await req.json();
    if (!peer_uid_hash) return json({ ok: false, error: 'missing peer_uid_hash' }, { status: 400 });
    const { error } = await supa.from('contacts').upsert({ owner_uid_hash: uid, peer_uid_hash, nickname });
    if (error) return json({ ok: false, error: error.message }, { status: 500 });
    return json({ ok: true });
  }

  // Contacts: remove
  if (route === 'contacts_remove' && req.method === 'POST') {
    const guard = await requireSig(); if (guard) return guard;
    const uid = req.headers.get('x-pk') || '';
    const { peer_uid_hash } = await req.json();
    if (!peer_uid_hash) return json({ ok: false, error: 'missing peer_uid_hash' }, { status: 400 });
    const { error } = await supa.from('contacts').delete().eq('owner_uid_hash', uid).eq('peer_uid_hash', peer_uid_hash);
    if (error) return json({ ok: false, error: error.message }, { status: 500 });
    return json({ ok: true });
  }

  // Summary counts for right rail
  if (route === 'summary_counts' && req.method === 'GET') {
    const guard = await requireSig(); if (guard) return guard;
    const uid = req.headers.get('x-pk') || '';
    // Friend requests (incoming pending)
    const fr = await supa
      .from('contact_requests')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_uid_hash', uid)
      .eq('status', 'pending');
    const friend_requests = fr.count || 0;
    // Outgoing requests (pending)
    const fro = await supa
      .from('contact_requests')
      .select('id', { count:'exact', head:true })
      .eq('requester_uid_hash', uid)
      .eq('status','pending');
    const outgoing_requests = fro.count || 0;
    // Queue unread = current queue messages count
    const qm = await supa
      .from('queue_messages')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_uid_hash', uid);
    const unread_queue = qm.count || 0;
    // Upcoming events owned by user
    const nowIso = new Date().toISOString();
    const ev = await supa
      .from('events')
      .select('id', { count: 'exact', head: true })
      .eq('owner_uid_hash', uid)
      .gte('event_time', nowIso);
    const upcoming_events = ev.count || 0;
    // Pending event invites for this user
    const ei = await supa
      .from('event_invites')
      .select('event_id', { count: 'exact', head: true })
      .eq('recipient_uid_hash', uid)
      .eq('status', 'pending');
    const event_invites = ei.count || 0;
    return json({ ok:true, counts: { friend_requests, outgoing_requests, event_invites, unread_queue, upcoming_events } });
  }

  // Event invite responses
  if (route === 'event_invite_accept' && req.method === 'POST') {
    const guard = await requireSig(); if (guard) return guard;
    const uid = req.headers.get('x-pk') || '';
    const { event_id } = await req.json();
    if (!event_id) return json({ ok:false, error:'missing event_id' }, { status:400 });
    const { error } = await supa
      .from('event_invites')
      .update({ status: 'accepted', updated_at: new Date().toISOString() })
      .eq('event_id', event_id)
      .eq('recipient_uid_hash', uid)
      .eq('status', 'pending');
    if (error) return json({ ok:false, error:error.message }, { status:500 });
    return json({ ok:true });
  }
  if (route === 'event_invite_decline' && req.method === 'POST') {
    const guard = await requireSig(); if (guard) return guard;
    const uid = req.headers.get('x-pk') || '';
    const { event_id } = await req.json();
    if (!event_id) return json({ ok:false, error:'missing event_id' }, { status:400 });
    const { error } = await supa
      .from('event_invites')
      .update({ status: 'declined', updated_at: new Date().toISOString() })
      .eq('event_id', event_id)
      .eq('recipient_uid_hash', uid)
      .eq('status', 'pending');
    if (error) return json({ ok:false, error:error.message }, { status:500 });
    return json({ ok:true });
  }

  return json({ ok: false, error: 'not_found' }, { status: 404 });
});



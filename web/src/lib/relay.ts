import nacl from 'tweetnacl';
import { toHex } from './identity';

const RELAY_URL = process.env.NEXT_PUBLIC_RELAY_URL || 'https://moersuetwciwfrzwfqas.functions.supabase.co/relay';

async function request(route: string, init: RequestInit = {}) {
  const res = await fetch(`${RELAY_URL}?route=${encodeURIComponent(route)}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init.headers || {}) },
  });
  const body = await res.json();
  if (!res.ok || body?.ok === false) throw new Error(body?.error || `Relay ${res.status}`);
  return body;
}

export async function withSig(bodyText: string, pubHex?: string, sec?: Uint8Array) {
  const ts = Date.now().toString();
  if (pubHex && sec) {
    const msg = new TextEncoder().encode(`${ts}\n${bodyText}`);
    const sig = nacl.sign.detached(msg, sec);
    return { 'x-ts': ts, 'x-pk': pubHex, 'x-sig': toHex(sig) };
  }
  return { 'x-ts': ts };
}

export const relay = {
  register: async (payload: any, pubHex?: string, sec?: Uint8Array) => {
    const body = JSON.stringify(payload);
    return request('register', { method: 'POST', headers: await withSig(body, pubHex, sec), body });
  },
  statusListFor: async (uid: string, pubHex?: string, sec?: Uint8Array) => {
    const headers = await withSig('', pubHex, sec);
    const res = await fetch(`${RELAY_URL}?route=status_list_for&uid=${encodeURIComponent(uid)}`, { headers });
    const body = await res.json();
    if (!res.ok || body?.ok === false) throw new Error(body?.error || `Relay ${res.status}`);
    return body as { ok: true; items: Array<{ id:string; uid_hash:string; content:string; visibility:string; created_at:string; profiles?:{ display_name?:string; avatar_url?:string } }> };
  },
  acceptInvite: async (payload: any, pubHex?: string, sec?: Uint8Array) => {
    const body = JSON.stringify(payload);
    return request('accept_invite', { method: 'POST', headers: await withSig(body, pubHex, sec), body });
  },
  enqueue: async (payload: any, pubHex?: string, sec?: Uint8Array) => {
    const body = JSON.stringify(payload);
    return request('enqueue', { method: 'POST', headers: await withSig(body, pubHex, sec), body });
  },
  queue: async (to: string, from = 1, pubHex?: string, sec?: Uint8Array) => {
    const url = `${RELAY_URL}?route=queue&to=${encodeURIComponent(to)}&from=${from}`;
    const headers = await withSig('', pubHex, sec);
    const res = await fetch(url, { headers });
    const body = await res.json();
    if (!res.ok || body?.ok === false) throw new Error(body?.error || `Relay ${res.status}`);
    return body;
  },
  queuePoller: (to: string, onItems: (items: any[]) => void, pubHex?: string, sec?: Uint8Array, intervalMs = 5000) => {
    let from = 1;
    let timer: any;
    const run = async () => {
      try {
        const res = await (relay as any).queue(to, from, pubHex, sec);
        if (Array.isArray(res.items) && res.items.length) {
          onItems(res.items);
        }
        from = res.next || from;
      } catch {}
      timer = setTimeout(run, intervalMs);
    };
    run();
    return () => { if (timer) clearTimeout(timer); };
  },
  ack: async (payload: any, pubHex?: string, sec?: Uint8Array) => {
    const body = JSON.stringify(payload);
    return request('ack', { method: 'POST', headers: await withSig(body, pubHex, sec), body });
  },
  profileGet: async (pubHex?: string, sec?: Uint8Array) => {
    const headers = await withSig('', pubHex, sec);
    const res = await fetch(`${RELAY_URL}?route=profile_get`, { headers });
    const body = await res.json();
    if (!res.ok || body?.ok === false) throw new Error(body?.error || `Relay ${res.status}`);
    return body as { ok: true; profile: { uid_hash: string; display_name?: string; avatar_url?: string; bio?: string; favorites_books?: string; favorites_movies?: string; favorites_music?: string } | null, joined_at?: string };
  },
  profileUpdate: async (data: { display_name?: string; avatar_url?: string; bio?: string; favorites_books?: string; favorites_movies?: string; favorites_music?: string }, pubHex?: string, sec?: Uint8Array) => {
    const body = JSON.stringify(data);
    return request('profile_update', { method: 'POST', headers: await withSig(body, pubHex, sec), body });
  },
  avatarUpload: async (file: File, pubHex?: string, sec?: Uint8Array) => {
    const headers = await withSig('', pubHex, sec);
    headers['content-type'] = file.type || 'application/octet-stream';
    const url = `${RELAY_URL}?route=avatar_upload&filename=${encodeURIComponent(file.name)}`;
    const res = await fetch(url, { method: 'PUT', headers, body: file });
    const body = await res.json();
    if (!res.ok || body?.ok === false) throw new Error(body?.error || `Relay ${res.status}`);
    return body as { ok: true; url: string; path: string };
  },
  // Events
  eventsCreate: async (data: { title: string; event_time: string; location?: string; description?: string }, pubHex?: string, sec?: Uint8Array) => {
    const body = JSON.stringify(data);
    return request('events_create', { method: 'POST', headers: await withSig(body, pubHex, sec), body });
  },
  eventsList: async (pubHex?: string, sec?: Uint8Array) => {
    const headers = await withSig('', pubHex, sec);
    const res = await fetch(`${RELAY_URL}?route=events_list`, { headers });
    const body = await res.json();
    if (!res.ok || body?.ok === false) throw new Error(body?.error || `Relay ${res.status}`);
    return body as { ok: true; events: Array<{ id: string; owner_uid_hash: string; title: string; event_time: string; location?: string; description?: string }> };
  },
  eventsRsvp: async (event_id: string, status: 'going'|'maybe'|'no', pubHex?: string, sec?: Uint8Array) => {
    const body = JSON.stringify({ event_id, status });
    return request('events_rsvp', { method: 'POST', headers: await withSig(body, pubHex, sec), body });
  },
  eventsInvite: async (event_id: string, recipient_uid_hash: string, pubHex?: string, sec?: Uint8Array) => {
    const body = JSON.stringify({ event_id, recipient_uid_hash });
    return request('events_invite', { method: 'POST', headers: await withSig(body, pubHex, sec), body });
  },
  eventInvitesIncoming: async (pubHex?: string, sec?: Uint8Array) => {
    const headers = await withSig('', pubHex, sec);
    const res = await fetch(`${RELAY_URL}?route=event_invites_incoming`, { headers });
    const body = await res.json();
    if (!res.ok || body?.ok === false) throw new Error(body?.error || `Relay ${res.status}`);
    return body as { ok: true; invites: Array<{ event_id: string; status: string; created_at: string; events?: { title: string; event_time: string; location?: string; description?: string } }> };
  },
  eventInviteAccept: async (event_id: string, pubHex?: string, sec?: Uint8Array) => {
    const body = JSON.stringify({ event_id });
    return request('event_invite_accept', { method: 'POST', headers: await withSig(body, pubHex, sec), body });
  },
  eventInviteDecline: async (event_id: string, pubHex?: string, sec?: Uint8Array) => {
    const body = JSON.stringify({ event_id });
    return request('event_invite_decline', { method: 'POST', headers: await withSig(body, pubHex, sec), body });
  },
  eventInvitesOutgoing: async (pubHex?: string, sec?: Uint8Array) => {
    const headers = await withSig('', pubHex, sec);
    const res = await fetch(`${RELAY_URL}?route=event_invites_outgoing`, { headers });
    const body = await res.json();
    if (!res.ok || body?.ok === false) throw new Error(body?.error || `Relay ${res.status}`);
    return body as { ok: true; invites: Array<{ event_id: string; status: string; created_at: string; events?: { title: string; event_time: string; location?: string; description?: string } }> };
  },
  eventInviteCancel: async (event_id: string, recipient_uid_hash: string, pubHex?: string, sec?: Uint8Array) => {
    const body = JSON.stringify({ event_id, recipient_uid_hash });
    return request('event_invite_cancel', { method: 'POST', headers: await withSig(body, pubHex, sec), body });
  },
  // Albums
  albumsCreate: async (name: string, pubHex?: string, sec?: Uint8Array) => {
    const body = JSON.stringify({ name });
    return request('albums_create', { method: 'POST', headers: await withSig(body, pubHex, sec), body });
  },
  albumsAddPhoto: async (album_id: string, url: string, tagged: string[] = [], pubHex?: string, sec?: Uint8Array) => {
    const body = JSON.stringify({ album_id, url, tagged });
    return request('albums_add_photo', { method: 'POST', headers: await withSig(body, pubHex, sec), body });
  },
  albumsList: async (pubHex?: string, sec?: Uint8Array) => {
    const headers = await withSig('', pubHex, sec);
    const res = await fetch(`${RELAY_URL}?route=albums_list`, { headers });
    const body = await res.json();
    if (!res.ok || body?.ok === false) throw new Error(body?.error || `Relay ${res.status}`);
    return body as { ok: true; albums: Array<{ id: string; name: string; created_at: string; album_photos: Array<{ id: string; url: string }> }> };
  },
  // Status updates
  statusCreate: async (content: string, visibility: 'public'|'contacts'|'private' = 'contacts', pubHex?: string, sec?: Uint8Array) => {
    const body = JSON.stringify({ content, visibility });
    return request('status_create', { method: 'POST', headers: await withSig(body, pubHex, sec), body });
  },
  statusList: async (pubHex?: string, sec?: Uint8Array) => {
    const headers = await withSig('', pubHex, sec);
    const res = await fetch(`${RELAY_URL}?route=status_list`, { headers });
    const body = await res.json();
    if (!res.ok || body?.ok === false) throw new Error(body?.error || `Relay ${res.status}`);
    return body as { ok: true; items: Array<{ id:string; uid_hash:string; content:string; created_at:string; profiles?:{ display_name?:string; avatar_url?:string } }> };
  },
  statusFeed: async (pubHex?: string, sec?: Uint8Array, offset = 0, limit = 50) => {
    const headers = await withSig('', pubHex, sec);
    const res = await fetch(`${RELAY_URL}?route=status_feed&offset=${offset}&limit=${limit}`, { headers });
    const body = await res.json();
    if (!res.ok || body?.ok === false) throw new Error(body?.error || `Relay ${res.status}`);
    return body as { ok: true; items: Array<{ id:string; uid_hash:string; content:string; visibility:string; created_at:string; profiles?:{ display_name?:string; avatar_url?:string } }>, next_offset?: number };
  },
  summaryCounts: async (pubHex?: string, sec?: Uint8Array) => {
    const headers = await withSig('', pubHex, sec);
    const res = await fetch(`${RELAY_URL}?route=summary_counts`, { headers });
    const body = await res.json();
    if (!res.ok || body?.ok === false) throw new Error(body?.error || `Relay ${res.status}`);
    return body as { ok: true; counts: { friend_requests:number; outgoing_requests:number; event_invites:number; unread_queue:number; upcoming_events:number } };
  },
  contactsList: async (pubHex?: string, sec?: Uint8Array) => {
    const headers = await withSig('', pubHex, sec);
    const res = await fetch(`${RELAY_URL}?route=contacts_list`, { headers });
    const body = await res.json();
    if (!res.ok || body?.ok === false) throw new Error(body?.error || `Relay ${res.status}`);
    return body as { ok: true; contacts: Array<{ peer_uid_hash: string; nickname?: string; profiles?: { display_name?: string; avatar_url?: string } }> };
  },
  contactsAdd: async (peer_uid_hash: string, nickname?: string, pubHex?: string, sec?: Uint8Array) => {
    const body = JSON.stringify({ peer_uid_hash, nickname });
    return request('contacts_add', { method: 'POST', headers: await withSig(body, pubHex, sec), body });
  },
  contactsRemove: async (peer_uid_hash: string, pubHex?: string, sec?: Uint8Array) => {
    const body = JSON.stringify({ peer_uid_hash });
    return request('contacts_remove', { method: 'POST', headers: await withSig(body, pubHex, sec), body });
  },
  contactsSearch: async (q: string, pubHex?: string, sec?: Uint8Array) => {
    const headers = await withSig('', pubHex, sec);
    const res = await fetch(`${RELAY_URL}?route=contacts_search&q=${encodeURIComponent(q)}`, { headers });
    const body = await res.json();
    if (!res.ok || body?.ok === false) throw new Error(body?.error || `Relay ${res.status}`);
    return body as { ok: true; contacts: Array<{ peer_uid_hash: string; nickname?: string; profiles?: { display_name?: string; avatar_url?: string } }> };
  },
  profilesSearch: async (q: string, pubHex?: string, sec?: Uint8Array) => {
    const headers = await withSig('', pubHex, sec);
    const res = await fetch(`${RELAY_URL}?route=profiles_search&q=${encodeURIComponent(q)}`, { headers });
    const body = await res.json();
    if (!res.ok || body?.ok === false) throw new Error(body?.error || `Relay ${res.status}`);
    return body as { ok: true; profiles: Array<{ uid_hash: string; display_name?: string; avatar_url?: string }> };
  },
  // Contact requests
  contactRequestSend: async (recipient_uid_hash: string, pubHex?: string, sec?: Uint8Array) => {
    const body = JSON.stringify({ recipient_uid_hash });
    return request('contact_request_send', { method: 'POST', headers: await withSig(body, pubHex, sec), body });
  },
  contactRequestsIncoming: async (pubHex?: string, sec?: Uint8Array) => {
    const headers = await withSig('', pubHex, sec);
    const res = await fetch(`${RELAY_URL}?route=contact_requests_incoming`, { headers });
    const body = await res.json();
    if (!res.ok || body?.ok === false) throw new Error(body?.error || `Relay ${res.status}`);
    return body as { ok: true; requests: Array<{ id:string; requester_uid_hash:string; status:string; created_at:string; profiles?:{ display_name?:string; avatar_url?:string } }> };
  },
  contactRequestsOutgoing: async (pubHex?: string, sec?: Uint8Array) => {
    const headers = await withSig('', pubHex, sec);
    const res = await fetch(`${RELAY_URL}?route=contact_requests_outgoing`, { headers });
    const body = await res.json();
    if (!res.ok || body?.ok === false) throw new Error(body?.error || `Relay ${res.status}`);
    return body as { ok: true; requests: Array<{ id:string; recipient_uid_hash:string; status:string; created_at:string; profiles?:{ display_name?:string; avatar_url?:string } }> };
  },
  contactRequestCancel: async (id: string, pubHex?: string, sec?: Uint8Array) => {
    const body = JSON.stringify({ id });
    return request('contact_request_cancel', { method: 'POST', headers: await withSig(body, pubHex, sec), body });
  },
  contactRequestAccept: async (id: string, pubHex?: string, sec?: Uint8Array) => {
    const body = JSON.stringify({ id });
    return request('contact_request_accept', { method: 'POST', headers: await withSig(body, pubHex, sec), body });
  },
};



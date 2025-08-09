import { useEffect, useState } from 'react';
import { relay } from '../../lib/relay';

type EventItem = { id: string; owner_uid_hash: string; title: string; event_time: string; location?: string; description?: string };

type Props = {
  identity: { pubHex: string; sec?: Uint8Array };
};

export default function EventsPanel({ identity }: Props) {
  const [items, setItems] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState('');
  const [when, setWhen] = useState('');
  const [location, setLocation] = useState('');
  const [invites, setInvites] = useState<Array<{ event_id:string; status:string; created_at:string; events?: { title:string; event_time:string; location?:string } }>>([]);
  const [outgoing, setOutgoing] = useState<Array<{ event_id:string; status:string; created_at:string; events?: { title:string; event_time:string; location?:string } }>>([]);
  const [inviteTo, setInviteTo] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await relay.eventsList(identity.pubHex, identity.sec);
      setItems(res.events || []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    (async ()=>{ try { const res = await relay.eventInvitesIncoming(identity.pubHex, identity.sec); setInvites(res.invites || []); } catch {} })();
    (async ()=>{ try { const res = await relay.eventInvitesOutgoing(identity.pubHex, identity.sec); setOutgoing(res.invites || []); } catch {} })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity.pubHex]);

  const create = async () => {
    if (!title.trim() || !when.trim()) return;
    try {
      await relay.eventsCreate({ title: title.trim(), event_time: new Date(when).toISOString(), location: location.trim() || undefined }, identity.pubHex, identity.sec);
      setTitle('');
      setWhen('');
      setLocation('');
      await load();
    } catch {
      // ignore
    }
  };

  const rsvp = async (id: string, status: 'going'|'maybe'|'no') => {
    try {
      await relay.eventsRsvp(id, status, identity.pubHex, identity.sec);
      await load();
    } catch {
      // ignore
    }
  };

  const invite = async (event_id: string) => {
    const peer = inviteTo.trim();
    if (!peer) return;
    try {
      await relay.eventsInvite(event_id, peer, identity.pubHex, identity.sec);
      setInviteTo('');
    } catch {}
  };

  return (
    <div className="card" style={{ padding: 12 }}>
      <div className="row" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ margin: 0, fontWeight: 700, fontSize: 12, color: '#1f2937' }}>Events</div>
        <button className="btn" style={{ fontSize: 12, padding: '4px 8px' }} onClick={load} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button>
      </div>
      <div className="row" style={{ gap: 8, marginTop: 8 }}>
        <input className="input" style={{ padding: '6px 10px', fontSize: 12 }} placeholder="Event title" value={title} onChange={(e)=>setTitle(e.target.value)} />
        <input className="input" style={{ padding: '6px 10px', fontSize: 12 }} type="datetime-local" value={when} onChange={(e)=>setWhen(e.target.value)} />
      </div>
      <div className="row" style={{ gap: 8, marginTop: 8 }}>
        <input className="input" style={{ padding: '6px 10px', fontSize: 12 }} placeholder="Location (optional)" value={location} onChange={(e)=>setLocation(e.target.value)} />
        <button className="btn primary" style={{ fontSize: 12, padding: '6px 10px' }} onClick={create}>Create</button>
      </div>

      {(!items || items.length === 0) && !loading && (
        <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>No events yet</div>
      )}

      {outgoing.length > 0 && (
        <div style={{ borderTop: '1px solid var(--border)', marginTop: 8, paddingTop: 8 }}>
          <div style={{ fontWeight: 700, fontSize: 12, color: '#1f2937', marginBottom: 6 }}>Invites you sent</div>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {outgoing.map((iv) => (
              <li key={`${iv.event_id}`} style={{ fontSize: 12, padding: '4px 0', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span>
                  {(iv.events?.title || 'Event')} • {new Date(iv.events?.event_time || iv.created_at).toLocaleString()}
                </span>
                <button className="btn" style={{ fontSize: 12, padding: '4px 8px' }} onClick={async ()=>{ try { /* cancel needs recipient; omit until UI carries selection */ } catch {} }} disabled>
                  Cancel (per recipient)
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <ul style={{ listStyle: 'none', padding: 0, marginTop: 8 }}>
        {items.map((it) => (
          <li key={it.id} className="card" style={{ marginBottom: 8, padding: 10 }}>
            <div style={{ fontWeight: 600, fontSize: 12 }}>{it.title}</div>
            <div className="muted" style={{ fontSize: 11 }}>{new Date(it.event_time).toLocaleString()} {it.location ? `• ${it.location}` : ''}</div>
            <div className="row" style={{ gap: 8, marginTop: 8 }}>
              <button className="btn" style={{ fontSize: 12, padding: '4px 8px' }} onClick={()=>rsvp(it.id,'going')}>Going</button>
              <button className="btn" style={{ fontSize: 12, padding: '4px 8px' }} onClick={()=>rsvp(it.id,'maybe')}>Maybe</button>
              <button className="btn" style={{ fontSize: 12, padding: '4px 8px' }} onClick={()=>rsvp(it.id,'no')}>No</button>
            </div>
            <div className="row" style={{ gap: 6, marginTop: 8 }}>
              <input className="input" style={{ fontSize: 12, padding: '6px 10px' }} placeholder="Invite by uid" value={inviteTo} onChange={(e)=>setInviteTo(e.target.value)} />
              <button className="btn" style={{ fontSize: 12, padding: '4px 8px' }} onClick={()=>invite(it.id)}>Invite</button>
            </div>
          </li>
        ))}
      </ul>

      {invites.length > 0 && (
        <div style={{ borderTop: '1px solid var(--border)', marginTop: 8, paddingTop: 8 }}>
          <div style={{ fontWeight: 700, fontSize: 12, color: '#1f2937', marginBottom: 6 }}>Invited to you</div>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {invites.map((iv) => (
              <li key={iv.event_id} style={{ fontSize: 12, padding: '4px 0', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span>
                  {(iv.events?.title || 'Event')} • {new Date(iv.events?.event_time || iv.created_at).toLocaleString()}
                </span>
                <span className="row" style={{ gap:6 }}>
                  <button className="btn" style={{ fontSize: 12, padding: '4px 8px' }} onClick={async ()=>{ try { await relay.eventInviteAccept(iv.event_id, identity.pubHex, identity.sec); const res = await relay.eventInvitesIncoming(identity.pubHex, identity.sec); setInvites(res.invites || []); } catch {} }}>Accept</button>
                  <button className="btn" style={{ fontSize: 12, padding: '4px 8px' }} onClick={async ()=>{ try { await relay.eventInviteDecline(iv.event_id, identity.pubHex, identity.sec); const res = await relay.eventInvitesIncoming(identity.pubHex, identity.sec); setInvites(res.invites || []); } catch {} }}>Decline</button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}



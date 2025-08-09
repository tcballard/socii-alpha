import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getOrCreateIdentity } from '../lib/identity';
import { relay } from '../lib/relay';
import { useMounted } from '../lib/useMounted';

export default function Contacts() {
  const mounted = useMounted();
  const [{ pubHex, sec }] = useState(() => getOrCreateIdentity());
  const [contacts, setContacts] = useState<Array<{ peer_uid_hash: string; nickname?: string; profiles?: { display_name?: string; avatar_url?: string } }>>([]);
  const [peer, setPeer] = useState('');
  const [nick, setNick] = useState('');

  const load = async () => {
    const res = await relay.contactsList(pubHex, sec);
    setContacts(res.contacts);
  };

  useEffect(() => { if (mounted) load(); /* eslint-disable-next-line */}, [mounted]);

  if (!mounted) return null;
  return (
    <main className="stack">
      <h2>Contacts</h2>
      <div className="row">
        <input className="input" placeholder="uid to add" value={peer} onChange={(e)=>setPeer(e.target.value)} />
        <input className="input" placeholder="nickname (optional)" value={nick} onChange={(e)=>setNick(e.target.value)} />
        <button className="btn" onClick={async ()=>{ if (!peer.trim()) return; await relay.contactsAdd(peer.trim(), nick.trim()||undefined, pubHex, sec); setPeer(''); setNick(''); load(); }}>Add</button>
      </div>
      <ul style={{ listStyle:'none', padding:0 }}>
        {contacts.map(c => (
          <li key={c.peer_uid_hash} className="card" style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
              {c.profiles?.avatar_url ? (
                <img src={c.profiles.avatar_url} alt="avatar" style={{ width:32, height:32, borderRadius:2, border:'1px solid var(--border)' }} />
              ) : (
                <div style={{ width:32, height:32, borderRadius:2, border:'1px solid var(--border)', background:'#f5f5f5' }} />
              )}
              <Link href={`/profile/${encodeURIComponent(c.peer_uid_hash)}`} style={{ textDecoration:'none', color:'inherit' }}>
                  <div>
                    <div style={{ fontWeight:600 }}>{c.profiles?.display_name || c.nickname || c.peer_uid_hash}</div>
                    <div className="muted" style={{ fontSize:12 }}>{c.peer_uid_hash}</div>
                  </div>
              </Link>
            </div>
            <button className="btn" onClick={async ()=>{ await relay.contactsRemove(c.peer_uid_hash, pubHex, sec); load(); }}>Remove</button>
          </li>
        ))}
      </ul>
    </main>
  );
}



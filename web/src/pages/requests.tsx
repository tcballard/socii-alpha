import { useEffect, useState } from 'react';
import { useMounted } from '../lib/useMounted';
import { getOrCreateIdentity } from '../lib/identity';
import { relay } from '../lib/relay';

export default function Requests() {
  const mounted = useMounted();
  const [{ pubHex, sec }] = useState(() => getOrCreateIdentity());
  const [requests, setRequests] = useState<Array<{ id:string; requester_uid_hash:string; profiles?:{ display_name?:string; avatar_url?:string } }>>([]);
  const [outgoing, setOutgoing] = useState<Array<{ id:string; recipient_uid_hash:string; profiles?:{ display_name?:string; avatar_url?:string } }>>([]);
  const [sendTo, setSendTo] = useState('');
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<Array<{ uid_hash:string; display_name?:string; avatar_url?:string }>>([]);

  const load = async () => {
    const res = await relay.contactRequestsIncoming(pubHex, sec);
    setRequests(res.requests);
    try { const out = await relay.contactRequestsOutgoing(pubHex, sec); setOutgoing(out.requests || []); } catch {}
  };

  useEffect(()=>{ if(mounted) load(); /* eslint-disable-next-line */ }, [mounted]);
  if (!mounted) return null;

  return (
    <main className="stack">
      <h2>Contact Requests</h2>
      <div className="card">
        <div className="row">
          <input className="input" placeholder="Search by name (e.g., Bob Smith)" value={search} onChange={async (e)=>{ const q=e.target.value; setSearch(q); if(q.trim().length<2){ setResults([]); return;} try{ const r=await relay.profilesSearch(q.trim(), pubHex, sec); setResults(r.profiles||[]);}catch{ setResults([]);} }} />
        </div>
        {results.length>0 && (
          <ul style={{ listStyle:'none', padding:0, marginTop:8 }}>
            {results.map((p)=>(
              <li key={p.uid_hash} className="card" style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div className="row">
                  {p.avatar_url ? <img src={p.avatar_url} alt="avatar" style={{ width:24, height:24, border:'1px solid var(--border)' }} /> : <div style={{ width:24, height:24, border:'1px solid var(--border)' }} />}
                  <span style={{ fontSize:12 }}>{p.display_name || p.uid_hash}</span>
                </div>
                <button className="btn" onClick={async ()=>{ await relay.contactRequestSend(p.uid_hash, pubHex, sec).catch(()=>{}); setSearch(''); setResults([]); load(); }}>Send Request</button>
              </li>
            ))}
          </ul>
        )}
        <div className="row" style={{ marginTop:8 }}>
          <input className="input" placeholder="Or enter uid directly" value={sendTo} onChange={(e)=>setSendTo(e.target.value)} />
          <button className="btn" onClick={async ()=>{ const t=sendTo.trim(); if(!t) return; await relay.contactRequestSend(t, pubHex, sec).catch(()=>{}); setSendTo(''); load(); }}>Send</button>
        </div>
      </div>
      <ul style={{ listStyle:'none', padding:0 }}>
        {requests.map(r => (
          <li key={r.id} className="card" style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
              {r.profiles?.avatar_url ? (
                <img src={r.profiles.avatar_url} alt="avatar" style={{ width:32, height:32, borderRadius:2, border:'1px solid var(--border)' }} />
              ) : (
                <div style={{ width:32, height:32, borderRadius:2, border:'1px solid var(--border)', background:'#f5f5f5' }} />
              )}
              <div>
                <div style={{ fontWeight:600 }}>{r.profiles?.display_name || r.requester_uid_hash}</div>
                <div className="muted" style={{ fontSize:12 }}>{r.requester_uid_hash}</div>
              </div>
            </div>
            <button className="btn" onClick={async ()=>{ await relay.contactRequestAccept(r.id, pubHex, sec); load(); }}>Accept</button>
          </li>
        ))}
      </ul>
      {outgoing.length > 0 && (
        <div className="card">
          <div style={{ fontWeight:600, marginBottom:8 }}>Outgoing</div>
          <ul style={{ listStyle:'none', padding:0, margin:0 }}>
            {outgoing.map((r)=>(
              <li key={r.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'6px 0' }}>
                <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                  {r.profiles?.avatar_url ? (
                    <img src={r.profiles.avatar_url} alt="avatar" style={{ width:24, height:24, border:'1px solid var(--border)' }} />
                  ) : (
                    <div style={{ width:24, height:24, border:'1px solid var(--border)', background:'#f5f5f5' }} />
                  )}
                  <div style={{ fontSize:12 }}>{r.profiles?.display_name || r.recipient_uid_hash}</div>
                </div>
                <button className="btn" onClick={async ()=>{ await relay.contactRequestCancel(r.id, pubHex, sec); load(); }}>Cancel</button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}



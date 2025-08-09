import { useEffect, useState } from 'react';
import { getOrCreateIdentity } from '../lib/identity';
import { useMounted } from '../lib/useMounted';
import { relay } from '../lib/relay';

type Item = { n: number; payload: { type: string; msg?: string; content?: string } };

export default function Feed() {
  const [{ pubHex, sec }, setId] = useState(() => getOrCreateIdentity());
  const [items, setItems] = useState<Item[]>([]);
  const [from, setFrom] = useState(1);
  const [text, setText] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [pokeUid, setPokeUid] = useState('');
  const [statusText, setStatusText] = useState('');

  const load = async () => {
    const res = await relay.queue(pubHex, from, pubHex, sec);
    setItems((prev) => [...prev, ...res.items]);
    setFrom(res.next);
  };

  useEffect(() => {
    setId(getOrCreateIdentity());
    load();
    (async () => {
      try {
        const { profile } = await relay.profileGet(pubHex, sec);
        setDisplayName(profile?.display_name || 'You');
        setAvatarUrl(profile?.avatar_url || '');
      } catch {}
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const share = async () => {
    if (!text.trim()) return;
    await relay.enqueue({ to: pubHex, payload: { type: 'post', content: text, author: { uid: pubHex, name: displayName, avatar_url: avatarUrl } } }, pubHex, sec);
    setText('');
    await load();
  };

  const acknowledge = async () => {
    const upto = Math.max(1, from - 1);
    await relay.ack({ to: pubHex, n: upto }, pubHex, sec);
    setItems([]);
    setFrom(1);
    await load();
  };

  const mounted = useMounted();
  if (!mounted) return null;
  return (
    <main className="stack">
      <h2>Feed</h2>
      <div className="row">
        <input className="input" value={statusText} onChange={(e)=>setStatusText(e.target.value)} placeholder={`${displayName || 'You'} is ...`} />
        <button className="btn" onClick={async ()=>{ if(!statusText.trim()) return; await relay.statusCreate(statusText.trim(), 'contacts', pubHex, sec); setStatusText(''); }}>Post Status</button>
      </div>
      <div className="row">
        <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Share something..." />
        <button className="btn primary" onClick={share}>Share</button>
        <button className="btn" onClick={load}>Load</button>
        <button className="btn" onClick={acknowledge}>Ack</button>
      </div>
      <div className="row">
        <input className="input" value={pokeUid} onChange={(e)=>setPokeUid(e.target.value)} placeholder="Enter someone's uid to poke" />
        <button className="btn" onClick={async ()=>{
          const target = pokeUid.trim();
          if (!target) return;
          await relay.enqueue({ to: target, payload: { type: 'poke', from: { uid: pubHex, name: displayName || 'You', avatar_url: avatarUrl } } }, pubHex, sec);
          setPokeUid('');
          alert('Poke sent');
        }}>Poke</button>
      </div>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {items.map((it) => (
          <li key={it.n} className="card">
            <div className="row" style={{ marginBottom: 6 }}>
              { ((it as any)?.payload?.author?.avatar_url || (it as any)?.payload?.from?.avatar_url || avatarUrl) ? (
                <img src={(it as any)?.payload?.author?.avatar_url || (it as any)?.payload?.from?.avatar_url || avatarUrl} alt="avatar" style={{ width: 32, height: 32, borderRadius: 2, border: '1px solid var(--border)' }} />
              ) : (
                <div style={{ width: 32, height: 32, borderRadius: 2, border: '1px solid var(--border)', background:'#f5f5f5' }} />
              ) }
              <div>
                <div style={{ fontWeight: 600 }}>{(it as any)?.payload?.author?.name || (it as any)?.payload?.from?.name || displayName || 'You'}</div>
                <div className="muted" style={{ fontSize: 12 }}>{new Date().toLocaleString()}</div>
              </div>
            </div>
            <div>
              {it.payload?.type === 'status' ? (
                <div><strong>{(it as any)?.payload?.author?.name || displayName || 'You'}</strong> is {(it as any)?.payload?.content}</div>
              ) : it.payload?.type === 'poke' ? (
                <div className="row" style={{ justifyContent:'space-between' }}>
                  <div>👈 {(it as any)?.payload?.from?.name || 'Someone'} poked you</div>
                  <button className="btn" onClick={async ()=>{
                    const sender = (it as any)?.payload?.from?.uid;
                    if (!sender) return;
                    await relay.enqueue({ to: sender, payload: { type: 'poke', from: { uid: pubHex, name: displayName, avatar_url: avatarUrl } } }, pubHex, sec);
                  }}>Poke back</button>
                </div>
              ) : (
                <div>{it.payload?.content || it.payload?.msg || JSON.stringify(it.payload)}</div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}



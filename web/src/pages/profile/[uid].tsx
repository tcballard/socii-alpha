import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { useMounted } from '../../lib/useMounted';
import { getOrCreateIdentity } from '../../lib/identity';
import { relay } from '../../lib/relay';

export default function Profile() {
  const router = useRouter();
  const mounted = useMounted();
  const [{ pubHex, sec }] = useState(() => getOrCreateIdentity());
  const [profile, setProfile] = useState<{ display_name?: string; avatar_url?: string; bio?: string; favorites_books?: string; favorites_movies?: string; favorites_music?: string } | null>(null);
  const [joinedAt, setJoinedAt] = useState<string | null>(null);
  const [uid, setUid] = useState('');
  const [items, setItems] = useState<Array<{ id:string; content:string; created_at:string; profiles?:{ display_name?:string; avatar_url?:string } }>>([]);
  const [isContact, setIsContact] = useState<boolean>(false);

  useEffect(() => {
    if (!mounted) return;
    const id = (router.query.uid as string) || '';
    setUid(id);
    (async () => {
      try {
        const headers = await (await import('../../lib/relay')).withSig('', pubHex, sec) as any;
        const res = await fetch(`${(process as any).env.NEXT_PUBLIC_RELAY_URL || 'https://moersuetwciwfrzwfqas.functions.supabase.co/relay'}?route=profile_get&uid=${encodeURIComponent(id)}`, { headers });
        const body = await res.json();
        if (res.ok && body?.ok) { setProfile(body.profile); setJoinedAt(body.joined_at || null); }
      } catch {}
      const feed = await relay.statusListFor(id, pubHex, sec).catch(()=>({ items:[] } as any));
      setItems((feed as any)?.items || []);
      try {
        const c = await relay.contactsList(pubHex, sec);
        setIsContact((c.contacts || []).some((x:any)=>x.peer_uid_hash===id));
      } catch {}
    })();
  }, [mounted, router.query.uid]);

  if (!mounted) return null;
  return (
    <main className="stack">
      <h2>Profile</h2>
      <div className="card" style={{ display:'flex', gap:12, alignItems:'center' }}>
        {profile?.avatar_url ? (
          <img src={profile.avatar_url} alt="avatar" style={{ width:64, height:64, borderRadius:2, border:'1px solid var(--border)' }} />
        ) : (
          <div style={{ width:64, height:64, borderRadius:2, border:'1px solid var(--border)', background:'#f5f5f5' }} />)
        }
        <div>
          <div style={{ fontWeight:700 }}>{profile?.display_name || uid}</div>
          <div className="muted" style={{ fontSize:12 }}>{uid}</div>
          {joinedAt && <div className="muted" style={{ fontSize:12 }}>Joined {new Date(joinedAt).toLocaleDateString()}</div>}
        </div>
        <div style={{ marginLeft:'auto' }}>
          <button className="btn" onClick={async ()=>{
            if (!uid) return;
            const me = await relay.profileGet(pubHex, sec);
            await relay.enqueue({ to: uid, payload: { type: 'poke', from: { uid: pubHex, name: me.profile?.display_name || 'You', avatar_url: me.profile?.avatar_url || '' } } }, pubHex, sec);
            alert('Poked');
          }}>Poke</button>
        </div>
      </div>
      {profile?.bio && (
        <div className="card">
          <div style={{ fontWeight:600 }}>About</div>
          <div>{profile.bio}</div>
        </div>
      )}
      {!isContact && uid && (
        <div className="card">
          <button className="btn" onClick={async ()=>{ await relay.contactRequestsOutgoing(pubHex, sec).catch(()=>{}); try { await relay.contactRequestsOutgoing(pubHex, sec); } catch {}; try{ await relay.contactRequestSend(uid, pubHex, sec);}catch{} setIsContact(true); }}>Add to contacts</button>
        </div>
      )}
      <div className="card">
        <div style={{ fontWeight:600, marginBottom:8 }}>Wall</div>
        <ul style={{ listStyle:'none', padding:0, margin:0 }}>
          {items.map(it => (
            <li key={it.id} className="card" style={{ marginBottom:8 }}>
              <div style={{ fontSize:12, fontWeight:600 }}>{profile?.display_name || uid}</div>
              <div className="muted" style={{ fontSize:11 }}>{new Date(it.created_at).toLocaleString()}</div>
              <div style={{ marginTop:6, fontSize:12 }}>{it.content}</div>
            </li>
          ))}
        </ul>
      </div>
      {(profile?.favorites_books || profile?.favorites_movies || profile?.favorites_music) && (
        <div className="card">
          <div style={{ fontWeight:600 }}>Favorites</div>
          {profile.favorites_books && <div>Books: {profile.favorites_books}</div>}
          {profile.favorites_movies && <div>Movies: {profile.favorites_movies}</div>}
          {profile.favorites_music && <div>Music: {profile.favorites_music}</div>}
        </div>
      )}
    </main>
  );
}



import { getOrCreateIdentity, resetIdentity, exportRecoveryPhrase, importRecoveryPhrase } from '../lib/identity';
import { relay } from '../lib/relay';
import { useEffect, useMemo, useState } from 'react';
import { useMounted } from '../lib/useMounted';

export default function Settings() {
  const [nonce, setNonce] = useState(0);
  const id = useMemo(() => getOrCreateIdentity(), [nonce]);

  const mounted = useMounted();

  // Profile state
  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [bio, setBio] = useState('');
  const [favBooks, setFavBooks] = useState('');
  const [favMovies, setFavMovies] = useState('');
  const [favMusic, setFavMusic] = useState('');
  const loadProfile = async () => {
    try {
      const { profile } = await relay.profileGet(id.pubHex, id.sec);
      setDisplayName(profile?.display_name || '');
      setAvatarUrl(profile?.avatar_url || '');
      setBio((profile as any)?.bio || '');
      setFavBooks((profile as any)?.favorites_books || '');
      setFavMovies((profile as any)?.favorites_movies || '');
      setFavMusic((profile as any)?.favorites_music || '');
    } catch {}
  };
  useEffect(() => { loadProfile(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id.pubHex]);
  if (!mounted) return null;
  return (
    <main className="stack">
      <h2>Settings</h2>
      <p className="muted">uid: {id.pubHex}</p>
      <div>
        <button className="btn" onClick={() => {
          const phrase = exportRecoveryPhrase();
          navigator.clipboard.writeText(phrase).catch(()=>{});
          alert('Recovery phrase copied to clipboard');
        }}>Copy Recovery Phrase</button>
      </div>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Profile</h3>
        <div className="row">
          <input className="input" placeholder="Display name" value={displayName} onChange={(e)=>setDisplayName(e.target.value)} />
          <button className="btn" onClick={async ()=>{
            await relay.profileUpdate({ display_name: displayName }, id.pubHex, id.sec);
            alert('Saved');
          }}>Save</button>
        </div>
        <div className="row">
          <input className="input" placeholder="Avatar URL" value={avatarUrl} onChange={(e)=>setAvatarUrl(e.target.value)} />
          <button className="btn" onClick={async ()=>{
            await relay.profileUpdate({ avatar_url: avatarUrl }, id.pubHex, id.sec);
            alert('Saved');
          }}>Save</button>
        </div>
        <div className="col">
          <textarea className="input" placeholder="Bio" value={bio} onChange={(e)=>setBio(e.target.value)} />
          <input className="input" placeholder="Favorite books" value={favBooks} onChange={(e)=>setFavBooks(e.target.value)} />
          <input className="input" placeholder="Favorite movies" value={favMovies} onChange={(e)=>setFavMovies(e.target.value)} />
          <input className="input" placeholder="Favorite music" value={favMusic} onChange={(e)=>setFavMusic(e.target.value)} />
          <button className="btn" onClick={async ()=>{
            await relay.profileUpdate({ bio, favorites_books: favBooks, favorites_movies: favMovies, favorites_music: favMusic }, id.pubHex, id.sec);
            alert('Saved');
          }}>Save Info</button>
        </div>
        <div className="row">
          <input type="file" onChange={async (e)=>{
            const f = e.target.files?.[0];
            if (!f) return;
            const res = await relay.avatarUpload(f, id.pubHex, id.sec);
            setAvatarUrl(res.url);
            await relay.profileUpdate({ avatar_url: res.url }, id.pubHex, id.sec);
          }} />
        </div>
        {avatarUrl && (
          <div className="row">
            <img src={avatarUrl} alt="avatar" style={{ width: 64, height: 64, borderRadius: 4, border: '1px solid var(--border)' }} />
          </div>
        )}
      </div>
      <div className="row">
        <input id="phrase" className="input" placeholder="Paste recovery phrase" />
        <button className="btn" onClick={() => {
          const el = document.getElementById('phrase') as HTMLInputElement | null;
          try {
            importRecoveryPhrase(el?.value || '');
            setNonce((n) => n + 1);
            alert('Imported. Identity updated.');
          } catch (e: any) {
            alert('Invalid phrase');
          }
        }}>Import</button>
      </div>
      <button className="btn"
        onClick={() => {
          resetIdentity();
          setNonce((n) => n + 1);
        }}
      >
        Reset identity
      </button>
    </main>
  );
}



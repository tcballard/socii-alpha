import { useEffect, useState } from 'react';
import { useMounted } from '../lib/useMounted';
import { getOrCreateIdentity } from '../lib/identity';
import { relay } from '../lib/relay';

export default function Albums() {
  const mounted = useMounted();
  const [{ pubHex, sec }] = useState(() => getOrCreateIdentity());
  const [name, setName] = useState('');
  const [albums, setAlbums] = useState<Array<{ id:string; name:string; album_photos:Array<{ id:string; url:string }> }>>([]);
  const [photoUrl, setPhotoUrl] = useState('');
  const [tagged, setTagged] = useState('');
  const [selectedAlbum, setSelectedAlbum] = useState('');

  const load = async () => {
    const res = await relay.albumsList(pubHex, sec);
    setAlbums(res.albums);
  };
  useEffect(()=>{ if (mounted) load(); /* eslint-disable-next-line */}, [mounted]);

  if (!mounted) return null;
  return (
    <main className="stack">
      <h2>Photo Albums</h2>
      <div className="card">
        <h3 style={{ marginTop:0 }}>Create Album</h3>
        <div className="row">
          <input className="input" placeholder="Album name" value={name} onChange={(e)=>setName(e.target.value)} />
          <button className="btn" onClick={async ()=>{ if(!name) return; await relay.albumsCreate(name, pubHex, sec); setName(''); load(); }}>Create</button>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop:0 }}>Add Photo</h3>
        <div className="row">
          <select className="input" value={selectedAlbum} onChange={(e)=>setSelectedAlbum(e.target.value)}>
            <option value="">Select album</option>
            {albums.map(a => (<option key={a.id} value={a.id}>{a.name}</option>))}
          </select>
          <input className="input" placeholder="Photo URL" value={photoUrl} onChange={(e)=>setPhotoUrl(e.target.value)} />
        </div>
        <div className="row">
          <input className="input" placeholder="Tag uids (comma separated)" value={tagged} onChange={(e)=>setTagged(e.target.value)} />
          <button className="btn" onClick={async ()=>{
            if (!selectedAlbum || !photoUrl) return;
            const tags = tagged.split(',').map(s=>s.trim()).filter(Boolean);
            await relay.albumsAddPhoto(selectedAlbum, photoUrl, tags, pubHex, sec);
            setPhotoUrl(''); setTagged(''); load();
          }}>Add Photo</button>
        </div>
      </div>

      <ul style={{ listStyle:'none', padding:0 }}>
        {albums.map(a => (
          <li key={a.id} className="card">
            <div style={{ fontWeight:600, marginBottom:8 }}>{a.name}</div>
            <div className="row" style={{ flexWrap:'wrap' }}>
              {a.album_photos?.map(p => (
                <img key={p.id} src={p.url} alt="photo" style={{ width:120, height:120, objectFit:'cover', borderRadius:4, border:'1px solid var(--border)' }} />
              ))}
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}



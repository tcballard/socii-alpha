import { useEffect, useRef, useState } from 'react';
import { relay } from '../../lib/relay';

type Props = {
  identity: { pubHex: string; sec?: Uint8Array };
  onProfileUpdated?: () => void;
};

export default function ProfileCard({ identity, onProfileUpdated }: Props) {
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [bio, setBio] = useState('');
  const fileRef = useRef<HTMLInputElement | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const { profile } = await relay.profileGet(identity.pubHex, identity.sec);
      setDisplayName(profile?.display_name || '');
      setAvatarUrl(profile?.avatar_url || '');
      setBio(profile?.bio || '');
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity.pubHex]);

  const save = async () => {
    await relay.profileUpdate({ display_name: displayName, avatar_url: avatarUrl, bio }, identity.pubHex, identity.sec);
    onProfileUpdated?.();
  };

  const onPickAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const res = await relay.avatarUpload(file, identity.pubHex, identity.sec);
    setAvatarUrl(res.url);
  };

  return (
    <div className="card">
      <div className="row" style={{ alignItems: 'center', gap: 12 }}>
        {avatarUrl ? (
          <img src={avatarUrl} alt="avatar" style={{ width: 56, height: 56, borderRadius: 6, border: '1px solid var(--border)' }} />
        ) : (
          <div style={{ width: 56, height: 56, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface, #111827)' }} />
        )}
        <div style={{ flex: 1 }}>
          <input className="input" value={displayName} onChange={(e)=>setDisplayName(e.target.value)} placeholder="Your name" />
          <input className="input" value={bio} onChange={(e)=>setBio(e.target.value)} placeholder="Bio" />
        </div>
      </div>
      <div className="row" style={{ marginTop: 8, gap: 8 }}>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onPickAvatar} />
        <button className="btn" onClick={()=>fileRef.current?.click()}>Change Avatar</button>
        <button className="btn primary" onClick={save} disabled={loading}>Save</button>
      </div>
    </div>
  );
}



import { useEffect, useState } from 'react';
import { relay } from '../../lib/relay';

type Props = {
  identity: { pubHex: string; sec?: Uint8Array };
  onEditProfile?: () => void;
};

export default function ProfileSidebar({ identity, onEditProfile }: Props) {
  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [bio, setBio] = useState('');
  const [joinedAt, setJoinedAt] = useState<string | null>(null);
  const [friends, setFriends] = useState<Array<{ uid: string; name?: string; avatar?: string }>>([]);

  const load = async () => {
    try {
      const { profile, joined_at } = await relay.profileGet(identity.pubHex, identity.sec);
      setDisplayName(profile?.display_name || 'You');
      setAvatarUrl(profile?.avatar_url || '');
      setBio((profile as any)?.bio || '');
      setJoinedAt(joined_at || null);
    } catch {}
    try {
      const res = await relay.contactsList(identity.pubHex, identity.sec);
      const list = (res.contacts || []).slice(0, 6).map((c: any) => ({
        uid: c.peer_uid_hash,
        name: c.profiles?.display_name,
        avatar: c.profiles?.avatar_url,
      }));
      setFriends(list);
    } catch {}
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [identity.pubHex]);

  return (
    <aside>
      <div style={{ background: '#f5f6f7', border: '1px solid #d3d6db', padding: 8 }}>
        <div style={{ background: '#fff', border: '1px solid #d3d6db', padding: 4, display: 'flex', justifyContent: 'center' }}>
          {avatarUrl ? (
            <img src={avatarUrl} alt="avatar" style={{ width: 180, height: 180, objectFit: 'cover' }} />
          ) : (
            <div style={{ width: 180, height: 180, background: '#e5e7eb' }} />
          )}
        </div>
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 12, color: '#1f2937', fontWeight: 700 }}>{displayName}</div>
        </div>
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <button className="btn" style={{ fontSize: 12, padding: '4px 8px' }} onClick={onEditProfile}>Edit My Profile</button>
        </div>
        <div style={{ borderTop: '1px solid #d3d6db', marginTop: 8, paddingTop: 8 }}>
          <div style={{ fontSize: 11, color: '#6b7280' }}>{bio || 'Write something about yourself.'}</div>
        </div>
        <div style={{ borderTop: '1px solid #d3d6db', marginTop: 8, paddingTop: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#1f2937', marginBottom: 4 }}>Info</div>
          <div style={{ fontSize: 11, color: '#374151' }}>Joined: {joinedAt ? new Date(joinedAt).toLocaleDateString() : '—'}</div>
          <div style={{ fontSize: 11, color: '#374151' }}>Friends: {friends.length > 0 ? friends.length : 0}</div>
        </div>
        <div style={{ borderTop: '1px solid #d3d6db', marginTop: 8, paddingTop: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#1f2937', marginBottom: 6 }}>Friends</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
            {friends.map((f) => (
              <div key={f.uid} style={{ textAlign: 'center' }}>
                {f.avatar ? (
                  <img src={f.avatar} alt="friend" style={{ width: 48, height: 48, objectFit: 'cover', border: '1px solid #d3d6db' }} />
                ) : (
                  <div style={{ width: 48, height: 48, background: '#e5e7eb', border: '1px solid #d3d6db' }} />
                )}
                <div style={{ fontSize: 10, color: '#374151', marginTop: 2 }}>{(f.name || f.uid.slice(0, 6))}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}



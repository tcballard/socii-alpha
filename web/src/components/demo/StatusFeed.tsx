import { useEffect, useState } from 'react';
import { relay } from '../../lib/relay';

type StatusItem = { id: string; uid_hash: string; content: string; created_at: string; profiles?: { display_name?: string; avatar_url?: string } };

type Props = {
  identity: { pubHex: string; sec?: Uint8Array };
  refreshToken?: number;
};

export default function StatusFeed({ identity, refreshToken = 0 }: Props) {
  const [items, setItems] = useState<StatusItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'all'|'me'|'contacts'>('all');
  const [offset, setOffset] = useState(0);

  const load = async () => {
    setLoading(true);
    try {
      const res = await relay.statusFeed(identity.pubHex, identity.sec, 0, 50);
      setItems(res.items || []);
      setOffset(res.next_offset || (res.items?.length || 0));
    } catch (e) {
      // Gracefully degrade if backend tables are not yet migrated
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  const loadMore = async () => {
    setLoading(true);
    try {
      const res = await relay.statusFeed(identity.pubHex, identity.sec, offset, 50);
      setItems((prev)=>[...prev, ...(res.items || [])]);
      setOffset(res.next_offset || (offset + (res.items?.length || 0)));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity.pubHex, refreshToken]);

  return (
    <div>
      <div className="row" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontWeight: 700, fontSize: 12, color: '#1f2937' }}>Status Feed</div>
        <button className="btn" style={{ fontSize: 12, padding: '4px 8px' }} onClick={load} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button>
      </div>
      <div className="row" style={{ gap:6, marginTop:6 }}>
        <button className="btn" style={{ fontSize: 12, padding: '2px 6px', borderColor: filter==='all' ? '#1f2937' : undefined }} onClick={()=>setFilter('all')}>All</button>
        <button className="btn" style={{ fontSize: 12, padding: '2px 6px', borderColor: filter==='me' ? '#1f2937' : undefined }} onClick={()=>setFilter('me')}>Me</button>
        <button className="btn" style={{ fontSize: 12, padding: '2px 6px', borderColor: filter==='contacts' ? '#1f2937' : undefined }} onClick={()=>setFilter('contacts')}>Contacts</button>
      </div>
      {(!items || items.length === 0) && !loading && (
        <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>No updates yet</div>
      )}
      <ul style={{ listStyle: 'none', padding: 0, marginTop: 8 }}>
        {items.filter(it => filter==='all' ? true : (filter==='me' ? it.uid_hash === identity.pubHex : it.uid_hash !== identity.pubHex)).map((it) => (
          <li key={it.id} className="card" style={{ marginBottom: 8, padding: 10 }}>
            <div className="row" style={{ marginBottom: 6 }}>
              {it.profiles?.avatar_url ? (
                <img src={it.profiles.avatar_url} alt="avatar" style={{ width: 32, height: 32, borderRadius: 2, border: '1px solid var(--border)' }} />
              ) : (
                <div style={{ width: 32, height: 32, borderRadius: 2, border: '1px solid var(--border)' }} />
              )}
              <div>
                <div style={{ fontWeight: 600, fontSize: 12 }}>
                  <a href={`/profile/${it.uid_hash}`}>{it.profiles?.display_name || 'Someone'}</a>
                </div>
                <div className="muted" style={{ fontSize: 11 }}>{new Date(it.created_at).toLocaleString()}</div>
              </div>
            </div>
            <div style={{ fontSize: 12, color: '#1f2937' }}>{it.content}</div>
          </li>
        ))}
      </ul>
      <div className="row" style={{ justifyContent:'center', marginTop:8 }}>
        <button className="btn" style={{ fontSize:12, padding:'6px 10px' }} onClick={loadMore} disabled={loading}>Load more</button>
      </div>
    </div>
  );
}



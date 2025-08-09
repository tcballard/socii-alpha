import { useEffect, useState } from 'react';
import { relay } from '../../lib/relay';

type RequestItem = { id: string; requester_uid_hash: string; status: string; created_at: string; profiles?: { display_name?: string; avatar_url?: string } };

type Props = {
  identity: { pubHex: string; sec?: Uint8Array };
  onChange?: () => void;
};

export default function PendingRequests({ identity, onChange }: Props) {
  const [items, setItems] = useState<RequestItem[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await relay.contactRequestsIncoming(identity.pubHex, identity.sec);
      setItems(res.requests || []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity.pubHex]);

  const accept = async (id: string) => {
    try {
      await relay.contactRequestAccept(id, identity.pubHex, identity.sec);
      await load();
      onChange?.();
    } catch {
      // ignore
    }
  };

  return (
    <div className="card" style={{ padding: 12 }}>
      <div className="row" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ margin: 0, fontWeight: 700, fontSize: 12, color: '#1f2937' }}>Pending Requests</div>
        <button className="btn" style={{ fontSize: 12, padding: '4px 8px' }} onClick={load} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button>
      </div>
      {(!items || items.length === 0) && !loading && (
        <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>You’re all set</div>
      )}
      <ul style={{ listStyle: 'none', padding: 0, marginTop: 8 }}>
        {items.map((it) => (
          <li key={it.id} className="card" style={{ marginBottom: 8, padding: 10 }}>
            <div className="row" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
              <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                {it.profiles?.avatar_url ? (
                  <img src={it.profiles.avatar_url} alt="avatar" style={{ width: 28, height: 28, borderRadius: 2, border: '1px solid var(--border)' }} />
                ) : (
                  <div style={{ width: 28, height: 28, borderRadius: 2, border: '1px solid var(--border)' }} />
                )}
                <div style={{ fontWeight: 600, fontSize: 12 }}>{it.profiles?.display_name || it.requester_uid_hash.slice(0, 6)}…</div>
              </div>
              <button className="btn primary" style={{ fontSize: 12, padding: '4px 8px' }} onClick={() => accept(it.id)}>Accept</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}



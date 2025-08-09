import { useEffect, useState } from 'react';
import { getOrCreateIdentity } from '../../lib/identity';
import { useMounted } from '../../lib/useMounted';

const RELAY_URL = process.env.NEXT_PUBLIC_RELAY_URL || 'https://moersuetwciwfrzwfqas.functions.supabase.co/relay';

export default function AdminInvites() {
  const mounted = useMounted();
  const [pubHex, setPubHex] = useState('');
  useEffect(() => {
    if (!mounted) return;
    const { pubHex } = getOrCreateIdentity();
    setPubHex(pubHex);
  }, [mounted]);
  const [adminToken, setAdminToken] = useState('');
  const [count, setCount] = useState(5);
  const [prefix, setPrefix] = useState('HL-');
  const [codes, setCodes] = useState<string[]>([]);
  const [error, setError] = useState('');

  const generate = async () => {
    setError('');
    setCodes([]);
    try {
      const body = JSON.stringify({ count, prefix });
      const res = await fetch(`${RELAY_URL}?route=invites_generate`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-admin-token': adminToken,
          // x-pk not strictly needed for admin, but we include it in case server infers createdBy
          'x-pk': pubHex,
        },
        body,
      });
      const json = await res.json();
      if (!res.ok || json?.ok === false) throw new Error(json?.error || res.statusText);
      setCodes(json.codes || []);
    } catch (e: any) {
      setError(e?.message || 'Failed');
    }
  };

  if (!mounted) return null;
  return (
    <main style={{ padding: 24, maxWidth: 720, margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
      <h2>Admin: Generate Invite Codes</h2>
      <p style={{ color: '#666' }}>Your uid: {pubHex}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 520 }}>
        <input placeholder="Admin Token" value={adminToken} onChange={(e) => setAdminToken(e.target.value)} />
        <div style={{ display: 'flex', gap: 8 }}>
          <input type="number" value={count} onChange={(e) => setCount(parseInt(e.target.value || '1'))} />
          <input placeholder="Prefix" value={prefix} onChange={(e) => setPrefix(e.target.value)} />
          <button onClick={generate}>Generate</button>
        </div>
      </div>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {codes.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <h3>Codes</h3>
          <ul>
            {codes.map((c) => (
              <li key={c} style={{ marginBottom: 8 }}>
                <code>{c}</code>{' '}
                <button onClick={() => navigator.clipboard.writeText(`${window.location.origin}/invite?code=${encodeURIComponent(c)}`)}>
                  Copy Link
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p><a href="/">← Home</a></p>
    </main>
  );
}



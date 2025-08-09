import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { getOrCreateIdentity } from '../lib/identity';
import { relay } from '../lib/relay';
import { useMounted } from '../lib/useMounted';

export default function Invite() {
  const router = useRouter();
  const mounted = useMounted();
  const [status, setStatus] = useState('');
  const [pubHex, setPubHex] = useState('');
  const [sec, setSec] = useState<Uint8Array | undefined>(undefined);

  useEffect(() => {
    if (!mounted) return;
    const { pubHex, sec } = getOrCreateIdentity();
    setPubHex(pubHex);
    setSec(sec);
    const code = (router.query.code as string) || '';
    if (!code) return;
    (async () => {
      try {
        await relay.register({ ed25519: pubHex, x25519: pubHex }, pubHex, sec).catch(() => {});
        await relay.acceptInvite({ code }, pubHex, sec);
        setStatus('Invite accepted. You are now connected. Redirecting to contacts...');
        setTimeout(() => router.replace('/contacts'), 800);
      } catch (e: any) {
        setStatus('Error: ' + e?.message);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, router.query.code]);

  if (!mounted) return null;
  return (
    <main style={{ padding: 24, maxWidth: 720, margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
      <h2>Invite</h2>
      <p>{status || 'Waiting for invite code...'}</p>
      <p><a href="/">← Home</a></p>
    </main>
  );
}



import { useEffect, useState } from 'react';
import { getOrCreateIdentity } from '../lib/identity';
import { useMounted } from '../lib/useMounted';
import { relay } from '../lib/relay';

export default function Home() {
  const [pubHex, setPubHex] = useState('');
  const [code, setCode] = useState('');
  const [log, setLog] = useState('');
  const prompts = [
    "What's on your mind?",
    "What's the vibe today?",
    "Tell your circle something new",
    "Share a quick update",
  ];
  const prompt = prompts[Math.floor((Date.now()/60000)%prompts.length)];

  useEffect(() => {
    const { pubHex, sec } = getOrCreateIdentity();
    setPubHex(pubHex);
  }, []);

  const append = (s: string) => setLog((l) => l + s + '\n');

  const register = async () => {
    try {
      const { sec } = getOrCreateIdentity();
      await relay.register({ ed25519: pubHex, x25519: pubHex }, pubHex, sec);
      append('register: ok');
    } catch (e: any) {
      append('register: ' + e?.message);
    }
  };

  const accept = async () => {
    try {
      const { sec } = getOrCreateIdentity();
      await relay.acceptInvite({ code, uidHash: pubHex }, pubHex, sec);
      append('accept_invite: ok');
    } catch (e: any) {
      append('accept_invite: ' + e?.message);
    }
  };

  // Auto-register on first load if not registered yet (best-effort)
  useEffect(() => {
    (async () => {
      try {
        if (!pubHex) return;
        const { sec } = getOrCreateIdentity();
        await relay.register({ ed25519: pubHex, x25519: pubHex }, pubHex, sec);
      } catch {}
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pubHex]);

  const mounted = useMounted();
  if (!mounted) return null;
  return (
    <main className="stack">
      <h1>Socii</h1>
      <p className="muted">uid: {pubHex}</p>
      <div className="row">
        <button className="btn" onClick={register}>Register Keys</button>
        <input className="input" placeholder={prompt} disabled />
        <input className="input" placeholder="Invite code" value={code} onChange={(e) => setCode(e.target.value)} />
        <button className="btn primary" onClick={accept}>Accept Invite</button>
      </div>
      <pre className="card">{log || 'No logs'}</pre>
    </main>
  );
}



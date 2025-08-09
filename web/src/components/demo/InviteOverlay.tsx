import { useEffect, useState } from 'react';
import { relay } from '../../lib/relay';

type Props = {
  isOpen: boolean;
  initialCode?: string;
  onClose: () => void;
  identity: { pubHex: string; sec?: Uint8Array };
};

export default function InviteOverlay({ isOpen, initialCode = '', onClose, identity }: Props) {
  const [code, setCode] = useState(initialCode);
  const [status, setStatus] = useState<'idle'|'loading'|'success'|'error'>('idle');
  const [error, setError] = useState('');

  useEffect(() => {
    setCode(initialCode);
  }, [initialCode]);

  if (!isOpen) return null;

  const accept = async () => {
    if (!code.trim()) return;
    setStatus('loading');
    setError('');
    try {
      await relay.acceptInvite({ code: code.trim(), uidHash: identity.pubHex }, identity.pubHex, identity.sec);
      setStatus('success');
      setTimeout(() => {
        onClose();
        setStatus('idle');
        setCode('');
      }, 800);
    } catch (e: any) {
      setError(e?.message || 'Failed to accept invite');
      setStatus('error');
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="card" style={{ width: 400, maxWidth: '90vw' }}>
        <h3 style={{ marginTop: 0 }}>Enter your invite code</h3>
        <input className="input" value={code} onChange={(e)=>setCode(e.target.value)} placeholder="e.g. SOCII-ABCD1234" />
        {error && <div className="muted" style={{ color: 'var(--danger, #ef4444)', marginTop: 8 }}>{error}</div>}
        {status === 'success' && <div className="muted" style={{ color: 'var(--success, #22c55e)', marginTop: 8 }}>Invite accepted</div>}
        <div className="row" style={{ marginTop: 12, justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={accept} disabled={status==='loading'}>{status==='loading'?'Accepting…':'Accept Invite'}</button>
        </div>
      </div>
    </div>
  );
}



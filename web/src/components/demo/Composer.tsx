import { useState } from 'react';
import { relay } from '../../lib/relay';

type Props = {
  identity: { pubHex: string; sec?: Uint8Array };
  onPosted?: () => void;
};

export default function Composer({ identity, onPosted }: Props) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);

  const post = async () => {
    const value = text.trim();
    if (!value) return;
    setLoading(true);
    try {
      await relay.statusCreate(value, 'contacts', identity.pubHex, identity.sec);
      setText('');
      onPosted?.();
    } catch {
      // ignore create error in demo if backend not ready
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="row" style={{ gap: 8 }}>
        <input className="input" style={{ padding: '6px 10px', fontSize: 12 }} placeholder="Share a quick status…" value={text} onChange={(e)=>setText(e.target.value)} />
        <button className="btn primary" style={{ fontSize: 12, padding: '6px 10px' }} onClick={post} disabled={loading}>{loading?'Posting…':'Post Status'}</button>
      </div>
    </div>
  );
}



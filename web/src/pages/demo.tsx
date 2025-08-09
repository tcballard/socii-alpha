import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { getOrCreateIdentity, fromHex } from '../lib/identity';
import nacl from 'tweetnacl';
import { relay } from '../lib/relay';

import InviteOverlay from '../components/demo/InviteOverlay';
import ProfileCard from '../components/demo/ProfileCard';
import ProfileSidebar from '../components/demo/ProfileSidebar';
import RightRail from '../components/demo/RightRail';
import Composer from '../components/demo/Composer';
import StatusFeed from '../components/demo/StatusFeed';
import PendingRequests from '../components/demo/PendingRequests';
import EventsPanel from '../components/demo/EventsPanel';

export default function DemoPage() {
  const router = useRouter();
  const [{ pubHex, sec }, setId] = useState(() => getOrCreateIdentity());
  const [initialized, setInitialized] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteCode, setInviteCode] = useState('');

  // Attempt one-time registration with relay (ed25519 + x25519)
  useEffect(() => {
    setId(getOrCreateIdentity());
  }, []);

  useEffect(() => {
    const run = async () => {
      try {
        // Derive x25519 keypair deterministically from stored seed if present
        let x25519PubHex = '';
        let x25519SecHex = '';
        if (typeof window !== 'undefined') {
          const seedHex = localStorage.getItem('socii_web_seed_hex');
          if (seedHex && seedHex.length >= 64) {
            const seed = fromHex(seedHex);
            const xkp = nacl.box.keyPair.fromSecretKey(seed);
            const toHex = (bytes: Uint8Array) => Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
            x25519PubHex = toHex(xkp.publicKey);
            x25519SecHex = toHex(xkp.secretKey);
          }
        }
        if (pubHex && sec && x25519PubHex && x25519SecHex) {
          await relay.register({ ed25519: pubHex, x25519: x25519PubHex, uidHash: pubHex });
        }
      } catch {
        // Non-fatal for demo, continue
      } finally {
        setInitialized(true);
      }
    };
    run();
  }, [pubHex, sec]);

  // Handle invite=CODE in query
  useEffect(() => {
    const code = (router.query?.invite as string) || '';
    if (code) {
      setInviteCode(code);
      setInviteOpen(true);
    }
  }, [router.query]);

  const identity = useMemo(() => ({ pubHex, sec }), [pubHex, sec]);

  const [refreshToken, setRefreshToken] = useState(0);
  const triggerRefresh = () => setRefreshToken((x) => x + 1);
  const [banner, setBanner] = useState<string | null>(null);

  // Simple queue poller to surface new pokes/messages
  useEffect(() => {
    if (!pubHex) return;
    let cancel: any;
    (async () => {
      cancel = (relay as any).queuePoller(pubHex, (items: any[]) => {
        const cnt = items.length;
        if (cnt) setBanner(`You have ${cnt} new message${cnt>1?'s':''}`);
      }, pubHex, sec, 8000);
    })();
    return () => { if (cancel) cancel(); };
  }, [pubHex, sec]);

  const PageShell = ({ children }: { children: React.ReactNode }) => (
    <div style={{ background: '#e9ebf0' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: 16 }}>{children}</div>
    </div>
  );

  if (!initialized) {
    return (
      <PageShell>
        <div className="card">
          <div style={{ fontSize: 14 }}>Loading demo…</div>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      {banner && (
        <div className="card" style={{ background:'#fffbe6', borderColor:'#facc15', marginBottom:12, padding:10 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div style={{ fontSize:12, color:'#92400e' }}>{banner}</div>
            <div className="row" style={{ gap:8 }}>
              <button className="btn" style={{ fontSize:12, padding:'4px 8px' }} onClick={()=>setBanner(null)}>Dismiss</button>
              <button className="btn primary" style={{ fontSize:12, padding:'4px 8px' }} onClick={async ()=>{ try { const upto=refreshToken; await relay.ack({ to: pubHex, n: 999999999 }, pubHex, sec); setBanner(null);} catch {} }}>Ack all</button>
            </div>
          </div>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 16 }}>
        {/* Left Sidebar (span 3) */}
        <div style={{ gridColumn: 'span 3' }}>
          <ProfileSidebar identity={identity} onEditProfile={() => setInviteOpen(false)} />
        </div>

        {/* Center: Wall/Publisher (span 6) */}
        <div style={{ gridColumn: 'span 6' }}>
          <div className="card" style={{ padding: 16, border: '1px solid #d1d5db' }}>
            <div style={{ marginBottom: 12 }}>
              <p style={{ fontSize: 12, color: '#374151', lineHeight: 1.5 }}>
                Socii lets you <strong>share</strong> moments, <strong>connect</strong> with real friends, and <strong>control</strong> your privacy in a network built for the people who matter.
              </p>
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#1f2937', marginBottom: 8 }}>Use Socii to…</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, color: '#374151' }}>Connect with close friends and family in a chronological feed.</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, color: '#374151' }}>Share photos and milestones with privacy-first protection.</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, color: '#374151' }}>Enjoy social media without ads or addictive designs.</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, color: '#374151' }}>Curate your circle with mutual, meaningful connections.</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, color: '#374151' }}>Experience unfiltered, transparent social networking.</span>
                </div>
              </div>
            </div>
            <div>
              <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', padding: 8, borderRadius: 4 }}>
                <p style={{ fontSize: 12, color: '#1d4ed8', margin: 0, marginBottom: 6 }}>
                  <strong>Early Beta Access:</strong> Autumn 2025
                </p>
                <p style={{ fontSize: 12, color: '#1e40af', margin: 0 }}>
                  Join the hundreds of others who are ready to take back control of their social media experience.
                </p>
              </div>
            </div>
          </div>

          <div style={{ height: 12 }} />

          <div className="card" style={{ padding: 12 }}>
            <Composer identity={identity} onPosted={triggerRefresh} />
            <div style={{ height: 8 }} />
            <StatusFeed identity={identity} refreshToken={refreshToken} />
          </div>
          <div style={{ height: 12 }} />
          <div className="card" style={{ padding: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#1f2937' }}>Invite Access</div>
              <button className="btn primary" style={{ fontSize: 12, padding: '6px 10px' }} onClick={() => setInviteOpen(true)}>Enter Invite Code</button>
            </div>
          </div>

          <div style={{ height: 12 }} />
          <div className="card" style={{ padding: 12 }}>
            <PendingRequests identity={identity} onChange={triggerRefresh} />
          </div>

          <div style={{ height: 12 }} />
          <div className="card" style={{ padding: 12 }}>
            <EventsPanel identity={identity} />
          </div>
        </div>

        {/* Right Rail (span 3) */}
        <div style={{ gridColumn: 'span 3' }}>
          <RightRail identity={identity} onOpenInvite={() => setInviteOpen(true)} />
        </div>
      </div>

      <InviteOverlay
        isOpen={inviteOpen}
        initialCode={inviteCode}
        onClose={() => setInviteOpen(false)}
        identity={identity}
      />
    </PageShell>
  );
}



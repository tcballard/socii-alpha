import { useEffect, useState } from 'react';
import { relay } from '../../lib/relay';

type Props = {
  identity: { pubHex: string; sec?: Uint8Array };
  onOpenInvite: () => void;
};

export default function RightRail({ identity, onOpenInvite }: Props) {
  const [friendRequests, setFriendRequests] = useState(0);
  const [eventInvites, setEventInvites] = useState(0);
  const [outgoingRequests, setOutgoingRequests] = useState(0);
  const [notifications, setNotifications] = useState(0); // placeholder
  const [upcoming, setUpcoming] = useState<Array<{ id: string; title: string; event_time: string }>>([]);

  const load = async () => {
    try {
      const summary = await relay.summaryCounts(identity.pubHex, identity.sec);
      setFriendRequests(summary.counts.friend_requests);
      setOutgoingRequests(summary.counts.outgoing_requests || 0);
      setEventInvites(summary.counts.event_invites);
      setNotifications(summary.counts.unread_queue);
    } catch {}
    try {
      const ev = await relay.eventsList(identity.pubHex, identity.sec);
      const soon = (ev.events || [])
        .filter((e) => new Date(e.event_time).getTime() > Date.now() - 86400000)
        .slice(0, 5)
        .map((e) => ({ id: e.id, title: e.title, event_time: e.event_time }));
      setUpcoming(soon);
    } catch {}
    // no-op
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [identity.pubHex]);

  const Section: React.FC<{ title: string; rightLink?: string; onRightClick?: () => void; children: React.ReactNode }>
    = ({ title, rightLink, onRightClick, children }) => (
      <div className="card" style={{ padding: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#1f2937' }}>{title}</div>
          {rightLink && (
            <button className="btn" style={{ fontSize: 11, padding: '2px 6px' }} onClick={onRightClick}>{rightLink}</button>
          )}
        </div>
        {children}
      </div>
    );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Section title="Requests" rightLink="See all" onRightClick={()=>{ location.href = '/requests'; }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 6, fontSize: 12, color: '#374151' }}>
          <div><strong>{friendRequests}</strong> friend requests</div>
          <div><strong>{outgoingRequests}</strong> outgoing requests</div>
          <div><strong>{eventInvites}</strong> event invitations</div>
        </div>
      </Section>

      <Section title="Notifications">
        <div style={{ fontSize: 12, color: '#374151' }}>
          <strong>{notifications}</strong> new notifications
        </div>
      </Section>

      <Section title="Invite Your Friends">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ width: 48, height: 48, background: '#e5e7eb', border: '1px solid #d3d6db' }} />
          <div style={{ fontSize: 12, color: '#374151' }}>
            Use simple tools to quickly invite and connect with friends on Socii.
          </div>
        </div>
        <div style={{ marginTop: 8 }}>
          <button className="btn primary" style={{ fontSize: 12, padding: '6px 10px' }} onClick={onOpenInvite}>Invite</button>
        </div>
      </Section>

      <Section title="Events and Birthdays" rightLink={upcoming.length > 0 ? 'See All' : undefined}>
        {upcoming.length === 0 ? (
          <div style={{ fontSize: 12, color: '#6b7280' }}>No upcoming items</div>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {upcoming.map((e) => (
              <li key={e.id} style={{ fontSize: 12, color: '#374151', padding: '4px 0' }}>
                <span style={{ color: '#1f2937', fontWeight: 600 }}>{new Date(e.event_time).toLocaleDateString()}</span>{' '}
                {e.title}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}



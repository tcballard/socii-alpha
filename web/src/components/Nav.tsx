import Link from 'next/link';

export default function Nav() {
  return (
    <nav style={{
      display: 'flex',
      gap: 12,
      alignItems: 'center',
      padding: '8px 12px',
      borderBottom: '1px solid #eee',
      marginBottom: 12,
      fontFamily: 'system-ui, sans-serif',
    }}>
      <Link href="/">Home</Link>
      <Link href="/feed">Feed</Link>
      <Link href="/settings">Settings</Link>
      <Link href="/contacts">Contacts</Link>
      <Link href="/events">Events</Link>
      <Link href="/albums">Albums</Link>
      <Link href="/requests">Requests</Link>
      <Link href="/admin/invites">Admin Invites</Link>
    </nav>
  );
}



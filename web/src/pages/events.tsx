import { useEffect, useState } from 'react';
import { useMounted } from '../lib/useMounted';
import { getOrCreateIdentity } from '../lib/identity';
import { relay } from '../lib/relay';

export default function Events() {
  const mounted = useMounted();
  const [{ pubHex, sec }] = useState(() => getOrCreateIdentity());
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [events, setEvents] = useState<Array<{ id: string; title: string; event_time: string; location?: string; description?: string }>>([]);

  const load = async () => {
    const res = await relay.eventsList(pubHex, sec);
    setEvents(res.events);
  };

  useEffect(() => { if (mounted) load(); /* eslint-disable-next-line */ }, [mounted]);

  if (!mounted) return null;
  return (
    <main className="stack">
      <h2>Events</h2>
      <div className="card">
        <h3 style={{ marginTop:0 }}>Create Event</h3>
        <div className="row">
          <input className="input" placeholder="Title" value={title} onChange={(e)=>setTitle(e.target.value)} />
          <input className="input" type="date" value={date} onChange={(e)=>setDate(e.target.value)} />
          <input className="input" type="time" value={time} onChange={(e)=>setTime(e.target.value)} />
        </div>
        <div className="row">
          <input className="input" placeholder="Location" value={location} onChange={(e)=>setLocation(e.target.value)} />
        </div>
        <div className="row">
          <input className="input" placeholder="Description" value={description} onChange={(e)=>setDescription(e.target.value)} />
          <button className="btn" onClick={async ()=>{
            if (!title || !date) return;
            const event_time = new Date(`${date}T${time || '00:00'}:00`).toISOString();
            await relay.eventsCreate({ title, event_time, location, description }, pubHex, sec);
            setTitle(''); setDate(''); setTime(''); setLocation(''); setDescription('');
            load();
          }}>Create</button>
        </div>
      </div>

      <ul style={{ listStyle:'none', padding:0 }}>
        {events.map(ev => (
          <li key={ev.id} className="card" style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div>
              <div style={{ fontWeight:600 }}>{ev.title}</div>
              <div className="muted" style={{ fontSize:12 }}>{new Date(ev.event_time).toLocaleString()} • {ev.location || ''}</div>
              {ev.description && <div>{ev.description}</div>}
            </div>
            <div className="row">
              <button className="btn" onClick={()=> relay.eventsRsvp(ev.id,'going', pubHex, sec)}>Going</button>
              <button className="btn" onClick={()=> relay.eventsRsvp(ev.id,'maybe', pubHex, sec)}>Maybe</button>
              <button className="btn" onClick={()=> relay.eventsRsvp(ev.id,'no', pubHex, sec)}>No</button>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}



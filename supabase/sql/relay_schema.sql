-- Supabase schema for relay (queues, invites, public keys, entitlement mirror)
create table if not exists public.users_public (
  uid_hash text primary key,
  ed25519 text not null,
  x25519 text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.invites (
  code text primary key,
  created_by text not null,
  used_by text,
  used_at timestamptz
);

create table if not exists public.entitlement_mirror (
  uid_hash text primary key,
  plan text not null,
  refreshed_at timestamptz not null default now()
);

create table if not exists public.queue_counters (
  uid_hash text primary key,
  last_n bigint not null default 0
);

create table if not exists public.queue_messages (
  id bigserial primary key,
  recipient_uid_hash text not null,
  n bigint not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  constraint uq_recipient_n unique(recipient_uid_hash, n)
);

create index if not exists idx_queue_recipient_n
  on public.queue_messages(recipient_uid_hash, n);

-- Profiles
create table if not exists public.profiles (
  uid_hash text primary key,
  display_name text,
  avatar_url text,
  bio text,
  favorites_books text,
  favorites_movies text,
  favorites_music text,
  updated_at timestamptz not null default now()
);

-- Contacts (simple directed list: owner -> peer)
create table if not exists public.contacts (
  owner_uid_hash text not null,
  peer_uid_hash text not null,
  nickname text,
  created_at timestamptz not null default now(),
  primary key(owner_uid_hash, peer_uid_hash)
);

-- Foreign keys to enable joins (guard against duplicate creation)
do $$
begin
  alter table public.contacts
    add constraint contacts_peer_fk
    foreign key (peer_uid_hash) references public.profiles(uid_hash) on delete cascade;
exception when duplicate_object then
  -- constraint already exists
  null;
end$$;

-- Events
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  owner_uid_hash text not null,
  title text not null,
  event_time timestamptz not null,
  location text,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.event_rsvps (
  event_id uuid not null references public.events(id) on delete cascade,
  uid_hash text not null,
  status text not null check (status in ('going','maybe','no')),
  updated_at timestamptz not null default now(),
  primary key(event_id, uid_hash)
);

-- Event invitations (separate from RSVPs)
create table if not exists public.event_invites (
  event_id uuid not null references public.events(id) on delete cascade,
  recipient_uid_hash text not null,
  inviter_uid_hash text not null,
  status text not null default 'pending' check (status in ('pending','accepted','declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(event_id, recipient_uid_hash)
);

-- Simple per-uid rate limiting (minute buckets)
create table if not exists public.rate_limits (
  uid_hash text not null,
  key text not null,
  window_start timestamptz not null,
  count int not null default 0,
  primary key(uid_hash, key, window_start)
);

create or replace function public.rate_limit_increment(p_uid text, p_key text, p_window timestamptz, p_limit int)
returns boolean language plpgsql security definer as $$
declare cur int;
begin
  insert into public.rate_limits(uid_hash, key, window_start, count)
  values (p_uid, p_key, date_trunc('minute', p_window), 1)
  on conflict (uid_hash, key, window_start)
  do update set count = rate_limits.count + 1
  returning count into cur;
  if cur > p_limit then
    return false;
  end if;
  return true;
end$$;

-- Albums
create table if not exists public.albums (
  id uuid primary key default gen_random_uuid(),
  owner_uid_hash text not null,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.album_photos (
  id uuid primary key default gen_random_uuid(),
  album_id uuid not null references public.albums(id) on delete cascade,
  url text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.photo_tags (
  photo_id uuid not null references public.album_photos(id) on delete cascade,
  tagged_uid_hash text not null,
  primary key(photo_id, tagged_uid_hash)
);

-- Status updates (2008 style)
create table if not exists public.status_updates (
  id uuid primary key default gen_random_uuid(),
  uid_hash text not null,
  content text not null,
  visibility text not null default 'contacts' check (visibility in ('public','contacts','private')),
  created_at timestamptz not null default now()
);

-- Optional materialized view for a simple feed (self + contacts). Not required.
-- create materialized view public.v_status_feed as
--   select s.id, s.uid_hash, s.content, s.visibility, s.created_at
--   from public.status_updates s;

-- Contact requests (mutual contacts when accepted)
create table if not exists public.contact_requests (
  id uuid primary key default gen_random_uuid(),
  requester_uid_hash text not null,
  recipient_uid_hash text not null,
  status text not null default 'pending' check (status in ('pending','accepted','declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);


-- RPCs
create or replace function public.accept_invite(p_code text, p_uid_hash text)
returns void language plpgsql security definer as $$
begin
  update public.invites
     set used_by = p_uid_hash, used_at = now()
   where code = p_code and used_by is null;
  if not found then
    raise exception 'invalid_or_used';
  end if;
end$$;

create or replace function public.enqueue_message(p_recipient text, p_payload jsonb)
returns bigint language plpgsql security definer as $$
declare
  next_n bigint;
begin
  insert into public.queue_counters(uid_hash, last_n)
  values (p_recipient, 0)
  on conflict (uid_hash) do nothing;

  update public.queue_counters
     set last_n = last_n + 1
   where uid_hash = p_recipient
  returning last_n into next_n;

  insert into public.queue_messages(recipient_uid_hash, n, payload)
  values (p_recipient, next_n, p_payload);

  return next_n;
end$$;

create or replace function public.fetch_queue(p_recipient text, p_from bigint, p_limit int default 100)
returns setof public.queue_messages
language sql security definer as $$
  select * from public.queue_messages
   where recipient_uid_hash = p_recipient
     and n >= p_from
   order by n asc
   limit p_limit;
$$;

create or replace function public.ack_queue(p_recipient text, p_upto bigint)
returns bigint language sql security definer as $$
  with d as (
    delete from public.queue_messages
     where recipient_uid_hash = p_recipient
       and n <= p_upto
    returning 1
  )
  select count(*)::bigint from d;
$$;



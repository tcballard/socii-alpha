/*
  # Add missing profile columns and foreign key constraints

  1. Profile Table Updates
    - Add `bio` column for user biographies
    - Add `favorites_books` column for book preferences
    - Add `favorites_movies` column for movie preferences  
    - Add `favorites_music` column for music preferences

  2. Foreign Key Constraints
    - Add foreign key from `contact_requests.requester_uid_hash` to `profiles.uid_hash`
    - Add foreign key from `contact_requests.recipient_uid_hash` to `profiles.uid_hash`
    - Add foreign key from `event_invites.inviter_uid_hash` to `profiles.uid_hash`
    - Add foreign key from `event_invites.recipient_uid_hash` to `profiles.uid_hash`

  3. Security
    - Maintain existing RLS policies
*/

-- Add missing columns to profiles table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'bio'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN bio text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'favorites_books'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN favorites_books text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'favorites_movies'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN favorites_movies text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'favorites_music'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN favorites_music text;
  END IF;
END $$;

-- Add foreign key constraints for contact_requests
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'contact_requests_requester_fk'
  ) THEN
    ALTER TABLE public.contact_requests
      ADD CONSTRAINT contact_requests_requester_fk
      FOREIGN KEY (requester_uid_hash) REFERENCES public.profiles(uid_hash) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN duplicate_object THEN
  -- constraint already exists
  NULL;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'contact_requests_recipient_fk'
  ) THEN
    ALTER TABLE public.contact_requests
      ADD CONSTRAINT contact_requests_recipient_fk
      FOREIGN KEY (recipient_uid_hash) REFERENCES public.profiles(uid_hash) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN duplicate_object THEN
  -- constraint already exists
  NULL;
END $$;

-- Add foreign key constraints for event_invites
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'event_invites_inviter_fk'
  ) THEN
    ALTER TABLE public.event_invites
      ADD CONSTRAINT event_invites_inviter_fk
      FOREIGN KEY (inviter_uid_hash) REFERENCES public.profiles(uid_hash) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN duplicate_object THEN
  -- constraint already exists
  NULL;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'event_invites_recipient_fk'
  ) THEN
    ALTER TABLE public.event_invites
      ADD CONSTRAINT event_invites_recipient_fk
      FOREIGN KEY (recipient_uid_hash) REFERENCES public.profiles(uid_hash) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN duplicate_object THEN
  -- constraint already exists
  NULL;
END $$;
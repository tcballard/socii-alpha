-- D1 schema for HumanLink relay
CREATE TABLE IF NOT EXISTS users_public (
  uid_hash TEXT PRIMARY KEY,
  ed25519 TEXT NOT NULL,
  x25519 TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS invites (
  code TEXT PRIMARY KEY,
  created_by TEXT NOT NULL,
  used_by TEXT,
  used_at INTEGER
);

CREATE TABLE IF NOT EXISTS entitlement_mirror (
  uid_hash TEXT PRIMARY KEY,
  plan TEXT NOT NULL,
  refreshed_at INTEGER NOT NULL
);



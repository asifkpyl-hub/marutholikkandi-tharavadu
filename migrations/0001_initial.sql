PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin','editor')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS family_members (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  gender TEXT,
  birth_date TEXT,
  death_date TEXT,
  parent1_id TEXT,
  parent2_id TEXT,
  spouse_name TEXT,
  biography TEXT,
  photo_url TEXT,
  branch TEXT,
  is_public INTEGER NOT NULL DEFAULT 1,
  created_by TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(parent1_id) REFERENCES family_members(id) ON DELETE SET NULL,
  FOREIGN KEY(parent2_id) REFERENCES family_members(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  action TEXT NOT NULL,
  member_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_members_name ON family_members(full_name);
CREATE INDEX IF NOT EXISTS idx_members_parent1 ON family_members(parent1_id);
CREATE INDEX IF NOT EXISTS idx_members_parent2 ON family_members(parent2_id);
CREATE INDEX IF NOT EXISTS idx_members_public ON family_members(is_public);

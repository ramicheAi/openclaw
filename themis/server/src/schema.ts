// SQLite DDL, written to stay close to Postgres so the schema can be lifted to
// Supabase/Postgres with minimal edits. Notes on the mapping:
//   - TEXT primary keys (slugs/ids)            -> same in PG
//   - INTEGER 0/1 booleans (hot, done, ...)    -> BOOLEAN in PG
//   - TEXT columns holding JSON (json_*)       -> JSONB in PG
//   - TEXT ISO-8601 timestamps                 -> TIMESTAMPTZ in PG
//   - accepted is nullable tri-state           -> BOOLEAN NULL in PG
// JSON-encoded columns are prefixed `json_` by convention.

export const SCHEMA = /* sql */ `
CREATE TABLE IF NOT EXISTS matters (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  client         TEXT NOT NULL,
  matter_type    TEXT NOT NULL,
  lead_attorney  TEXT NOT NULL,
  status         TEXT NOT NULL,
  pages          INTEGER NOT NULL DEFAULT 0,
  docs           INTEGER NOT NULL DEFAULT 0,
  ingest_percent INTEGER NOT NULL DEFAULT 0,
  last_activity  TEXT NOT NULL,
  posture        TEXT NOT NULL DEFAULT '',
  json_claims    TEXT NOT NULL DEFAULT '[]',
  json_defenses  TEXT NOT NULL DEFAULT '[]',
  json_key_dates TEXT NOT NULL DEFAULT '[]',
  created_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ingest_stages (
  matter_id TEXT NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  ord       INTEGER NOT NULL,
  label     TEXT NOT NULL,
  done      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (matter_id, ord)
);

CREATE TABLE IF NOT EXISTS gap_findings (
  id        TEXT PRIMARY KEY,
  matter_id TEXT NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  severity  TEXT NOT NULL,
  text      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS documents (
  id              TEXT PRIMARY KEY,
  matter_id       TEXT NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  bates           TEXT NOT NULL,
  title           TEXT NOT NULL,
  type            TEXT NOT NULL,
  doc_date        TEXT NOT NULL,
  author          TEXT NOT NULL,
  json_recipients TEXT NOT NULL DEFAULT '[]',
  summary         TEXT NOT NULL DEFAULT '',
  json_entities   TEXT NOT NULL DEFAULT '[]',
  privilege       TEXT NOT NULL DEFAULT 'none',
  privilege_basis TEXT,
  hot             INTEGER NOT NULL DEFAULT 0,
  thread_id       TEXT,
  thread_pos      INTEGER,
  thread_len      INTEGER,
  duplicates      INTEGER,
  ocr_confidence  TEXT NOT NULL DEFAULT 'high',
  body            TEXT NOT NULL DEFAULT '',
  pages           INTEGER NOT NULL DEFAULT 1,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  reviewed        INTEGER NOT NULL DEFAULT 0,
  reviewed_by     TEXT,
  reviewed_at     TEXT,
  hot_set_by      TEXT,
  hot_set_at      TEXT
);
CREATE INDEX IF NOT EXISTS idx_documents_matter ON documents(matter_id);
CREATE INDEX IF NOT EXISTS idx_documents_bates ON documents(matter_id, bates);

CREATE TABLE IF NOT EXISTS chronology_events (
  id                TEXT PRIMARY KEY,
  matter_id         TEXT NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  event_date        TEXT NOT NULL,
  description        TEXT NOT NULL,
  citation_bates    TEXT NOT NULL,
  citation_page     INTEGER NOT NULL DEFAULT 1,
  citation_verified INTEGER NOT NULL DEFAULT 0,
  confidence        TEXT NOT NULL DEFAULT 'medium',
  accepted          INTEGER,
  json_issue_tags   TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS idx_chron_matter ON chronology_events(matter_id);

CREATE TABLE IF NOT EXISTS entities (
  id                 TEXT PRIMARY KEY,
  matter_id          TEXT NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  name               TEXT NOT NULL,
  role               TEXT NOT NULL DEFAULT '',
  org                TEXT NOT NULL DEFAULT '',
  json_aliases       TEXT NOT NULL DEFAULT '[]',
  mentions           INTEGER NOT NULL DEFAULT 0,
  json_relationships TEXT NOT NULL DEFAULT '[]',
  first_seen         TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_entities_matter ON entities(matter_id);

CREATE TABLE IF NOT EXISTS chat_messages (
  id             TEXT PRIMARY KEY,
  matter_id      TEXT NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  role           TEXT NOT NULL,
  text           TEXT NOT NULL,
  json_citations TEXT NOT NULL DEFAULT '[]',
  confidence     TEXT,
  created_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chat_matter ON chat_messages(matter_id, created_at);

CREATE TABLE IF NOT EXISTS causal_chains (
  id         TEXT PRIMARY KEY,
  matter_id  TEXT NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  json_nodes TEXT NOT NULL DEFAULT '[]',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_causal_matter ON causal_chains(matter_id);

CREATE TABLE IF NOT EXISTS binders (
  id         TEXT PRIMARY KEY,
  matter_id  TEXT NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_binders_matter ON binders(matter_id);

CREATE TABLE IF NOT EXISTS binder_items (
  id        TEXT PRIMARY KEY,
  binder_id TEXT NOT NULL REFERENCES binders(id) ON DELETE CASCADE,
  doc_id    TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  label     TEXT NOT NULL,
  ord       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_binder_items_binder ON binder_items(binder_id, ord);

CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,
  email       TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL DEFAULT '',
  firm        TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL,
  last_login  TEXT
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

CREATE TABLE IF NOT EXISTS auth_tokens (
  token       TEXT PRIMARY KEY,        -- url-safe random
  email       TEXT NOT NULL,           -- normalized lowercase
  created_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL,           -- ISO; tokens live 15 min
  consumed    INTEGER NOT NULL DEFAULT 0,
  ip          TEXT NOT NULL DEFAULT '' -- request ip for the audit, best effort
);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_email ON auth_tokens(email);

CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,        -- the cookie value
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL,
  last_used   TEXT,
  expires_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS damages_items (
  id              TEXT PRIMARY KEY,
  matter_id       TEXT NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  category        TEXT NOT NULL,           -- 'medical' | 'lost_wages' | 'property' | 'pain_suffering' | 'future_care' | 'other'
  description     TEXT NOT NULL,
  amount_cents    INTEGER NOT NULL DEFAULT 0,   -- dollars * 100
  multiplier      REAL NOT NULL DEFAULT 1,      -- e.g. 2.5x for pain & suffering
  date_incurred   TEXT,                         -- ISO YYYY-MM-DD
  citation_bates  TEXT,                         -- optional anchor doc
  notes           TEXT NOT NULL DEFAULT '',
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_damages_matter ON damages_items(matter_id);

CREATE TABLE IF NOT EXISTS share_links (
  token        TEXT PRIMARY KEY,        -- url-safe random
  matter_id    TEXT NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  label        TEXT NOT NULL DEFAULT '',
  scope        TEXT NOT NULL DEFAULT 'matter', -- 'matter' | 'binder'
  binder_id    TEXT,
  created_by   TEXT NOT NULL DEFAULT '',
  created_at   TEXT NOT NULL,
  expires_at   TEXT,                    -- ISO; NULL = no expiry
  revoked      INTEGER NOT NULL DEFAULT 0,
  view_count   INTEGER NOT NULL DEFAULT 0,
  last_viewed  TEXT
);
CREATE INDEX IF NOT EXISTS idx_share_matter ON share_links(matter_id);

CREATE TABLE IF NOT EXISTS productions (
  id              TEXT PRIMARY KEY,
  matter_id       TEXT NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  direction       TEXT NOT NULL,                    -- 'sent' | 'received'
  party           TEXT NOT NULL,                    -- producing/receiving party name
  prod_date       TEXT NOT NULL,                    -- ISO YYYY-MM-DD
  label           TEXT NOT NULL DEFAULT '',         -- e.g. "Defendant's First Production"
  bates_start     TEXT NOT NULL,                    -- e.g. OLIV-000001
  bates_end       TEXT NOT NULL,                    -- e.g. OLIV-000050
  doc_count       INTEGER NOT NULL DEFAULT 0,
  privilege_log   INTEGER NOT NULL DEFAULT 0,       -- 1 = privilege log served alongside
  notes           TEXT NOT NULL DEFAULT '',
  created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_productions_matter ON productions(matter_id, prod_date);

CREATE TABLE IF NOT EXISTS deadlines (
  id          TEXT PRIMARY KEY,
  matter_id   TEXT NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  due_date    TEXT NOT NULL,           -- ISO YYYY-MM-DD
  title       TEXT NOT NULL,
  detail      TEXT NOT NULL DEFAULT '',
  kind        TEXT NOT NULL DEFAULT 'deadline', -- deadline | hearing | conference | trial | disclosure
  source      TEXT NOT NULL DEFAULT '', -- e.g. "Scheduling Order" or a Bates id
  done        INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_deadlines_matter ON deadlines(matter_id, due_date);

CREATE TABLE IF NOT EXISTS audit_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  matter_id   TEXT NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  ts          TEXT NOT NULL,
  actor       TEXT NOT NULL,
  action      TEXT NOT NULL,
  detail      TEXT NOT NULL DEFAULT '',
  prev_hash   TEXT NOT NULL DEFAULT '',
  entry_hash  TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_audit_matter ON audit_log(matter_id, id);
`;

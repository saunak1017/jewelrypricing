-- Safe to paste into the Cloudflare D1 Console more than once.
-- This repairs the scan/selection tables without one-time ALTER statements.
CREATE TABLE IF NOT EXISTS style_selections (
  id TEXT PRIMARY KEY, style_id TEXT NOT NULL, customer TEXT, meeting_date TEXT,
  proposed_price REAL, buying_group TEXT, modifications INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'complete', cost_snapshot REAL DEFAULT 0,
  created_by TEXT, updated_by TEXT, scan_session_id TEXT, scan_item_id TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  FOREIGN KEY(style_id) REFERENCES styles(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS barcode_uploads (
  id TEXT PRIMARY KEY, filename TEXT, uploaded_at TEXT NOT NULL, uploaded_by TEXT,
  active INTEGER NOT NULL DEFAULT 0, row_count INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS barcode_mappings (
  id TEXT PRIMARY KEY, upload_id TEXT NOT NULL, barcode TEXT NOT NULL,
  source_style_no TEXT, base_key TEXT, UNIQUE(upload_id, barcode),
  FOREIGN KEY(upload_id) REFERENCES barcode_uploads(id)
);
CREATE TABLE IF NOT EXISTS style_aliases (
  id TEXT PRIMARY KEY, source_style_no TEXT NOT NULL UNIQUE, target_style_id TEXT NOT NULL,
  candidate_signature TEXT, prompt_on_multiple INTEGER DEFAULT 0,
  confirmed_by TEXT, confirmed_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS scan_sessions (
  id TEXT PRIMARY KEY, name TEXT, customer TEXT, mode TEXT NOT NULL,
  default_markup REAL DEFAULT 45, created_by TEXT, created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL, status TEXT DEFAULT 'open'
);
CREATE TABLE IF NOT EXISTS scan_items (
  id TEXT PRIMARY KEY, session_id TEXT NOT NULL, barcode TEXT, source_style_no TEXT,
  style_id TEXT, quantity INTEGER DEFAULT 1, cost_snapshot REAL DEFAULT 0,
  cttw_snapshot REAL DEFAULT 0, markup_pct REAL DEFAULT 45, final_price REAL DEFAULT 0,
  resolution_status TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  FOREIGN KEY(session_id) REFERENCES scan_sessions(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS scan_selection_links (
  scan_item_id TEXT PRIMARY KEY, selection_id TEXT NOT NULL,
  scan_session_id TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_barcode_lookup ON barcode_mappings(upload_id, barcode);
CREATE INDEX IF NOT EXISTS idx_scan_items_session ON scan_items(session_id);
CREATE INDEX IF NOT EXISTS idx_scan_selection_session ON scan_selection_links(scan_session_id);

SELECT name AS scanning_table, 'ok' AS status
FROM sqlite_schema
WHERE type='table' AND name IN (
  'style_selections','barcode_uploads','barcode_mappings','style_aliases',
  'scan_sessions','scan_items','scan_selection_links'
)
ORDER BY name;

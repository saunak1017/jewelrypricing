-- Run once against an existing production database. New databases are also
-- initialized automatically by functions/_utils.js.
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id));
CREATE TABLE IF NOT EXISTS audit_log (id TEXT PRIMARY KEY, user_id TEXT, user_name TEXT, action TEXT NOT NULL, entity_type TEXT, entity_id TEXT, before_json TEXT, after_json TEXT, metadata_json TEXT, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);
CREATE TABLE IF NOT EXISTS style_selections (id TEXT PRIMARY KEY, style_id TEXT NOT NULL, customer TEXT, meeting_date TEXT, proposed_price REAL, buying_group TEXT, modifications INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'complete', cost_snapshot REAL DEFAULT 0, created_by TEXT, updated_by TEXT, scan_session_id TEXT, scan_item_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY(style_id) REFERENCES styles(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS style_imports (id TEXT PRIMARY KEY, filename TEXT, row_count INTEGER DEFAULT 0, imported_at TEXT NOT NULL, imported_by TEXT);
CREATE TABLE IF NOT EXISTS barcode_uploads (id TEXT PRIMARY KEY, filename TEXT, uploaded_at TEXT NOT NULL, uploaded_by TEXT, active INTEGER NOT NULL DEFAULT 0, row_count INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS barcode_mappings (id TEXT PRIMARY KEY, upload_id TEXT NOT NULL, barcode TEXT NOT NULL, source_style_no TEXT, base_key TEXT, UNIQUE(upload_id, barcode), FOREIGN KEY(upload_id) REFERENCES barcode_uploads(id));
CREATE INDEX IF NOT EXISTS idx_barcode_lookup ON barcode_mappings(upload_id, barcode);
CREATE TABLE IF NOT EXISTS style_aliases (id TEXT PRIMARY KEY, source_style_no TEXT NOT NULL UNIQUE, target_style_id TEXT NOT NULL, candidate_signature TEXT, prompt_on_multiple INTEGER DEFAULT 0, confirmed_by TEXT, confirmed_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS scan_sessions (id TEXT PRIMARY KEY, name TEXT, customer TEXT, mode TEXT NOT NULL, default_markup REAL DEFAULT 45, created_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, status TEXT DEFAULT 'open');
CREATE TABLE IF NOT EXISTS scan_items (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, barcode TEXT, source_style_no TEXT, style_id TEXT, quantity INTEGER DEFAULT 1, cost_snapshot REAL DEFAULT 0, cttw_snapshot REAL DEFAULT 0, markup_pct REAL DEFAULT 45, final_price REAL DEFAULT 0, resolution_status TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY(session_id) REFERENCES scan_sessions(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS scan_selection_links (scan_item_id TEXT PRIMARY KEY, selection_id TEXT NOT NULL, scan_session_id TEXT NOT NULL, created_at TEXT NOT NULL);
ALTER TABLE styles ADD COLUMN cost_source TEXT DEFAULT 'calculated';
ALTER TABLE styles ADD COLUMN imported_stone_count REAL DEFAULT 0;
ALTER TABLE styles ADD COLUMN imported_cttw REAL DEFAULT 0;
ALTER TABLE styles ADD COLUMN imported_metal_cost REAL DEFAULT 0;
ALTER TABLE styles ADD COLUMN imported_diamond_cost REAL DEFAULT 0;
ALTER TABLE styles ADD COLUMN imported_export_cost REAL DEFAULT 0;
ALTER TABLE styles ADD COLUMN imported_duty REAL DEFAULT 0;
ALTER TABLE styles ADD COLUMN imported_tariff REAL DEFAULT 0;
ALTER TABLE styles ADD COLUMN imported_import_cost REAL DEFAULT 0;
ALTER TABLE style_orders ADD COLUMN status TEXT DEFAULT 'complete';
ALTER TABLE style_orders ADD COLUMN cost_snapshot REAL DEFAULT 0;
ALTER TABLE style_orders ADD COLUMN created_by TEXT;
ALTER TABLE style_orders ADD COLUMN updated_by TEXT;

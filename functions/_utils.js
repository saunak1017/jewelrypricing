export function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

const DEFAULT_USERS = { Administrator: "admin123" };
const SESSION_COOKIE = "jc_session";

export function configuredUsers(env) {
  try {
    const parsed = JSON.parse(env.USER_PASSWORDS || "");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
  } catch (_) { /* Fall through to the backwards-compatible configuration. */ }
  return env.ADMIN_PASSWORD ? { Administrator: env.ADMIN_PASSWORD } : DEFAULT_USERS;
}

function cookieValue(request, name) {
  const cookie = request.headers.get("cookie") || "";
  return cookie.split(";").map(v => v.trim()).find(v => v.startsWith(`${name}=`))?.slice(name.length + 1) || "";
}

export async function requireAdmin(context) {
  const db = context.env.DB;
  await ensureSchema(db);
  const token = cookieValue(context.request, SESSION_COOKIE);
  if (token) {
    const session = await db.prepare(`SELECT s.*, u.name FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > ? AND u.active = 1`).bind(token, nowIso()).first();
    if (session) {
      context.data.user = { id: session.user_id, name: session.name };
      return null;
    }
  }
  // Keep Bearer authentication working during deployment and local migration.
  const auth = (context.request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  const match = Object.entries(configuredUsers(context.env)).find(([, password]) => String(password) === auth);
  if (match) {
    const id = `user_${slug(match[0])}`;
    await upsertUser(db, id, match[0]);
    context.data.user = { id, name: match[0] };
    return null;
  }
  return json({ error: "Unauthorized" }, 401);
}

export function sessionCookie(token, maxAge = 60 * 60 * 24 * 7) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

export async function upsertUser(db, id, name) {
  await db.prepare(`INSERT INTO users (id, name, active, created_at, updated_at) VALUES (?, ?, 1, ?, ?)
    ON CONFLICT(id) DO UPDATE SET name=excluded.name, active=1, updated_at=excluded.updated_at`).bind(id, name, nowIso(), nowIso()).run();
}

export async function audit(db, user, action, entityType, entityId, before = null, after = null, metadata = null) {
  await db.prepare(`INSERT INTO audit_log (id, user_id, user_name, action, entity_type, entity_id, before_json, after_json, metadata_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(uid("audit"), user?.id || "system", user?.name || "System", action, entityType, entityId || "", before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null, metadata ? JSON.stringify(metadata) : null, nowIso()).run();
}

export function slug(value) {
  return String(value || "user").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

export function toNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  const n = Number(String(value).replace(/[$,% ,]/g, ""));
  return Number.isFinite(n) ? n : fallback;
}

export function uid(prefix = "id") {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function nowIso() {
  return new Date().toISOString();
}

export async function ensureSchema(db) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id))`),
    db.prepare(`CREATE TABLE IF NOT EXISTS audit_log (id TEXT PRIMARY KEY, user_id TEXT, user_name TEXT, action TEXT NOT NULL, entity_type TEXT, entity_id TEXT, before_json TEXT, after_json TEXT, metadata_json TEXT, created_at TEXT NOT NULL)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS pricing_uploads (
      id TEXT PRIMARY KEY,
      filename TEXT,
      uploaded_at TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 0,
      row_count INTEGER NOT NULL DEFAULT 0
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS diamond_prices (
      id TEXT PRIMARY KEY,
      upload_id TEXT NOT NULL,
      interchange_shape TEXT,
      quality TEXT,
      color_clarity TEXT,
      interchange_minweight REAL,
      interchange_maxweight REAL,
      size TEXT,
      interchange_unitcost REAL,
      FOREIGN KEY(upload_id) REFERENCES pricing_uploads(id)
    )`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_diamond_lookup ON diamond_prices(upload_id, interchange_shape, quality, interchange_minweight, interchange_maxweight)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS styles (
      id TEXT PRIMARY KEY,
      factory TEXT,
      vendor_style_no TEXT,
      shivani_style_no TEXT,
      jewelry_category TEXT,
      metal_kt TEXT,
      diamond_description TEXT,
      diamond_quality TEXT,
      stone_count REAL DEFAULT 0,
      cttw REAL DEFAULT 0,
      net_wt_gms REAL DEFAULT 0,
      gold_loss_pct REAL DEFAULT 0,
      current_gold_lock REAL DEFAULT 0,
      gold_per_gram REAL DEFAULT 0,
      merchandiser TEXT,
      diamond_handling REAL DEFAULT 0,
      total_labor REAL DEFAULT 0,
      duty_pct REAL DEFAULT 7,
      tariff_pct REAL DEFAULT 11,
      pendant_chain REAL DEFAULT 0,
      earring_backs REAL DEFAULT 0,
      cad_fees REAL DEFAULT 0,
      margin_pct REAL DEFAULT 45,
      selling_price REAL DEFAULT 0,
      notes TEXT,
      image_filename TEXT,
      image_data_url TEXT,
      model_filename TEXT,
      model_data_url TEXT,
      model_mime_type TEXT,
      archived INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS diamond_components (
      id TEXT PRIMARY KEY,
      style_id TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      shape TEXT,
      quality TEXT,
      color_clarity TEXT,
      each_weight REAL DEFAULT 0,
      quantity REAL DEFAULT 0,
      pricing_mode TEXT NOT NULL DEFAULT 'auto',
      manual_unitcost REAL DEFAULT 0,
      manual_total REAL DEFAULT 0,
      notes TEXT,
      FOREIGN KEY(style_id) REFERENCES styles(id) ON DELETE CASCADE
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS style_orders (
      id TEXT PRIMARY KEY,
      style_id TEXT NOT NULL,
      customer TEXT,
      order_date TEXT,
      quantity TEXT,
      price TEXT,
      buying_group TEXT,
      memo_or_asset TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(style_id) REFERENCES styles(id) ON DELETE CASCADE
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS style_selections (
      id TEXT PRIMARY KEY, style_id TEXT NOT NULL, customer TEXT, meeting_date TEXT, proposed_price REAL, buying_group TEXT,
      modifications INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'complete', cost_snapshot REAL DEFAULT 0,
      created_by TEXT, updated_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      FOREIGN KEY(style_id) REFERENCES styles(id) ON DELETE CASCADE
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS style_imports (id TEXT PRIMARY KEY, filename TEXT, row_count INTEGER DEFAULT 0, imported_at TEXT NOT NULL, imported_by TEXT)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS barcode_uploads (id TEXT PRIMARY KEY, filename TEXT, uploaded_at TEXT NOT NULL, uploaded_by TEXT, active INTEGER NOT NULL DEFAULT 0, row_count INTEGER DEFAULT 0)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS barcode_mappings (id TEXT PRIMARY KEY, upload_id TEXT NOT NULL, barcode TEXT NOT NULL, source_style_no TEXT, base_key TEXT, UNIQUE(upload_id, barcode), FOREIGN KEY(upload_id) REFERENCES barcode_uploads(id))`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_barcode_lookup ON barcode_mappings(upload_id, barcode)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS style_aliases (id TEXT PRIMARY KEY, source_style_no TEXT NOT NULL UNIQUE, target_style_id TEXT NOT NULL, candidate_signature TEXT, prompt_on_multiple INTEGER DEFAULT 0, confirmed_by TEXT, confirmed_at TEXT NOT NULL)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS scan_sessions (id TEXT PRIMARY KEY, name TEXT, customer TEXT, mode TEXT NOT NULL, default_markup REAL DEFAULT 45, created_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, status TEXT DEFAULT 'open')`),
    db.prepare(`CREATE TABLE IF NOT EXISTS scan_items (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, barcode TEXT, source_style_no TEXT, style_id TEXT, quantity INTEGER DEFAULT 1, cost_snapshot REAL DEFAULT 0, cttw_snapshot REAL DEFAULT 0, markup_pct REAL DEFAULT 45, final_price REAL DEFAULT 0, resolution_status TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY(session_id) REFERENCES scan_sessions(id) ON DELETE CASCADE)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS cost_history (
      id TEXT PRIMARY KEY,
      style_id TEXT NOT NULL,
      pricing_upload_id TEXT,
      snapshot_at TEXT NOT NULL,
      reason TEXT,
      total_metal_cost REAL DEFAULT 0,
      total_diamond_cost REAL DEFAULT 0,
      diamond_handling REAL DEFAULT 0,
      total_labor REAL DEFAULT 0,
      total_export_cost REAL DEFAULT 0,
      duty REAL DEFAULT 0,
      tariff REAL DEFAULT 0,
      total_import_cost REAL DEFAULT 0,
      details_json TEXT,
      FOREIGN KEY(style_id) REFERENCES styles(id) ON DELETE CASCADE
    )`)
  ]);

  const styleColumns = [
    ["merchandiser", "TEXT DEFAULT ''"],
    ["pendant_chain", "REAL DEFAULT 0"],
    ["earring_backs", "REAL DEFAULT 0"],
    ["cad_fees", "REAL DEFAULT 0"],
    ["margin_pct", "REAL DEFAULT 45"],
    ["selling_price", "REAL DEFAULT 0"],
    ["image_filename", "TEXT DEFAULT ''"],
    ["image_data_url", "TEXT DEFAULT ''"],
    ["model_filename", "TEXT DEFAULT ''"],
    ["model_data_url", "TEXT DEFAULT ''"],
    ["model_mime_type", "TEXT DEFAULT ''"],
    ["cost_source", "TEXT DEFAULT 'calculated'"],
    ["imported_stone_count", "REAL DEFAULT 0"], ["imported_cttw", "REAL DEFAULT 0"],
    ["imported_metal_cost", "REAL DEFAULT 0"], ["imported_diamond_cost", "REAL DEFAULT 0"],
    ["imported_export_cost", "REAL DEFAULT 0"], ["imported_duty", "REAL DEFAULT 0"],
    ["imported_tariff", "REAL DEFAULT 0"], ["imported_import_cost", "REAL DEFAULT 0"]
  ];
  for (const [name, type] of styleColumns) {
    await db.prepare(`ALTER TABLE styles ADD COLUMN ${name} ${type}`).run().catch(() => {});
  }
  const orderColumns = [["status", "TEXT DEFAULT 'complete'"], ["cost_snapshot", "REAL DEFAULT 0"], ["created_by", "TEXT"], ["updated_by", "TEXT"]];
  for (const [name, type] of orderColumns) await db.prepare(`ALTER TABLE style_orders ADD COLUMN ${name} ${type}`).run().catch(() => {});
  for (const [name, type] of [["cost_snapshot", "REAL DEFAULT 0"], ["cttw_snapshot", "REAL DEFAULT 0"]]) await db.prepare(`ALTER TABLE scan_items ADD COLUMN ${name} ${type}`).run().catch(() => {});
}

export async function getActiveUpload(db) {
  return await db.prepare(`SELECT * FROM pricing_uploads WHERE active = 1 ORDER BY uploaded_at DESC LIMIT 1`).first();
}

export async function findDiamondPrice(db, activeUploadId, shape, quality, eachWeight) {
  if (!activeUploadId || !shape || !quality || !Number.isFinite(Number(eachWeight))) return null;
  return await db.prepare(`
    SELECT * FROM diamond_prices
    WHERE upload_id = ?
      AND UPPER(TRIM(interchange_shape)) = UPPER(TRIM(?))
      AND UPPER(TRIM(quality)) = UPPER(TRIM(?))
      AND interchange_minweight <= ?
      AND interchange_maxweight >= ?
    ORDER BY interchange_minweight DESC, interchange_maxweight ASC
    LIMIT 1
  `).bind(activeUploadId, shape, quality, Number(eachWeight), Number(eachWeight)).first();
}

export async function calculateStyle(db, style, components, activeUpload = null) {
  const upload = activeUpload || await getActiveUpload(db);
  const enriched = [];
  let totalDiamondCost = 0;
  let totalCtw = 0;
  let stoneCount = 0;

  for (const c of components || []) {
    const eachWeight = toNumber(c.each_weight);
    const quantity = toNumber(c.quantity);
    const totalLineCtw = eachWeight * quantity;
    let unitCost = 0;
    let lineTotal = 0;
    let matchedPrice = null;
    let status = "manual";

    if (c.pricing_mode === "manual_total") {
      lineTotal = toNumber(c.manual_total);
      unitCost = totalLineCtw ? lineTotal / totalLineCtw : 0;
    } else if (c.pricing_mode === "manual_unit") {
      unitCost = toNumber(c.manual_unitcost);
      lineTotal = totalLineCtw * unitCost;
    } else {
      matchedPrice = await findDiamondPrice(db, upload?.id, c.shape, c.quality, eachWeight);
      if (matchedPrice) {
        unitCost = toNumber(matchedPrice.interchange_unitcost);
        lineTotal = totalLineCtw * unitCost;
        status = "matched";
      } else {
        status = "missing_price";
      }
    }

    totalCtw += totalLineCtw;
    stoneCount += quantity;
    totalDiamondCost += lineTotal;
    enriched.push({
      ...c,
      total_ctw: round(totalLineCtw),
      resolved_unitcost: round(unitCost),
      line_total: round(lineTotal),
      match_status: status,
      matched_price: matchedPrice ? {
        min: matchedPrice.interchange_minweight,
        max: matchedPrice.interchange_maxweight,
        size: matchedPrice.size,
        color_clarity: matchedPrice.color_clarity,
        upload_id: matchedPrice.upload_id
      } : null
    });
  }

  const totalMetalCost = toNumber(style.net_wt_gms) * toNumber(style.gold_per_gram);
  const handling = toNumber(style.diamond_handling);
  const labor = toNumber(style.total_labor);
  const exportCost = totalMetalCost + totalDiamondCost + handling + labor;
  const duty = exportCost * (toNumber(style.duty_pct, 7) / 100);
  const tariff = (exportCost + duty) * (toNumber(style.tariff_pct, 11) / 100);
  const findings = toNumber(style.pendant_chain) + toNumber(style.earring_backs) + toNumber(style.cad_fees);
  const importCost = exportCost + duty + tariff + findings;

  const imported = style.cost_source === "imported";
  return {
    active_pricing_upload: upload || null,
    components: enriched,
    totals: {
      stone_count: round(imported ? style.imported_stone_count : stoneCount),
      cttw: round(imported ? style.imported_cttw : totalCtw),
      total_metal_cost: round(imported ? style.imported_metal_cost : totalMetalCost),
      total_diamond_cost: round(imported ? style.imported_diamond_cost : totalDiamondCost),
      diamond_handling: round(handling),
      total_labor: round(labor),
      total_export_cost: round(imported ? style.imported_export_cost : exportCost),
      duty: round(imported ? style.imported_duty : duty),
      tariff: round(imported ? style.imported_tariff : tariff),
      findings_total: round(findings),
      total_import_cost: round(imported ? style.imported_import_cost : importCost),
      cost_source: imported ? "imported" : "calculated"
    }
  };
}

export function round(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export async function snapshotAllStyles(db, reason = "Pricing update") {
  const active = await getActiveUpload(db);
  const styles = await db.prepare(`SELECT * FROM styles WHERE archived = 0`).all();
  const rows = styles.results || [];
  for (const style of rows) {
    const comps = await db.prepare(`SELECT * FROM diamond_components WHERE style_id = ? ORDER BY sort_order ASC`).bind(style.id).all();
    const calc = await calculateStyle(db, style, comps.results || [], active);
    await db.prepare(`INSERT INTO cost_history (
      id, style_id, pricing_upload_id, snapshot_at, reason,
      total_metal_cost, total_diamond_cost, diamond_handling, total_labor,
      total_export_cost, duty, tariff, total_import_cost, details_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(
        uid("hist"), style.id, active?.id || null, nowIso(), reason,
        calc.totals.total_metal_cost, calc.totals.total_diamond_cost,
        calc.totals.diamond_handling, calc.totals.total_labor,
        calc.totals.total_export_cost, calc.totals.duty, calc.totals.tariff,
        calc.totals.total_import_cost, JSON.stringify(calc)
      ).run();
  }
  return rows.length;
}

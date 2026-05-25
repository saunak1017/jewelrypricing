export function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

export async function requireAdmin(context) {
  const expected = context.env.ADMIN_PASSWORD || "admin123";
  const auth = context.request.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token || token !== expected) {
    return json({ error: "Unauthorized" }, 401);
  }
  return null;
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
      diamond_handling REAL DEFAULT 0,
      total_labor REAL DEFAULT 0,
      duty_pct REAL DEFAULT 7,
      tariff_pct REAL DEFAULT 11,
      notes TEXT,
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
  const importCost = exportCost + duty + tariff;

  return {
    active_pricing_upload: upload || null,
    components: enriched,
    totals: {
      stone_count: round(stoneCount),
      cttw: round(totalCtw),
      total_metal_cost: round(totalMetalCost),
      total_diamond_cost: round(totalDiamondCost),
      diamond_handling: round(handling),
      total_labor: round(labor),
      total_export_cost: round(exportCost),
      duty: round(duty),
      tariff: round(tariff),
      total_import_cost: round(importCost)
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

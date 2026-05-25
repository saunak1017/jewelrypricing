import { ensureSchema, json, requireAdmin, calculateStyle, getActiveUpload } from '../../../_utils.js';

export async function onRequestGet(context) {
  const unauthorized = await requireAdmin(context);
  if (unauthorized) return unauthorized;
  const db = context.env.DB;
  await ensureSchema(db);
  const url = new URL(context.request.url);
  const q = (url.searchParams.get('q') || '').trim();
  const active = await getActiveUpload(db);
  const sql = q
    ? `SELECT * FROM styles WHERE archived = 0 AND (shivani_style_no LIKE ? OR vendor_style_no LIKE ? OR factory LIKE ? OR jewelry_category LIKE ?) ORDER BY updated_at DESC`
    : `SELECT * FROM styles WHERE archived = 0 ORDER BY updated_at DESC`;
  const params = q ? [`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`] : [];
  const res = await db.prepare(sql).bind(...params).all();
  const styles = [];
  for (const style of res.results || []) {
    const comps = await db.prepare(`SELECT * FROM diamond_components WHERE style_id = ? ORDER BY sort_order ASC`).bind(style.id).all();
    const calc = await calculateStyle(db, style, comps.results || [], active);
    styles.push({ ...style, current: calc.totals, missing_price_count: calc.components.filter(c => c.match_status === 'missing_price').length });
  }
  return json({ styles, active_pricing_upload: active });
}

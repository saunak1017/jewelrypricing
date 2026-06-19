import { ensureSchema, json, requireAdmin, uid, nowIso, calculateStyle } from '../../../_utils.js';

export async function onRequestGet(context) {
  const unauthorized = await requireAdmin(context);
  if (unauthorized) return unauthorized;
  const db = context.env.DB;
  await ensureSchema(db);
  const id = context.params.id;
  const style = await db.prepare(`SELECT * FROM styles WHERE id = ?`).bind(id).first();
  if (!style) return json({ error: 'Style not found' }, 404);
  const comps = await db.prepare(`SELECT * FROM diamond_components WHERE style_id = ? ORDER BY sort_order ASC`).bind(id).all();
  const calc = await calculateStyle(db, style, comps.results || []);
  const hist = await db.prepare(`SELECT * FROM cost_history WHERE style_id = ? ORDER BY snapshot_at DESC LIMIT 100`).bind(id).all();
  const orders = await db.prepare(`SELECT * FROM style_orders WHERE style_id = ? ORDER BY order_date DESC, created_at DESC`).bind(id).all();
  return json({ style, components: comps.results || [], calculation: calc, history: hist.results || [], orders: orders.results || [] });
}

export async function onRequestPost(context) {
  const unauthorized = await requireAdmin(context);
  if (unauthorized) return unauthorized;
  const db = context.env.DB;
  await ensureSchema(db);
  const body = await context.request.json();
  const id = context.params.id === 'new' ? uid('style') : context.params.id;
  const now = nowIso();
  const s = body.style || {};
  const exists = await db.prepare(`SELECT id, created_at FROM styles WHERE id = ?`).bind(id).first();
  if (exists) {
    await db.prepare(`UPDATE styles SET
      factory=?, vendor_style_no=?, shivani_style_no=?, jewelry_category=?, metal_kt=?, diamond_description=?, diamond_quality=?,
      stone_count=?, cttw=?, net_wt_gms=?, gold_loss_pct=?, current_gold_lock=?, gold_per_gram=?, merchandiser=?, diamond_handling=?, total_labor=?,
      duty_pct=?, tariff_pct=?, pendant_chain=?, earring_backs=?, cad_fees=?, margin_pct=?, selling_price=?, notes=?, image_filename=?, image_data_url=?, model_filename=?, model_data_url=?, model_mime_type=?, updated_at=? WHERE id=?`)
      .bind(s.factory || '', s.vendor_style_no || '', s.shivani_style_no || '', s.jewelry_category || '', s.metal_kt || '', s.diamond_description || '', s.diamond_quality || '',
        Number(s.stone_count || 0), Number(s.cttw || 0), Number(s.net_wt_gms || 0), Number(s.gold_loss_pct || 0), Number(s.current_gold_lock || 0), Number(s.gold_per_gram || 0), s.merchandiser || '', Number(s.diamond_handling || 0), Number(s.total_labor || 0),
        Number(s.duty_pct ?? 7), Number(s.tariff_pct ?? 11), Number(s.pendant_chain || 0), Number(s.earring_backs || 0), Number(s.cad_fees || 0), Number(s.margin_pct ?? 45), Number(s.selling_price || 0), s.notes || '', s.image_filename || '', s.image_data_url || '', s.model_filename || '', s.model_data_url || '', s.model_mime_type || '', now, id).run();
    await db.prepare(`DELETE FROM diamond_components WHERE style_id = ?`).bind(id).run();
  } else {
    await db.prepare(`INSERT INTO styles (id, factory, vendor_style_no, shivani_style_no, jewelry_category, metal_kt, diamond_description, diamond_quality,
      stone_count, cttw, net_wt_gms, gold_loss_pct, current_gold_lock, gold_per_gram, merchandiser, diamond_handling, total_labor, duty_pct, tariff_pct, pendant_chain, earring_backs, cad_fees, margin_pct, selling_price, notes, image_filename, image_data_url, model_filename, model_data_url, model_mime_type, archived, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`)
      .bind(id, s.factory || '', s.vendor_style_no || '', s.shivani_style_no || '', s.jewelry_category || '', s.metal_kt || '', s.diamond_description || '', s.diamond_quality || '',
        Number(s.stone_count || 0), Number(s.cttw || 0), Number(s.net_wt_gms || 0), Number(s.gold_loss_pct || 0), Number(s.current_gold_lock || 0), Number(s.gold_per_gram || 0), s.merchandiser || '', Number(s.diamond_handling || 0), Number(s.total_labor || 0),
        Number(s.duty_pct ?? 7), Number(s.tariff_pct ?? 11), Number(s.pendant_chain || 0), Number(s.earring_backs || 0), Number(s.cad_fees || 0), Number(s.margin_pct ?? 45), Number(s.selling_price || 0), s.notes || '', s.image_filename || '', s.image_data_url || '', s.model_filename || '', s.model_data_url || '', s.model_mime_type || '', now, now).run();
  }
  const comps = body.components || [];
  let order = 0;
  for (const c of comps) {
    await db.prepare(`INSERT INTO diamond_components (id, style_id, sort_order, shape, quality, color_clarity, each_weight, quantity, pricing_mode, manual_unitcost, manual_total, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(c.id || uid('comp'), id, order++, c.shape || '', c.quality || '', c.color_clarity || '', Number(c.each_weight || 0), Number(c.quantity || 0), c.pricing_mode || 'auto', Number(c.manual_unitcost || 0), Number(c.manual_total || 0), c.notes || '').run();
  }
  const style = await db.prepare(`SELECT * FROM styles WHERE id = ?`).bind(id).first();
  const savedComps = await db.prepare(`SELECT * FROM diamond_components WHERE style_id = ? ORDER BY sort_order ASC`).bind(id).all();
  const calc = await calculateStyle(db, style, savedComps.results || []);
  return json({ ok: true, id, style, components: savedComps.results || [], calculation: calc });
}

export async function onRequestDelete(context) {
  const unauthorized = await requireAdmin(context);
  if (unauthorized) return unauthorized;
  const db = context.env.DB;
  await ensureSchema(db);
  await db.prepare(`UPDATE styles SET archived = 1, updated_at = ? WHERE id = ?`).bind(nowIso(), context.params.id).run();
  return json({ ok: true });
}

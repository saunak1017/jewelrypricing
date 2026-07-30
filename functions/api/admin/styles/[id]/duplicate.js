import { audit, ensureSchema, json, requireAdmin, uid, nowIso } from '../../../../_utils.js';

export async function onRequestPost(context) {
  const unauthorized = await requireAdmin(context);
  if (unauthorized) return unauthorized;
  const db = context.env.DB;
  await ensureSchema(db);
  const source = await db.prepare(`SELECT * FROM styles WHERE id = ?`).bind(context.params.id).first();
  if (!source) return json({ error: 'Style not found' }, 404);
  const id = uid('style');
  const now = nowIso();
  await db.prepare(`INSERT INTO styles (id, factory, vendor_style_no, shivani_style_no, jewelry_category, metal_kt, diamond_description, diamond_quality,
    stone_count, cttw, net_wt_gms, gold_loss_pct, current_gold_lock, gold_per_gram, merchandiser, diamond_handling, total_labor, duty_pct, tariff_pct, pendant_chain, earring_backs, cad_fees, margin_pct, selling_price, notes, image_filename, image_data_url, model_filename, model_data_url, model_mime_type, archived, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`)
    .bind(id, source.factory, source.vendor_style_no, `${source.shivani_style_no || ''} COPY`.trim(), source.jewelry_category, source.metal_kt, source.diamond_description, source.diamond_quality,
      source.stone_count, source.cttw, source.net_wt_gms, source.gold_loss_pct, source.current_gold_lock, source.gold_per_gram, source.merchandiser, source.diamond_handling, source.total_labor, source.duty_pct, source.tariff_pct, source.pendant_chain, source.earring_backs, source.cad_fees, source.margin_pct, source.selling_price, source.notes, source.image_filename, source.image_data_url, source.model_filename, source.model_data_url, source.model_mime_type, now, now).run();
  const comps = await db.prepare(`SELECT * FROM diamond_components WHERE style_id = ? ORDER BY sort_order ASC`).bind(context.params.id).all();
  for (const c of comps.results || []) {
    await db.prepare(`INSERT INTO diamond_components (id, style_id, sort_order, shape, quality, color_clarity, each_weight, quantity, pricing_mode, manual_unitcost, manual_total, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(uid('comp'), id, c.sort_order, c.shape, c.quality, c.color_clarity, c.each_weight, c.quantity, c.pricing_mode, c.manual_unitcost, c.manual_total, c.notes).run();
  }
  await audit(db, context.data.user, 'STYLE_DUPLICATED', 'style', id, null, { source_style_id: context.params.id });
  return json({ ok: true, id });
}

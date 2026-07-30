import { audit, calculateStyle, ensureSchema, json, nowIso, requireAdmin, toNumber, uid } from '../../../_utils.js';

export async function onRequestPost(context) {
  const unauthorized = await requireAdmin(context); if (unauthorized) return unauthorized;
  const db = context.env.DB; await ensureSchema(db); const body = await context.request.json();
  const session = await db.prepare(`SELECT * FROM scan_sessions WHERE id=?`).bind(body.session_id).first();
  const style = await db.prepare(`SELECT * FROM styles WHERE id=?`).bind(body.style_id).first();
  if (!session || !style) return json({ error: 'Session or style not found.' }, 404);
  const components = await db.prepare(`SELECT * FROM diamond_components WHERE style_id=? ORDER BY sort_order`).bind(style.id).all();
  const calculation = await calculateStyle(db, style, components.results || []);
  const markup = toNumber(body.markup_pct, session.default_markup);
  const suggested = calculation.totals.total_import_cost * (1 + markup / 100);
  const existing = await db.prepare(`SELECT * FROM scan_items WHERE session_id=? AND barcode=?`).bind(session.id, body.barcode || '').first();
  if (existing && !body.allow_duplicate) return json({ duplicate: true, item: existing }, 409);
  if (existing) {
    await db.prepare(`UPDATE scan_items SET quantity=quantity+1,updated_at=? WHERE id=?`).bind(nowIso(), existing.id).run();
    await audit(db, context.data.user, 'DUPLICATE_SCAN_ADDED', 'scan_item', existing.id, existing, { quantity: Number(existing.quantity) + 1 });
    return json({ ok: true, item: await db.prepare(`SELECT * FROM scan_items WHERE id=?`).bind(existing.id).first() });
  }
  const id = uid('scanitem'); const now = nowIso();
  await db.prepare(`INSERT INTO scan_items (id,session_id,barcode,source_style_no,style_id,quantity,cost_snapshot,cttw_snapshot,markup_pct,final_price,resolution_status,created_at,updated_at)
    VALUES (?,?,?,?,?,1,?,?,?,?,?,?,?)`).bind(id, session.id, body.barcode || '', body.source_style_no || '', style.id,
      calculation.totals.total_import_cost, calculation.totals.cttw, markup, toNumber(body.final_price, suggested), body.resolution_status || 'resolved', now, now).run();
  await db.prepare(`UPDATE scan_sessions SET updated_at=? WHERE id=?`).bind(now, session.id).run();
  const saved = await db.prepare(`SELECT * FROM scan_items WHERE id=?`).bind(id).first();
  await audit(db, context.data.user, 'PIECE_SCANNED', 'scan_item', id, null, saved);
  return json({ ok: true, item: saved });
}

export async function onRequestPut(context) {
  const unauthorized = await requireAdmin(context); if (unauthorized) return unauthorized;
  const db = context.env.DB; await ensureSchema(db); const body = await context.request.json();
  const updates = Array.isArray(body.items) ? body.items : [body];
  if (!updates.length) return json({ error: 'No scan item changes supplied.' }, 400);
  const saved = [];
  for (const update of updates) {
    const before = await db.prepare(`SELECT * FROM scan_items WHERE id=?`).bind(update.id).first();
    if (!before) return json({ error: `Scan item ${update.id || ''} not found.` }, 404);
    await db.prepare(`UPDATE scan_items SET quantity=?,markup_pct=?,final_price=?,updated_at=? WHERE id=?`)
      .bind(Math.max(1, Number(update.quantity) || 1), toNumber(update.markup_pct), toNumber(update.final_price), nowIso(), update.id).run();
    const item = await db.prepare(`SELECT * FROM scan_items WHERE id=?`).bind(update.id).first();
    await audit(db, context.data.user, 'SCAN_ITEM_UPDATED', 'scan_item', update.id, before, item);
    saved.push(item);
  }
  return json({ ok: true, items: saved, item: saved[0] });
}

export async function onRequestDelete(context) {
  const unauthorized = await requireAdmin(context); if (unauthorized) return unauthorized;
  const db = context.env.DB; await ensureSchema(db); const id = new URL(context.request.url).searchParams.get('id');
  const before = await db.prepare(`SELECT * FROM scan_items WHERE id=?`).bind(id).first();
  if (!before) return json({ error: 'Scan item not found.' }, 404);
  const link = await db.prepare(`SELECT selection_id FROM scan_selection_links WHERE scan_item_id=?`).bind(id).first();
  if (link) await db.prepare(`DELETE FROM style_selections WHERE id=?`).bind(link.selection_id).run();
  await db.prepare(`DELETE FROM scan_selection_links WHERE scan_item_id=?`).bind(id).run();
  await db.prepare(`DELETE FROM scan_items WHERE id=?`).bind(id).run();
  await audit(db, context.data.user, 'SCAN_ITEM_DELETED', 'scan_item', id, before);
  return json({ ok: true });
}

import { audit, ensureSchema, json, nowIso, requireAdmin, toNumber, uid } from '../../../_utils.js';

const text = value => String(value ?? '').trim();

export async function onRequestPost(context) {
  const unauthorized = await requireAdmin(context); if (unauthorized) return unauthorized;
  const db = context.env.DB; await ensureSchema(db);
  const body = await context.request.json();
  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (!rows.length) return json({ error: 'No resolved styles were supplied.' }, 400);
  const importId = uid('styleimport'); const now = nowIso();
  await db.prepare(`INSERT INTO style_imports (id, filename, row_count, imported_at, imported_by) VALUES (?, ?, ?, ?, ?)`)
    .bind(importId, text(body.filename) || 'styles.xlsx', rows.length, now, context.data.user.id).run();
  let created = 0, updated = 0, selections = 0;
  for (const row of rows) {
    const styleNo = text(row.shivani_style_no);
    if (!styleNo) continue;
    let existing = await db.prepare(`SELECT * FROM styles WHERE UPPER(TRIM(shivani_style_no)) = UPPER(TRIM(?)) LIMIT 1`).bind(styleNo).first();
    const id = existing?.id || uid('style');
    const values = [text(row.factory), text(row.vendor_style_no), styleNo, text(row.jewelry_category), text(row.metal_kt), text(row.diamond_description), text(row.diamond_quality), toNumber(row.stone_count), toNumber(row.cttw), toNumber(row.net_wt_gms), toNumber(row.gold_loss_pct), toNumber(row.current_gold_lock), toNumber(row.gold_per_gram), text(row.merchandiser), toNumber(row.diamond_handling), toNumber(row.total_labor), 7, 11, 'imported', toNumber(row.stone_count), toNumber(row.cttw), toNumber(row.total_metal_cost), toNumber(row.total_diamond_cost), toNumber(row.total_export_cost), toNumber(row.duty), toNumber(row.tariff), toNumber(row.total_import_cost), now];
    if (existing) {
      await db.prepare(`UPDATE styles SET factory=?, vendor_style_no=?, shivani_style_no=?, jewelry_category=?, metal_kt=?, diamond_description=?, diamond_quality=?, stone_count=?, cttw=?, net_wt_gms=?, gold_loss_pct=?, current_gold_lock=?, gold_per_gram=?, merchandiser=?, diamond_handling=?, total_labor=?, duty_pct=?, tariff_pct=?, cost_source=?, imported_stone_count=?, imported_cttw=?, imported_metal_cost=?, imported_diamond_cost=?, imported_export_cost=?, imported_duty=?, imported_tariff=?, imported_import_cost=?, updated_at=?, archived=0 WHERE id=?`).bind(...values, id).run(); updated++;
    } else {
      await db.prepare(`INSERT INTO styles (id, factory, vendor_style_no, shivani_style_no, jewelry_category, metal_kt, diamond_description, diamond_quality, stone_count, cttw, net_wt_gms, gold_loss_pct, current_gold_lock, gold_per_gram, merchandiser, diamond_handling, total_labor, duty_pct, tariff_pct, cost_source, imported_stone_count, imported_cttw, imported_metal_cost, imported_diamond_cost, imported_export_cost, imported_duty, imported_tariff, imported_import_cost, archived, created_at, updated_at) VALUES (?, ${Array(27).fill('?').join(', ')}, 0, ?, ?)`)
        .bind(id, ...values.slice(0, -1), now, now).run(); created++;
    }
    const customers = [...new Set((row.customers || [row.customer]).map(text).filter(Boolean))];
    for (const customer of customers) {
      const duplicate = await db.prepare(`SELECT id FROM style_selections WHERE style_id=? AND UPPER(TRIM(customer))=UPPER(TRIM(?)) AND status='draft'`).bind(id, customer).first();
      if (!duplicate) {
        await db.prepare(`INSERT INTO style_selections (id, style_id, customer, meeting_date, proposed_price, buying_group, modifications, status, cost_snapshot, created_by, updated_by, created_at, updated_at) VALUES (?, ?, ?, '', 0, '', 0, 'draft', ?, ?, ?, ?, ?)`)
          .bind(uid('selection'), id, customer, toNumber(row.total_import_cost), context.data.user.id, context.data.user.id, now, now).run(); selections++;
      }
    }
    await audit(db, context.data.user, existing ? 'STYLE_IMPORTED_UPDATE' : 'STYLE_IMPORTED', 'style', id, existing, row, { import_id: importId });
  }
  return json({ ok: true, import_id: importId, created, updated, selections });
}

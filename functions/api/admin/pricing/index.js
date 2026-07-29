import { audit, ensureSchema, json, requireAdmin, uid, nowIso, snapshotAllStyles } from '../../../_utils.js';

export async function onRequestGet(context) {
  const unauthorized = await requireAdmin(context);
  if (unauthorized) return unauthorized;
  const db = context.env.DB;
  await ensureSchema(db);
  const uploads = await db.prepare(`SELECT * FROM pricing_uploads ORDER BY uploaded_at DESC LIMIT 50`).all();
  const active = await db.prepare(`SELECT * FROM pricing_uploads WHERE active = 1 ORDER BY uploaded_at DESC LIMIT 1`).first();
  return json({ uploads: uploads.results || [], active });
}

export async function onRequestPost(context) {
  const unauthorized = await requireAdmin(context);
  if (unauthorized) return unauthorized;
  const db = context.env.DB;
  await ensureSchema(db);
  const body = await context.request.json();
  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (!rows.length) return json({ error: 'No pricing rows received' }, 400);

  await snapshotAllStyles(db, 'Before new diamond pricing upload');

  const uploadId = uid('pricing');
  const now = nowIso();
  await db.prepare(`UPDATE pricing_uploads SET active = 0 WHERE active = 1`).run();
  await db.prepare(`INSERT INTO pricing_uploads (id, filename, uploaded_at, active, row_count) VALUES (?, ?, ?, 1, ?)`)
    .bind(uploadId, body.filename || 'diamond-pricing.xlsx', now, rows.length).run();

  const stmts = [];
  for (const r of rows) {
    stmts.push(db.prepare(`INSERT INTO diamond_prices (id, upload_id, interchange_shape, quality, color_clarity, interchange_minweight, interchange_maxweight, size, interchange_unitcost)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(uid('price'), uploadId,
        String(r.interchange_shape ?? '').trim(),
        String(r.Quality ?? r.quality ?? '').trim(),
        String(r['Color/Clarity'] ?? r.color_clarity ?? '').trim(),
        Number(r.interchange_minweight ?? 0),
        Number(r.interchange_maxweight ?? 0),
        String(r.size ?? '').trim(),
        Number(r.interchange_unitcost ?? 0)
      ));
  }
  for (let i = 0; i < stmts.length; i += 50) {
    await db.batch(stmts.slice(i, i + 50));
  }
  await audit(db, context.data.user, 'DIAMOND_PRICING_UPLOADED', 'pricing_upload', uploadId, null, { filename: body.filename, row_count: rows.length });
  return json({ ok: true, upload_id: uploadId, row_count: rows.length, uploaded_at: now });
}

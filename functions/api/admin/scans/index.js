import { audit, ensureSchema, json, nowIso, requireAdmin, toNumber, uid } from '../../../_utils.js';

async function withItems(db, session) {
  if (!session) return null;
  const rows = await db.prepare(`SELECT i.*, s.shivani_style_no, s.jewelry_category, s.diamond_description,
    s.metal_kt, s.diamond_quality, s.image_filename, s.image_data_url, s.imported_cttw, s.cost_source
    FROM scan_items i LEFT JOIN styles s ON s.id=i.style_id WHERE i.session_id=? ORDER BY i.created_at`)
    .bind(session.id).all();
  return { ...session, items: rows.results || [] };
}

export async function onRequestGet(context) {
  const unauthorized = await requireAdmin(context); if (unauthorized) return unauthorized;
  const db = context.env.DB; await ensureSchema(db);
  const id = new URL(context.request.url).searchParams.get('id');
  if (id) return json({ session: await withItems(db, await db.prepare(`SELECT * FROM scan_sessions WHERE id=?`).bind(id).first()) });
  const rows = await db.prepare(`SELECT ss.*, u.name created_by_name,
    (SELECT COUNT(*) FROM scan_items i WHERE i.session_id=ss.id) item_count
    FROM scan_sessions ss LEFT JOIN users u ON u.id=ss.created_by ORDER BY ss.updated_at DESC LIMIT 100`).all();
  return json({ sessions: rows.results || [] });
}

export async function onRequestPost(context) {
  const unauthorized = await requireAdmin(context); if (unauthorized) return unauthorized;
  const db = context.env.DB; await ensureSchema(db); const body = await context.request.json();
  const id = uid('scan'); const now = nowIso();
  await db.prepare(`INSERT INTO scan_sessions (id,name,customer,mode,default_markup,created_by,created_at,updated_at,status)
    VALUES (?,?,?,?,?,?,?,?,'open')`).bind(id, body.name || `Scan ${now.slice(0, 10)}`, String(body.customer || '').trim(),
      body.mode === 'presentation' ? 'presentation' : 'costing', toNumber(body.default_markup, 45), context.data.user.id, now, now).run();
  const saved = await db.prepare(`SELECT * FROM scan_sessions WHERE id=?`).bind(id).first();
  await audit(db, context.data.user, 'SCAN_SESSION_CREATED', 'scan_session', id, null, saved);
  return json({ ok: true, session: { ...saved, items: [] } });
}

export async function onRequestPut(context) {
  const unauthorized = await requireAdmin(context); if (unauthorized) return unauthorized;
  const db = context.env.DB; await ensureSchema(db); const body = await context.request.json();
  const before = await db.prepare(`SELECT * FROM scan_sessions WHERE id=?`).bind(body.id).first();
  if (!before) return json({ error: 'Scan session not found.' }, 404);
  const customer = String(body.customer ?? before.customer ?? '').trim();
  const status = body.complete ? 'complete' : (body.status || before.status);
  const now = nowIso();
  await db.prepare(`UPDATE scan_sessions SET name=?,customer=?,mode=?,default_markup=?,status=?,updated_at=? WHERE id=?`)
    .bind(body.name || before.name, customer, body.mode || before.mode, toNumber(body.default_markup, before.default_markup), status, now, body.id).run();

  let selectionsLogged = 0;
  if (body.complete) {
    if (!customer) return json({ error: 'Enter a customer before logging this scan as selections.' }, 400);
    const items = await db.prepare(`SELECT * FROM scan_items WHERE session_id=? ORDER BY created_at`).bind(body.id).all();
    if (!(items.results || []).length) return json({ error: 'Scan at least one piece before logging selections.' }, 400);
    const meetingDate = body.meeting_date || now.slice(0, 10);
    for (const item of items.results || []) {
      const existing = await db.prepare(`SELECT id FROM style_selections WHERE scan_item_id=? LIMIT 1`).bind(item.id).first();
      if (existing) {
        await db.prepare(`UPDATE style_selections SET customer=?,meeting_date=?,proposed_price=?,cost_snapshot=?,status='complete',updated_by=?,updated_at=? WHERE id=?`)
          .bind(customer, meetingDate, item.final_price, item.cost_snapshot, context.data.user.id, now, existing.id).run();
      } else {
        await db.prepare(`INSERT INTO style_selections (id,style_id,customer,meeting_date,proposed_price,buying_group,modifications,status,cost_snapshot,created_by,updated_by,scan_session_id,scan_item_id,created_at,updated_at)
          VALUES (?,?,?,?,?,'',0,'complete',?,?,?,?,?,?,?)`)
          .bind(uid('selection'), item.style_id, customer, meetingDate, item.final_price, item.cost_snapshot,
            context.data.user.id, context.data.user.id, body.id, item.id, now, now).run();
        selectionsLogged++;
      }
    }
  }

  const saved = await db.prepare(`SELECT * FROM scan_sessions WHERE id=?`).bind(body.id).first();
  await audit(db, context.data.user, body.complete ? 'SCAN_SELECTIONS_LOGGED' : 'SCAN_SESSION_UPDATED', 'scan_session', body.id, before, saved,
    body.complete ? { customer, selections_logged: selectionsLogged } : null);
  return json({ ok: true, selections_logged: selectionsLogged, session: await withItems(db, saved) });
}

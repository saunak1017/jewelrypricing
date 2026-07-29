import { audit, calculateStyle, ensureSchema, json, requireAdmin, uid, nowIso } from '../../../../_utils.js';

const ALLOWED_GROUPS = new Set(['', 'RJO', 'LJG', 'CBG', 'AGS', 'Other']);
const ALLOWED_TYPES = new Set(['Memo', 'Asset']);

function cleanOrder(body = {}) {
  const buyingGroup = ALLOWED_GROUPS.has(body.buying_group || '') ? (body.buying_group || '') : '';
  const memoOrAsset = ALLOWED_TYPES.has(body.memo_or_asset) ? body.memo_or_asset : 'Memo';
  return {
    customer: body.customer || '',
    order_date: body.order_date || '',
    quantity: body.quantity || '',
    price: body.price || '',
    buying_group: buyingGroup,
    memo_or_asset: memoOrAsset
  };
}

export async function onRequestPost(context) {
  const unauthorized = await requireAdmin(context);
  if (unauthorized) return unauthorized;
  const db = context.env.DB;
  await ensureSchema(db);
  const style = await db.prepare(`SELECT * FROM styles WHERE id = ? AND archived = 0`).bind(context.params.id).first();
  if (!style) return json({ error: 'Style not found' }, 404);
  const body = await context.request.json();
  const order = cleanOrder(body);
  const now = nowIso();
  const id = uid('order');
  const components = await db.prepare(`SELECT * FROM diamond_components WHERE style_id=? ORDER BY sort_order`).bind(context.params.id).all();
  const calc = await calculateStyle(db, style, components.results || []);
  await db.prepare(`INSERT INTO style_orders (id, style_id, customer, order_date, quantity, price, buying_group, memo_or_asset, status, cost_snapshot, created_by, updated_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'complete', ?, ?, ?, ?, ?)`).bind(id, context.params.id, order.customer, order.order_date, order.quantity, order.price, order.buying_group, order.memo_or_asset, calc.totals.total_import_cost, context.data.user.id, context.data.user.id, now, now).run();
  const saved = await db.prepare(`SELECT * FROM style_orders WHERE id = ?`).bind(id).first();
  await audit(db, context.data.user, 'ORDER_CREATED', 'order', id, null, saved);
  return json({ ok: true, order: saved });
}

export async function onRequestPut(context) {
  const unauthorized = await requireAdmin(context); if (unauthorized) return unauthorized;
  const db = context.env.DB; await ensureSchema(db); const body = await context.request.json();
  const before = await db.prepare(`SELECT * FROM style_orders WHERE id=? AND style_id=?`).bind(body.id, context.params.id).first();
  if (!before) return json({ error: 'Order not found.' }, 404);
  const order = cleanOrder(body); const now = nowIso();
  await db.prepare(`UPDATE style_orders SET customer=?, order_date=?, quantity=?, price=?, buying_group=?, memo_or_asset=?, status=?, updated_by=?, updated_at=? WHERE id=?`)
    .bind(order.customer, order.order_date, order.quantity, order.price, order.buying_group, order.memo_or_asset, body.status || 'complete', context.data.user.id, now, body.id).run();
  const saved = await db.prepare(`SELECT * FROM style_orders WHERE id=?`).bind(body.id).first();
  await audit(db, context.data.user, 'ORDER_UPDATED', 'order', body.id, before, saved); return json({ ok: true, order: saved });
}

export async function onRequestDelete(context) {
  const unauthorized = await requireAdmin(context); if (unauthorized) return unauthorized;
  const db = context.env.DB; await ensureSchema(db); const id = new URL(context.request.url).searchParams.get('order_id');
  const before = await db.prepare(`SELECT * FROM style_orders WHERE id=? AND style_id=?`).bind(id, context.params.id).first();
  if (!before) return json({ error: 'Order not found.' }, 404);
  await db.prepare(`DELETE FROM style_orders WHERE id=?`).bind(id).run();
  await audit(db, context.data.user, 'ORDER_DELETED', 'order', id, before); return json({ ok: true });
}

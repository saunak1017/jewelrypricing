import { ensureSchema, json, requireAdmin, uid, nowIso } from '../../../../_utils.js';

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
  const style = await db.prepare(`SELECT id FROM styles WHERE id = ? AND archived = 0`).bind(context.params.id).first();
  if (!style) return json({ error: 'Style not found' }, 404);
  const body = await context.request.json();
  const order = cleanOrder(body);
  const now = nowIso();
  const id = uid('order');
  await db.prepare(`INSERT INTO style_orders (id, style_id, customer, order_date, quantity, price, buying_group, memo_or_asset, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(id, context.params.id, order.customer, order.order_date, order.quantity, order.price, order.buying_group, order.memo_or_asset, now, now).run();
  const saved = await db.prepare(`SELECT * FROM style_orders WHERE id = ?`).bind(id).first();
  return json({ ok: true, order: saved });
}

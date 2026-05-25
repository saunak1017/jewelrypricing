import { ensureSchema, json, requireAdmin } from '../../../_utils.js';

export async function onRequestGet(context) {
  const unauthorized = await requireAdmin(context);
  if (unauthorized) return unauthorized;
  const db = context.env.DB;
  await ensureSchema(db);
  const url = new URL(context.request.url);
  const styleId = url.searchParams.get('style_id');
  if (!styleId) return json({ error: 'style_id is required' }, 400);
  const rows = await db.prepare(`SELECT * FROM cost_history WHERE style_id = ? ORDER BY snapshot_at DESC`).bind(styleId).all();
  return json({ history: rows.results || [] });
}

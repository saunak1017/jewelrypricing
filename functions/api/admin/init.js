import { ensureSchema, json, requireAdmin } from '../../_utils.js';

export async function onRequestPost(context) {
  const unauthorized = await requireAdmin(context);
  if (unauthorized) return unauthorized;
  await ensureSchema(context.env.DB);
  return json({ ok: true });
}

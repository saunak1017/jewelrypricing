import { configuredUsers, ensureSchema, json, nowIso, requireAdmin, sessionCookie, slug, uid, upsertUser, audit } from '../../_utils.js';

export async function onRequestGet(context) {
  const unauthorized = await requireAdmin(context);
  if (unauthorized) return unauthorized;
  return json({ ok: true, user: context.data.user, schema_ready: true });
}

export async function onRequestPost(context) {
  const db = context.env.DB;
  await ensureSchema(db);
  const body = await context.request.json().catch(() => ({}));
  const supplied = String(body.password || (context.request.headers.get('authorization') || '').replace(/^Bearer\s+/i, ''));
  let users;
  try { users = configuredUsers(context.env); }
  catch (error) { return json({ error: error.message }, 500); }
  const match = Object.entries(users).find(([, password]) => String(password) === supplied);
  if (!match) return json({ error: 'Password is incorrect.' }, 401);
  const user = { id: `user_${slug(match[0])}`, name: match[0] };
  await upsertUser(db, user.id, user.name);
  const token = uid('session') + crypto.randomUUID().replaceAll('-', '');
  const expires = new Date(Date.now() + 7 * 86400000).toISOString();
  await db.prepare(`INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)`).bind(token, user.id, nowIso(), expires).run();
  await audit(db, user, 'LOGIN', 'session', token);
  return new Response(JSON.stringify({ ok: true, user }), { status: 200, headers: { 'content-type': 'application/json', 'set-cookie': sessionCookie(token), 'cache-control': 'no-store' } });
}

export async function onRequestDelete(context) {
  const cookie = context.request.headers.get('cookie') || '';
  const token = cookie.split(';').map(v => v.trim()).find(v => v.startsWith('jc_session='))?.slice(11);
  if (token) await context.env.DB.prepare(`DELETE FROM sessions WHERE token = ?`).bind(token).run();
  return new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json', 'set-cookie': sessionCookie('', 0) } });
}

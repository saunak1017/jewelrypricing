import { ensureSchema, json, requireAdmin } from '../../../_utils.js';
export async function onRequestGet(context){const unauthorized=await requireAdmin(context);if(unauthorized)return unauthorized;const db=context.env.DB;await ensureSchema(db);const rows=await db.prepare(`SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 500`).all();return json({events:rows.results||[]});}

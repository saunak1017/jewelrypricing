import { audit, calculateStyle, ensureSchema, json, nowIso, requireAdmin, toNumber, uid } from '../../../../_utils.js';

const clean = b => ({ customer: String(b.customer || '').trim(), meeting_date: b.meeting_date || '', proposed_price: toNumber(b.proposed_price), buying_group: b.buying_group || '', modifications: b.modifications ? 1 : 0, status: b.status || 'complete' });

export async function onRequestPost(context) {
  const unauthorized = await requireAdmin(context); if (unauthorized) return unauthorized;
  const db=context.env.DB; await ensureSchema(db); const style=await db.prepare(`SELECT * FROM styles WHERE id=? AND archived=0`).bind(context.params.id).first();
  if (!style) return json({error:'Style not found.'},404); const value=clean(await context.request.json()); const components=await db.prepare(`SELECT * FROM diamond_components WHERE style_id=? ORDER BY sort_order`).bind(context.params.id).all(); const calc=await calculateStyle(db,style,components.results||[]); const now=nowIso(); const id=uid('selection');
  await db.prepare(`INSERT INTO style_selections (id,style_id,customer,meeting_date,proposed_price,buying_group,modifications,status,cost_snapshot,created_by,updated_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(id,context.params.id,value.customer,value.meeting_date,value.proposed_price,value.buying_group,value.modifications,value.status,calc.totals.total_import_cost,context.data.user.id,context.data.user.id,now,now).run();
  const saved=await db.prepare(`SELECT * FROM style_selections WHERE id=?`).bind(id).first(); await audit(db,context.data.user,'SELECTION_CREATED','selection',id,null,saved); return json({ok:true,selection:saved});
}
export async function onRequestPut(context) {
  const unauthorized=await requireAdmin(context); if(unauthorized)return unauthorized; const db=context.env.DB; await ensureSchema(db); const body=await context.request.json(); const before=await db.prepare(`SELECT * FROM style_selections WHERE id=? AND style_id=?`).bind(body.id,context.params.id).first(); if(!before)return json({error:'Selection not found.'},404); const v=clean(body); const now=nowIso();
  await db.prepare(`UPDATE style_selections SET customer=?,meeting_date=?,proposed_price=?,buying_group=?,modifications=?,status=?,updated_by=?,updated_at=? WHERE id=?`).bind(v.customer,v.meeting_date,v.proposed_price,v.buying_group,v.modifications,v.status,context.data.user.id,now,body.id).run(); const saved=await db.prepare(`SELECT * FROM style_selections WHERE id=?`).bind(body.id).first(); await audit(db,context.data.user,'SELECTION_UPDATED','selection',body.id,before,saved); return json({ok:true,selection:saved});
}
export async function onRequestDelete(context) {
  const unauthorized=await requireAdmin(context); if(unauthorized)return unauthorized; const db=context.env.DB; await ensureSchema(db); const id=new URL(context.request.url).searchParams.get('selection_id'); const before=await db.prepare(`SELECT * FROM style_selections WHERE id=? AND style_id=?`).bind(id,context.params.id).first(); if(!before)return json({error:'Selection not found.'},404); await db.prepare(`DELETE FROM style_selections WHERE id=?`).bind(id).run(); await audit(db,context.data.user,'SELECTION_DELETED','selection',id,before); return json({ok:true});
}

import { audit, calculateStyle, ensureSchema, json, nowIso, requireAdmin, uid } from '../../../../_utils.js';
export async function onRequestPost(context) {
  const unauthorized=await requireAdmin(context); if(unauthorized)return unauthorized; const db=context.env.DB; await ensureSchema(db);
  const style=await db.prepare(`SELECT * FROM styles WHERE id=?`).bind(context.params.id).first(); if(!style)return json({error:'Style not found.'},404);
  const comps=await db.prepare(`SELECT * FROM diamond_components WHERE style_id=? ORDER BY sort_order`).bind(context.params.id).all();
  if(!(comps.results||[]).length)return json({error:'Add diamond components before switching to calculated costs.'},400);
  const imported=await calculateStyle(db,style,comps.results); const now=nowIso();
  await db.prepare(`INSERT INTO cost_history (id,style_id,pricing_upload_id,snapshot_at,reason,total_metal_cost,total_diamond_cost,diamond_handling,total_labor,total_export_cost,duty,tariff,total_import_cost,details_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(uid('hist'),style.id,null,now,'Legacy imported costs before switching to calculated mode',style.imported_metal_cost,style.imported_diamond_cost,style.diamond_handling,style.total_labor,style.imported_export_cost,style.imported_duty,style.imported_tariff,style.imported_import_cost,JSON.stringify({source:'legacy import'})).run();
  await db.prepare(`UPDATE styles SET cost_source='calculated',updated_at=? WHERE id=?`).bind(now,style.id).run();
  const updated={...style,cost_source:'calculated'}; const calculated=await calculateStyle(db,updated,comps.results); await audit(db,context.data.user,'STYLE_COST_SOURCE_CHANGED','style',style.id,{cost_source:'imported',totals:imported.totals},{cost_source:'calculated',totals:calculated.totals}); return json({ok:true,calculation:calculated});
}

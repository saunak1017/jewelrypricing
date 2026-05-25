import { ensureSchema, json, requireAdmin, calculateStyle, getActiveUpload } from '../../_utils.js';

export async function onRequestGet(context) {
  const unauthorized = await requireAdmin(context);
  if (unauthorized) return unauthorized;
  const db = context.env.DB;
  await ensureSchema(db);
  const active = await getActiveUpload(db);
  const res = await db.prepare(`SELECT * FROM styles WHERE archived = 0 ORDER BY shivani_style_no ASC`).all();
  const rows = [];
  for (const style of res.results || []) {
    const comps = await db.prepare(`SELECT * FROM diamond_components WHERE style_id = ? ORDER BY sort_order ASC`).bind(style.id).all();
    const calc = await calculateStyle(db, style, comps.results || [], active);
    rows.push({
      Factory: style.factory,
      'Vendor Style No': style.vendor_style_no,
      'Shivani Style#': style.shivani_style_no,
      'Jewelry Category': style.jewelry_category,
      'Metal KT': style.metal_kt,
      'Diamond Description': style.diamond_description,
      'Diamond Quality': style.diamond_quality,
      '# of Stones': calc.totals.stone_count,
      CTTW: calc.totals.cttw,
      'Net wt. in gms': style.net_wt_gms,
      'Gold Loss %': style.gold_loss_pct,
      'Current Gold Lock': style.current_gold_lock,
      'Gold per Gram $': style.gold_per_gram,
      'Tot Metal Cost': calc.totals.total_metal_cost,
      'Total Dia Cost': calc.totals.total_diamond_cost,
      'Diamond Handling': calc.totals.diamond_handling,
      'Total Labor': calc.totals.total_labor,
      'Total Export Cost': calc.totals.total_export_cost,
      'Duty': calc.totals.duty,
      'Tariff': calc.totals.tariff,
      'Total Import Cost': calc.totals.total_import_cost
    });
  }
  return json({ active_pricing_upload: active, rows });
}

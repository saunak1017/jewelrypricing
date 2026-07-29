-- Safe to run repeatedly. This query only reads schema metadata.
-- A successful migration returns 23 rows, all with status "ok".
SELECT 'table.' || required.name AS schema_item,
       CASE WHEN actual.name IS NOT NULL THEN 'ok' ELSE 'missing' END AS status
FROM (
  SELECT 'users' AS name UNION ALL SELECT 'sessions' UNION ALL
  SELECT 'audit_log' UNION ALL SELECT 'style_selections' UNION ALL
  SELECT 'style_imports' UNION ALL SELECT 'barcode_uploads' UNION ALL
  SELECT 'barcode_mappings' UNION ALL SELECT 'style_aliases' UNION ALL
  SELECT 'scan_sessions' UNION ALL SELECT 'scan_items'
) required
LEFT JOIN sqlite_schema actual
  ON actual.type = 'table' AND actual.name = required.name

UNION ALL

SELECT 'styles.' || required.name AS schema_item,
       CASE WHEN actual.name IS NOT NULL THEN 'ok' ELSE 'missing' END AS status
FROM (
  SELECT 'cost_source' AS name UNION ALL SELECT 'imported_stone_count' UNION ALL
  SELECT 'imported_cttw' UNION ALL SELECT 'imported_metal_cost' UNION ALL
  SELECT 'imported_diamond_cost' UNION ALL SELECT 'imported_export_cost' UNION ALL
  SELECT 'imported_duty' UNION ALL SELECT 'imported_tariff' UNION ALL
  SELECT 'imported_import_cost'
) required
LEFT JOIN pragma_table_info('styles') actual ON actual.name = required.name

UNION ALL

SELECT 'style_orders.' || required.name AS schema_item,
       CASE WHEN actual.name IS NOT NULL THEN 'ok' ELSE 'missing' END AS status
FROM (
  SELECT 'status' AS name UNION ALL SELECT 'cost_snapshot' UNION ALL
  SELECT 'created_by' UNION ALL SELECT 'updated_by'
) required
LEFT JOIN pragma_table_info('style_orders') actual ON actual.name = required.name
ORDER BY schema_item;

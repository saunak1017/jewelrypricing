# Jewelry Costing App

A Cloudflare Pages + D1 web app for saving jewelry style costing and recalculating live costs from the active diamond pricing master file.

## What this version does

- Password-protected admin area
- Manual style entry
- Unlimited diamond component lines per style
- Diamond line pricing modes:
  - Auto from active master pricing
  - Manual $/ct
  - Manual total
- Upload a diamond pricing Excel file and make it the active master list
- Before a new pricing file becomes active, the app snapshots each style's current export/import cost into history
- Main dashboard always shows current recalculated costs from the active master pricing file
- Gold loss % is saved for reference only and is not included in the calculation
- Export current costing to Excel
- Duplicate and archive styles

## Expected diamond pricing upload headers

The app expects the first sheet of the Excel file to contain these columns:

| Column | Header |
|---|---|
| A | interchange_shape |
| B | Quality |
| C | Color/Clarity |
| D | interchange_minweight |
| E | interchange_maxweight |
| F | size |
| G | interchange_unitcost |

Some alternate header names are tolerated, but the cleanest path is to use the exact names above.

## Core formulas

```text
Total Metal Cost = Net wt. in gms × Gold per Gram
Gold Loss % = stored only for reference

Diamond Line Total Ctw = Each Stone Weight × Quantity
Auto Diamond Line Cost = Total Ctw × matched $/ct from active diamond pricing
Manual $/ct Line Cost = Total Ctw × manual $/ct
Manual Total Line Cost = manual total

Total Diamond Cost = Sum of diamond lines
Total Export Cost = Total Metal Cost + Total Diamond Cost + Diamond Handling + Total Labor
Duty = Export Cost × Duty %
Tariff = (Export Cost + Duty) × Tariff %
Total Import Cost = Export Cost + Duty + Tariff
```

Defaults:

```text
Duty = 7%
Tariff = 11%
```

Both are editable inside each style.

## Deploy to Cloudflare Pages

1. Upload this folder to a new GitHub repository.
2. In Cloudflare, create a new D1 database, for example `jewelry-costing-db`.
3. In `wrangler.toml`, replace `YOUR_D1_DATABASE_ID` with the D1 database ID.
4. Create a new Cloudflare Pages project connected to the GitHub repo.
5. Use these build settings:

```text
Framework preset: React / Vite
Build command: npm run build
Build output directory: dist
```

6. In Cloudflare Pages → Settings → Functions → D1 database bindings, add:

```text
Variable name: DB
D1 database: jewelry-costing-db
```

7. In Cloudflare Pages → Settings → Environment Variables, add:

```text
ADMIN_PASSWORD = your-password-here
```

8. Deploy.

The app creates its own D1 tables the first time you log in.

## Local/default password

Until `ADMIN_PASSWORD` is set in Cloudflare, the fallback password is:

```text
admin123
```

Change this by setting the `ADMIN_PASSWORD` environment variable in Cloudflare Pages.

## Multi-user login and production setup

The login remains password-only, but each password maps to a named user and creates a seven-day HTTP-only session. Every style, order, selection, barcode, alias, and scan mutation is written to `audit_log` with that identity.

Set one encrypted Cloudflare secret with these fields:

```text
Variable name: USER_PASSWORDS
Type: Secret (encrypted)
Value: one JSON object containing every name/password pair
```

Do not put only one password in the Value field, and do not create one Cloudflare variable per person. The value must be valid, one-line JSON whose keys are the names displayed in the app and whose values are the corresponding passwords. Do not add the real value to this repository. For example:

```json
{"Person One":"replace-me","Person Two":"replace-me"}
```

The surrounding curly braces are required. For example, this by itself is **not valid** and will not work:

```text
"Atit":"actual-password"
```

A one-person JSON value would need to be `{"Atit":"actual-password"}`, but the production value should contain **all users inside the same pair of braces**, separated by commas:

```json
{"Atit":"actual-password","Mehul":"actual-password","Mayur":"actual-password"}
```

Replace the example values with the corresponding real passwords and include the remaining users in that same object.

Cloudflare dashboard:

1. Open **Workers & Pages → jewelry-costing-app → Settings → Variables and Secrets**.
2. Click **Add variable** and enter `USER_PASSWORDS` in **Variable name**.
3. Select **Secret** (encrypted), not plain-text Variable.
4. In **Value**, paste the complete one-line JSON object containing all users and their actual passwords; do not paste a password by itself.
5. Save it for Production (and Preview if preview deployments should accept the same passwords).
6. Redeploy the Pages project.

Wrangler alternative:

```bash
npx wrangler pages secret put USER_PASSWORDS --project-name jewelry-costing-app
```

`ADMIN_PASSWORD` remains a backwards-compatible single-user fallback. When neither secret is set, local development uses `admin123` for the `Administrator` identity.

## D1 upgrade

The application defensively creates its schema on an authenticated request. For a controlled production rollout, run the checked-in migration once before deploying:

```bash
npx wrangler d1 execute jewelry_pricing --remote --file=migrations/0002_sales_scanning.sql
```

The equivalent Cloudflare workflow is **D1 → jewelry_pricing → Console**, paste `migrations/0002_sales_scanning.sql`, and execute it once. Cloudflare reporting **“This query returned no data” is the expected success result** for `CREATE TABLE`, `CREATE INDEX`, and `ALTER TABLE`: those statements change the schema but do not return rows. Do not paste the migration a second time after that message, because its `ALTER TABLE` statements are intentionally one-time operations. The application's `ensureSchema` helper tolerates already-present columns during normal requests.

Verify the migration afterward by opening a new D1 Console query and pasting `migrations/verify_0002_sales_scanning.sql`, or run its table check directly:

```sql
SELECT name FROM sqlite_schema WHERE type = 'table' AND name IN ('users','sessions','audit_log','style_selections','barcode_uploads','scan_sessions','scan_items') ORDER BY name;
```

## Legacy style import

**Import Existing Styles** accepts `.xlsx`, `.xls`, and `.csv`. `Shivani Style#` is the case-insensitive unique identity. The review screen collapses exact duplicates and requires a source-row choice for conflicting duplicates. Unique Customer values become editable draft **selections**, not orders.

Legacy styles display the workbook's exact metal, diamond, export, duty, tariff, import, stone-count, and CTTW totals. Adding components does not silently replace them. **Switch to Calculated Costs** explicitly snapshots the imported totals and changes the style to the live calculator.

## Barcode scanning and export

The barcode master should use the first worksheet and exactly this simple layout:

| Column | Header | Meaning |
|---|---|---|
| A | `Style Number` | Shivani Style Number |
| B | `Barcode` | Barcode scanned or entered manually |

The importer reads both columns as displayed text so formatted barcodes, including values with leading zeroes, are preserved. A ready-to-fill CSV is available at `templates/barcode-master-template.csv`.

**Upload Barcode Master** persists the active workbook in D1 until another upload replaces it. Exact style matches resolve immediately. Missing SIL/ALY-style variants use the leading-letters-plus-digits base key and require confirmation; remembered mappings are reviewed again when the candidate set changes, unless configured to always ask.

Scan sessions are saved in D1 and offer Costing and Presentation modes. Duplicate scans ask whether to increase quantity. Export creates one ZIP with `Selection.xlsx` plus an `Images/` folder. Diamond quality codes are expanded to the customer-facing descriptions specified by the business export format.

## Login, schema, and scanning troubleshooting

- On deployment, the app checks and repairs its required D1 schema automatically before authentication. `ensureSchema` now caches that work per Cloudflare isolate and checks existing columns before issuing `ALTER TABLE`, avoiding repeated failed migration queries on every scan request.
- If `USER_PASSWORDS` is absent, the backwards-compatible `ADMIN_PASSWORD` is used; if both are absent, the temporary fallback login is `admin123`. A malformed `USER_PASSWORDS` secret now produces a specific configuration error instead of looking like an incorrect password. The parser accepts the documented JSON object and also repairs the commonly pasted `"Name":"password"` form.
- Existing session cookies are restored when the page opens, so refreshing no longer sends a signed-in user back to the login form.
- A scanner that sends Enter adds its barcode immediately. With **Auto-add after scan** enabled, input is also submitted after a short pause without clicking a button. Multiple barcodes can be pasted one per line and added as a batch.
- Quantity, markup, and final price are edited entirely in the browser with no network request per keystroke. **Save Price Changes** persists all edited rows in one request, and **Log Selections** saves pending price edits automatically before creating selections.
- Completing a scan session creates or updates one selection per scanned style using the session customer, meeting date, final price, and cost snapshot. Re-completing the same session updates its linked selections rather than duplicating them.

### Individual Cloudflare password secrets

As an alternative to `USER_PASSWORDS`, each password can be stored separately in Cloudflare. Add each entry as an encrypted **Secret** using these variable names: `Saunak_Password`, `Atit_Password`, `Mehul_Password`, `Mayur_Password`, `Bhavesh_Password`, `Sanil_Password`, `Kyi_Password`, `Hema_Password`, and `Kirti_Password`. The Value for each secret is only that person's actual password. Uppercase forms such as `SAUNAK_PASSWORD` are also supported. Save the secrets for Production and redeploy.

### Repeatable scanning repair migration

If the original migration was partial or its result is uncertain, open **D1 → jewelry_pricing → Console** and paste `migrations/0003_scanning_repair.sql`. Unlike the original one-time migration, this repair file contains only repeatable `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS` statements, so it is safe to run again. Its final query should return seven scanning tables with status `ok`. The deployed application also checks for missing columns automatically.

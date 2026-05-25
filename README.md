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

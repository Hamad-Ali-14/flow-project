<<<<<<< HEAD
# FLOW Petroleum Operations MVP

FLOW Petroleum station management ka premium responsive MVP. UI FLOW logo ke navy, royal blue aur amber theme mein hai.

## MVP mein kya hai

- Owner, Admin aur dono shift managers ke role concept
- 7 AM–7 PM Day Shift aur 7 PM–7 AM Night Shift
- Shift closing, meter readings aur cash reconciliation flow
- HSD/Diesel, PMG/Petrol aur HOBC ke liye 3-tank view
- Nozzle/meter readings aur fuel stock monitoring
- Expenses, other income, employees aur salaries ke sections
- Daily/monthly report screens aur export action
- Responsive desktop/tablet/mobile UI

## Run karne ka tareeqa

```bash
npm install
npm run dev
```

Production build:

```bash
npm run build
```

## Database recommendation

Production MVP ke liye **Supabase PostgreSQL** best fit hai: managed PostgreSQL, secure authentication, role-based policies, file storage (receipts/PDFs), backups aur realtime updates ek hi stack mein milte hain. Initial schema `supabase/schema.sql` mein diya gaya hai. Abhi UI demo data use karti hai; live deployment par Supabase client/API connect ki jayegi.

## Important formulas

- Sold litres = Current meter reading − Previous meter reading
- Sale amount = Sold litres × Shift ke waqt ka fuel rate
- Closing difference = Actual cash − Expected cash
- Tank stock = Opening stock + Received litres − Sold litres

## Next production steps:

1. Supabase project bana kar `supabase/schema.sql` run karein.
2. Owner se Admin aur Manager accounts invite karein.
3. Station, tanks, nozzles aur fuel rates configure karein.
4. Receipt upload aur PDF generation ko storage/report API se connect karein.
5. Biometric attendance aur tank sensors ko Phase 2 mein add karein.


## Tank & nozzle inventory (Supabase)

The **Tanks & nozzles** page runs on a real inventory ledger. Stock is never typed in: it is
`previous stock + fuel received - nozzle dispensing +/- authorised adjustments`, and every movement
is an append-only row in `fuel_transactions` (with before/after stock).

### Setup
1. Create a Supabase project and run, in order, in the SQL editor:
   1. `supabase/schema.sql` (base schema, if not already applied)
   2. `supabase/migrations/20261001_tank_inventory.sql` (idempotent; safe to re-run)
   3. `supabase/seed_tank_inventory.sql` (Tank 1 HSD n1-2, Tank 2 PMG n3-4, Tank 3 PMG n5-6, Shift #1)
2. **Replace the placeholder meter readings** for nozzles 1, 2, 5, 6 in the seed with the real dispenser totals before the first shift closing.
3. Create staff in Supabase Auth, then add a profile: `insert into profiles (id, full_name, role) values ('<auth uid>', 'Name', 'manager');` (roles: owner, admin, manager, supervisor, attendant).
4. Copy `.env.example` to `.env.local` and set `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (anon key only; never the service-role key).

**Restart `npm run dev` after creating or editing `.env.local`** (Vite only reads env files at startup).

Without the Supabase keys the app shows a **"not connected"** state and no tank data. There is intentionally no silent fallback to sample data. For development only you can opt in to an in-memory sample station with `VITE_DEMO_MODE=true`; it is labelled "DEMO MODE - not saved to a database" and everything resets on refresh.

**Troubleshooting "stock goes back after refresh":** that means the page is on the demo station (look for the DEMO MODE label), not the database. Check `.env.local` and restart the dev server.

### Design notes
- All stock-changing operations are `SECURITY DEFINER` Postgres functions (`receive_fuel`, `close_shift`, `adjust_stock`, `record_dip_reading`) that lock rows, validate capacity / non-negative stock / meters / roles, and run as one transaction. The browser only previews.
- Tank stock cannot be changed by direct `UPDATE`; history rows and closed shifts are immutable (triggers). Corrections are new adjustment transactions.
- Mapping to existing tables: `shift_closings` = the shift instance (the `shifts` table stays the Day/Night template); `meter_readings` = per-nozzle opening/closing readings.
- Role matrix lives in SQL (`inventory_can`); the UI reads the resulting permissions from the server.
- Stock-status thresholds (GOOD >= 30%, LOW >= 10%) live in `STOCK_STATUS_THRESHOLDS` in `src/utils/inventoryCalculations.js`.
- `npm test` runs the unit tests for the calculation utilities.

### Single source of truth for tank data
```
Supabase (get_tank_overview)  ->  useInventory  ->  TankDataProvider / useTanks()
      ->  Overview "Current tank snapshot"  |  Tanks & nozzles  |  Reports (Tank Stock)
```
- There is **no hard-coded tank data in any page**. `main.jsx` no longer contains a tank array; Overview, Tanks & nozzles and Reports all read the same records via `useTanks()` (`src/hooks/useTanks.jsx`).
- Percentage and status are derived in exactly one place, `withStockMetrics()` (which uses `calculateStockPercentage` / `calculateTankStatus`) in `src/utils/inventoryCalculations.js`.
- After any inventory operation the Tanks page reloads the shared dataset, so every view updates without a manual refresh. The Overview also revalidates when opened and when the browser tab regains focus. There is no realtime subscription, which is why the Overview says "Current stock", not "Live".
- The only remaining sample tank numbers live in `src/services/demoInventoryService.js` (the no-Supabase demo backend, which is itself the single source in demo mode) and in `supabase/seed_tank_inventory.sql`.

### How a receipt is persisted
`receive_fuel` (Postgres function) locks the tank row, validates quantity and capacity, writes the `FUEL_RECEIVED` row in `fuel_transactions` (with before/after stock, reference, remarks, user, timestamp), updates `tanks.current_stock_litres`, and returns `{transaction, tank}` read back from the database, all in one transaction. The UI shows success only after that returns, paints the returned record immediately, then re-reads everything from the database. Stock is stored in litres; percentage is always derived.

### Supabase connection and diagnostics
- There is exactly **one** Supabase client, `src/lib/supabaseClient.js`; every feature imports it.
- It reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (also accepts `VITE_SUPABASE_PROJECT_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_KEY`). Put them in `.env.local` in the project root and restart `npm run dev`.
- If configuration is wrong, the page says exactly what: which variable is missing or invalid, and the *names* (never values) of the Supabase-related variables Vite can actually see, which exposes typos and misplaced files. A `service_role`/secret key is refused.
- Other failures are reported separately: network error, query error (the real database error is appended in development), missing inventory functions (run the migration), database permission denied, signed in without a `profiles` row, invalid API key, and an empty tank table.

### Connecting to your Supabase project: checklist
1. Put `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in **`.env.local`** (project root). `.env.example` is only a template and is never read by Vite. Restart `npm run dev`.
2. In the Supabase SQL editor run, in order: `supabase/schema.sql` (once), `supabase/migrations/20261001_tank_inventory.sql`, `supabase/seed_tank_inventory.sql`.
3. Create a user under Authentication > Users, then add a staff row: `insert into profiles (id, full_name, role) values ('<auth user uuid>', 'Name', 'owner');`
4. Run `supabase/verify_inventory_setup.sql` (read-only). Every line should say PASS; any FAIL says which file to run.
5. Sign in on the Tanks & nozzles page.

### One-command connection check
`npm run check:supabase` reads `.env.local` (like Vite) and reports PASS/FAIL for: the env file and variable names, the key (a service_role key is refused), project reachability, and each inventory function. Add `CHECK_EMAIL` / `CHECK_PASSWORD` (environment variables, so the password stays out of shell history files and the project) to also sign in and list the tanks exactly as the app would, including a clear message if the user has no `profiles` row. It prints names and results only, never keys or tokens, and writes nothing to your database.

## Fuel prices, scheduled price changes (12:00 AM PKT) and sales revenue

### Setup (order matters)
1. `supabase/migrations/20261001_tank_inventory.sql` (inventory ledger, shift closing, dip, adjustments)
2. `supabase/migrations/20261002_fuel_pricing.sql` (fuel rates, schedules and sales summary)
3. `supabase/migrations/20261003_station_operations.sql` (expenses, other income, employees & shifts operations)

Do not re-run 20261001 after 20261002: it would restore the old `close_shift` / `get_tank_overview` and re-create the 10-argument `_apply_stock_movement`. If you ever do, run 20261002 again straight afterwards. Both files are otherwise idempotent.

**Set the prices first.** Seeded fuels start at price 0 ("Not set"). A shift that sold fuel cannot be closed until its fuel has a price (error `PRICE_NOT_SET`), so revenue is never silently recorded as PKR 0. Sign in as owner/admin, open *Tanks & nozzles > Fuel prices > Change price*.

### How it works
- **Active price** = `fuel_types.current_rate` (one price per fuel product: Petrol / PMG, Diesel / HSD).
- **Who can see / change prices and revenue:** only roles that pass `inventory_can('manage_prices')` / `('view_sales')`, i.e. owner and admin. The Fuel prices card, unit prices, revenue and the Overview sales figures are fetched only for them; the database returns nothing priced to other roles. RLS is unchanged (no client policies on any table).
- **Instant update:** applies immediately and is logged in `fuel_price_history`.
- **Scheduled update:** the owner picks a price and a Pakistan date/time (default: tomorrow 12:00 AM PKT). It is stored in `fuel_price_schedule` as an absolute instant (PKT is always UTC+05:00, no DST). One pending change per fuel; scheduling again replaces it; it can be cancelled.
- **Exactly when it switches:** `_apply_due_prices()` flips every due schedule, idempotently. It runs (a) from the browser, which checks every 10 s for a due schedule or a Karachi day rollover and then refreshes prices, tanks and Overview, and (b) inside `get_tank_overview`, `get_sales_summary`, the price RPCs and `close_shift`, so a shift is always valued with the correct price even if nobody had the app open at midnight. Optional: enable `pg_cron` and schedule `select public._apply_due_prices();` every minute (see the end of the migration) for a server-side switch.
- **Revenue:** at shift closing each nozzle's litres (closing - opening meter) x the active price of that nozzle's fuel is stored on the `NOZZLE_SALE` ledger row (`unit_price`, `sale_amount`) and on `meter_readings.rate`. The ledger is append-only, so history keeps the exact price that applied, even after later changes (Tank history shows `@ price = amount`).
- **Overview:** *Today / This week / This month* sales, fuel volume and the % change vs the previous equivalent period come from `get_sales_summary()` (sum of stored sale amounts, bucketed by Karachi day; weeks start Monday). The chart shows revenue and litres per day. They refresh after every shift closing, price change, and when the Overview opens. "Other income" is still the sample figure.

### Tests
`npm test` also runs `src/utils/pricing.test.js` (revenue maths, PKT midnight and DST-free conversion, week/month helpers, chart/percentage helpers).
=======
# FLOW Petroleum Operations MVP

FLOW Petroleum station management ka premium responsive MVP. UI FLOW logo ke navy, royal blue aur amber theme mein hai.

## MVP mein kya hai

- Owner, Admin aur dono shift managers ke role concept
- 7 AM–7 PM Day Shift aur 7 PM–7 AM Night Shift
- Shift closing, meter readings aur cash reconciliation flow
- HSD/Diesel, PMG/Petrol aur HOBC ke liye 3-tank view
- Nozzle/meter readings aur fuel stock monitoring
- Expenses, other income, employees aur salaries ke sections
- Daily/monthly report screens aur export action
- Responsive desktop/tablet/mobile UI

## Run karne ka tareeqa

```bash
npm install
npm run dev
```

Production build:

```bash
npm run build
```

## Database recommendation

Production MVP ke liye **Supabase PostgreSQL** best fit hai: managed PostgreSQL, secure authentication, role-based policies, file storage (receipts/PDFs), backups aur realtime updates ek hi stack mein milte hain. Initial schema `supabase/schema.sql` mein diya gaya hai. Abhi UI demo data use karti hai; live deployment par Supabase client/API connect ki jayegi.

## Important formulas

- Sold litres = Current meter reading − Previous meter reading
- Sale amount = Sold litres × Shift ke waqt ka fuel rate
- Closing difference = Actual cash − Expected cash
- Tank stock = Opening stock + Received litres − Sold litres

## Next production steps

1. Supabase project bana kar `supabase/schema.sql` run karein.
2. Owner se Admin aur Manager accounts invite karein.
3. Station, tanks, nozzles aur fuel rates configure karein.
4. Receipt upload aur PDF generation ko storage/report API se connect karein.
5. Biometric attendance aur tank sensors ko Phase 2 mein add karein.


## Tank & nozzle inventory (Supabase)

The **Tanks & nozzles** page runs on a real inventory ledger. Stock is never typed in: it is
`previous stock + fuel received - nozzle dispensing +/- authorised adjustments`, and every movement
is an append-only row in `fuel_transactions` (with before/after stock).

### Setup
1. Create a Supabase project and run, in order, in the SQL editor:
   1. `supabase/schema.sql` (base schema, if not already applied)
   2. `supabase/migrations/20261001_tank_inventory.sql` (idempotent; safe to re-run)
   3. `supabase/seed_tank_inventory.sql` (Tank 1 HSD n1-2, Tank 2 PMG n3-4, Tank 3 PMG n5-6, Shift #1)
2. **Replace the placeholder meter readings** for nozzles 1, 2, 5, 6 in the seed with the real dispenser totals before the first shift closing.
3. Create staff in Supabase Auth, then add a profile: `insert into profiles (id, full_name, role) values ('<auth uid>', 'Name', 'manager');` (roles: owner, admin, manager, supervisor, attendant).
4. Copy `.env.example` to `.env.local` and set `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (anon key only; never the service-role key).

**Restart `npm run dev` after creating or editing `.env.local`** (Vite only reads env files at startup).

Without the Supabase keys the app shows a **"not connected"** state and no tank data. There is intentionally no silent fallback to sample data. For development only you can opt in to an in-memory sample station with `VITE_DEMO_MODE=true`; it is labelled "DEMO MODE - not saved to a database" and everything resets on refresh.

**Troubleshooting "stock goes back after refresh":** that means the page is on the demo station (look for the DEMO MODE label), not the database. Check `.env.local` and restart the dev server.

### Design notes
- All stock-changing operations are `SECURITY DEFINER` Postgres functions (`receive_fuel`, `close_shift`, `adjust_stock`, `record_dip_reading`) that lock rows, validate capacity / non-negative stock / meters / roles, and run as one transaction. The browser only previews.
- Tank stock cannot be changed by direct `UPDATE`; history rows and closed shifts are immutable (triggers). Corrections are new adjustment transactions.
- Mapping to existing tables: `shift_closings` = the shift instance (the `shifts` table stays the Day/Night template); `meter_readings` = per-nozzle opening/closing readings.
- Role matrix lives in SQL (`inventory_can`); the UI reads the resulting permissions from the server.
- Stock-status thresholds (GOOD >= 30%, LOW >= 10%) live in `STOCK_STATUS_THRESHOLDS` in `src/utils/inventoryCalculations.js`.
- `npm test` runs the unit tests for the calculation utilities.

### Single source of truth for tank data
```
Supabase (get_tank_overview)  ->  useInventory  ->  TankDataProvider / useTanks()
      ->  Overview "Current tank snapshot"  |  Tanks & nozzles  |  Reports (Tank Stock)
```
- There is **no hard-coded tank data in any page**. `main.jsx` no longer contains a tank array; Overview, Tanks & nozzles and Reports all read the same records via `useTanks()` (`src/hooks/useTanks.jsx`).
- Percentage and status are derived in exactly one place, `withStockMetrics()` (which uses `calculateStockPercentage` / `calculateTankStatus`) in `src/utils/inventoryCalculations.js`.
- After any inventory operation the Tanks page reloads the shared dataset, so every view updates without a manual refresh. The Overview also revalidates when opened and when the browser tab regains focus. There is no realtime subscription, which is why the Overview says "Current stock", not "Live".
- The only remaining sample tank numbers live in `src/services/demoInventoryService.js` (the no-Supabase demo backend, which is itself the single source in demo mode) and in `supabase/seed_tank_inventory.sql`.

### How a receipt is persisted
`receive_fuel` (Postgres function) locks the tank row, validates quantity and capacity, writes the `FUEL_RECEIVED` row in `fuel_transactions` (with before/after stock, reference, remarks, user, timestamp), updates `tanks.current_stock_litres`, and returns `{transaction, tank}` read back from the database, all in one transaction. The UI shows success only after that returns, paints the returned record immediately, then re-reads everything from the database. Stock is stored in litres; percentage is always derived.

### Supabase connection and diagnostics
- There is exactly **one** Supabase client, `src/lib/supabaseClient.js`; every feature imports it.
- It reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (also accepts `VITE_SUPABASE_PROJECT_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_KEY`). Put them in `.env.local` in the project root and restart `npm run dev`.
- If configuration is wrong, the page says exactly what: which variable is missing or invalid, and the *names* (never values) of the Supabase-related variables Vite can actually see, which exposes typos and misplaced files. A `service_role`/secret key is refused.
- Other failures are reported separately: network error, query error (the real database error is appended in development), missing inventory functions (run the migration), database permission denied, signed in without a `profiles` row, invalid API key, and an empty tank table.

### Connecting to your Supabase project: checklist
1. Put `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in **`.env.local`** (project root). `.env.example` is only a template and is never read by Vite. Restart `npm run dev`.
2. In the Supabase SQL editor run, in order: `supabase/schema.sql` (once), `supabase/migrations/20261001_tank_inventory.sql`, `supabase/seed_tank_inventory.sql`.
3. Create a user under Authentication > Users, then add a staff row: `insert into profiles (id, full_name, role) values ('<auth user uuid>', 'Name', 'owner');`
4. Run `supabase/verify_inventory_setup.sql` (read-only). Every line should say PASS; any FAIL says which file to run.
5. Sign in on the Tanks & nozzles page.

### One-command connection check
`npm run check:supabase` reads `.env.local` (like Vite) and reports PASS/FAIL for: the env file and variable names, the key (a service_role key is refused), project reachability, and each inventory function. Add `CHECK_EMAIL` / `CHECK_PASSWORD` (environment variables, so the password stays out of shell history files and the project) to also sign in and list the tanks exactly as the app would, including a clear message if the user has no `profiles` row. It prints names and results only, never keys or tokens, and writes nothing to your database.

## Fuel prices, scheduled price changes (12:00 AM PKT) and sales revenue

### Setup (order matters)
1. `supabase/migrations/20261001_tank_inventory.sql` (inventory ledger, shift closing, dip, adjustments)
2. `supabase/migrations/20261002_fuel_pricing.sql` (fuel rates, schedules and sales summary)
3. `supabase/migrations/20261003_station_operations.sql` (expenses, other income, employees & shifts operations)

Do not re-run 20261001 after 20261002: it would restore the old `close_shift` / `get_tank_overview` and re-create the 10-argument `_apply_stock_movement`. If you ever do, run 20261002 again straight afterwards. Both files are otherwise idempotent.

**Set the prices first.** Seeded fuels start at price 0 ("Not set"). A shift that sold fuel cannot be closed until its fuel has a price (error `PRICE_NOT_SET`), so revenue is never silently recorded as PKR 0. Sign in as owner/admin, open *Tanks & nozzles > Fuel prices > Change price*.

### How it works
- **Active price** = `fuel_types.current_rate` (one price per fuel product: Petrol / PMG, Diesel / HSD).
- **Who can see / change prices and revenue:** only roles that pass `inventory_can('manage_prices')` / `('view_sales')`, i.e. owner and admin. The Fuel prices card, unit prices, revenue and the Overview sales figures are fetched only for them; the database returns nothing priced to other roles. RLS is unchanged (no client policies on any table).
- **Instant update:** applies immediately and is logged in `fuel_price_history`.
- **Scheduled update:** the owner picks a price and a Pakistan date/time (default: tomorrow 12:00 AM PKT). It is stored in `fuel_price_schedule` as an absolute instant (PKT is always UTC+05:00, no DST). One pending change per fuel; scheduling again replaces it; it can be cancelled.
- **Exactly when it switches:** `_apply_due_prices()` flips every due schedule, idempotently. It runs (a) from the browser, which checks every 10 s for a due schedule or a Karachi day rollover and then refreshes prices, tanks and Overview, and (b) inside `get_tank_overview`, `get_sales_summary`, the price RPCs and `close_shift`, so a shift is always valued with the correct price even if nobody had the app open at midnight. Optional: enable `pg_cron` and schedule `select public._apply_due_prices();` every minute (see the end of the migration) for a server-side switch.
- **Revenue:** at shift closing each nozzle's litres (closing - opening meter) x the active price of that nozzle's fuel is stored on the `NOZZLE_SALE` ledger row (`unit_price`, `sale_amount`) and on `meter_readings.rate`. The ledger is append-only, so history keeps the exact price that applied, even after later changes (Tank history shows `@ price = amount`).
- **Overview:** *Today / This week / This month* sales, fuel volume and the % change vs the previous equivalent period come from `get_sales_summary()` (sum of stored sale amounts, bucketed by Karachi day; weeks start Monday). The chart shows revenue and litres per day. They refresh after every shift closing, price change, and when the Overview opens. "Other income" is still the sample figure.

### Tests
`npm test` also runs `src/utils/pricing.test.js` (revenue maths, PKT midnight and DST-free conversion, week/month helpers, chart/percentage helpers).
>>>>>>> 6cb1bad17ea5e26fa7cbcecb5dec6a37f979c8a8

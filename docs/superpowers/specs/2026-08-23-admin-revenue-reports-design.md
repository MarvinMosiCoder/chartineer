# Admin: Revenue Reports (Daily/Weekly/Monthly/Yearly)

## Purpose

Give admins a dedicated revenue reporting page: net revenue trend over a chosen granularity (daily/weekly/monthly/yearly), broken down by subscription plan, with period-over-period comparison and CSV export. Today the only revenue visibility in the admin panel is `DashboardController::index()`'s superadmin-only lifetime/last-30-days totals — there is no way to see revenue over time or by plan.

Trigger: user request — "make report revenue daily, weekly, monthly and yearly" — as part of a broader admin-reporting push (this is the first of two report features; see `2026-08-23-admin-feedback-analytics-report-design.md` for the second, not yet written).

## Scope

**In scope:**
- A new admin-only "Revenue Reports" page with a Daily/Weekly/Monthly/Yearly granularity toggle and a date range picker.
- Net revenue (`paid` amount minus refunds) per period bucket, charted, plus gross paid and refund totals as separate figures.
- Breakdown of revenue by subscription plan for the selected range.
- Comparison to the immediately preceding period of equal length (% change).
- CSV export of the currently displayed bucketed data.
- A new granular permission (`reports_revenue`) so specific non-superadmin admins can be granted access via the existing Privileges page, and a new top-level "Reports" sidebar section to hold it.

**Explicitly out of scope:**
- Any new payment/revenue data source — this reads only the existing `subscription_requests` table.
- Multi-currency reporting — filtered to `PHP` only, matching `DashboardController`'s existing convention (PayMongo is PHP-only in this app today).
- Forecasting or projections — this is historical reporting only.
- The customer feedback/support analytics report (separate spec).
- Changing how `DashboardController`'s existing lifetime/30-day stats are computed or displayed.

## Current state (for context)

`app/Http/Controllers/Dashboard/DashboardController.php` computes `subscriptionMetrics` (`paidLifetime`, `revenueLifetimePhp`, `paidLast30Days`, `revenueLast30DaysPhp`, `pending`, `failedOrExpired`) from `SubscriptionRequest`, gated to superadmin only (`abort` is implicit via the `!$isSuperAdmin` branch returning a bare workspace view). This is a fixed lifetime/30-day snapshot with no granularity control, no plan breakdown, and no export.

`SubscriptionRequest` (`app/Models/SubscriptionRequest.php`) is the transaction record: `status` (creating/pending/paid/failed/expired/archived), `amount`, `currency`, `plan` (a string code — `weekly`/`monthly`/`yearly`, matching `subscription_plans.code`), `paid_at`, `failed_at`, `refunded_at`, `refund_amount`, `refund_status`. `subscription_plans` holds the human-readable `name` for each `code` (`database/migrations/2026_07_11_000006_create_subscription_plans_table.php`).

Admin permission checks (`admin.permission:{module},{action}` middleware, backed by `AdminAccessService::allows()`) require a matching row in `adm_modules` (by `path`) and a granted flag in `adm_privileges_roles` for the admin's privilege; `is_superadmin` always bypasses this check. Newer financial pages (`/admin/subscriptions`, `/admin/payment-activity`) are instead hard-gated to `superadmin` directly and were never registered as `adm_modules` rows — this report deliberately uses the older, privilege-gated pattern instead, per explicit user choice, so it can be delegated to non-superadmin admins.

`adm_admin_menuses` (a separate, unprivileged sidebar system — see `docs/developer/roles-privileges-menus.md`) currently has a "Payments" dropdown parent containing "Transactions" and "Pricing". There is no "Reports" section yet.

`apexcharts` and `react-apexcharts` are already in `package.json` but are not used anywhere in `resources/js` today.

## Design

### Data model

No new tables. All calculations read `subscription_requests` directly.

For a given date range `[from, to]`:
- **Gross paid** = rows where `status = 'paid'`, `currency = 'PHP'`, `paid_at` between `from` and `to` — summed by `amount`.
- **Refunds** = rows where `refunded_at` is not null and between `from` and `to` (regardless of `currency`, since `refund_amount` is always the PHP amount actually refunded) — summed by `refund_amount`.
- **Net revenue** = gross paid − refunds, per bucket.
- **Plan breakdown**: the same gross/refund/net computation grouped by `plan`, joined against `subscription_plans` (`code` → `name`) for the display label; a `plan` code with no matching row (e.g. a retired plan) falls back to displaying the raw code.

**Bucketing is done in PHP, not SQL date-truncation.** The controller fetches all matching rows for the range (bounded by the user-chosen date range, so this stays small for an admin report) with just `paid_at`/`refunded_at`/`amount`/`refund_amount`/`plan`, then groups them with Carbon (`startOfDay`/`startOfWeek`/`startOfMonth`/`startOfYear` as the bucket key depending on `granularity`). This avoids MySQL-specific SQL (`DATE_FORMAT`, `YEARWEEK`) that wouldn't run under the SQLite in-memory connection the existing admin dashboard test (`tests/Feature/AdminOperationsDashboardTest.php`) already uses, keeping this report's tests portable the same way.

**Default ranges per granularity** (used when the request doesn't specify `from`/`to`): daily → last 30 days, weekly → last 12 weeks, monthly → last 12 months, yearly → last 5 years. The date range picker can override this within the same granularity.

**Previous-period comparison**: the previous range is `[from - (to - from), from)` — i.e. an equal-length window immediately preceding the selected range — recomputed with the same gross/refund/net logic (unbucketed, single totals), yielding a `% change` for net revenue.

### Backend

New `App\Http\Controllers\Admin\RevenueReportController`:
- `adminPage()` — renders the Inertia page shell (`Reports/RevenueReports`), superadmin gets it via bypass, others via the permission check below.
- `adminIndex(Request $request)` — validates `granularity` (`in:day,week,month,year`) and optional `from`/`to` dates; returns JSON: bucketed series (`period`, `grossPaid`, `refunds`, `netRevenue`, `transactionCount`), plan breakdown array, and `comparison` (`previousNetRevenue`, `percentChange`).
- `export(Request $request)` — same inputs as `adminIndex`, streams the bucketed series as CSV via a small dedicated `fputcsv` response (not the generic `AdmRequestController::export`/`Export` class used elsewhere, since that's a raw-table dumper with filter/column selection built for a different shape of data than computed aggregates).

Routes (in the existing top-level `auth`/`account.active` group in `routes/web.php`, alongside the other `/admin/*` non-legacy pages):
```php
Route::get('/admin/reports/revenue', [RevenueReportController::class, 'adminPage'])->middleware('admin.permission:reports_revenue,view')->name('admin.reports.revenue.index');
Route::get('/admin/reports/revenue/items', [RevenueReportController::class, 'adminIndex'])->middleware('admin.permission:reports_revenue,view')->name('admin.reports.revenue.items');
Route::get('/admin/reports/revenue/export', [RevenueReportController::class, 'export'])->middleware('admin.permission:reports_revenue,view')->name('admin.reports.revenue.export');
```

### Access control & navigation

- New migration registers an `adm_modules` row (`name: 'Revenue Reports'`, `path: 'reports_revenue'`), mirroring how existing modules are registered, so it immediately appears on the Privileges page for per-role granting (`is_visible` → the `view` action).
- Same migration adds two `adm_admin_menuses` rows: a new "Reports" `type: 'URL'` parent (flat top-level dropdown, following the exact "Payments" pattern in `AdminSidebarMenuses.php`), and "Revenue" as its first child pointing at `admin/reports/revenue`. The child must not share its parent's exact `name` (the seeder's `updateOrInsert(['name' => ...])` match-by-name previously corrupted two rows this way for "Payments" — see `docs/developer/roles-privileges-menus.md`).
- `database/seeders/AdmModules.php` and `database/seeders/AdminSidebarMenuses.php` are both updated to mirror the migration's end state, so `migrate:fresh --seed` produces the same result on a fresh install.

### Frontend

New `resources/js/Pages/Reports/RevenueReports.jsx`:
- Granularity toggle (Daily/Weekly/Monthly/Yearly) and a date range picker, defaulting per the ranges above.
- One `react-apexcharts` chart (bar or line) for the net-revenue trend across buckets — first real usage of this already-installed-but-unused dependency.
- Stat tiles: net revenue, gross paid, refunds, and % change vs. the previous period.
- A plan-breakdown table (plan name, gross, refunds, net, transaction count) for the selected range.
- "Export CSV" button linking to the export route with the current granularity/range as query params.

### Docs

Add a short section to `docs/developer/roles-privileges-menus.md`'s or a new `docs/developer/admin-reports.md` describing the `reports_revenue` module, its route group, and the bucketing approach — new file preferred since this is the start of a distinct "Reports" area that the feedback analytics report will also live in.

## Testing

New `tests/Feature/RevenueReportControllerTest.php`, using the same isolated in-memory SQLite setup as `AdminOperationsDashboardTest`:
- Correct bucketing for each granularity (day/week/month/year) given a fixed set of `paid_at` timestamps.
- Net revenue math: a paid transaction and a later refund against it land in the correct buckets and net out correctly.
- Plan breakdown totals match the sum of the bucketed series.
- Period-comparison `% change` against a known previous-period total.
- `admin.permission:reports_revenue,view` actually gates `adminPage`/`adminIndex`/`export`: denied for a privilege without the grant, allowed once granted, always allowed for `is_superadmin`.
- CSV export returns the expected header row and one row per bucket.

# Admin Reports

## Purpose

A "Reports" area in the admin sidebar, distinct from the existing superadmin-only `/admin/subscriptions`, `/admin/payment-activity`, and `/admin/feedback` pages. Reports here are gated by the legacy `admin.permission:{module},{action}` system instead of a hard `superadmin` check, so specific non-superadmin admins can be granted access per report without full superadmin rights. Revenue Reports and Feedback Analytics are its two entries so far.

## Files

| File | Responsibility |
|---|---|
| `RevenueReportController.php` | Bucketed revenue series, plan breakdown, period comparison, CSV export |
| `Pages/Reports/RevenueReports.jsx` | Granularity/date filters, chart, stat tiles, plan table |
| `FeedbackReportController.php` | Category/priority/status breakdowns, response-time health, weekly volume trend, CSV export |
| `Pages/Reports/FeedbackAnalytics.jsx` | Date filter, category ranking chart + table, priority/status breakdowns, trend chart |
| `database/migrations/2026_08_23_170000_add_revenue_reports_module_and_menu.php` | Registers the `reports_revenue` module and creates the "Reports" > "Revenue" sidebar entry (also creates the "Reports" parent) |
| `database/migrations/2026_08_23_180000_add_feedback_reports_module_and_menu.php` | Registers the `reports_feedback` module and adds "Reports" > "Feedback" — looks up the existing "Reports" parent by `slug`, does not recreate it |
| `AdmModules.php`, `AdminSidebarMenuses.php` seeders | Mirror both migrations for a fresh install |

## Access control

Both `reports_revenue` and `reports_feedback` are normal `adm_modules` rows (`path` columns), so each appears automatically on the Privileges page for per-role granting via the `view` action — `is_superadmin` always bypasses the check. This deliberately differs from `admin/subscriptions`/`admin/payment-activity`/`admin/feedback`, which are hard-gated to `superadmin` only and were never registered as `adm_modules` rows. When adding a new report under this "Reports" section, decide up front whether it should follow this delegable pattern or the older financial-pages superadmin-only pattern — don't assume one from the other.

`RevenueReportController` and `FeedbackReportController` both live directly in `App\Http\Controllers` (not `App\Http\Controllers\Admin`), matching their true siblings `PaymentActivityLogController`/`SystemErrorLogController`/`UserFeedbackController`/`ReplayAccessController` — all explicitly routed in `routes/web.php` rather than dynamically dispatched. `App\Http\Controllers\Admin\*` is reserved for the legacy modules routed dynamically via `adm_modules.controller` (`CommonHelpers::routeController`/`routeOtherController`, which only glob `Controllers/Admin/*.php` and `Controllers/*/*.php` — a controller placed directly under `Controllers/` is never swept into that dynamic routing regardless of what string sits in `adm_modules.controller`).

## Revenue calculation

Reads `subscription_requests` only — no new tables. For a date range: gross paid = `amount` summed where `status = 'paid'` and `currency = 'PHP'`, refunds = `refund_amount` summed where `refunded_at` falls in range (not currency-filtered — refund_amount is always the PHP amount actually refunded), net = gross − refunds. Bucketing (day/week/month/year) happens in PHP over the fetched rows via Carbon, not SQL date-truncation, so it works unchanged against both MySQL (production) and the SQLite in-memory connection admin-report tests use. Plan breakdown groups the same rows by the `plan` code, labeled via `subscription_plans.name`. The period-comparison % change compares the selected range to an immediately preceding range of equal length.

## Feedback analytics calculation

Reads `user_feedback` only — no new tables, no message content. For a date range (default last 30 days, filtered on `created_at`): category breakdown counts + percentages per category plus a per-category `urgentHighCount` (submissions in that category with `priority` in `urgent`/`high`), sorted by count descending — every category with at least one submission is shown, with no palette-slot fold, since the chart uses a single accent hue for magnitude comparison rather than one hue per category (see "Color choice" below). Priority and status are simple grouped counts; status also derives `open` (submitted/reviewing/planned/in_progress) and `resolved` (completed/declined) summary totals. Response time is the **median** (not mean, to resist one stale outlier skewing it) of `responded_at − created_at` in hours across items that have a response, plus the percentage still awaiting one. The weekly volume trend buckets `created_at` in PHP via Carbon, same portability reasoning as the revenue bucketing.

**Color choice**: the category ranking chart is a single accent-hue bar chart, not a multi-color categorical one. Ranking counts per category is a magnitude-comparison job, not an identity job — coloring each bar differently would "spend the identity channel re-encoding what bar length already shows" (an explicit anti-pattern: "eight categorical hues when the story is one number"). Priority and status breakdowns are plain stat badges reusing this app's existing priority/status color conventions (already used in `Feedback/AdminIndex.jsx`), not charts — a handful of headline counts is a KPI row, not a chart.

## Verification

- Bucketing correctness per granularity against known `paid_at`/`refunded_at` timestamps.
- Net revenue nets out a paid transaction against a later refund correctly, in the right buckets.
- Plan breakdown totals reconcile with the bucketed series.
- Feedback category/priority/status breakdown counts, including the derived open/resolved totals and per-category urgent/high counts.
- Median response time across a mix of responded/unresponded items, and the awaiting-response percentage.
- Weekly volume-trend bucketing.
- `admin.permission:{reports_revenue,reports_feedback},view` denies an ungranted privilege, allows a granted one, and always allows `is_superadmin`.
- CSV export header and row shape, for both reports.

Related: [Roles, privileges, and menus](roles-privileges-menus.md), [Authentication and OAuth](authentication-and-oauth.md).

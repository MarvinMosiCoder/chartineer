# Admin: Feedback & Support Analytics Report

## Purpose

A second admin report, alongside Revenue Reports, that turns the existing `user_feedback` inbox into a prioritization tool: what are people complaining about most, how severe is it, and are responses keeping up. Today `Feedback/AdminIndex.jsx` is a per-ticket triage queue (search/filter/respond to one item at a time) with no aggregate view — an admin has no way to see "bugs are 40% of everything submitted this month and a third of them are high-priority" without manually counting.

Trigger: user request — "make report also about customer support and feedback i want this to know what most complain, bugs, enhancements, etc, to help better priorities first to improve in the system" — followed up with "then i can able to know also the most need to improve based on users feedback to help me to identify which i priority to build or fix" once the base design was confirmed, which is why the category ranking also surfaces a per-category urgent/high count (see Design).

## Scope

**In scope:**
- A new "Feedback" report page (second child under the "Reports" sidebar dropdown created for `2026-08-23-admin-revenue-reports-design.md`).
- Date-range-filtered category ranking (count, % of total, and urgent/high count per category) as the headline.
- Priority breakdown (urgent/high/normal/low counts).
- Status breakdown (the 6 statuses, grouped into Open vs Resolved summary counts plus individual counts).
- Median response time (`created_at` → `responded_at`) and % of in-range items still awaiting a response.
- A weekly volume-trend chart for context.
- CSV export of the category ranking.
- A new `reports_feedback` permission module, delegable like `reports_revenue`.

**Explicitly out of scope:**
- Any change to the existing `/admin/feedback` triage inbox (`UserFeedbackController::adminPage/adminIndex/update`, `Feedback/AdminIndex.jsx`) — this report is read-only and additive, not a replacement.
- Any new field on `user_feedback` (e.g. no new SLA/due-date columns) — every metric here is computed from what's already stored.
- Drilling from the report into an individual feedback item — that stays in the existing inbox.
- Feedback message content/threads (`user_feedback_messages`) — this report aggregates ticket-level fields only.

## Current state (for context)

`user_feedback` (`database/migrations/2026_07_11_000002_create_user_feedback_table.php`): `category` (`payment`/`subscription`/`account`/`enhancement`/`feature`/`bug`/`usability`/`performance`/`other`), `title`, `description`, `status` (`submitted`→`reviewing`/`planned`/`in_progress`→`completed`/`declined`), `priority` (`low`/`normal`/`high`/`urgent`), `admin_response`, `responded_by`, `responded_at`, `created_at`. Existing indexes already cover `(status, priority, created_at)` and `(category, status)`.

`UserFeedbackController` (`app/Http/Controllers/UserFeedbackController.php`) is superadmin-gated (`ensureSuperAdmin()` calling `AdminAccessService::isSuperadmin()`) for all admin actions. `DashboardController` separately computes a handful of lifetime/30-day feedback counts (`total`, `newLast30Days`, `open`, `highPriority`, `awaitingResponse`) for the superadmin dashboard — this report supersedes none of that; it's a dedicated, filterable, exportable view.

The "Reports" sidebar dropdown and its permission-module pattern (`adm_modules` row + `admin.permission:{module},view` middleware, distinct from the superadmin-hard-gated older financial pages) were established in `2026-08-23-admin-revenue-reports-design.md` for Revenue Reports, including the `RevenueReportController` placement directly in `App\Http\Controllers` (not `\Admin`) and the PHP-side Carbon bucketing approach (portable across MySQL/SQLite, matching the existing isolated-SQLite feature-test pattern).

## Design

### Data & calculation

All queries scope to `created_at BETWEEN [from, to]` (default: last 30 days, same default-range convention as Revenue Reports — no per-granularity variation needed since this report has one fixed default, not a day/week/month/year toggle).

- **Category ranking**: `user_feedback` grouped by `category` → `count`, `percentOfTotal` (`count / total in range`), and `urgentHighCount` (count within that category where `priority` is `urgent` or `high`). Sorted by `count` descending. All 9 category values (including the literal `other`) are shown as their own row — there is no palette-slot limit forcing a fold, since color plays no identity role here (see Frontend).
- **Priority breakdown**: `user_feedback` grouped by `priority` → 4 counts.
- **Status breakdown**: grouped by `status` → 6 counts, plus two derived summary counts: `open` (`submitted`+`reviewing`+`planned`+`in_progress`) and `resolved` (`completed`+`declined`).
- **Response time**: for rows with `responded_at` not null, `median(responded_at - created_at)` in hours. Median, not mean, so one very old stale ticket doesn't distort the headline number. Also `awaitingResponsePercent` = rows with `responded_at` null ÷ total in range.
- **Volume trend**: count of `created_at` per week within the range, bucketed in PHP via Carbon (`startOfWeek()` keys), matching `RevenueReportController::bucketKey()`'s approach — portable across MySQL and the SQLite in-memory test connection.

### Backend

New `App\Http\Controllers\FeedbackReportController` (top-level namespace, matching `RevenueReportController`'s sibling placement — not `\Admin`, since this is explicitly routed, not dynamically dispatched):
- `adminPage()` → `Inertia::render('Reports/FeedbackAnalytics')`.
- `adminIndex(Request $request)` → validates optional `from`/`to`; returns JSON: `categoryBreakdown`, `priorityBreakdown`, `statusBreakdown`, `responseTime`, `volumeTrend`, `totalCount`.
- `export(Request $request)` → streams the category ranking as CSV (category, count, percent, urgentHighCount), same `fputcsv`-via-`streamDownload` approach as `RevenueReportController::export()`.

Routes (same top-level `auth`/`account.active` group as the Revenue Reports routes):
```php
Route::get('/admin/reports/feedback', [FeedbackReportController::class, 'adminPage'])->middleware('admin.permission:reports_feedback,view')->name('admin.reports.feedback.index');
Route::get('/admin/reports/feedback/items', [FeedbackReportController::class, 'adminIndex'])->middleware('admin.permission:reports_feedback,view')->name('admin.reports.feedback.items');
Route::get('/admin/reports/feedback/export', [FeedbackReportController::class, 'export'])->middleware('admin.permission:reports_feedback,view')->name('admin.reports.feedback.export');
```

### Access control & navigation

New migration registers an `adm_modules` row (`name: 'Feedback Analytics'`, `path: 'reports_feedback'`) and adds a "Feedback" child under the **existing** "Reports" `adm_admin_menuses` parent — looked up by `slug = 'reports_group'` (that parent already exists once the Revenue Reports migration has run; this migration must not recreate it). `AdmModules.php` and `AdminSidebarMenuses.php` seeders are updated to mirror this for a fresh install — the seeder can hardcode `parent_id: 16`, the same "Reports" parent id the Revenue Reports seeder change established, since seeder rows are appended in a fixed, already-documented order (see that spec's seeder note).

### Frontend

New `resources/js/Pages/Reports/FeedbackAnalytics.jsx`:
- Date range filter (from/to, default last 30 days) + "Export CSV" button.
- Stat tiles: total submissions, top category (name + count), median response time, % awaiting response.
- **Category ranking — single accent-hue horizontal bar chart, not multi-color categorical.** This is a magnitude-comparison job ("what's most common"), not an identity job — the dataviz skill is explicit that coloring each bar of a ranked count-per-category chart differently is an anti-pattern ("eight categorical hues when the story is one number... spends the identity channel re-encoding what bar length already shows"). Bars sorted descending, each labeled with count + percent at the bar end (only up to 9 bars, so per-bar labels are reasonable, unlike Revenue's 30-bar daily view); the urgent/high sub-count renders as a smaller secondary label beside the total so a frequent-and-severe category is visible without a second chart.
- **Volume trend** — single accent-hue line with a soft (~10%) area fill, weekly buckets. Also a magnitude/trend job, not identity, so one hue.
- **Priority breakdown** — 4 stat badges, not a chart ("a handful of headline numbers" → KPI row, per the dataviz skill's form heuristic), reusing this app's existing priority color convention already in `Feedback/AdminIndex.jsx`/`SystemLogs/AdminIndex.jsx` (urgent → red-400, high → amber-400, normal/low → muted).
- **Status breakdown** — Open vs Resolved summary counts plus the 6 individual counts as a small badge list (not a chart, same reasoning as priority), reusing existing status-tone conventions (e.g. emerald for completed).

### Docs

Extend `docs/developer/admin-reports.md` (written for Revenue Reports) with a "Feedback Analytics" section following the same structure, rather than a new file — both reports now share that doc's "Reports" section framing, access-control note, and namespace-placement rule.

## Testing

New `tests/Feature/FeedbackReportControllerTest.php`, using the same isolated in-memory SQLite setup as `RevenueReportControllerTest`:
- Category ranking counts, percentages, and urgent/high sub-counts against known fixtures.
- Priority and status breakdown counts, including the Open/Resolved derived totals.
- Median response time computed correctly from a mix of responded/unresponded items, and the awaiting-response percentage.
- Weekly bucketing of the volume trend.
- `admin.permission:reports_feedback,view` gating: denied for an ungranted privilege, allowed once granted, always allowed for `is_superadmin`.
- CSV export header and row shape.

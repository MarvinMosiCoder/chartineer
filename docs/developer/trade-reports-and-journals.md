# Trade Reports and Journals

## Purpose

Closed simulated positions feed PnL summaries, a calendar, exports, snapshots, and editable journal fields.

| Route/file | Responsibility |
|---|---|
| `GET /market-backtest/report` | Filtered report JSON |
| `POST /market-backtest/report/export` | Queue a CSV/JSON export job |
| `GET /market-backtest/report/export/{export}/download` | Download a ready export |
| `PUT /market-backtest/trades/{position}/journal` | Journal update |
| `TradeReportPage.jsx` | Report page |
| `TradeReport.jsx` | Summaries, table, export trigger, journal UI |
| `TradeCalendar.jsx` | Daily result visualization |
| `MarketBacktestController.php` | Queries, ownership, export request/download, journal update, insights |
| `MarketBacktestReportService.php` | Shared closed-position query + row serialization, used by the controller and the export job |
| `MarketBacktestInsightService.php` | Rule-based coaching tips computed from closed positions, shared by the report page and the dashboard widget |
| `GenerateBacktestReportExport` (job) | Builds the CSV/JSON file and notifies the user |
| `MarketBacktestExport` (model) | Tracks one export request's lifecycle (`pending`→`processing`→`ready`/`failed`) |
| `TradeInsightsWidget.jsx` | Compact single-tip teaser rendered on the trader dashboard workspace, links to the full report |
| `POST /journal-tour/complete` | Marks the `/trade-report` spotlight tour finished for the caller |

## Flow

1. Report components request closed positions with date/session/market filters.
2. The controller scopes records through the authenticated account and uses report indexes.
3. Response data feeds summary cards, calendar aggregation, and rows.
4. Journal edits update setup/freeform tags, reason, mistake, emotion, and notes on the owned closed position.
5. Snapshot links use authorized routes/storage rather than exposing private paths.

## Trade journal spotlight tour

`TradeReportPage.jsx` owns a second `WorkspaceTour.jsx` instance (the first is the chart workspace tour — see [Trading chart](trading-chart.md)), covering all five stacked panels on `/trade-report` in page order: Risk Guardrails, Strategy Playbooks (the "New playbook" button), Trade Calendar, the report's summary stat grid, the Closed Trades table (search/filter/journal editing explained together, since they occupy the same panel), the CSV/JSON export buttons, and Imported Trades. Each step's `selector` targets a `data-tour="journal-*"` attribute placed directly on the real control in its owning component (`RiskGuardrailSettings.jsx`, `StrategyPlaybooks.jsx`, `TradeCalendar.jsx`, `TradeReport.jsx` ×3, `ImportedTrades.jsx`) — add the attribute to the new control first if a step is ever retargeted, rather than guessing a selector from outside.

It is entirely independent of the chart tour: separate nullable `journal_tour_completed_at` timestamp on `adm_users`, separate `POST /journal-tour/complete` (`MarketBacktestController::completeJournalTour()`), same idempotent "only stamp if not already set" pattern. `TradeReportPage.jsx` seeds `tourStep` from `auth.user.journal_tour_completed_at` the same way `Dashboard.jsx` seeds the chart tour's `chartTourCompleted`, and honors the same `?tour=1` query-param restart convention. Unlike the chart tour, there is no separate static `/help`-style page for this one — a small "Take the tour" button in the page's own header (top-right, above the panels) restarts it, since `Pages/Help/Index.jsx` is scoped specifically to the eight chart-workspace steps and extending it to a second, unrelated tour was out of scope here. If a written walkthrough of this tour is wanted later, give it its own page rather than interleaving two tours' steps into one.

## Coaching insights

The report response also includes `playbookPerformance`, grouped from immutable position snapshots rather than the current editable playbook record. Each row contains trade count, wins, win rate, net PnL, and average PnL. Serialized trades include `playbook`, `checklistAnswers`, and `checklistComplete`; the existing `setupTag` remains populated with the selected playbook name for compatibility.

## Advanced analytics and Monte Carlo

`MarketBacktestAdvancedAnalyticsService` calculates expectancy, profit factor, maximum absolute/percentage drawdown, recovery factor, maximum win/loss streaks, equity-curve points, and weekday/hour UTC breakdowns from the owned closed-position collection. The Trade Report displays the headline statistics.

With at least five closed positions, the same response includes a 500-run bootstrap Monte Carlo simulation. Each run samples historical trade PnL with replacement for the original trade count and returns 10th/50th/90th-percentile ending balances, median/90th-percentile drawdown, and the percentage of runs that touched half the starting balance. This is a risk estimate from the user's sample, not a forecast or investment advice.

The `advanced` payload also carries `maeMfe`, which measures each trade's maximum favorable/adverse excursion — the best and worst prices the position touched while open, tracked via the `favorable_price`/`adverse_price` columns — expressed as average MFE%/MAE% and amount plus an edge ratio (sum of MFE% over sum of MAE%). It's excluded (`eligible: false`) for accounts whose closed positions have no excursion data, i.e. legacy trades opened before this feature shipped; `sampledTrades` reports how many of the closed positions were actually eligible so the UI can caveat a partial sample. `byTradingSession` groups the same closed positions (same `groupPerformance()` helper used for `byWeekday`/`byHourUtc`) by market session, delegating to `MarketSessionService::label()` rather than computing buckets itself. Labels are `Asian`, `London`, `New York`, `London / New York`, and `Off-session`.

Two things changed here that affect how the numbers read:

- **It keys on `opened_at_time`, not `closed_at_time`** (falling back to the close only when an entry time is missing). The session is the context the setup was taken in — a trade opened in London that runs past the New York open is still a London trade. This makes `byTradingSession` the one breakdown in that panel that is entry-oriented while `byWeekday` and `byHourUtc` remain close-oriented, so the three no longer share a time convention. Say which one you mean when adding a fourth.
- **Boundaries are DST-aware.** The previous implementation partitioned the 24-hour clock on fixed UTC hours (Asian 00–08, London 08–13, New York 13–21, Late/Off-session 21–24), which drifted by an hour under BST/EDT for roughly half the year and had no overlap bucket. Session windows are now each market's own local hours in its own timezone, so London moves between 08:00 and 07:00 UTC with the clocks, and the London/New York overlap — the highest-volume window of the day — reports separately instead of being absorbed into New York. See [Trading chart](trading-chart.md) for the full session model, including why the definitions are mirrored in JS and how both sides are pinned by tests.

Historical reports will therefore re-bucket some trades relative to what they showed before, both from the entry/close switch and from the DST correction. That is the fix, not a regression, but it is visible to any user who remembers their old numbers.

`MarketBacktestInsightService::build(Collection $positions)` turns a set of closed positions into up to 3 rule-based coaching tips, ranked by a per-heuristic severity score. It requires at least 10 closed positions in the set it's given (`MarketBacktestInsightService::MIN_TOTAL_TRADES`) before returning anything besides `{eligible: false, currentTrades, requiredTrades: 10}` — below that, per-heuristic breakdowns (e.g. win rate on a single symbol) are too noisy to be worth surfacing. At 10 trades, group-based heuristics (side/symbol/setup-tag win rate, each needing 5+ trades per group) can only realistically fire on a roughly even split, so early tips lean more on the risk-reward and holding-time heuristics, which don't need sub-grouping.

Four heuristics run, each returning `null` if it doesn't clear its own significance bar so it's silently excluded rather than shown as a weak/noisy tip:

- **Risk-reward imbalance** — average loss vs average win, fires when one exceeds the other by ≥30%.
- **Win rate by side / symbol** — groups closed positions by `side` and separately by `symbol` (min 5 trades/group), surfaces the single group whose win rate deviates ≥15 points from the overall rate.
- **Holding-time pattern** — compares average hold duration (`closed_at_time - opened_at_time`) of wins vs losses; fires at a ≥1.5x ratio either direction ("cutting winners early" or "holding winners too long").
- **Setup-tag win rate** — same grouping logic as side/symbol, but keyed on `setup_tag` normalized (trimmed, lowercased); blank tags are excluded from grouping. This one is inherently best-effort since `setup_tag` is freeform text a user may or may not tag consistently, not a fixed category.

`MarketBacktestController::report()` passes its already-loaded, filter-scoped `$positions` collection into the insight service and returns the result under an `insights` key — no extra query, and insights respect whatever `symbol`/`session_id` filters were passed to `report()`. **The Trade Report page's own symbol/side/result/journal-status/search filters are applied entirely client-side in `TradeReport.jsx`** (see Maintenance below) and are never sent to `report()`, so in practice today's UI only ever requests the account-wide set — the server-side `symbol`/`session_id` scoping exists and is exercised by tests, but isn't reachable from the current UI. Wire an actual filter control to those params if per-symbol/per-session insights are wanted later.

`GET /market-backtest/report/insights` (`MarketBacktestController::reportInsightsSummary`) is a second, lightweight entry point used only by the dashboard's `TradeInsightsWidget.jsx`: it queries the account's 300 most recent closed positions (unfiltered) via the same `MarketBacktestReportService::getReportPositions()` and returns just `{insights}`, not the full trade list, since the widget only ever renders the single highest-severity tip (`insights.items[0]`) as a dismissible one-line teaser above `WatchlistPanel` in the trading workspace, linking to `/trade-report` for the rest. Both entry points share one `MarketBacktestInsightService` instance so heuristic logic is never duplicated between the two surfaces.

## Export (queued)

Exporting up to 5,000 rows with per-row snapshot lookups was the heaviest synchronous operation on this controller, so it runs as a background job instead of streaming inline:

1. `TradeReport.jsx`'s CSV/JSON buttons `POST /market-backtest/report/export`, which creates a `MarketBacktestExport` row (`status = pending`) and dispatches `GenerateBacktestReportExport` — the response returns immediately, it does not carry the file.
2. The job (queue worker) loads the account's closed positions via `MarketBacktestReportService`, writes the CSV/JSON to the `public` disk under `market-backtest-exports/{user_id}/`, and marks the row `ready` (or `failed` with an `error` message).
3. Either outcome creates an `AdmNotifications` row (`source_type = market_backtest_export`, deduplicated on `source_id` like price alerts) whose `url` points at the download route, surfaced through the existing notification bell.
4. `GET /market-backtest/report/export/{export}/download` streams the stored file after checking `adm_user_id` ownership and `status = ready`.

The notification list (`Pages/AdmVram/NotificationsViewAll.jsx`) renders a notification with a `url` as a real `<a href>` — not an Inertia `<Link>` and not a client-side redirect — so the browser handles the `Content-Disposition: attachment` response as a normal file download without navigating away from the notifications page. `NotificationsController::viewAllNotification` must keep passing `url` through in its mapped response for this to work; it was previously dropped, which is why export-ready notifications were unclickable.

This requires a running queue worker (`QUEUE_CONNECTION=database`, `php artisan queue:work`, supervised in production — see [Deployment](deployment-and-production.md)). `MarketBacktestReportService` also backs the synchronous `report()` summary and the trade-journal response, so a report field added there is available to both the live summary and the export without duplicating serialization.

The closed-trades journal table supports client-side full-text search across symbols and journal content, symbol/side/result/journal-status filters, selectable page sizes, and numbered pagination. Filtering resets to the first page and does not change the account-wide summary cards or export contents.

**Journal editing is a modal, not an inline-expanding table row.** `TradeReport.jsx` used to insert an extra `<tr>` directly under the clicked row (`editingTradeId === trade.id`) holding the setup tag/tags/emotion inputs and entry/exit/mistake/notes textareas — pushing every subsequent row down and consuming a large slice of the table's limited height, the same "always-visible form eats the screen" issue [Strategy playbooks](backtesting-and-orders.md#strategy-playbooks-and-pre-trade-checklist) had. The trigger button is unchanged (`editingTradeId === trade.id ? cancelJournalEdit() : startJournalEdit(trade)`, still toggling Edit/Close) but now opens a page-level modal (`z-[10010]`, matching `PaymentActionModal.jsx`'s convention) instead of expanding the row. `editingTrade` (`sortedTrades.find(trade => trade.id === editingTradeId)`) resolves which trade the modal shows — using the unfiltered/unpaginated `sortedTrades` rather than `paginatedTrades` so the modal doesn't unexpectedly lose its trade if pagination math shifts, though in practice the existing `cancelJournalEdit()` calls on page/filter change (see `goToPage`, and the `useEffect` keyed on the filter/search/page-size state) already close the modal before that could happen. The modal header repeats the trade's symbol/side/date/PnL for context since the underlying row is no longer visibly expanding beneath it. Backdrop click, the header X, and the footer Cancel/Save all route through the same `cancelJournalEdit()`/`saveJournal()` handlers the inline row used — no new state or persistence path, only where the fields render.

## Maintenance

- Add a report field first to the authoritative query/serializer, then table/export/UI.
- The Closed Trades table's **Mode** column (`Cross`/`Isolated` badge, next to Side) reads `trade.marginMode`, already present in `MarketBacktestReportService::serializeReportPosition()` — no backend change was needed to add it. Same column/field was added to the Mentor Review share page. See the "BacktradeLab Cross Margin" section of [Backtesting](backtesting-and-orders.md) for the full Cross feature writeup.
- Keep server and client exports consistent.
- Define whether a statistic groups by entry or close time. Reporting is close-oriented apart from `byTradingSession`, which is entry-oriented on purpose (see above).
- **Row order in the Closed Trades table is by real `created_at` (when the trade was actually entered in the browser), not `closed_at_time` (the simulated backtest/candle timestamp the trade's PnL/date figures are based on)** — `MarketBacktestReportService::getReportPositions()`'s `orderByDesc('created_at')`/`orderByDesc('id')` (tiebreaker) sets this server-side, and `TradeReport.jsx`'s `sortedTrades` `useMemo` re-sorts client-side the same way (the frontend fetches once and re-sorts/paginates in memory — see below — so both must agree or the client-side sort silently wins). This was a real bug once: a user replaying different historical date ranges across sessions would see rows interleaved by simulated date instead of by the order they actually made each trade, so "my last trade" wasn't reliably first. Keep this distinct from the point above — `closed_at_time` still drives every time-bucketed *statistic* (calendar days, weekday/session/hour grouping, holding-time), only the table's row order changed.
- Validate journal lengths/types and sanitize any rendered rich text.
- `TradeReport.jsx` fetches all (up to 500) closed positions once per `refreshKey` change and does symbol/side/result/journal-status/search filtering entirely client-side over that fetched set (`filteredTrades`) — it does not send `symbol`/`session_id` to `report()`, even though the endpoint supports both. Keep this in mind before assuming a UI filter narrows what the server (or the insight service) sees.
- Add a new coaching heuristic in `MarketBacktestInsightService` as another private `...Insight()` method returning `?array{type,tone,severity,title,message}` (or reusing `groupWinRateInsight()` for another grouping key), then add it to the `collect([...])` list in `build()`. Keep the per-heuristic significance thresholds (min group size, min deviation) — an insight that fires on noise erodes trust in the whole feature faster than one that stays silent.

## Verification

- Empty and populated account.
- Date/session/symbol filters and pagination.
- Timezone boundaries in calendar days.
- CSV/JSON/server export contents.
- Journal save/reload and cross-user denial.
- Search and combined filters, empty filtered results, page-size changes, and pagination boundaries.
- Export request creates a `pending` row and returns immediately; a queue worker processing it flips it to `ready` (or `failed`) and produces a notification; the download route rejects other users' export IDs.
- Insights: below/at/above the 10-trade threshold; each heuristic firing and not firing in isolation; more than 3 heuristics firing at once still caps at 3; `report()` and `report/insights` both reflect the same underlying data through the shared service.
- Close two trades back to back where the second uses an *earlier* simulated/Replay date than the first (e.g. close a trade replaying 2022 data, then open Replay again and close another trade using 2021 candle data) and confirm the 2021-dated trade — entered second, in real time — still appears **above** the 2022-dated one in the Closed Trades table, sorted by when it was actually entered, not by its displayed "Closed" date.

Related: [Backtesting](backtesting-and-orders.md), [Testing](testing-guide.md), [Imported trades](imported-trades.md), [Mentor review sharing](mentor-review-sharing.md), [Training challenges](training-challenges.md).

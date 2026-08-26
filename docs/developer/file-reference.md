# File Reference

- `app/Http/Controllers/MarketBacktestPlaybookController.php` — owned strategy playbook CRUD.
- `app/Models/MarketBacktestPlaybook.php` — playbook rules, checklist, and position relationship.
- `resources/js/Components/Market/StrategyPlaybooks.jsx` — trader playbook management interface.
- `database/migrations/2026_08_13_000001_create_market_backtest_playbooks_table.php` — playbooks and immutable position snapshots.
- `app/Http/Controllers/MarketBacktestRiskSettingController.php` — trader-owned risk-limit settings.
- `app/Services/MarketBacktestRiskGuardrailService.php` — replay-day and loss-streak enforcement calculations.
- `resources/js/Components/Market/RiskGuardrailSettings.jsx` — risk guardrail settings interface.
- `app/Services/MarketBacktestAdvancedAnalyticsService.php` — equity, drawdown, streak, grouped-performance, and Monte Carlo calculations.
- `database/migrations/2026_08_13_000003_add_advanced_exit_rules_to_market_backtest_positions.php` — liquidation, managed-exit, close-reason, and original-size fields.
- `app/Services/CrossMarginService.php`, `CrossMarkService.php`, `CrossLiquidationService.php` — BacktradeLab Cross Margin's pure portfolio calculator, mark ledger, and atomic liquidation transaction.
- `app/Services/CrossMarginLiveMonitor.php`, `app/Console/Commands/MonitorCrossMargin.php`, `config/cross-margin.php` — the Live Cross monitor (`php artisan cross-margin:monitor`) and its enable/poll-interval config.
- `app/Models/MarketBacktestMark.php`, `database/migrations/2026_08_26_000001_add_cross_margin_support_to_market_backtest.php` — the Cross mark ledger table and `exchange`/`margin_mode` position columns.

Use this index to find the feature owner of a source file. Detailed behavior belongs in the linked guide.

| Source path | Feature guide |
|---|---|
| `routes/web.php`, `routes/api.php` | [Architecture](02-project-architecture.md) and linked route owner |
| `resources/js/app.jsx`, `AppInitializer.jsx` | [Architecture](02-project-architecture.md) |
| `app/Http/Controllers/Auth/*` | [Authentication](authentication-and-oauth.md) |
| `AdminAccessService.php`, `EnsureAdmin*.php` | [Roles and menus](roles-privileges-menus.md) |
| `app/Http/Controllers/Users/*`, `AccountDeactivationService.php` | [Users and profiles](users-profiles-and-deactivation.md) |
| `AdminUsersController.php`, `PrivilegesController.php`, `MenusController.php`, `ModulsController.php` | [Roles and menus](roles-privileges-menus.md) |
| `Components/Profile/avatarCatalog.js`, `Components/Profile/AvatarBadge.jsx` | [Users, profiles, and deactivation](users-profiles-and-deactivation.md) |
| `DashboardController.php`, `Pages/Dashboard/*`, `Layouts/*` | [Dashboard and layouts](dashboard-and-layouts.md), including admin operations and workspace mode |
| `Pages/Public/*`, `CookieNotice.jsx`, `config/legal.php` | [Public and legal](public-and-legal-pages.md) |
| `MarketDataController.php`, `MarketMetadataService.php`, `MarketOverviewController.php`, `MarketOverviewService.php`, `MarketSymbol.php` | [Market data](market-data-and-symbols.md) |
| `Components/Market/MarketChart*` | [Trading chart](trading-chart.md) |
| `MarketDrawingController.php`, `MarketToolSettingController.php` | [Drawings and settings](chart-drawings-and-settings.md) |
| `liveCandleStream.js` | [Live streaming](live-market-streaming.md) |
| `MarketReplayProgressController.php`, `MarketReplayProgress.php` | [Replay](replay-and-progress.md) |
| `MarketBacktestController.php`, `MarketBacktest*.php` | [Backtesting](backtesting-and-orders.md) and [Reports](trade-reports-and-journals.md) |
| `Cross*.php`, `MonitorCrossMargin.php`, `config/cross-margin.php` | [Backtesting](backtesting-and-orders.md#backtradelab-cross-margin) |
| `MarketPriceAlertController.php`, `NotificationsController.php` | [Alerts and notifications](price-alerts-and-notifications.md) |
| `ReplayAccessController.php`, `Services/Payments/*`, `PayMongoWebhookController.php` | [Subscriptions and PayMongo](subscriptions-trials-and-paymongo.md) |
| `UserFeedbackController.php`, `Pages/Feedback/*` | [Feedback](feedback.md) |
| `AnnouncementsController.php`, `Announcement.php` | [Announcements](announcements.md) |
| `AdminApiController.php`, `Api/ApiController.php`, `Models/AdmModels/Api*` | [Admin API generator](admin-api-generator.md) |
| `SettingsController.php`, `Components/SystemSettings/*` | [System settings](system-settings.md) |
| `app/Services/SystemErrorLogger.php`, `SystemErrorLogController.php`, `Pages/SystemLogs/*` | [System error logs and payment activity](system-error-logs-and-payment-activity.md) |
| `app/Services/Payments/PaymentActivityLogger.php`, `PaymentActivityLogController.php`, `Pages/Subscriptions/ActivityLog.jsx` | [System error logs and payment activity](system-error-logs-and-payment-activity.md) |
| `database/migrations/*` | The feature guide for the table being changed |
| `tests/*` | [Testing guide](testing-guide.md) |

## Route coverage ownership

Shared authentication/profile/market/subscription/feedback/admin routes are covered by their guides. Notification/filter/export and database-generated controller routes are legacy admin infrastructure covered by [Roles and menus](roles-privileges-menus.md), [Announcements](announcements.md), [Admin API generator](admin-api-generator.md), or [System settings](system-settings.md). `routes/channels.php` and `routes/console.php` are framework/operations entry points; document new channel or scheduled-command behavior in the owning feature guide.
- `resources/js/Components/Market/WorkspaceTour.jsx`: reusable accessible spotlight tour.
- `resources/js/Components/Feedback/FeedbackChat.jsx`: customer/admin support conversation with visible-tab polling.
- `app/Models/UserFeedbackMessage.php`: threaded payment/subscription support message.

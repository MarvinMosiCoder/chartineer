# BacktradeLab Developer Handbook

This handbook documents the application by feature. Each guide names the responsible files, explains the request and data flow, shows small real-code excerpts, and provides maintenance and verification steps. Source code remains the authority.

## Recommended reading order

1. [Getting started](01-getting-started.md)
2. [Project architecture](02-project-architecture.md)
3. The feature guide for the area you will change
4. [Feature development guide](feature-development-guide.md)
5. [Testing guide](testing-guide.md)
6. [Deployment and production](deployment-and-production.md)

## Feature map

| Area | Guide |
|---|---|
| Login, reset password, Google/Facebook | [Authentication and OAuth](authentication-and-oauth.md) |
| Profile, password, account lifecycle | [Users, profiles, and deactivation](users-profiles-and-deactivation.md) |
| Admin authorization and navigation | [Roles, privileges, and menus](roles-privileges-menus.md) |
| Inertia shells and role dashboards | [Dashboard and layouts](dashboard-and-layouts.md) |
| Homepage, privacy, terms, cookies | [Public and legal pages](public-and-legal-pages.md) |
| Exchanges, candles, saved markets | [Market data and symbols](market-data-and-symbols.md) |
| Chart composition and indicators | [Trading chart](trading-chart.md) |
| Drawing persistence and templates | [Chart drawings and settings](chart-drawings-and-settings.md) |
| Exchange WebSockets and polling | [Live market streaming](live-market-streaming.md) |
| Candle replay and resume state | [Replay and progress](replay-and-progress.md) |
| Simulated accounts, sessions, orders | [Backtesting and orders](backtesting-and-orders.md) |
| PnL, calendar, exports, journal | [Trade reports and journals](trade-reports-and-journals.md) |
| Real trade CSV import, separate from simulated data | [Imported trades](imported-trades.md) |
| Revocable public trade-review links | [Mentor review sharing](mentor-review-sharing.md) |
| Rule-scored practice exercises | [Training challenges](training-challenges.md) |
| Price triggers and notifications | [Price alerts and notifications](price-alerts-and-notifications.md) |
| Trial, plans, checkout, webhook | [Subscriptions, trials, and PayMongo](subscriptions-trials-and-paymongo.md) |
| User/admin feedback workflow | [Feedback](feedback.md) |
| Admin announcements | [Announcements](announcements.md) |
| Legacy configurable API system | [Admin API generator](admin-api-generator.md) |
| Name, logo, theme, login settings | [System settings](system-settings.md) |
| App-wide exception log, payment lifecycle trail | [System error logs and payment activity](system-error-logs-and-payment-activity.md) |
| Admin "Reports" section: revenue by day/week/month/year | [Admin reports](admin-reports.md) |

Use [file reference](file-reference.md) when you know a path but not its feature owner.

## Documentation rules

- Create or update the feature guide in the same change as behavior.
- Prefer a short excerpt plus a source path; never paste a full implementation.
- Document routes with method, middleware, input, output, ownership, and failure behavior.
- Explain why a database field exists and who may read or change it.
- Link related guides instead of duplicating explanations.
- Mark legacy behavior explicitly. Do not silently describe intended behavior as current behavior.
- Run the checks in [Testing guide](testing-guide.md) after editing links or paths.

# Deployment and Production

## Required services and configuration

Use managed MySQL, shared Redis for cache/session/rate limits/queues, private S3-compatible storage for sensitive/shared files, supervised queue workers, HTTPS, and scheduled Laravel commands. Market-data protection requires `CACHE_DRIVER=redis` in production and the PHP Redis extension (or an explicitly installed compatible Redis client); the application refuses to boot in production without the shared cache unless `MARKET_DATA_REQUIRE_REDIS=false` is deliberately set for an emergency single-instance deployment.

**`SESSION_DRIVER` must not be `file` in production, for a reason beyond multi-instance sharing.** Laravel's `file` session driver acquires an exclusive `flock()` for the duration of each request, so concurrent requests sharing one session (e.g. a chart page firing its several own-data endpoints — drawings, tool settings, price alerts, replay access/progress — at once) serialize behind each other on the backend even though the browser fired them in parallel. Measured locally: switching to `SESSION_DRIVER=database` (the local dev default here, since Redis's client library isn't installed in this dev environment — see below) removed that queueing. Production should use `SESSION_DRIVER=redis` per the shared-Redis guidance above, which avoids the same file-lock bottleneck.

Local development in this repo currently runs `SESSION_DRIVER=database` rather than `redis`: the Redis *server* is present via Laragon, but the `predis/predis` client package isn't installed (`composer require predis/predis` would be needed first). `database` needs its `sessions` table migrated once (`php artisan session:table && php artisan migrate`) but otherwise avoids `file`'s locking with zero new dependencies — a reasonable default for local dev, not a substitute for `redis` in production.

Production secrets belong in the deployment environment. Important groups are `APP_*`, `DB_*`, `REDIS_*`, `MAIL_*`, `AWS_*`, `GOOGLE_*`, `FACEBOOK_*`, `LEGAL_*`, `COINMARKETCAP_API_KEY`, optional CoinGecko fallback `COINGECKO_*`, and `PAYMONGO_*`.

`MARKET_DATA_HISTORICAL_REQUEST_CACHE_SECONDS` controls fixed-end exchange-page caching and defaults to 86,400 seconds. Keep it substantially longer than the latest-candle cache so full-history requests reuse immutable pages.

Recommended deployment commands:

```bash
composer install --no-dev --optimize-autoloader
npm ci
npm run build
php artisan migrate --force
php artisan storage:link
php artisan optimize
```

Run the scheduler every minute and supervise queue workers. Test database restores, not only backups.

A queue worker is required, not optional: the trade-report export ([Trade reports and journals](trade-reports-and-journals.md)) dispatches a `GenerateBacktestReportExport` job and nothing processes it without `php artisan queue:work` running (supervised, same pattern as the market alert worker below). `QUEUE_CONNECTION=database` needs no extra infrastructure; switch to `redis` if queue volume grows, since Redis is already required for cache/sessions/rate limits.

Subscription renewal reminders ([Subscriptions](subscriptions-trials-and-paymongo.md)) do not need a separate supervised process — `subscriptions:send-renewal-reminders` runs off the same Laravel scheduler as `payments:reconcile-paymongo`, so it only needs the standard cron-triggered `php artisan schedule:run` every minute already required above.

## Security and operations

- Set `APP_ENV=production`, `APP_DEBUG=false`, HTTPS cookies, trusted proxies, and shared rate-limit storage.
- Keep TLS verification enabled for exchange/PayMongo HTTP calls.
- Restrict snapshot, historical proof, attachment, backup, and log access.
- Monitor HTTP errors, slow queries, failed jobs, exchange latency, WebSocket/fallback health, disk, MySQL, and Redis.
- Confirm all user-owned market/backtest/subscription/feedback routes enforce ownership.
- Review the legacy API generator before any external exposure.

## PayMongo rollout

Keep `PAYMONGO_ENABLED=false` until merchant, legal, tax, invoice, refund, consumer-protection, and provider requirements are ready.

Sandbox/staging requires test mode and `sk_test_`. Production live checkout additionally requires live mode, an `sk_live_` key, and `PAYMONGO_LIVE_ENABLED=true`. Register one webhook at `/webhooks/paymongo`, preserve the raw body/header, and keep its signing secret only in deployment secrets.

Validate available merchant payment methods; configuring `card,gcash` does not guarantee both are enabled.

## Launch checklist

- Run [Testing guide](testing-guide.md).
- Confirm legal URLs and operator values.
- Verify OAuth callbacks on the production domain.
- Verify rate limits behind the real proxy/CDN.
- Load-test candle, replay, order, report, and checkout endpoints.
- Verify WebSocket hosts in CSP/network rules and REST fallback behavior.
- Verify Redis-backed exchange budgets/cooldowns, stale-cache behavior, and structured 429/418 monitoring before exposing chart APIs to production traffic.
- Test PayMongo success/failure/abandonment/delayed/duplicate/missed webhook.
- Confirm subscription plan prices and durations.
- Verify private/shared storage and backup restore.
- Confirm offline price alerts have a worker if advertised.

Related: [Subscriptions](subscriptions-trials-and-paymongo.md), [Streaming](live-market-streaming.md).
# Market alert worker

Enable and supervise one long-running alert monitor:

```ini
[program:backtradelab-market-alerts]
command=php /var/www/backtradelab/artisan market-alerts:monitor
directory=/var/www/backtradelab
autostart=true
autorestart=true
stopasgroup=true
killasgroup=true
stdout_logfile=/var/log/backtradelab-market-alerts.log
redirect_stderr=true
```

Production environment:

```env
MARKET_ALERTS_ENABLED=true
MARKET_ALERT_POLL_SECONDS=5
```

After deployment, run migrations before starting the worker. Only one worker should run unless alert-market partitioning is introduced.
# BacktradeLab Cross Margin worker

**Required before any real (non-local) deployment where the Cross selector is reachable.** The Enter Position ticket's Isolated/Cross pill is now functional for every user (see [Backtesting and Orders](backtesting-and-orders.md#backtradelab-cross-margin)) — there is no feature flag gating it. The frontend's own `/market-backtest/cross/evaluate` call after opening a Cross position is a best-effort nicety, not a substitute for this worker: without it running, a Cross portfolio that breaches maintenance while a user is simply watching price (not submitting new orders) is never liquidated. Enable and supervise the same way as the alert worker above:

```ini
[program:backtradelab-cross-margin]
command=php /var/www/backtradelab/artisan cross-margin:monitor
directory=/var/www/backtradelab
autostart=true
autorestart=true
stopasgroup=true
killasgroup=true
stdout_logfile=/var/log/backtradelab-cross-margin.log
redirect_stderr=true
```

Production environment:

```env
CROSS_MARGIN_MONITOR_ENABLED=true
CROSS_MARGIN_MONITOR_POLL_SECONDS=5
```

Without this worker running, `--force`d manual runs aside, no open Cross portfolio is ever liquidated on maintenance breach — the frontend's own `/market-backtest/cross/evaluate` call is only an optimization, never authoritative. Only one worker should run unless Cross-market partitioning is introduced, same caveat as the alert worker.

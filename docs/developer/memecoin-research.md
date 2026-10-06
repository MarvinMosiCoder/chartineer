# Memecoin Research

Native Laravel/Inertia/React port of the implemented `vram-py` memecoin feature:
multi-chain token search, risk reports, Quick scalp setup, personal history,
wallet lists, creator/owner lookup, manual trade journal and Solana wallet alerts.
Open **More → Memecoins** in the trader navbar, or **More → Memecoin Research**
in the admin navbar. Research requires an active login
and is available without replay entitlement. DEX addresses are independent of
the exchange chart's symbol picker. Research never submits orders or changes
simulated balances.

## Owners

| File | Responsibility |
|---|---|
| `routes/memecoin.php` | Pages and JSON routes, included by `routes/web.php` |
| `app/Http/Controllers/MemecoinController.php` | Validation, ownership, history, journal and queued scans |
| `app/Services/Memecoin/Analyzer.php` | DexScreener, RugCheck, GoPlus, RDAP and archive collectors |
| `app/Services/Memecoin/RiskRules.php` | Risk scoring and unchecked evidence |
| `app/Services/Memecoin/Chains.php` | Chain/address validation and normalization |
| `app/Services/Memecoin/WalletWatcher.php` | Checkpoints, token gains, deduplication and optional Telegram |
| `app/Jobs/ScanMemecoinWallets.php` | Background scan for one active user |
| `app/Console/Commands/WatchMemecoinWallets.php` | Scheduled checks or one-user manual scan |
| `config/memecoin.php` | Chain registry, RPC, cache and watch configuration |
| `resources/js/Pages/Memecoin/Index.jsx` | Inertia views and theme |
| `resources/js/Components/Memecoin/` | Feature UI, same-origin HTTP adapter and pure scalp filters |
| `database/migrations/2026_10_06_000001_create_memecoin_tables.php` | Owned reports, wallets, journal and alerts |

## Routes and ownership

Pages: `/memecoin`, `/memecoin/{chain}/{address}`, `/memecoin/history`,
`/memecoin/history/{id}`, `/memecoin/wallets`, `/memecoin/creators`,
`/memecoin/journal`, `/memecoin/watch`.

JSON prefix `/memecoin-api` avoids collisions with Inertia page routes. All
routes use `auth` and `account.active`; all records belong to the caller.

| Method and suffix | Input and output |
|---|---|
| `GET /search` | `q` 2–100 characters, optional chain; tokens grouped by contract, deepest pool selected, sorted by total volume |
| `GET /analyze/{chain}/{address}` | Market, safety, website, assessment and source errors; saves an owned snapshot |
| `GET /market/{chain}/{address}` | Market-only refresh and UTC fetch time; no history write |
| `GET /reports` | Optional address, limit 1–200, offset; personal summaries newest first |
| `GET /reports/{id}` | Owned snapshot |
| `DELETE /reports/{id}` | Removes owned snapshot, preserves linked journal entry |
| `DELETE /reports` | Requires `confirm: clear_all_reports`; clears only caller's history |
| `GET /wallets` | Optional `list: blacklist|good_dev|watch` |
| `POST /wallets` | Address, list, optional label (100 chars), note (1000 chars); duplicate 409 |
| `DELETE /wallets/{id}` | Removes owned wallet |
| `GET /wallet-tokens/{chain}/{address}` | `relationship: creator|owner`, limit 1–100, offset; observed relationships in personal reports, including Solana creator history |
| `GET /trades` | Personal manual journal |
| `POST /trades` | Chain/address, positive entry price, reason, optional amount/date/report; linked report must be owned and match token |
| `PATCH /trades/{id}` | Entry correction or exit price/reason together; inconsistent close or exit before entry rejected atomically |
| `DELETE /trades/{id}` | Removes owned journal entry |
| `GET /watch` | Count, latest scan time, queued state, previous result, Telegram status |
| `POST /watch/check` | Queues scan (202); duplicate pending scan 409 |
| `GET /alerts` | Limit 1–200; caller's alerts and unseen count |
| `POST /alerts/seen` | Marks only caller's alerts seen |

Bad input returns 422, foreign records 404, inactive accounts 403, anonymous
JSON requests 401. Search/market upstream failure returns 502. Analysis keeps
working sources and identifies failed sources. Limits per user/minute: search
and refresh 20, analysis 6, scan requests 2. Other reads/writes use existing
named application limits.

## Risk and scalp strategy

Solana safety comes from RugCheck; EVM safety from GoPlus. Supported chains are
Solana, Ethereum, BNB Smart Chain, Base, Polygon, Arbitrum and Robinhood Chain.
Unavailable evidence stays unchecked. A hard finding gives **Avoid**; fail
findings add 40 points, warnings 10, score capped at 100. Missing hard checks or
worst-case warning score 40+ gives **High risk**. Otherwise **Watch** means no
blocking finding observed, never a buy recommendation. LP lock below 90% and
non-pool top-ten holders above 30% warn rather than fail for pools 30+ days old.
Private blacklisted creators fail; blacklisted holders warn.

Public facts are cached five minutes. Private blacklist assessment runs afresh
per caller, so one user's lists never alter another user's report. Incomplete
reports are not cached. Snapshots are deduplicated by user, token, fetch time
and assessment. Address hashes preserve Solana case sensitivity under MySQL;
EVM addresses normalize to lowercase.

Quick scalp defaults use the **selected pool**, never aggregate pools:

| Metric | Minimum |
|---|---|
| Market cap | $100,000 |
| Pool liquidity | $75,000 |
| Volume 1h / 5m | $50,000 / $10,000 |
| Trades 5m | 100 transactions |
| Liquidity / market cap | 10% |

Acceleration requires `volume_5m > (volume_1h - volume_5m) / 11`, pool age at
least one hour and consistent windows. Missing cap never uses FDV. Missing
inputs, Avoid/High risk, market older than 60 seconds, safety older than five
minutes or refresh failure suppress a positive match. Live market refresh is
30 seconds after each request settles; saved snapshots do not poll. Custom
minimums apply to the current view and reset on navigation.

HTTP(S) project links are retained; only registries and archive.org are queried,
never arbitrary project websites. Shared hosts are excluded from domain-age
checks. Domain suffix extraction is heuristic. Archive history is informational.
Wallet lookup is saved evidence, not a complete chain index. The source had no
first-buyer bundle analysis, X-account checks, AI reports, wash-trading detection,
fees or price-impact calculations; these remain outside the port.

## Operations

```bash
php artisan migrate --path=database/migrations/2026_10_06_000001_create_memecoin_tables.php
php artisan queue:work database --queue=memecoin --timeout=85
```

Use your configured queue connection when it differs. Scans use the dedicated
`memecoin` queue; include it in your supervised worker's queue list. A `sync` default routes
wallet scans to the database queue to keep RPC work outside HTTP requests.
`MEMECOIN_WATCH_ENABLED=true` enables five-minute scheduled scans with the normal
Laravel scheduler. `php artisan memecoin:watch --user=<id>` scans one user now.
Override public RPC using `MEMECOIN_SOLANA_RPC_URL` when needed.

First scan records a baseline without historical alerts. Later scans process
oldest signatures first, aggregate all token accounts per mint, exclude failed
transactions and wrapped SOL/USDC/USDT, and deduplicate per user/wallet/transaction/
mint. Gains may be transfers or airdrops, not buys. Unavailable transactions keep
their checkpoint. A 45-second work budget, per-wallet locks and oldest-check-first
rotation bound work. Pagination beyond five 1000-signature pages reports backlog
and retains the cursor. EVM scanning remains unsupported.

Watch polls every ten seconds. Browser alerts require an explicit grant and an
open Watch page. Optional Telegram requires `MEMECOIN_TELEGRAM_USER_ID`,
`MEMECOIN_TELEGRAM_BOT_TOKEN`, and `MEMECOIN_TELEGRAM_CHAT_ID`; only that user's
alerts go to that recipient. Keep the bot token in deployment secrets.

## Verification

```bash
php -d extension=pdo_sqlite vendor/phpunit/phpunit/phpunit --filter=Memecoin
npm run test:memecoin-scalp
npm run build
php artisan route:list --path=memecoin
```

PHP tests cover source fixture parity, missing evidence, private blacklists,
validation, ownership, history preserving journals, atomic closes, queued scans,
gain aggregation and retry checkpoints. JS tests cover boundaries, missing cap,
overlapping volume, selected-pool values, custom minimums and stale/risk overrides.
Fixtures are public provider responses reduced to fields used by the port.
Browser verification covers every tab, both themes and mobile widths.

Related: [Market data](market-data-and-symbols.md), [Trade reports](trade-reports-and-journals.md), [Deployment](deployment-and-production.md).

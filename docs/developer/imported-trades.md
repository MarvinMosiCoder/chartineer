# Imported Trades (Broker/Exchange CSV Import)

## Purpose

Traders can import real historical fills from a broker or exchange CSV export. This is a completely separate dataset from the simulated backtest engine — its own tables, its own controller, its own job — so real trade history is never confused with, or mixed into, simulated backtest positions/trades.

| Route/file | Responsibility |
|---|---|
| `POST /imported-trades/batches/preview` | Store the uploaded CSV privately, return header row + short preview |
| `POST /imported-trades/batches/{batch}/commit` | Save column mapping + timezone, dispatch the async import job |
| `GET /imported-trades/batches` | The authenticated trader's own import batches, newest first |
| `DELETE /imported-trades/batches/{batch}` | Delete an owned batch, its stored file, and its imported trades |
| `GET /imported-trades/items` | Paginated, read-only list of the authenticated trader's imported trades |
| `ImportedTradeController.php` | Validation, ownership checks, preview parsing, row-count guard |
| `ProcessImportedTradesBatch.php` | Queued job: parses the file, normalizes/dedupes/inserts rows |
| `ImportedTradeBatch.php` / `ImportedTrade.php` | Domain records/relations |
| `ImportedTrades.jsx` | Upload, column-mapping, batch history, and read-only trades UI |

## Two-phase preview/commit flow

1. **Preview.** The trader uploads a `.csv`/`.txt` file (max 10 MB) plus an optional broker name. The controller stores the file privately on the `local` disk under `imported-trades/{adm_user_id}/`, reads the header row and first ~20 data rows with `Excel::toArray(null, $file)` (maatwebsite/excel — no custom `Import` class), and creates an `imported_trade_batches` row with `status = 'mapping'`. The response returns `batchId`, `headers`, and `previewRows` so the UI can render a column-mapping step without ever running the full import synchronously.
2. **Commit.** The trader maps each required target field (`symbol`, `side`, `quantity`, `entry_price`) and any optional ones (`exit_price`, `fee`, `realized_pnl`, `opened_at_time`, `closed_at_time`) to one of the returned CSV headers, and picks a source IANA timezone. `commit()` re-derives the row count from the stored file and rejects the request with `422` if it exceeds **20,000 rows**. On success it saves `column_mapping` + `source_timezone`, flips `status` to `pending`, and dispatches `ProcessImportedTradesBatch::dispatch($batch->id)` — the actual parse/insert work always happens off the request cycle.

The batch's `status` moves through `mapping → pending → processing → ready` (or `failed`). The frontend lightly polls `GET /imported-trades/batches` while any batch is `pending`/`processing` so counts update without a manual refresh.

## The async job (`ProcessImportedTradesBatch`)

Mirrors the existing `GenerateBacktestReportExport` pattern: a DB-row-tracked job that flips `status` on entry/exit and writes an `AdmNotifications` row on both success and failure (`source_type = 'imported_trade_batch'`, `source_id = $batch->id`, deduplicated the same way exports are — `firstOrCreate` on `[source_type, source_id]` — with `url` pointing at `/trade-report`).

1. Load the batch, set `status = 'processing'`.
2. Parse the stored file's first sheet with `Excel::toCollection(null, $batch->file_path, 'local')->first()`, skipping the header row.
3. Resolve each mapped target field to a column index using the *current* header row (not the header captured at preview time), so a structurally changed file fails clearly instead of silently misreading columns.
4. For every data row: normalize symbol/side, parse numeric fields, convert any mapped timestamp field, compute the dedup hash (see below), and either queue it for insert or record it as a duplicate.
5. Insert new rows in chunks of 500 via `ImportedTrade::insertOrIgnore()` — safe to call given the driver in use (see **Database driver note** below).
6. On success: delete the source file from the `local` disk, set `status = 'ready'`, and persist `total_rows`, `imported_rows`, `duplicate_rows`, `error_rows`, and `row_errors` (capped at 50 entries — the job keeps processing every row regardless, it just stops *storing* per-row error detail past that cap).
7. On any uncaught exception: set `status = 'failed'`, store `error`, **keep the file** on disk for debugging, write the failure notification, and rethrow so the queue's own failure handling still applies.

Per-row failures (bad side value, unparseable number, unparseable timestamp, or a value that normalizes to nothing) are caught individually and recorded in `row_errors` — they do not abort the batch.

## Dedup mechanism

Every prepared row computes:

```php
hash('sha256', implode('|', [
    $admUserId, $symbol, $side, $quantity, $entryPrice,
    $exitPrice ?? '', $openedAt ?? '', $closedAt ?? '',
]))
```

stored as `imported_trades.source_row_hash`. Before the row loop starts, the job pre-loads every existing hash for that user (`ImportedTrade::where('adm_user_id', ...)->pluck('source_row_hash')`) into an in-memory set, so:

- **Duplicates within the same run** (the file itself repeats a row) are caught as soon as the second occurrence's hash is computed, without a DB round trip.
- **Duplicates across runs** (the same file, or an overlapping export, imported again) are caught the same way, since the pre-loaded set is scoped per user and rebuilt fresh on every job execution.
- `imported_trades` also carries a **unique index on `(adm_user_id, source_row_hash)`** as a backstop for the case the in-memory check can't cover — a genuine race between two concurrent imports for the same user. `insertOrIgnore()` means that race silently drops the losing row instead of failing the whole chunk.

Both layers key off the *normalized* values (uppercased/stripped symbol, canonical `long`/`short` side, parsed numbers, UTC epoch timestamps), not the raw CSV text, so formatting differences that don't change the underlying trade (e.g. `"BTC-USDT"` vs `"btcusdt"`, `"Buy"` vs `"long"`) still collapse to the same hash.

## Timezone handling

Trade CSVs rarely carry UTC timestamps. The trader supplies one `source_timezone` (a Laravel-validated IANA name, e.g. `America/New_York`) for the whole batch at commit time. Every mapped timestamp cell is parsed against that zone and converted to a UTC epoch second:

```php
Carbon::parse($cell, $timezone)->utc()->getTimestamp()
```

`opened_at_time`/`closed_at_time` are stored as `unsignedBigInteger` UTC epoch seconds, matching the convention already used by `market_backtest_positions`/`market_backtest_trades`. A cell that fails to parse is recorded as a row error rather than guessed at.

## Symbol normalization

Raw symbol text is uppercased and stripped of everything except `A-Z`/`0-9`:

```php
$symbol = preg_replace('/[^A-Z0-9]/', '', strtoupper($raw));
```

So `"btc-usdt"`, `"BTC/USDT"`, and `"  Btc_Usdt "` all normalize to `"BTCUSDT"`. A value that normalizes to an empty string is rejected as a row error rather than stored as a blank symbol.

## Side normalization

A small synonym map, case-insensitive: `buy`/`long`/`b`/`l` → `long`, `sell`/`short`/`s` → `short`. Anything else throws and is recorded as a row error for that line — it is never silently guessed.

## Row cap

`commit()` rejects the request with `422` if the stored file has more than **20,000 data rows**, before ever dispatching the job. This keeps a single queued job bounded and keeps the synchronous commit-time row count check itself cheap (one read of the already-uploaded file, not a second upload).

## Database driver note

`insertOrIgnore()` is used for the chunked insert. The app's default connection (`DB_CONNECTION` in `.env`/`.env.example`) is `mysql`, where `insertOrIgnore()` compiles to `INSERT IGNORE`, which is exactly the "skip duplicates, don't fail the statement" behavior this job wants as a race backstop. It is also portable to the `sqlite` connection the test suite forces (`INSERT OR IGNORE`), so the same job code runs correctly under both.

## Ownership

Every controller action scopes its query to `$request->user()->id` — a batch or trade row belonging to another user resolves as `404`, never `403` (so existence isn't leaked), matching `MarketBacktestController`'s `getOrCreateAccount()` convention. Route-model-bound `{batch}` parameters are still explicitly re-checked against the authenticated user inside the action rather than trusted as already-scoped.

## Explicitly not part of simulated backtest analytics

`imported_trades` / `imported_trade_batches` are never queried, joined, or aggregated by `MarketBacktestReportService` or `MarketBacktestAdvancedAnalyticsService`, and the simulated `market_backtest_positions`/`market_backtest_trades` tables are never queried by `ImportedTradeController`/`ProcessImportedTradesBatch`. The two datasets share no foreign keys, no shared rows, and no shared report code path — only the same trader (`adm_user_id`) and the same `/trade-report` page as a UI home. If a future feature wants to compare real vs. simulated performance, that comparison belongs in a new, explicitly-named service that reads both sources separately, not a change to either existing service.

## Maintenance

- Keep the dedup hash's input field list and normalization rules in one place (`ProcessImportedTradesBatch`) — the controller never recomputes it.
- If new optional mapped fields are added, extend `TARGET_FIELDS`/`column_mapping.*` validation, the job's `prepareRow()`, and the migration together.
- Never widen `insertOrIgnore` usage to assume it reports an exact "rows ignored" count — only "rows affected" is portable across drivers; `duplicate_rows` is derived from the in-memory hash-set check, not from the insert's return value.

## Verification

- Preview returns headers/preview rows and creates a `mapping`-status batch; commit validates required mapping keys and a real IANA timezone, then dispatches the job (`Queue::fake()` + `Queue::assertPushed`).
- Symbol normalization (`"btc-usdt"` → `"BTCUSDT"`), side synonym mapping, and a timezone conversion against a known fixture date/time.
- Re-running the same file: `duplicate_rows` reflects every already-imported row, no duplicate `imported_trades` rows are created, and the unique index is never violated.
- Cross-user `404` on `destroyBatch`/`items`.

Related: [Backtesting and orders](backtesting-and-orders.md), [Trade reports and journals](trade-reports-and-journals.md).

# Tier gate

Every `/imported-trades/*` route is gated `replay.access:imported_trades` (tier 3, Elite — see [Subscriptions](subscriptions-trials-and-paymongo.md)). These routes previously carried only a throttle, so real-broker CSV import was reachable by any logged-in user with no subscription and no trial.

Importing real trades is the point at which a user stops practising and starts analysing real money, which is why it sits at the top tier rather than alongside the simulated-trading engine. Existing batches stay readable after a downgrade; only new imports are refused.

## Gated presentation

Both list requests (`/imported-trades/batches` and `/imported-trades/items`) fail together when the tier is missing, so the refusal is hoisted to **one** page-level `AccessNotice` rather than repeated per section — two identical red messages stacked down the panel read as two broken panels rather than one locked feature.

The empty states are suppressed while gated: `No import batches yet.` renders nothing and the trades table says `Locked`. Claiming the list is empty when it was never allowed to load is a different statement from the truth, and it hides the fact that there is an action available.

The upload and commit errors route through the same notice, so a refusal on the import action itself is as actionable as one on the list. See [Subscriptions](subscriptions-trials-and-paymongo.md#gated-error-presentation-accessnotice).

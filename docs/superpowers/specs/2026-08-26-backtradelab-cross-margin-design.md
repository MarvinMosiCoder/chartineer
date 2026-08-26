# BacktradeLab Cross Margin simulation

## Purpose

Add an exchange-neutral **BacktradeLab Cross** mode for futures practice. Cross positions share the account's eligible simulated collateral and are liquidated as one portfolio when shared equity reaches the documented maintenance requirement. Existing Isolated behavior remains the default and Spot remains separate.

This is an educational BacktradeLab model. It does not claim to reproduce Binance, Bybit, or another venue's risk tiers, mark-price construction, insurance fund, auto-deleveraging, or partial-liquidation process.

## Confirmed product rules

- Margin mode is selected per futures order: `isolated` or `cross`.
- Isolated and Cross positions may coexist in one simulated account.
- Spot orders do not expose margin mode and never participate in Cross collateral or liquidation.
- Existing and migrated futures positions default to `isolated`.
- Cross version one supports multiple symbols in both Live and Replay.
- BacktradeLab uses a fixed maintenance rate of `0.5%` of combined Cross notional plus estimated closing fees.
- When Cross equity reaches the maintenance requirement, every open Cross position is closed atomically at its current simulated mark.
- Version one does not implement partial liquidation.

## Accounting model

All calculations use decimal-safe server-side arithmetic and round only at established persistence/response boundaries.

For each open Cross position `i`:

```text
notional_i           = abs(quantity_i * mark_i)
initial_margin_i     = persisted position.margin
unrealized_pnl_i     = side-aware (mark_i - entry_i) * quantity_i
closing_fee_i        = notional_i * configured simulation fee rate
maintenance_i        = notional_i * 0.005
```

Portfolio values:

```text
cross_initial_margin = sum(initial_margin_i)
cross_unrealized_pnl = sum(unrealized_pnl_i)
cross_closing_fees   = sum(closing_fee_i)
cross_maintenance    = sum(maintenance_i) + cross_closing_fees
cross_equity         = account.cash_balance
                       + cross_initial_margin
                       + cross_unrealized_pnl
cross_pending_reserve = sum(pending cross margin + estimated entry fee)
cross_available_margin = max(
    0,
    cross_equity
      - cross_initial_margin
      - cross_pending_reserve
      - cross_closing_fees
)
cross_margin_ratio   = cross_maintenance > 0
                       ? cross_equity / cross_maintenance
                       : null
```

`account.cash_balance` remains the existing free-cash ledger: opening a filled position deducts its initial margin and entry fee; closing returns its remaining margin plus gross PnL less exit fee. Adding Cross therefore does not rewrite historical account accounting. The difference is that liquidation eligibility uses the full Cross portfolio equity rather than each position's isolated liquidation price.

Margin locked in Isolated positions is excluded from `cross_equity`. Free `cash_balance` is eligible Cross collateral. Spot position value and Spot PnL are excluded.

A new Cross order is accepted only when its requested initial margin and entry fee fit within `cross_available_margin` after including existing pending reservations. A pending Cross order reserves capacity but does not deduct cash until triggered, matching the current pending-order ledger pattern.

## Data model

### Positions

Add to `market_backtest_positions`:

- `exchange` string, populated from the order/session and required for new records.
- `margin_mode` string with allowed values `isolated` and `cross`; default `isolated`.

Backfill existing rows to `isolated`. Backfill `exchange` from the related session where possible and use the application's established default exchange only for legacy rows without a session. Add indexes supporting account/status/margin-mode scans.

`liquidation_price` remains populated only for Isolated futures. It is `null` for Cross and Spot positions. Cross liquidation is an account-level condition and must not be represented as a misleading fixed per-position price.

### Mark ledger

Add `market_backtest_marks` with:

- account owner and market identity: account, exchange, category, symbol;
- mode: `live` or `replay`;
- replay session identity for Replay marks (null for Live);
- mark price;
- candle timestamp and observation timestamp;
- source/status metadata sufficient to reject stale values;
- unique account/market/mode/session identity and indexes for active Cross scans.

The ledger stores simulated marks used for reproducible account calculations. It does not define a third-party margin formula. Prices continue to come through BacktradeLab's existing market-data gateway and candle normalization.

## Backend boundaries

### `CrossMarginService`

A pure domain service receives an account, its open/pending Cross positions, and a complete mark map. It returns the portfolio metrics above plus explicit eligibility/status fields. It performs no HTTP calls and no database writes, making calculations deterministic and directly unit-testable.

The service rejects incomplete, invalid, non-positive, future-dated, or stale marks. It never substitutes entry price or zero PnL for a missing market because doing so could suppress a real liquidation.

### `CrossMarkService`

Resolves and persists marks for all open/pending Cross markets:

- Live uses the latest normalized market candle available through the existing market-data layer.
- Replay resolves each symbol's latest candle at or before the shared replay timestamp.
- Results are coalesced/cached per market and timestamp so accounts sharing a market do not create request storms.
- A mark is usable only when it satisfies configured freshness and replay-time constraints.

### `CrossLiquidationService`

Runs inside one database transaction:

1. Lock the account.
2. Lock every open Cross position for that account.
3. Resolve a complete fresh mark map.
4. Recalculate metrics after locking.
5. Exit without mutation when equity is above maintenance.
6. Otherwise close every Cross position at its mark, create close trades, charge exit fees, return/reconcile margin, update realized PnL/fees/cash, and set `close_reason = cross_liquidation`.

The operation is idempotent: repeated monitors after liquidation find no open Cross positions and create no duplicate trades. Isolated and Spot positions are never included in the batch.

### Controller integration

`MarketBacktestController` continues orchestrating requests but delegates Cross calculations. Entry, trigger, cancel, risk update, close, and account-payload paths must use the services rather than embedding portfolio formulas in the controller.

Cross entry and trigger flows lock the account before validating available margin. Cancelling a pending Cross order immediately removes its computed reservation. Manual and TP/SL closes of one Cross position recalculate the remaining portfolio after mutation.

## Monitoring

### Live

Add a scheduled/long-running BacktradeLab monitor, following the existing alert-monitor operational pattern. It groups open Cross positions by market, refreshes/coalesces marks, evaluates affected accounts, and invokes atomic liquidation when required. Cross correctness must not depend on which chart a user currently has open or whether a browser tab is connected.

The frontend may request an immediate evaluation after order mutations or visible ticks for responsiveness, but that request is an optimization; the server monitor is authoritative.

### Replay

The active Replay cursor is the shared portfolio timestamp for the current Cross practice session. On a replay step, play tick, seek, or restore, the server resolves every open Cross symbol at the latest candle not later than that timestamp, stores the replay marks, evaluates the portfolio, and returns the resulting account state.

A replay evaluation is rejected when any required symbol lacks history at or before the requested timestamp. BacktradeLab does not mix current Live prices into a Replay portfolio.

Seeking forward must evaluate skipped intervals in chronological order where an intermediate account liquidation or position TP/SL could have occurred; evaluating only the destination candle would reproduce the existing class of skipped-candle errors documented for isolated monitoring. Seeking backward does not reverse already-persisted trades or liquidations; the existing Replay reset/session semantics remain authoritative.

## UI

### Enter Position

- Futures shows a functional Isolated/Cross selector next to leverage.
- Spot continues hiding both margin mode and leverage.
- Isolated remains the default for existing users and new tickets.
- Cross selection displays shared available margin rather than implying a fixed isolated liquidation price.
- Submission payload includes `margin_mode`.
- Missing/stale Cross marks disable submission with an actionable message.

### Account and positions

Display:

- Cross equity;
- Cross unrealized PnL;
- used initial margin;
- pending reserve;
- maintenance requirement;
- available margin;
- margin ratio and escalating warning state.

Position, open-order, history, journal, export, and mentor-review surfaces label margin mode. Cross positions show `Cross` and no fixed liquidation-price value.

- The closed-trades journal table (`TradeReport.jsx`) adds a **Mode** column showing a `Cross`/`Isolated` badge per row, styled consistently with the badges already used on the Positions and Open Orders panels. The journal's export and symbol/side/result/journal-status filters are unaffected; Mode is a display column only for version one.
- Every entry toast — the order-placed/filled notification fired on a new position or triggered pending order — states the margin mode alongside symbol, side, quantity, and price (e.g. `BTCUSDT Long filled · Cross · 0.01 @ 65,000.00`), not only the batch liquidation summary below.
- A portfolio liquidation creates one user notification/toast summarizing the batch (always `Cross`, since Isolated positions are never included) and individual trade records for reporting.

## Failure and safety behavior

- Missing or stale marks block new Cross entries and liquidation decisions; they do not trigger liquidation and do not assume safety.
- Monitoring exposes degraded status through logs/metrics and retries with bounded backoff.
- Account and position ownership checks remain mandatory.
- Entry, trigger, cancel, manual close, and liquidation mutations use locks and transactions.
- Concurrent monitor/browser/order requests recalculate after locking and remain idempotent.
- Invalid `margin_mode`, Cross on Spot, or Cross with incomplete market identity returns validation errors.
- The UI and documentation consistently call the feature **BacktradeLab Cross Simulation**.

## Delivery phases

1. **Core persistence and calculations:** migrations, model fields, pure service, payload metrics, unit tests. — Delivered.
2. **Order lifecycle:** Cross entry/pending/trigger/cancel/manual close with transaction tests. — Delivered.
3. **Multi-symbol marks and monitoring:** ledger, Live worker, Replay evaluator, stale-data behavior. — Live worker delivered; the Replay evaluator is tracked as separate outstanding follow-up work (see `docs/developer/backtesting-and-orders.md`'s "Replay evaluation is intentionally not built yet").
4. **Atomic portfolio liquidation:** batch close, notifications, concurrency/idempotency tests. — Delivered, including a persisted `AdmNotifications` row on liquidation (not just the batch close itself), surfaced via the existing notification feed/toast mechanism regardless of which client triggered the check.
5. **UI and reporting:** selector, metrics, labels, histories, exports, documentation. — Delivered: every position/order/history/journal/export/mentor-review surface labels margin mode, entry/cancel/close toasts state it, and docs are updated (see `docs/developer/backtesting-and-orders.md`).

Each phase must keep Isolated and Spot behavior passing before proceeding. A hidden/config-gated rollout is acceptable until phases 1-4 are complete; users must not receive a selectable Cross mode backed by incomplete monitoring.

## Testing

### Unit

- Long, short, mixed-side, multi-symbol unrealized PnL.
- Initial margin, pending reserve, closing-fee buffer, maintenance, equity, available margin, and ratio.
- Missing/stale/invalid marks.
- Empty portfolio and zero-maintenance behavior.
- Mixed Isolated/Cross/Spot exclusion rules.

### Feature and concurrency

- Validation and ownership for every Cross mutation.
- Entry accepted/rejected at exact available-margin boundaries.
- Pending reservation, trigger, cancellation, and duplicate-click behavior.
- Manual/TP/SL close recalculates remaining Cross metrics.
- Liquidation closes all and only Cross positions, creates one close trade per position, and reconciles cash/PnL/fees.
- Two concurrent liquidation requests create no duplicate trades.
- Existing Isolated liquidation and Spot restrictions remain unchanged.

### Live and Replay integration

- Multi-symbol marks refresh without requiring the matching chart to be open.
- Stale provider data produces degraded status without a false liquidation.
- Replay values every symbol at or before the shared timestamp.
- Replay forward seeks evaluate skipped intervals and stop at the first liquidation event.
- Reloading returns identical persisted marks, metrics, and histories.

### Required verification

```bash
php artisan test
npm run test:chart-utils
npm run build
php artisan route:list
```

Update `docs/developer/backtesting-and-orders.md`, `docs/developer/live-market-streaming.md`, `docs/developer/trade-reports-and-journals.md`, `docs/developer/deployment-and-production.md`, `.env.example`, and `docs/developer/file-reference.md` as their phases land.

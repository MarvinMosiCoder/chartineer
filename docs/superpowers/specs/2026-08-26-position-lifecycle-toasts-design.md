# Position/order lifecycle toasts

## Purpose

The backtest order-entry engine (`ReplayPanel.jsx`, `MarketChart.jsx`, `MarketBacktestController.php`) has no toast feedback anywhere today. A pending entry auto-filling, a stop-loss or take-profit closing a position, a liquidation, or even a manual Close/Cancel button click all update the account state silently — the only feedback is the position disappearing from/appearing in the Positions/Open Orders lists. This is easy to miss, especially for automatic events (a pending order filling, or SL/TP hitting) that happen with no direct user action to anchor attention to the moment it occurred.

Trigger: user asked to "add toast when my enter position is hit, like if sl or tp hit and my position is filled" — i.e. surface a notification when a pending order fills and when SL/TP closes a position.

## Scope

**In scope — a toast fires for every position/order lifecycle transition:**
- Pending order placed (limit/trigger order created, not yet filled).
- Order filled — either a market order filling immediately, or a pending limit/trigger order auto-triggering when price reaches it.
- Order cancelled (manual Cancel button on a pending order).
- Position closed, for every reason this app already tracks: `manual`, `stop_loss`, `take_profit`, `partial_take_profit`, `liquidation`.

**Explicitly out of scope:**
- No change to the toast system's single-message-at-a-time behavior (`ToastContext.jsx`). A new toast still immediately replaces whatever is on screen — this is the existing behavior for every toast in the app today, and is being kept as-is rather than built into a stacked queue. A burst of near-simultaneous events (e.g. a Replay timeline drag that closes several positions in the same monitoring pass) may only show the most recently fired toast; this is an accepted tradeoff, not a bug to fix here.
- No change to error/failure feedback. Failed requests (insufficient balance, invalid SL/TP, etc.) keep surfacing through the existing `setBacktestError` inline banner in `ReplayPanel.jsx`. Toasts are added only for successful transitions.
- No change to `ToastContext`/`DissapearingToast` component behavior, styling, or API — reused exactly as it exists today (`handleToast(message, type, duration)`, `type` is `'success'` or `'error'`, no other visual variant exists in this codebase).
- No change to SL/TP monitoring logic itself (trigger detection, dedup keys, gap-fill, in-flight guards) — this feature only adds a notification alongside transitions that already happen.

## Current state (for context)

- `ToastContext.jsx` holds one `message`/`messageType` pair globally; `useToast()` exposes `handleToast(message, type, duration = 3000)`. Every existing call site in the app uses `type: 'success'` or `type: 'error'` — `DissapearingToast.jsx` only renders two visual variants (green check for `'success'`, red X for anything else), though the heading text shows the literal capitalized `type` string.
- `MarketChart.jsx` has no toast usage anywhere today (confirmed: not in the file's imports or body).
- **Open/place/fill/cancel already carry enough client-side data, no backend change needed:**
  - `handleOpenBacktestPosition` (`MarketChart.jsx:6156`) already diffs `previousPositionIds` against the response account's `openPositions`/`pendingPositions` to find `createdPosition` (used today only to upload an entry snapshot) — this object already has `symbol`, `side`, `category`, `quantity`, `entryPrice`, `status` (`'open'` for a market fill, `'pending'` for a limit/trigger order placed).
  - `handleTriggerBacktestPosition` (`MarketChart.jsx:6315`, the pending-entry auto-trigger path — always called with `silent: true` from the SL/TP-monitoring effect, never called manually) receives `positionId`/`entryPrice`; the full pending-position object (symbol/side/category) is available in the calling effect's closure before the request fires, and the final `quantity` is available in the response account's `openPositions` by matching `id`.
  - `handleCancelBacktestPosition` (`MarketChart.jsx:6357`) and `handleCloseBacktestPosition` (`MarketChart.jsx:6375`) are both called today with only a bare `positionId` from `ReplayPanel.jsx`/`PositionsPanel.jsx` — the symbol/side/category needed for the toast must be looked up from `backtestAccount.pendingPositions`/`.openPositions` by id at the top of the handler, before the request fires (since the position disappears from that array once cancelled/closed).
- **Close events are the one real gap.** `closePosition()` (`MarketBacktestController.php:911`) computes `$netPnl`, `$closeQuantity`, `$isPartial`, and the effective `close_reason` internally, but its JSON response today only returns the rebuilt account payload (`buildPayload()`) — none of those values are returned. This is harmless for a manual close or the simple client-computed SL/TP path (`MarketChart.jsx:6650`'s `triggeredPositions` branch), since the frontend already knows the reason it's sending in the request. It's a real gap for the **managed-position path** (`processPositionCandle()`, `MarketBacktestController.php:992` — used for any position with `liquidation_price`/trailing-stop/break-even/partial-TP set): that method computes the trigger reason (`liquidation` / `stop_loss` / `take_profit` / `partial_take_profit`) entirely server-side and currently has no way to tell the frontend which one fired. `processPositionCandle()` delegates to `closePosition()` for the actual close (`MarketBacktestController.php:1045`), so a single response-shape change to `closePosition()` covers all three close paths (manual, simple, managed) with no duplicated logic.
- Existing formatting helpers already used for the chart's own SL/TP/entry price badges — `formatOverlayPrice(value)` and `formatOverlayPnl(value)` (module-level functions in `MarketChart.jsx`, around line 565-645) — are reused for toast copy instead of introducing new formatting logic, so toast numbers always match what's already shown on the chart.

## Design

### Backend (`MarketBacktestController::closePosition`)

Add a `closedTrade` object to the existing JSON response, built from values already computed inside the transaction:

```php
return response()->json([
    'success' => true,
    'account' => $this->buildPayload(...),
    'closedTrade' => [
        'positionId' => $position->id,
        'symbol' => $position->symbol,
        'side' => $position->side,
        'category' => $position->category,
        'reason' => $validated['close_reason'] ?? 'manual',
        'isPartial' => $isPartial,
        'quantity' => $closeQuantity,
        'price' => $exitPrice,
        'netPnl' => $netPnl,
    ],
]);
```

`reason` uses `$validated['close_reason'] ?? 'manual'` (the effective reason for this close request) rather than the persisted `$position->close_reason` column, since the column is intentionally left `null` on a partial close (the position row stays `open`) — the response should still tell the frontend a partial take-profit just happened. No other change to `closePosition()`'s logic. `processPositionCandle()` needs no changes beyond this — it already returns whatever `closePosition()` returns when something triggers, and its own early-return (`triggered: false`, nothing crossed a level) correctly carries no `closedTrade`.

### Frontend (`MarketChart.jsx`)

A small set of pure helper functions (colocated near the existing `formatOverlayPrice`/`formatOverlayPnl` module-level helpers):

- `getPositionSideLabel(position)` → `'Buy'` when `category === 'spot'`, else `'Long'`/`'Short'` from `side`. `PositionsPanel.jsx` already has an equivalent non-exported `positionSideLabel(item)` (line 52) — not shared, since `MarketChart.jsx` doesn't import from `PositionsPanel.jsx` and this codebase already has several independent inline copies of this same Long/Short/Buy branch (see "Spot support in the order ticket" in [Backtesting and orders](../../developer/backtesting-and-orders.md)); this adds one more local copy rather than introducing a new shared module for a two-line function.
- `buildFillToastMessage(position)` → e.g. `"BTCUSDT Long filled · 0.05 @ 64,950.00"` (for a market fill or an auto-triggered pending entry) or `"BTCUSDT Long order placed · 0.05 @ 64,200.00"` (for a newly created pending limit/trigger order) — branches on `position.status`.
- `buildCancelToastMessage(position)` → `"BTCUSDT Long order cancelled"`.
- `buildCloseToastMessage(closedTrade)` → branches on `closedTrade.reason`:
  - `take_profit` → `"{SYMBOL} closed — Take Profit hit · {sign}{pnl} ({pnlPercent}%)"`, success.
  - `partial_take_profit` → `"{SYMBOL} partial take-profit · {N}% closed · {sign}{pnl}"`, success.
  - `stop_loss` → `"{SYMBOL} closed — Stop Loss hit · {sign}{pnl} ({pnlPercent}%)"`, error.
  - `liquidation` → `"{SYMBOL} liquidated · {sign}{pnl}"`, error.
  - `manual` → `"{SYMBOL} closed · {sign}{pnl}"`, color (`success`/`error`) chosen by `netPnl >= 0`.

  `pnlPercent` is derived client-side the same way the chart's own PnL badges already do (net PnL over margin), not a new server field.

Wiring `useToast()`'s `handleToast(message, type)` into the existing handlers:

- **`handleOpenBacktestPosition`** (`MarketChart.jsx:6156`): after `setBacktestAccount(nextAccount)`, the existing `createdPosition` lookup (already there for the snapshot upload) is reused to call `buildFillToastMessage` and fire the toast — `'success'` in both the "placed" and "filled" cases.
- **`handleTriggerBacktestPosition`** (`MarketChart.jsx:6315`): the calling effect (`MarketChart.jsx:6418`) already has the full pending-position object per `item` before calling `triggerBacktestPositionRef.current(...)`; on success, look up the matching id in the response account's `openPositions` for final quantity and fire a `'success'` fill toast. Only fires when the trigger actually succeeded (mirrors the existing `didOpen` check).
- **`handleCancelBacktestPosition`** (`MarketChart.jsx:6357`): look up the target position from `backtestAccount.pendingPositions` by id at the top of the handler (before the request), and fire a `'success'` cancel toast after a successful response.
- **`handleCloseBacktestPosition`** (`MarketChart.jsx:6375`): look up the target position from `backtestAccount.openPositions` by id at the top of the handler (needed as a fallback for symbol/side/category display, though `closedTrade` from the response carries its own copies of those fields too); on success, read `response.data.closedTrade` and call `buildCloseToastMessage`. Covers both the manual Close button and the simple client-computed auto SL/TP path (`MarketChart.jsx:6650`'s `triggeredPositions` branch), since both go through this one function.
- **Managed-position `process-candle` branch** (inside the SL/TP-monitoring effect, `MarketChart.jsx:6578-6648`): after a successful `process-candle` response, read `response.data.closedTrade` — if present (a level was actually crossed), fire the same `buildCloseToastMessage` toast. If absent (nothing triggered this candle), no toast, matching today's silent no-op.

No changes to `ToastContext.jsx` or `DissapearingToast.jsx`.

### Error handling

Unchanged. A failed trigger/close/cancel/open request continues to surface through `setBacktestError`'s inline banner in `ReplayPanel.jsx`; toasts are only fired on the success branch of each handler.

## Testing

Manual, matching how the rest of this feature area is tested (no automated coverage exists for the order-entry engine today):

- Place a pending limit order → "order placed" toast; let replay price reach it → "filled" toast (auto-trigger path, no user click at the moment of fill).
- Cancel a pending order → "order cancelled" toast, correct symbol/side.
- Open a market position and manually close it once at a profit and once at a loss → correct sign and success/error color on the manual-close toast.
- Open a position with a plain SL and TP (no trailing-stop/break-even/partial-TP — the "simple" client-checked path) and let each trigger automatically → correct reason/color, no manual click involved.
- Open a position with trailing-stop + partial-take-profit set (forces the "managed" `process-candle` path) and drive it through a partial-TP fill, then a full close, then separately through a liquidation on a fresh leveraged position → each shows the correct reason/color. This is the path that depends on the new `closedTrade` backend field, so specifically confirm the reason shown matches what actually happened (check the position's `close_reason` in the database or Order History tab against the toast).
- Open two positions on the same symbol and let both close within the same monitoring pass (or drag the Replay timeline across a gap spanning multiple SL/TP crossings) → confirm only the most recently fired toast is visible and nothing errors, consistent with the accepted last-one-wins behavior.
- Confirm a failed action (e.g. attempt to trigger with insufficient balance) still shows the existing inline error banner, not a toast.

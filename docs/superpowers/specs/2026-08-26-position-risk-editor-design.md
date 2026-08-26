# Set/Edit TP/SL on running positions and pending orders

## Purpose

Today, Stop Loss and Take Profit can only be set at order-entry time (the Enter Position ticket) or by dragging the SL/TP line directly on the chart. Dragging only works when a line already exists — `buildLine()` in `MarketChart.jsx` returns `null` (renders nothing) when the position's `stopLoss`/`takeProfit` is `null`, so a position or pending order opened without SL/TP has no line to grab and no way to add one afterward. This adds a dedicated editor reachable from `PositionsPanel.jsx`'s **Positions** and **Open Orders** tabs so a forgotten or since-changed SL/TP can always be set or corrected, independent of the chart-drag path.

This applies identically to Isolated and Cross Margin positions — the backend endpoint it uses is already margin-mode-agnostic.

## Confirmed product decisions

- Editor matches the entry ticket's Advanced TP/SL modal: both **Price** and **PnL%** input modes per field, not a stripped-down price-only form.
- Entry point is a new **TP/SL** button placed next to the existing Close (Positions tab) / Cancel (Open Orders tab) button — not a click-the-cell-value affordance.
- This pass is **set/edit only** — no "clear to none" action for an existing SL or TP.
- Out of scope: the chart-drag editor is untouched; `PositionsPanel` remaining desktop-only (`{!isFullscreen && ...}`) is pre-existing and unrelated to this feature.

## UI changes

### `PositionsPanel.jsx`

- **Positions tab** (open positions table): add a **TP/SL** button in the action column, to the left of the existing **Close** button.
- **Open Orders tab** (pending positions table): add the same **TP/SL** button next to the existing **Cancel** button.
- Clicking it opens `PositionRiskModal` scoped to that row's position (works the same for an open position and a pending order — the backend's `updatePositionRisk` already accepts both statuses).

### `PositionRiskModal` (new)

A new modal, visually consistent with the existing `AdvancedTpSlModal` ("Take Profit / Stop Loss" dialog) in `ReplayPanel.jsx`. Rather than duplicate that ~150 lines of UI/conversion logic, `ReplayPanel.jsx` exports:

- `TpSlAdvancedField` (the per-field Price/PnL% segmented input with live preview text), and
- `estimatePriceFromPnlPercent` / `estimatePnlPercentFromPrice` (the PnL%↔price conversion math).

`PositionsPanel.jsx` imports these and renders its own modal shell (header, Save/Cancel, error banner) around two `TpSlAdvancedField`s — one for Take Profit, one for Stop Loss — matching the existing dialog's layout and styling (dark/light theme via `chartTheme`).

**Local state:** `stopLossMode`/`stopLossPrice`/`stopLossPnl`, `takeProfitMode`/`takeProfitPrice`/`takeProfitPnl`, `isSaving`, `error`. Initialized from the position/order passed in:
- Mode always starts as `'price'` for both fields (the backend only ever stores an absolute price, never a PnL% origin, so there is nothing to reconstruct a starting `%` from).
- Price fields pre-fill from `position.stopLoss` / `position.takeProfit` (blank if `null`).

**Validation (client-side, mirrors `updatePositionRisk`'s server checks):**
- Long: stop loss must be below entry price; take profit must be above entry price.
- Short: stop loss must be above entry price; take profit must be below entry price.
- A field that currently has **no** value (blank at open, left blank) is allowed and skips its own directional check — it means "leave unset."
- A field that currently **has** a value cannot be saved blank: since this pass is set/edit only (no clear), blanking a pre-filled price/PnL input reverts to that field's original value on Save rather than clearing it — there is no way to remove an existing SL or TP from this modal. This keeps "blank" from silently doubling as "clear."
- Failing the directional check disables/blocks Save and shows the same style of inline message the ticket uses (e.g. "Long stop loss must be below entry price.").

**Save:**
- Resolves each field to a final absolute price: if that field's mode is `'pnl'`, convert via `estimatePriceFromPnlPercent(side, entryPrice, leverage, pnlValue, isLoss)`; if blank and the field started with a value, use that original value (see above); otherwise use the typed price, or `null` if it started and remains blank.
- Sends one `PUT /market-backtest/positions/{position.id}/risk` with `{ stop_loss, take_profit }` — always both keys, since this modal is the single source of truth for both fields together (per `updatePositionRisk`'s `array_key_exists` semantics, omitting a key would leave that field unchanged server-side, which is not what a modal presenting both fields as an editable pair should do).
- Shows a small loading state on the Save button while the request is in flight.
- On a `422`/error response, shows the server's `message` inline in the modal (same wording the backend already returns, e.g. "Long take profit must be above entry price.") and leaves the modal open.
- On success, applies `response.data.account` the same way every other position-mutation handler does, then closes the modal.

No changes to `AdvancedTpSlModal` itself beyond exporting the two helpers and `TpSlAdvancedField` it already defines.

## Data flow / wiring

`PositionsPanel` currently receives `onClosePosition`/`onCancelOrder` callbacks from `MarketChart.jsx` and calls them by position id. This feature adds one more callback of the same shape:

- **New handler in `MarketChart.jsx`:** `handleUpdatePositionRiskLevels(positionId, { stopLoss, takeProfit })` — PUTs to `/market-backtest/positions/{positionId}/risk` with the resolved `stop_loss`/`take_profit`, then `setBacktestAccount(response.data.account)`. Same error-propagation shape as `handleCloseBacktestPosition`/`handleCancelBacktestPosition` (return `true`/`false`, or throw/reject so the modal can show the message) — the modal itself owns showing the error inline rather than routing it through `setBacktestError`, so this new handler should reject/return the error payload to the caller instead of swallowing it into the page-level error banner.
- **New prop on `<PositionsPanel>`:** `onUpdatePositionRisk={handleUpdatePositionRiskLevels}`, passed alongside the existing `onClosePosition`/`onCancelOrder` at the call site (`MarketChart.jsx`, `{!isFullscreen && <PositionsPanel ... />}`).

No backend changes are required — `updatePositionRisk` already validates ownership, status (`pending`/`open`), and side-relative price ordering, and already ignores margin mode entirely.

## Testing / verification

- No backend changes, so no new PHP tests are needed; `updatePositionRisk`'s existing behavior already covers the endpoint this feature calls.
- Manual verification (no React component test harness exists in this repo beyond `tests/js/marketChartUtils.test.js`, which only covers pure chart-utility functions):
  - Open a position with no SL/TP set, use the new **TP/SL** button in the Positions tab, set both via Price mode, Save, and confirm the row's TP/SL column updates and the chart lines now appear (since `buildLine()` now has non-null prices to render).
  - Repeat via PnL% mode and confirm the resolved price lands where the preview text said it would.
  - Edit an existing SL/TP on a position that already has both set, and confirm the new values persist (not blocked by the old ones).
  - Try an invalid combination (e.g. long stop loss above entry) and confirm the modal blocks Save with the correct inline message, both from client-side validation and (by temporarily bypassing it, or via a stale entry-price race) from the server's own rejection.
  - Repeat the whole flow from the **Open Orders** tab against a pending (limit/trigger) order, and confirm it still shows correctly once the order triggers into an open position.
  - Repeat once against a Cross Margin position to confirm no margin-mode-specific difference in behavior.

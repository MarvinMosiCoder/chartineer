# Draggable ghost SL/TP lines on the chart

## Purpose

Dragging an SL or TP line on the chart already works, but only once the line exists. `buildLine()` in `MarketChart.jsx` returns `null` when a position's `stopLoss`/`takeProfit` is `null`, so a pending order or open position created without them renders no line at all — there is nothing on the chart to grab, and the only way to add a level is `PositionsPanel`'s TP/SL modal (see [2026-08-26-position-risk-editor-design.md](2026-08-26-position-risk-editor-design.md), which built that modal and documented this same gap).

This adds a **ghost line**: a placeholder SL/TP that any unprotected position shows on the chart, positioned to be grabbable, that becomes a real level the moment it is dragged. It closes the chart half of the gap the risk editor closed from the panel side.

Applies identically to Isolated and Cross Margin — the endpoint it uses is margin-mode-agnostic.

## Confirmed product decisions

- **Ghosts are always shown**, for every pending and open position on the current symbol that is missing SL and/or TP. No click or menu is needed to summon one.
- **Drag-only commit.** A ghost commits when dragged and released. A click on a ghost does nothing at all. This is deliberate: a ghost sits on the chart looking much like a real line, so neither a stray click nor a glance should ever be able to produce or imply protection that was not chosen.
- **Ghosts sit at a fixed on-screen distance from the entry line (80px), not at a fixed percentage,** and **show no price** — the badge reads `SET SL` / `SET TP` with no number. A percentage offset breaks at both zoom extremes (at one it overlaps the entry line and is ungrabbable, at the other it is off-pane), and a displayed price on an unset level invites reading it as real protection.
- **Wrong-side drags clamp, for ghosts and for existing lines alike.** Today's SL/TP drag has no clamp and relies on the server's 422; this change makes an invalid level unreachable instead of rejected after the fact. This is a small, deliberate change to shipped behaviour, accepted so the two line types do not behave differently under the same gesture.
- Out of scope: clearing a set SL/TP back to none from the chart (matching the risk editor's set/edit-only posture); de-cluttering when several unprotected positions stack ghosts near each other; the Enter Position draft's own SL/TP lines, which already default to ±1% and are untouched.

## UI changes

### Ghost construction (`MarketChart.jsx`, `renderedBacktestOrders`)

Real lines run price → `series.priceToCoordinate()` → `y`. Ghosts invert this: they have **no price at all** until dragged, and their `y` is derived from the entry line's `y`. A `buildGhostLine()` sits alongside `buildLine()` and emits:

```js
{
  id: `ghost:${position.id}:${kind}`,   // distinct from `${status}:${id}:${kind}`
  positionId, status, side, kind,        // kind: 'sl' | 'tp'
  entryPrice,                            // needed by the clamp
  y,
  isGhost: true,
  dashed: true,
  canCancel: false,
  color: kind === 'tp' ? '#22c55e' : '#ef4444',
  label: kind === 'tp' ? 'SET TP' : 'SET SL',
  price: null, pnlText: null, pnlPositive: null,
}
```

A ghost is emitted for a position only when all three hold: that level is `null`, the entry line itself resolved a `y`, and `ghostLineY()` (below) returned a non-null placement. Its `y` is that helper's result. Placement lives in `MarketChart/utils.js` as a pure helper so it is testable:

```js
ghostLineY(entryY, kind, side, overlayHeight)
```

- Long: TP above entry (`entryY - 80`), SL below (`entryY + 80`). Short is inverted.
- Result is clamped into the pane with an 8px margin, so a position near the top or bottom edge still gets a reachable ghost.
- Returns `null` when the clamped result lands within 20px of the entry line — there is no room to grab it there, and a ghost overlapping the entry line would be worse than none.

`buildLine()` also gains `entryPrice` on its output, which the clamp needs for existing lines.

### Rendering (`ChartStage.jsx`, `BacktestOrderOverlay`)

Ghosts render in the same pass as real lines, distinguished by `item.isGhost`:

- Line: `strokeDasharray="2,4"`, `opacity` 0.4 (vs 0.95).
- Badge: the label only, no P&L badge, no cancel `x`.
- The right-edge grab handle **is** kept — it is the affordance that says "drag me".

### Cursor

`hitTestBacktestOrder` currently only feeds `isHoveringBacktestOrderCancel` (→ `pointer`). Add a sibling `isHoveringBacktestOrderLine` → `ns-resize` in `ChartStage`'s cursor chain, applied to any hovered order line, ghost or real. Every one of them is vertically draggable; only the ghosts need the hint, but applying it uniformly avoids two lines that look alike behaving differently under the pointer.

Cancel keeps precedence: `hitTestBacktestOrder` already returns `{ action: 'cancel' }` before it considers a line hit, so hovering the `x` still yields `pointer`, not `ns-resize`. The new flag is set only when the hit has no `action`.

## Data flow / wiring

**Hit-testing** needs no change. `hitTestBacktestOrder` matches on `item.y` and returns the whole item, so ghosts are found as soon as they are in `renderedBacktestOrders`.

**Drag state** (`dragBacktestOrderRef`) gains `isGhost`, `entryPrice`, `startY`, and `moved`.

- **Pointer down on a ghost:** record drag state. Commit nothing.
- **Pointer move:** the 3px movement threshold applies **to ghosts only** (`isGhost && !moved && |y - startY| < 3` returns without touching anything) — this is what makes a click a no-op. An existing line keeps today's behaviour of updating on any movement, so the only change to that path is the clamp. Past the threshold, set `moved = true` and fall through to the existing path: `updateLocalBacktestPositionLine(positionId, { stopLoss | takeProfit })`. That gives the position a non-null level in local state, so the ghost stops being emitted and a normal line renders in its place, with price and P&L, for the rest of the drag. No separate "dragging ghost" render state is needed.
- **Pointer up:** the existing handler calls `handleUpdateBacktestPositionRisk(dragState)`. Add one guard: when `isGhost && !moved`, skip the PUT entirely. Nothing was changed locally either, so the ghost is simply still there — there is nothing to restore.

**Clamping** applies in the pointer-move handler, before the price is written, for `kind` of `sl` or `tp` (entry is never clamped). New pure helper in `MarketChart/utils.js`:

```js
clampRiskPrice(kind, side, entryPrice, price)
```

- Long SL and short TP must sit **below** entry; long TP and short SL **above**.
- The server rejects equality (`$stopLoss >= $entryPrice`), so the clamp lands strictly inside at `entryPrice * (1 ∓ 0.0001)` rather than on the entry price itself. A clamp exactly at entry would still 422.

**No backend changes.** `updatePositionRisk` already accepts both `pending` and `open`, already validates ownership and side-relative ordering, and already accepts a level that was previously `null` — it reads `array_key_exists('stop_loss', $validated)` rather than requiring a prior value.

## Testing / verification

**Unit tests** (`tests/js/`, Node's built-in runner, matching `marketChartUtils.test.js`). Both new helpers are pure, which is why they live in `utils.js`:

- `clampRiskPrice`: all four side/kind combinations pass through untouched when already valid; each clamps when dragged across entry; the clamped value is **strictly** on the correct side of entry, never equal to it (the exact condition the server rejects).
- `ghostLineY`: correct direction per side and kind; clamped into the pane for a position near either edge; returns `null` when the result would land within 20px of the entry line.

**PHP** (`MarketBacktestPositionRiskTest`): add a case setting `stop_loss` and `take_profit` on a position that had both `null`. This is the path the feature makes reachable from the chart and nothing currently covers it — the existing tests all start from a position that already has levels.

**Manual:**

- Open a position with no SL/TP and confirm two dotted `SET SL` / `SET TP` ghosts appear with no prices, and that the real lines do not.
- Click a ghost without moving: nothing happens, no request fires, the ghost stays a ghost.
- Drag the ghost SL down and release: it becomes a solid line with a price and P&L badge, the value persists across a reload, and the ghost does not come back.
- Drag a ghost SL *up* through the entry on a long: it stops just short of the entry price and cannot cross. Release there and confirm the server accepts it (i.e. the clamp landed strictly below entry, not on it).
- Repeat the clamp check on an **existing** SL line — this path is changed too.
- Zoom all the way in and all the way out and confirm the ghosts stay ~80px from the entry line and remain grabbable at both extremes.
- Put a position near the very top of the pane and confirm the TP ghost either clamps into view or is correctly omitted, rather than rendering off-pane.
- Repeat once on a pending order and once on a Cross Margin position.

# In-chart Replay control bar

## Purpose

Replay's transport controls lived in a flyout opened from a `Play` button on the chart's left tool rail — a vertical stack of buttons floating over the left half of the chart, covering candles while in use and requiring a click to reach mid-session. This moves them into a slim horizontal bar pinned to the bottom of the chart canvas, visible only while Replay is active, and removes the rail button and flyout entirely.

The rail's Replay flyout also duplicated an entry point that already existed: `ChartHeader.jsx` has carried a Start replay / Back to live toggle (`onToggleReplayMode`) the whole time. Because entering Replay never depended on the flyout, a surface that only exists *during* Replay has no bootstrapping problem.

## Confirmed product decisions

- **Relocation only this pass.** The position readout stays as text (`18,499 / 20,000`). A draggable scrubber is the obvious follow-up — horizontal space is what makes one possible — but is explicitly out of scope here. The bar's middle region is built as its own flex child so a scrubber can replace it later without disturbing the groups on either side.
- **Floating overlay, not a layout row.** The bar is absolutely positioned over the bottom of the canvas rather than taking space between the chart and `PositionsPanel`. Taking a row would resize the canvas on every Replay enter/exit, which reflows the price scale and can shift the user's viewport. The cost is a thin strip of covered candles.
- **Speed is a dropdown**, not seven inline buttons. Keeps the bar narrow enough that the floating overlay stays defensible; costs one extra click to change speed.
- **No "Start Replay" control in the bar.** The chart header owns entering and exiting.
- Out of scope: the rail's drawing tools, tool editor, and every other flyout are untouched.

## UI changes

### `ReplayControlBar.jsx` (new)

```
┌ ⏮  ▶  ⏭ │ 18,499 / 20,000 │ 4x ▾ │ ⊕  ◎  ⟲ ┐
  transport   position         speed   set/follow/reset
```

Renders `null` unless `replayMode` is true. Positioned `absolute bottom-4 left-1/2 -translate-x-1/2` inside the existing `relative flex min-w-0 flex-col` chart container in `MarketChart.jsx`, which is the same container in both windowed and fullscreen — so fullscreen gets the bar with no extra wiring.

Contents, all carried over from the removed flyout: step back / play-pause / step forward, the candle position readout, a speed dropdown over the existing `PLAYBACK_SPEEDS`, Set replay price, Follow, and Reset. The speed menu opens *upward* (the bar is at the bottom of the canvas) and closes on outside click or Escape, following the guarded-`mousedown` pattern `ChartHeader.jsx`'s dropdowns already use.

`replayAccessError` — previously rendered inside the flyout with a "Try again" link — appears as a truncated inline segment at the end of the bar with a Retry action.

The component holds no state beyond the speed menu's open flag; everything else is props `MarketChart.jsx` already owned.

### Tooltips: anchored-portal, wired manually

Every hover hint in the bar uses the shared `useAnchoredTooltip`/`AnchoredTooltipPortal` module, not the native `title` attribute — `title` is the legacy pattern that [tooltip modernization](2026-08-23-tooltip-modernization-design.md) exists to eliminate, and the first draft of this bar mistakenly reintroduced it.

Three specifics:

- **Manual wiring, not `IconTooltipButton`.** That wrapper applies its `className` to both the wrapping `<span>` and the `<button>` inside it, so any visible `bg-*`/`rounded-*`/padding renders twice as a nested double box — the artifact already documented in `trading-chart.md` for `FullscreenChartHeader` and `TimeframeSelector`. Every button in this bar has a visible background and padding, so it is exactly that case. A local `BarButton` owns its own hook instance instead, matching the `RailButton`/`ToolEditorButton` precedent.
- **`placement="top"`.** The bar is pinned to the bottom of the canvas, so the module's default right placement (and bottom) would put labels outside the chart.
- **Hover handlers on the wrapper, not the button.** Chrome does not dispatch `mouseenter`/`mouseleave` to a disabled `<button>`, and these controls disable during `checking-access` — the state whose tooltip ("Checking replay access…") is most worth showing.

`BarButton`, `SpeedMenu`, and `AccessErrorNotice` are separate components specifically so their hooks stay unconditional: `ReplayControlBar` returns `null` outside Replay, so a hook in its own body after that early return would change hook count between renders. The main component holds no hooks at all.

### Why a new file rather than `ReplayPanel.jsx`

`ReplayPanel.jsx` was 3,603 lines covering the drawing rail, tool editor bar, drawing-settings dialog, leverage modal, and order-plan math. Replay was only ever a tenant. Extracting the controls into their own file gives them a flat, readable prop contract and shrinks `ReplayPanel` to the drawing/tool surface it actually is.

### `ReplayPanel.jsx` removals

- The `Play` `RailButton` — **both** call sites (the grouped/fullscreen rail and the plain workspace rail).
- The entire `activeGroup === 'replay'` flyout (~102 lines).
- Six icon imports orphaned by that removal: `Play`, `Pause`, `SkipBack`, `SkipForward`, `LocateFixed`, `Gauge`.
- **Eighteen now-dead props**, each verified to have been referenced only in the destructured signature and nowhere in the body: `replayMode`, `replayAccessStatus`, `replayAccessError`, `liveConnectionStatus`, `isPlaying`, `followReplay`, `isReplayPricePickActive`, `playbackSpeed`, `replayIndex`, `candleCount`, `onStepBackward`, `onTogglePlay`, `onStepForward`, `onResetReplay`, `onFollowReplay`, `onToggleReplayPricePick`, `onRetryReplayAccess`, `onPlaybackSpeedChange`. Removed from both the component signature and the `MarketChart.jsx` call site.

### `MarketChart.jsx`

- Mounts `ReplayControlBar` as a sibling of `ChartStage`/`ReplayPanel`.
- Extracts `handleToggleReplayPricePick` from an inline arrow at the old `ReplayPanel` call site into a named handler, so the bar and any future consumer share one copy of the access check rather than duplicating the async guard.

## Deliberately unchanged

**`FullscreenChartHeader.jsx` needed no change.** An initial `grep` for "replay" in that file returned nothing, which suggested fullscreen had no entry point and would strand users once the rail button was removed. That was wrong: the file renders `<ChartHeader {...chartHeaderProps} compact />` internally, so it has carried the replay toggle all along — the props are spread, so they don't appear as literals. Verified before writing any code. Both modes already enter Replay the same way.

## Edge cases

- **Price-pick window.** Between pressing Start replay and clicking a candle, `isReplayPricePickActive` is true but `replayMode` is still false, so the bar is hidden. `ChartStage.jsx` already draws a crosshair cursor, a dashed blue vertical line, a dimmed future region, and a teal label during this step — a stronger affordance than the flyout's "Click a candle to start" text it replaces. Exit is the header's red ✕.
- **`checking-access`.** Transport and speed controls disable; the play button shows a spinner.
- **Narrow windows.** The bar is capped at `max-w-[calc(100%-1rem)]` and the position readout truncates first.
- **`data-tour="replay"`** already points at the header button, so the onboarding tour is unaffected by the rail button's removal.

## Verification

No component test harness exists for this area (`npm run test:chart-utils` is pure-function only), so verification is manual:

- Enter Replay from the header, windowed and fullscreen; the bar appears in both.
- Play/pause, step both directions, change speed, Set replay price, Follow, Reset.
- Exit via the header's Back to live; the bar disappears.
- **The chart must not resize on enter or exit** — this is the property the floating overlay exists to protect.
- The left rail no longer shows a `Play` button in either mode, and its remaining tool flyouts still open.

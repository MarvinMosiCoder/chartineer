# Tooltip modernization: align old native tooltips to the anchored-portal pattern

## Purpose

Several parts of the app still use the plain browser-native `title="..."` attribute (or an old, independently-built wrapper component) for hover hints, while the trading chart's header, replay rail, and watchlist panel already use a theme-aware, portal-rendered "anchored tooltip" that doesn't get clipped by scrolling/overflow ancestors and matches the app's own visual language. This spec converts every remaining old-style tooltip to that same modern pattern, and de-duplicates the four existing copies of it into one shared component in the process.

Trigger: user asked to bring all "old UI" tooltips in line with the "modern UI" ones already used by favorites/watchlist.

## Scope

**In scope:**
- Extract the anchored-portal tooltip pattern into a shared `resources/js/Components/Tooltip/AnchoredTooltip.jsx` module.
- Refactor the 4 existing independent copies (`ChartHeader.jsx`, `ReplayPanel.jsx`, `WatchlistPanel.jsx`, `TimeframeSelector.jsx`'s grid trigger) to use the shared module instead of their own local `useAnchoredTooltip`/`*TooltipPortal`/`IconTooltipButton` definitions. No behavior change to these — pure de-duplication.
- Convert every remaining native `title=` hover tooltip in the trading chart UI to the shared pattern (full list under Design).
- Convert the old `Components/Tooltip/Tooltip.jsx` wrapper (used in 3 Admin pages) and the Tippy-based `Components/Tooltip/LoginInputTooltip.jsx` (used in 3 form spots) to the shared pattern.
- Delete `Components/Tooltip/Tooltip.jsx` and `Components/Tooltip/LoginInputTooltip.jsx` once nothing imports them, and remove the `@tippyjs/react` dependency if nothing else in the app uses it.
- Remove two now-pointless dead imports discovered during the audit (`SidebarAccordion.jsx` imports `Tooltip` but never renders it; `ApiGeneratorView.jsx` imports `LoginInputTooltip` but never renders it) — both are dead code today, found incidentally while auditing every tooltip import site.
- Update `docs/developer/trading-chart.md`'s "Header command buttons: icon-only with anchored tooltips" section to describe the shared module instead of per-file duplicates.

**Explicitly out of scope:**
- Any tooltip/hint that already uses the anchored-portal pattern and isn't one of the 4 duplicate definitions above (e.g. the rest of `ChartHeader.jsx`'s icon row, `ReplayPanel.jsx`'s tool rail, `WatchlistPanel.jsx`'s edit/delete icons) — these are already "modern," only their duplicated *implementation* is touched, not their call sites.
- `ChartStage.jsx`'s candle-close countdown tooltip: its `title` attribute sits on a `pointer-events-none` box, so it can never actually receive a hover event today. This is dead markup, not a working old-style tooltip — the fix is to delete the attribute, not wire up a tooltip that still couldn't fire (making the box hoverable is a separate, unrequested behavior change).
- Any non-tooltip UI modernization (buttons, panels, layout).
- Touch/mobile hover-equivalent behavior — the existing pattern only wires `onMouseEnter`/`onMouseLeave`/`onFocus`/`onBlur`, same as today; not introducing or fixing touch support.

## Current state (for context)

The "modern" pattern — first documented in `docs/developer/trading-chart.md` under "Header command buttons: icon-only with anchored tooltips" — is: a `useAnchoredTooltip()` hook holds a ref and a `pos` state set from `anchorRef.current.getBoundingClientRect()` on hover/focus, and a `*TooltipPortal` component renders the label via `createPortal(..., document.body)`, positioned with `style={{ top, left }}` and `position: fixed`. This escapes any `overflow`/`z-index` clipping ancestor, which a plain `absolute`-positioned tooltip (or the native `title` attribute's un-stylable browser tooltip) cannot do reliably inside this app's many portaled, scrollable, and stacked panels.

Four independent, near-identical copies of this pattern exist today, each with its own hook/portal/button names and its own `zIndexClass` default tuned to that file's stacking context:
- `ChartHeader.jsx`: `useAnchoredTooltip`, `HeaderTooltipPortal` (`z-[9999]` default, `z-[10022]` for popover-nested rows), `IconTooltipButton`.
- `ReplayPanel.jsx`: `useAnchoredTooltip`, `RailTooltipPortal` (`z-[9999]`), used inline by `RailButton`/`ToolEditorButton`/`ControlButton` (each with extra `disabled`/`hideTooltip` suppression logic layered around the hook).
- `WatchlistPanel.jsx`: `useAnchoredTooltip`, `PanelTooltipPortal` (`z-[10022]`, since this panel renders from inside a `z-[130]` popover with its own `z-[10050]` react-select menu), `IconTooltipButton`.
- `TimeframeSelector.jsx`: only has `useAnchoredGridPosition` for its "Select period" grid panel — the grid's own buttons/pills still use plain native `title=`.

All four use identical positioning math for the hover label itself: `{ top: rect.top + rect.height / 2, left: rect.right + 8 }`, rendered with `-translate-y-1/2` — i.e. always to the right of the anchor, vertically centered. None of them clamp to the viewport edge.

Separately, three Admin pages (`Privileges.jsx`, `Users.jsx`, `ApiDocumentation.jsx`) use an older, different `Components/Tooltip/Tooltip.jsx` wrapper — a `relative`-positioned (not portaled) tooltip driven by `useThemeStyles`, which can get clipped by any `overflow: hidden` ancestor and doesn't share the modern pattern's visual styling. And three form spots (`TextArea.jsx`, `ApiGeneratorCreate.jsx`, `ApiGeneratorEdit.jsx`) use `Components/Tooltip/LoginInputTooltip.jsx`, a thin wrapper around the `@tippyjs/react` library — functional and already portaled by Tippy internally, but visually inconsistent with the app's own tooltip styling (default Tippy theme vs. the app's `rounded-md border ... shadow-lg` look).

## Design

### Shared module: `resources/js/Components/Tooltip/AnchoredTooltip.jsx`

```js
export function useAnchoredTooltip(placement = 'right') {
  // returns { anchorRef, pos, show, hide }
  // pos = { top, left, placement } | null, computed from anchorRef.current.getBoundingClientRect()
}

export function AnchoredTooltipPortal({ pos, label, isDark, zIndexClass = 'z-[9999]' }) {
  // createPortal(..., document.body); same visual style as today's copies
  // (rounded-md border px-2 py-1 text-[11px] font-medium shadow-lg, theme-aware colors);
  // translate/alignment classes chosen from pos.placement
}

export function IconTooltipButton({
  label, isDark, className, onClick, onMouseDown, ariaLabel,
  disabled, showTooltipWhenDisabled = true, placement, zIndexClass, children,
}) {
  // convenience wrapper for the common "icon-only button + hover label" case
}
```

Positioning math per `placement`, all relative to `anchorRef.current.getBoundingClientRect()`:
- `right` (default, matches all 4 existing copies): `{ top: rect.top + rect.height / 2, left: rect.right + 8 }`; portal applies `-translate-y-1/2`.
- `left`: `{ top: rect.top + rect.height / 2, left: rect.left - 8 }`; portal applies `-translate-y-1/2 -translate-x-full`.
- `bottom`: `{ top: rect.bottom + 8, left: rect.left + rect.width / 2 }`; portal applies `-translate-x-1/2`.
- `top`: `{ top: rect.top - 8, left: rect.left + rect.width / 2 }`; portal applies `-translate-x-1/2 -translate-y-full`.

No viewport clamping is added — none of the existing copies clamp today, and adding it is separable from this consistency pass. Edge-of-screen call sites instead pick a `placement` that avoids clipping (e.g. `left` for the rightmost button in a row) rather than relying on clamping math.

`isDark` and `zIndexClass` stay caller-supplied, exactly as today — each file already computes its own dark/light boolean differently (`chartTheme.mode`, a `theme` string, etc.), and each stacking context needs its own z-index tuned to its portaled ancestors.

Non-button anchors (a `<input type="color">` swatch, a drag handle, a `<div role="button">` grid cell) don't go through `IconTooltipButton` — they use `useAnchoredTooltip` + `AnchoredTooltipPortal` directly, spreading `ref`/`onMouseEnter`/`onMouseLeave`/`onFocus`/`onBlur` onto whatever element they are, the same way `ChartHeader.jsx` already wires its non-trivial cases (e.g. `symbolPickerTooltip`) today. No new abstraction beyond the two primitives is introduced.

### Refactor the 4 existing copies

`ChartHeader.jsx`, `ReplayPanel.jsx`, `WatchlistPanel.jsx`, and `TimeframeSelector.jsx` drop their local `useAnchoredTooltip`/`*TooltipPortal`/`IconTooltipButton` definitions and import from the shared module instead, passing their existing `zIndexClass` values through explicitly so stacking is unchanged. `ReplayPanel.jsx`'s `RailButton` keeps its `{!disabled && <Portal/>}` suppression as a local choice — expressed as `showTooltipWhenDisabled={false}` on `IconTooltipButton` (or equivalent manual wiring for `ToolEditorButton`/`ControlButton`, which also carry the separate `hideTooltip` prop used only by the "Templates" button — that stays local caller logic, orthogonal to the shared primitive).

### Convert native `title=` tooltips

| File | Elements | Notes |
|---|---|---|
| `FullscreenChartHeader.jsx` | Watchlists, Enter Position, Fullscreen/Exit fullscreen | Plain `IconTooltipButton` swap, `placement="bottom"` (row sits at the top of the screen) |
| `ChartHeader.jsx` | Symbol-search Close ✕, "Open {symbol}" row button | `placement="bottom"` for Close ✕ (top-right of its popover) |
| `PositionsPanel.jsx` | Close position | Dynamic disabled-reason label (`'Close position'` vs. `'Switch to {symbol} to close'`); needs `showTooltipWhenDisabled={true}` (the default) since the reason only matters while disabled |
| `MarketChart.jsx` | Chart settings, Chart timezone, Restart workspace tour, Create-order overlay, Set-alert overlay | Plain `IconTooltipButton` swap |
| `ChartSettingsModal.jsx` | Up/Down color swatches (`ColorPair`), drag handle | Manual wiring — swatches are `<input type="color">`, not buttons |
| `TradeCalendar.jsx` | Previous month, Select month/year, Next month | `placement="left"` on Next month (rightmost in its row) |
| `TimeframeSelector.jsx` | Per-pill label, "Select period" chevron, per-grid-item cell | Pills → `IconTooltipButton`, `placement="bottom"`. Grid cell is `<div role="button">` → manual wiring. Chevron → manual wiring, not `IconTooltipButton` (see note below) |
| `ChartStage.jsx` | Candle-close countdown | Out of scope — delete the dead `title` attribute (see Scope) |

The chevron button already carries a ref (`grid.anchorRef`, from `useAnchoredGridPosition`, for positioning its "Select period" panel) — a DOM node can only take one `ref` prop, so this button does not instantiate a second `useAnchoredTooltip()`. Instead its hover/focus handlers call `show()`/`hide()` from a small local tooltip-`pos` state computed directly off `grid.anchorRef.current.getBoundingClientRect()`, reusing the existing ref rather than wiring a second one onto the same element.

### Convert the old Admin `Tooltip.jsx` wrapper

`Privileges.jsx`, `Users.jsx`, `ApiDocumentation.jsx`: the "Refresh data/table" button's `<Tooltip text="..." arrow="bottom">` wrapper becomes `IconTooltipButton` with `placement="bottom"` (matches the existing `arrow='bottom'`), preserving the current label text.

### Convert `LoginInputTooltip.jsx` (Tippy) spots

`TextArea.jsx`'s validation-error info icon and `ApiGeneratorCreate.jsx`/`ApiGeneratorEdit.jsx`'s validation-rules info icon switch from `<LoginInputTooltip content={...} placement="...">` to manual `useAnchoredTooltip`/`AnchoredTooltipPortal` wiring around the same `<i>`/`<div>` icon element, preserving each call site's existing `placement` (`'left'` for the two `ApiGenerator*` spots; `TextArea.jsx` didn't set one, so it gets `'top'` since the icon sits inside a form field with limited space to the right). Content stays dynamic (`onError` string / static hint string) — same prop shape, new component.

### Cleanup

- Delete `Components/Tooltip/Tooltip.jsx` and `Components/Tooltip/LoginInputTooltip.jsx` once the conversions above land and grep confirms no remaining imports.
- Remove `SidebarAccordion.jsx`'s unused `Tooltip` import and `ApiGeneratorView.jsx`'s unused `LoginInputTooltip` import — both dead today, unrelated to whether the underlying components still exist.
- Remove the `@tippyjs/react`/`tippy.js` dependency from `package.json` if this was its only consumer (confirm via a repo-wide grep before removing).

### Docs

Rewrite `docs/developer/trading-chart.md`'s "Header command buttons: icon-only with anchored tooltips" section to describe the shared `AnchoredTooltip.jsx` module (hook + portal + `IconTooltipButton`, placement options, manual-wiring escape hatch) as the canonical implementation, replacing the current per-file description of the (now removed) duplicated definitions.

## Testing

- No new automated tests — this is a visual/markup change with no new business logic or backend surface.
- Manual browser check, both light and dark theme:
  - Every converted element in the table above shows a themed, non-clipped label on hover and on keyboard focus, and the label disappears on mouse-leave/blur.
  - Tooltips inside portaled/scrollable ancestors (symbol search popover, "Select period" grid, watchlist panel, replay tool rail) are not clipped and are not painted underneath the popover they're nested in.
  - `placement="left"`/`"bottom"` call sites (Next month, symbol-search Close ✕, header row buttons) don't run off the viewport edge.
  - `PositionsPanel.jsx`'s Close-position button shows the correct reason text while disabled.
  - The 3 converted Admin "Refresh" buttons and the 3 converted form info-icon tooltips render with the app's tooltip styling, not the old wrapper's/Tippy's default look.
  - `npm run build` succeeds after `@tippyjs/react` removal (if removed) with no missing-module errors.

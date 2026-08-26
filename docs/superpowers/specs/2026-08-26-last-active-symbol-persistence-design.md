# Last active market symbol persistence

## Purpose

The chart currently resets to the wrong symbol far more often than users expect — sometimes to a hardcoded default, sometimes to whatever symbol happens to be first in the user's saved/favorite list — even though a persistence mechanism already exists and appears to work in some cases. This spec makes "the symbol, exchange, category, and timeframe you were last looking at" a real, account-tied preference: it survives logout, page navigation, and a different browser/device, and it stops being silently overridden.

## Current behavior and root cause

`Dashboard.jsx` (the Workspace page) seeds an `activeSymbol` state from a `localStorage` key (`backtradelab-active-symbol:{userId}`), passes it into `MarketChart` as `initialSymbol`/`initialExchange`/`initialMarketCategory`, and writes back to that key whenever `activeSymbol` changes. Nothing clears this key on logout, so in principle it should survive that. `initialTimeframe` has no persistence at all today — it is always `'15m'`.

Two problems make this not work as expected:

1. **The chart's own symbol switcher is disconnected from this mechanism entirely.** `activeSymbol` is only ever updated by a `window` event, `backtradelab-active-symbol-change`, which is dispatched from `AppNavbar.jsx`'s symbol search — a component not used on the Workspace page (which uses `TraderNavbar.jsx`). `MarketChart.jsx` has no callback prop and never dispatches this event. Switching symbols the normal way, from the dropdown at the top of the chart itself, updates nothing outside the chart. The next time the page loads, that choice is gone.
2. **A restored symbol can be silently overridden.** `MarketChart.jsx`'s `loadMarketSymbols()` treats the active symbol as suspect if it isn't in the user's saved/favorited symbol list, and — unless it was just deliberately picked this session (tracked via `justSwitchedSymbolKeyRef`, which starts `null` on every mount) — snaps it back to the first saved symbol matching the current category. A restored value looks identical to a stale/deleted one from this code's point of view, so it gets overridden on the very next `loadMarketSymbols()` call after every page load.

## Data model

Add four nullable columns to `adm_users`, mirroring how `theme` is already a plain column rather than a separate settings table:

- `last_market_symbol` (string)
- `last_market_exchange` (string)
- `last_market_category` (string)
- `last_market_timeframe` (string)

All four are added to `AdmUser::$fillable`. No new table: this is a single current-value preference per user, not a history.

Because `HandleInertiaRequests` already shares the entire authenticated user model as `auth.user` on every page, these four fields reach the frontend for free the moment they exist — no new shared-prop wiring needed on the read side.

## Backend

One endpoint, `POST /profile/last-market-symbol`, handled by `ProfilePageController` alongside the existing `updateTheme`:

```text
symbol:    required, string, max:32, regex:/^[A-Za-z0-9]+$/
exchange:  required, string, max:32
category:  required, in: spot, linear, inverse   (matches MarketDataController's existing list)
timeframe: required, string, max:8, regex:/^[0-9]+[mhdw]$/
```

Updates the four columns on the authenticated user and returns `{ success: true }`. No ownership/authorization concern beyond standard auth — a user can only ever update their own record (`$request->user()`).

## Frontend

**Dispatching the change.** `MarketReplayChart` (`MarketChart.jsx`) gets a `useEffect` watching `[symbol, exchange, marketCategory, timeframe]`. On every change *after* the initial mount (skip the first run — it would just be echoing the `initial*` props back), it dispatches the existing `backtradelab-active-symbol-change` window event:

```js
window.dispatchEvent(new CustomEvent('backtradelab-active-symbol-change', {
  detail: { symbol, exchange, category: marketCategory, timeframe, origin: 'chart' },
}));
```

**Splitting remount from persistence.** `Dashboard.jsx`'s existing listener for that event currently does one thing (`setActiveSymbol(event.detail)`), which — because `activeSymbol` drives the `chartKey` passed as `<MarketChart key={chartKey} ...>` — forces a full unmount/remount of the chart. That is correct and necessary when the change came from *outside* the chart (`AppNavbar`'s search, which has no live chart instance to update in place) but actively harmful when the chart is telling its own parent what it already internally became — it would remount the chart every time a user picks a symbol from its own dropdown, discarding scroll position, tool selection, and in-flight data for no reason.

The listener splits on the new `origin` field:

```js
const handleSymbolChange = (event) => {
  if (!event.detail?.symbol) return;
  persistLastMarketSymbol(event.detail); // always: localStorage + debounced server POST
  if (event.detail.origin !== 'chart') {
    setActiveSymbol(event.detail); // only remount for externally-originated switches
  }
};
```

`AppNavbar.jsx`'s dispatch is unchanged (no `origin` field), so it continues to remount exactly as today.

**`persistLastMarketSymbol(detail)`** (new helper in `Dashboard.jsx`) does two things, unconditionally on every call regardless of origin:
- Writes `localStorage.setItem('backtradelab-active-symbol:{userId}', JSON.stringify(detail))` immediately (replaces the old `useEffect`-on-`activeSymbol` write, which only fired for external-origin changes).
- Debounces (~800ms after the last call) a `POST /profile/last-market-symbol` with `{ symbol, exchange, category, timeframe }`.

**Initial value resolution.** `Dashboard.jsx`'s `activeSymbol` initializer changes from "localStorage or null" to: server value (`auth.user.last_market_symbol` etc., if `last_market_symbol` is present) first, else the existing localStorage read, else `null` (falling through to `MarketChart`'s own hardcoded defaults). `MarketChart` also needs `initialTimeframe` wired from this same restored value, which it does not receive from anywhere today.

**Fixing the snap-back.** `justSwitchedSymbolKeyRef` is seeded with the initial (restored) symbol's key on mount instead of `null`, so `loadMarketSymbols()`'s first run treats the restored value exactly like a symbol the user just deliberately picked — never silently replacing it just because it isn't saved/favorited.

## Error handling

The persist `POST` is fire-and-forget: a failure is caught and dropped (no error toast, no retry), since losing one write of a low-stakes UI preference isn't worth interrupting the user, and the next symbol/timeframe change naturally retries by firing again. `localStorage` continues to work as an immediate, same-device fallback if the server call never lands.

## Testing

**Backend:** a feature test for `POST /profile/last-market-symbol` — persists valid values onto the authenticated user's record, rejects an invalid `category`/malformed `timeframe`, and confirms one user can't affect another's stored value (scoped to `$request->user()`).

**Frontend:** manual verification only — this repository has no test harness exercising `Dashboard.jsx`'s effects or window-event wiring, and adding one is out of scope here. Verification steps:
- Switch symbol/timeframe from the chart's own dropdown; confirm no remount/flicker and that `localStorage` updates.
- Reload the page; confirm the same symbol/exchange/category/timeframe is restored, including a symbol not on the saved/favorites list.
- Log out and back in (same browser); confirm it's still restored.
- Switch symbol from the external nav search (`AppNavbar`, e.g. via the public Market page's "Open in Workspace"); confirm the chart *does* jump/remount to it.
- Log in as the same user from a different browser (clear/incognito) after switching symbol on the first: confirm the second browser now restores the same symbol from the server value, not the hardcoded default.

## Required verification

```bash
php artisan test
npm run build
php artisan route:list
```

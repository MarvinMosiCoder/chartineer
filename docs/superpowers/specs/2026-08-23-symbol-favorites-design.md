# Symbol search: real favorites, decoupled from watchlists

## Purpose

Give the symbol search modal (`ChartHeader.jsx`) a real, direct-toggle favorite concept. Today the star icon there actually opens an "add to watchlist" picker menu, and the Favorites tab filters by membership in whichever watchlist is currently active in the sidebar (`docs/superpowers/specs/2026-08-20-symbol-search-market-list-redesign-design.md`). That conflates two different ideas and requires two clicks (star, then pick a list) to "favorite" something. This spec replaces it with a one-click star that favorites a symbol directly, independent of watchlists, plus per-row and bulk ways to clear favorites.

Trigger: user asked whether the existing Favorites tab worked; on inspection it was watchlist-membership-based, not a real per-symbol favorite.

## Scope

**In scope:**
- A new `is_favorite` boolean on saved symbols (`market_symbols`), toggled with one click, independent of watchlist membership.
- Star icon (yellow when favorited) does the toggle directly — no menu.
- The existing "add to watchlist" picker menu moves to a new `Bookmark` icon button, behavior unchanged.
- Favorites tab filters by `is_favorite` instead of active-watchlist membership.
- Per-row "remove from favorites" control and a "remove all favorites" bulk control, both scoped to the Favorites tab only.

**Explicitly out of scope:**
- Any change to `WatchlistPanel.jsx` (the sidebar) — favorites do not appear there. Confirmed with the user: search modal only.
- Any change to watchlist membership semantics, `addSymbolToWatchlist`, `removeSymbolFromWatchlist`, `deleteSavedSymbol`, or `removeAllSavedSymbols`.
- Deleting the underlying saved symbol as part of any favorites action (see Design below — favoriting/unfavoriting never deletes a `market_symbols` row).

## Current state (for context)

`ChartHeader.jsx` renders each search result row (both the compact/mobile and desktop variants) with a `Star` icon button that opens a small per-item menu listing every named watchlist, with a checkmark for lists that already contain the symbol; picking one calls `addSymbolToWatchlist`. The star is filled/blue when the symbol is in the **active** watchlist specifically (`watchlists[activeWatchlistName]`). The Favorites tab (`showFavoritesOnly` state) filters `filteredAddSymbolOptions` down to rows whose key is in that same active watchlist — it is not a fourth `marketCategory`, just a client-side filter layered on top of the current Spot/Futures result set.

Saved symbols are `MarketSymbol` rows (`app/Models/MarketSymbol.php`), one per `(adm_user_id, exchange, category, symbol)` (unique index `market_symbols_user_exchange_category_symbol_unique`), managed through `MarketDataController`: `GET /market-symbols` (list), `POST /market-symbols` (`storeSymbol`, an `updateOrCreate` upsert also used on every symbol switch via `MarketChart.jsx`'s `handleAddSymbol`), `DELETE /market-symbols/{marketSymbol}` (single hard delete), `DELETE /market-symbols` (delete all). Watchlists themselves are a separate concept — a `{name: [symbolKey, ...]}` JSON blob persisted via `PUT /market-watchlists`, unrelated to the `market_symbols` table.

Two independent client-side copies of saved symbols exist and are kept in sync only via a `backtradelab-symbols-changed` broadcast event (`utils/crossTabSync.js`): `MarketChart.jsx`'s local `symbols` state, and `WatchlistContext.jsx`'s `savedSymbols` state (used by `ChartHeader.jsx` and `WatchlistPanel.jsx`). `ChartHeader.jsx` reaches watchlist/saved-symbol data via `useWatchlist()`, not via props from `MarketChart.jsx`.

## Design

### Data model

New migration adds `is_favorite` boolean (default `false`) to `market_symbols`. `MarketSymbol::$fillable` and `::$casts` gain `is_favorite`. `MarketDataController::symbols()` includes it in the selected columns so it reaches `WatchlistContext`'s `savedSymbols`.

### Backend endpoints

**`PUT /market-symbols/favorite`** (throttled `market-write`, same as the other mutating symbol routes) → new `toggleFavoriteSymbol` method. Validates the same shape `storeSymbol` does (`symbol`, `exchange`, `category`, `exchange_symbol`, `coin_name`, `base_coin`, `quote_coin`) plus a required `is_favorite` boolean, and performs its own `updateOrCreate` keyed on `(adm_user_id, exchange, category, symbol)`. This is a deliberate, self-contained duplicate of `storeSymbol`'s upsert rather than a shared helper or an extension of `storeSymbol` itself:
- It must work for a symbol that isn't saved yet (favoriting straight from the Spot/Futures tabs), so it needs full upsert semantics, not just an update.
- It must not depend on ordering with `MarketChart.jsx`'s separate, deliberately-unawaited `onAddSymbol` call — being self-sufficient avoids a race where the favorite toggle fires before the row exists.
- `storeSymbol`/`handleAddSymbol` already carries several hard-won timing and CSRF fixes (documented in `docs/developer/trading-chart.md`) and runs on every symbol switch; extending it risks regressing that path for no benefit.

Returns `{ success: true, symbol: {...} }` (the upserted row, including `id` and `is_favorite`), matching `storeSymbol`'s response shape.

**`DELETE /market-symbols/favorites`** (throttled `market-write`) → new `clearAllFavorites` method. Bulk-updates `is_favorite = false` for every one of the user's rows where it's currently `true`. This is an `UPDATE`, not a row delete — `market_symbols` rows are untouched, so watchlist membership (which references symbols by key, not by favorite status) is unaffected. Returns `{ success: true, cleared: <count> }`.

Both routes live alongside the existing `/market-symbols` routes in `routes/web.php`, same middleware group.

### `WatchlistContext.jsx`

- `toggleFavorite(item)`: calls `PUT /market-symbols/favorite` with the desired boolean (the caller already knows current state from `savedSymbols`), updates `savedSymbols` locally from the response, and broadcasts `backtradelab-symbols-changed` (same pattern `deleteSavedSymbol` uses) so `MarketChart.jsx`'s separate `symbols` copy and any other open tab stay in sync.
- `removeAllFavorites()`: calls `DELETE /market-symbols/favorites`, sets `is_favorite: false` on the matching local `savedSymbols` entries, broadcasts the same event. No watchlist pruning — nothing was deleted.
- Both exposed via `useWatchlist()` alongside the existing watchlist functions.

### `ChartHeader.jsx` (compact and desktop variants — same change applied to both, matching how the rest of this file duplicates its search-result markup)

**Star** — one click, calls `toggleFavorite(item)` directly. Filled and colored amber/yellow (`text-amber-400`, matching the color `WatchlistPanel.jsx` already uses for its own star, `fill="currentColor"`) when `is_favorite` is true for that symbol; outline otherwise. No menu.

**Bookmark** (new icon, `lucide-react`) — takes over exactly what the star does today: opens the existing per-item watchlist-picker menu, highlighted blue when the symbol is in the active watchlist. Pure rename/relocation of existing logic (`watchlistMenuOpenKey`, `handleAddToWatchlist`) — no behavior change.

**Favorites tab filter** — `showFavoritesOnly` now filters `filteredAddSymbolOptions` against a `favoritedKeys` set built from `savedSymbols.filter(s => s.is_favorite)`, replacing the old `activeWatchlistSymbols.includes(key)` check. Tab-switch behavior (Favorites exits when Spot/Futures is clicked) and the "No favorites in this market yet" empty state copy are unchanged.

**Per-row delete (Favorites tab only)** — a small `X` button next to Bookmark. `useConfirm()` gate: "Remove {symbol} from favorites?" → `toggleFavorite(item)` (sets `is_favorite` to false). No toast, matching `removeSymbolFromWatchlist`'s convention in `WatchlistPanel.jsx` (soft, non-destructive removal doesn't toast there either). Does not touch watchlist membership or delete the saved symbol.

**Remove all favorites (Favorites tab only)** — a `Trash2` button shown above the results whenever there's at least one favorited row in the current view. `useConfirm()` gate: "Remove all {count} favorites? This only clears their favorite status — they stay saved and stay in any watchlists." → `removeAllFavorites()` → `useToast()` success/error ("Removed {count} symbols from favorites." / failure message), matching `removeAllSavedSymbols`'s toast convention in `WatchlistPanel.jsx`.

Both of these are net-new imports for `ChartHeader.jsx` (`useConfirm`, `useToast` — currently only used elsewhere, e.g. `WatchlistPanel.jsx`), and each needs its `confirmElement` rendered once in the component's output.

**Confirmed independence from watchlists:** every favorites action above (star toggle, per-row `X`, bulk clear) only ever reads/writes `is_favorite` on a `market_symbols` row. None of them call `deleteSavedSymbol`, `removeSymbolFromWatchlist`, `removeAllSavedSymbols`, or touch the `watchlists` JSON. A symbol can be unfavorited while remaining saved and remaining in every watchlist it was already in.

### Docs

Update `docs/developer/trading-chart.md`'s "Symbol search panel layout: tabs and Favorites" and "Add to watchlist from symbol search" sections to describe this split (favorite flag vs. watchlist membership) in place of the current "Favorites = active watchlist, star = watchlist toggle" description.

## Testing

- New `tests/Feature/MarketSymbolFavoriteTest.php`:
  - Favoriting an unsaved symbol creates it and sets `is_favorite` in one call.
  - Toggling an already-saved symbol's favorite flag on/off works and doesn't touch its other columns or watchlist-unrelated state.
  - `DELETE /market-symbols/favorites` clears `is_favorite` on every favorited row for the authenticated user, leaves non-favorited rows untouched, and does not delete any row.
  - Both endpoints are scoped to the authenticated user (can't affect another user's rows) and sit behind the same throttle as the other mutating `/market-symbols` routes.
- Manual browser check (both compact/mobile and desktop search panel):
  - Star toggles instantly and turns yellow, no menu appears.
  - Bookmark still opens the watchlist picker unchanged.
  - Favorites tab filters correctly and independently of which watchlist is active in the sidebar.
  - Per-row `X` removes a symbol from Favorites; it still appears under Spot/Futures and is still present in `WatchlistPanel.jsx`'s sidebar if it was in a watchlist.
  - "Remove all favorites" clears every favorited row (with confirm), and previously-favorited symbols remain saved and remain in their watchlists afterward.
  - State survives a reload and a second browser tab (via the existing `backtradelab-symbols-changed` broadcast).

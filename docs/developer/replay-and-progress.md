# Replay and Progress

## Purpose

Replay hides future candles, advances historical data at selected speeds, and resumes a user's last market-specific candle/price.

| Route/file | Responsibility |
|---|---|
| `GET/PUT /market-replay-progress` | Read/write resume state |
| `DELETE /market-replay-progress` | Drop one market's checkpoint — sent when the user goes Back to Live |
| `MarketReplayProgressController.php` | Validation, ownership, conflict ordering |
| `MarketReplayProgress.php` | Per-user/per-market progress |
| `MarketChart.jsx`, `ReplayPanel.jsx` | Replay selection, playback, controls |
| `GET /replay-access` | Entitlement gate |

The update route requires replay access:

```php
Route::put('/market-replay-progress', [MarketReplayProgressController::class, 'update'])
    ->middleware('replay.access');
```

## Flow

1. User starts replay; the chart first checks `/replay-access`.
2. If denied, the subscription modal opens. Access checking is deduplicated in the UI.
3. The user selects a historical candle and playback begins.
4. Live socket/polling stops and only candles through the replay index render.
5. Progress is periodically saved with market identity and `client_saved_at`.
6. On reload/market return, the server record restores the replay location.
7. Back to Live ends the session and deletes that market's record, so the next visit starts in Live.

## Back to Live clears the checkpoint

`toggleReplayMode()`'s exit branch calls `clearSavedReplayProgress()` in `MarketChart.jsx`. Going Live used to only flip local state and deliberately keep the row ("the checkpoint remains available"), but nothing in the UI ever resumed from it inside that session — re-entering Replay always goes through the price-pick flow, never the checkpoint. The only thing the leftover row actually did was make the *next* visit to that market (or any reload) drop straight back into Replay at the abandoned candle, since `shouldRestoreSavedReplay` only asks whether a row exists. Ending the session is now what deletes it.

Four things have to be cleared together, and missing any one of them puts the checkpoint straight back:

- `latestReplayProgressRef.current = null` — **first**, because both flush paths (the unmount cleanup and the `pagehide` keepalive `fetch`) re-PUT whatever this ref holds. Deleting without clearing it means the row returns the moment the user navigates away.
- `localStorage.removeItem(replayProgressStorageKey)` — the loader prefers the local copy over the server one (`localProgress ?? serverProgress`) and re-PUTs it, so a surviving local entry both restores Replay *and* recreates the server row.
- `setSavedReplayProgress(null)` and `restoredReplayProgressKeyRef.current = replayProgressKey` — stops a re-restore for this market before the loader next resets that ref on a market change.
- `DELETE /market-replay-progress`, chained behind `pendingReplayProgressSaveRef.current`. The save is debounced 500 ms; a PUT already in flight would otherwise land after the delete and recreate the row. The not-yet-fired debounce is handled by the save effect's own `clearTimeout` cleanup when `replayMode` flips false.

The delete route intentionally carries **no `replay.access` middleware**, unlike the PUT: clearing state is not a replay action, and a user whose entitlement lapsed must still be able to drop a stale row. Losing access mid-session (the `requireReplayAccess` effects) forces `replayMode` false but does **not** delete — that is an interruption, not the user ending the session, so their checkpoint survives until they resubscribe.

## Safety and maintenance

- Scope progress by authenticated user, exchange, category, symbol, and timeframe.
- Use client/server ordering data to prevent a delayed request overwriting newer progress.
- Trial activation must be explicit; loading the workspace must not start it.
- New replay state must be added to both persistence payload and restoration logic.
- **Replay is per-market, never a chart-wide sticky mode.** Switching to a different exchange/category/symbol while already replaying does not, by itself, keep the new chart in Replay — it only re-enters Replay if *that specific market* has its own saved `market_replay_progress` row, resolved via the same `GET /market-replay-progress` this feature already makes on every market change. A timeframe change on the same market is not a market change and simply continues whatever mode (Live or Replay) was already active. See [Trading chart](trading-chart.md)'s candle-fetch section for the `isSymbolChange`/`shouldRestoreSavedReplay` mechanics.
- The candle-fetch effect only waits on this feature's progress round trip when it's not already replaying the same market (`!replayMode` on a plain timeframe change, or before this row's own market's data has loaded on a genuine market change); see [Trading chart](trading-chart.md) for why blocking unconditionally on it was a real switching-latency bug, not a safety requirement, and for the two-pass (Live-first, promote-to-Replay-once-confirmed) sequence a market change now goes through.

## Verification

- Denied, trial, paid, expired, timeout, and retry states.
- Resume after reload and across markets.
- Start Replay on a symbol with a saved checkpoint, switch to a symbol that has never been replayed, and confirm the chart lands in Live mode (not Replay) once the switch settles. Switch back to the original symbol and confirm it re-enters Replay at its saved point. Changing only the timeframe mid-replay must not drop back to Live.
- Rapid save ordering and multiple tabs.
- Back-to-live restarts streaming and goes to current time.
- Back to Live, then switch to another symbol and back (and separately, reload the page): the market must stay in **Live** both times, with no `market_replay_progress` row left for it. Repeat with a Back to Live issued within half a second of the last checkpoint save to cover the in-flight-PUT ordering.
- Let replay access lapse mid-session and confirm the checkpoint survives (the chart drops to Live, but the row is kept for when the user resubscribes).
- `tests/Feature/MarketReplayProgressDeletionTest.php` covers the delete's user/market scoping, idempotence, validation, auth, and that it stays available without replay access. Like `BacktestTradeNotificationTest` it runs against the real schema with `DatabaseTransactions`.

Related: [Subscriptions](subscriptions-trials-and-paymongo.md), [Streaming](live-market-streaming.md).

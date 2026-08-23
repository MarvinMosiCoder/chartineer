# Replay and Progress

## Purpose

Replay hides future candles, advances historical data at selected speeds, and resumes a user's last market-specific candle/price.

| Route/file | Responsibility |
|---|---|
| `GET/PUT /market-replay-progress` | Read/write resume state |
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

Related: [Subscriptions](subscriptions-trials-and-paymongo.md), [Streaming](live-market-streaming.md).

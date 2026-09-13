# Live Market Streaming

## Purpose

Live mode updates the active candle from public exchange WebSockets and falls back to fresh REST polling when streaming is unavailable or stale.

| File | Responsibility |
|---|---|
| `liveCandleStream.js` | Exchange subscriptions, normalization, heartbeat/reconnect |
| `MarketChart.jsx` | Lifecycle, status, fallback polling, chart updates |
| `MarketDataController.php` | REST fallback candles |

## Flow

1. Chart selects exchange/category/symbol/timeframe.
2. The old connection and timers are closed.
3. `liveCandleStream.js` opens the exchange-specific public stream.
4. A valid candle is merged by timestamp into `allCandlesRef` and patched into both series with `update()`; React state follows on the next coalescing flush.
5. If no first candle arrives or the stream becomes stale, the chart polls `/api/klines?...&fresh=1`.
6. Replay mode stops streaming/polling; returning live creates a new subscription.

Only a valid normalized candle should change the UI to `Live`. Repeated timestamps replace the current candle; older/new candles remain chronologically unique.

## Maintenance

- Encapsulate exchange message shapes and subscription payloads in the stream module.
- Clear sockets, reconnect timers, stale watchdogs, and polling on dependency change/unmount.
- Keep production CSP/firewall access for all configured WebSocket hosts.
- A live tick never rebuilds the series. `applyLiveCandleToSeries()` in `MarketChart.jsx` merges the candle into `allCandlesRef` with `mergeLiveCandle()` (O(1): patch the last bar or append one) and patches both series through `candleSeries.update()`/`volumeSeries.update()`. This is how exchange front-ends drive a forming candle, and it is why the tick path no longer pays for a `setData()` of the full 5,000-20,000 bar history, a `Map` de-duplication and a re-sort several times a second.
- React state is deliberately behind the series. `LIVE_TICK_FLUSH_MS` (250ms) coalesces ticks into one `setAllCandles()`, because publishing per message re-renders `MarketChart`, re-runs every `visibleCandles` consumer and recomputes each indicator over full history just to move one bar. The array published is `allCandlesRef.current`, which already holds every merged tick — buffering the candles and replaying them at flush time instead would drop the final close of a bucket whenever a burst spanned a bar boundary.
- Anything that reads the series imperatively must read `allCandlesRef.current`, not the `allCandles` state, or call `flushLiveTicks()` first. Every Replay entry point does the latter: a tick applied to the ref but not yet flushed would otherwise leave `allCandles` one bar short, and both the default start index and the resume checkpoint are derived from that length.
- `appliedLiveSeriesRef` is the fingerprint (bar count, last bar OHLCV, active candle colors) of what the tick path last pushed into the series. The `setData` effect skips its rebuild when the fingerprint matches the incoming `visibleCandles`, which only ever happens for the live tick path — every other producer (history load, Replay slice, symbol/timeframe switch, candle color change) moves the count, the last bar or the colors. It is reset on chart creation and on market switch; a stale match there would skip the initial fill and leave a blank chart.
- Replay keeps the full `setData` path and is unaffected by the above: the stream and REST polling both return early in Replay, and `update()` could not serve it anyway — stepping backward and scrubbing shrink `visibleCandles`, and `lightweight-charts` can only patch the last bar or append, never remove one.
- Avoid `fitContent()` during every tick; preserve the user's viewport. This also covers a subtler case than a literal `fitContent()` call: the `candleSeries.setData(visibleCandles...)`/`volumeSeries.setData(visibleVolume)` effect in `MarketChart.jsx` captures the visible logical range before each call and restores it afterward whenever the user isn't already pinned to the live edge, because `lightweight-charts`' own `shiftVisibleRangeOnNewBar` (on by default) silently re-anchors the viewport on `setData()` when the bar count grows — this is not dead code to simplify away; removing it reproduces the "can't place a drawing tool in the live chart's future whitespace" regression documented in [Trading chart](trading-chart.md). Live ticks no longer reach this code (`update()` on the current bucket does not change the bar count, so it cannot trip the reflow), but history loads, retries and Replay transitions still do.
- REST fallback polls every 10 seconds by default, pauses while the tab is hidden or offline, and resumes immediately when visible/online. The server coalesces identical latest-candle requests for five seconds.
- Reconnect delays include jitter. BingX uses separate Spot and swap WebSocket hosts. MEXC Spot decodes the current protobuf K-line channel; unsupported MEXC timeframes are not offered.
- Per-product payload shapes, verified against the live sockets. These are easy to get wrong in a way that fails *silently* — the socket connects, every message parses to `null`, the candle never moves and the badge just cycles `Connecting`/`Reconnecting`:
  - BingX **Spot** takes its own interval vocabulary (`BINGX_SPOT_INTERVALS`: `1min`/`60min`/`4hour`/`1day`/`1mon`); it rejects the `1m`/`4h` forms with `dataType is error`. The candle is at `data.K`, bucket key `t`.
  - BingX **Perpetual** uses the shared `1m`/`4h` vocabulary. The candle is at `data[0]`, bucket key `T`.
  - MEXC **Perpetual** `push.kline` is single-letter keyed: `t` seconds, `o/h/l/c`, `q` volume (`a` is quote turnover). No `time`/`open`/`vol`/`amount` keys exist.
- Binance **Perpetual** (`fstream.binance.com`) can accept the WebSocket upgrade and then send nothing at all from restricted regions, while `fapi.binance.com` REST — which the server proxy uses — keeps working. The symptom is a chart that loads history and then never ticks. That path degrades to REST polling by design; it is not a parser bug, and the badge shows `REST Polling` rather than `Live`.

## Verification

- First-message timeout, disconnect, stale open socket, reconnect.
- REST fallback continues without request storms.
- Symbol/timeframe/exchange change creates exactly one active connection.
- Replay stops live activity.
- Duplicate/older timestamps and volume values are safe.
- Entering Replay mid-stream (click pick, spacebar, step back, reset) lands on the same bar as it would with no tick in flight, and the resume checkpoint survives a reload.
- A candle color change repaints every volume bar, not only the newest.

Related: [Market data](market-data-and-symbols.md), [Trading chart](trading-chart.md).
# Initial history readiness

Live candles are buffered until the matching REST history request completes. The loading skeleton remains visible until at least two valid historical candles are available, preventing a one-candle chart flash during exchange connection or market/timeframe changes. RSI and MACD pane sizes are calculated from the fixed chart viewport, so candle updates do not grow the chart.

The chart's bottom-right badge displays `Replay`, `Offline`, `Connecting`, `Reconnecting`, `Delayed`, `Live`, or `REST Polling`. Hovering or focusing it shows three rows: browser connectivity (`Internet`), the active exchange/category (`Market`), and receipt age (`Chart delay`). WebSocket data becomes delayed after 45 seconds without a valid candle; REST data becomes delayed after two missed polling intervals with a 20-second minimum. The displayed chart delay is receipt age inside BacktradeLab, not exchange network round-trip latency.

The popover used to carry three more rows — `Feed` (WebSocket vs. REST fallback), `Last update`, and `Candle started`, all absolute browser-local timestamps — which were removed as noise: two full datetimes plus a transport name is more than the surface is for, and `Chart delay` already answers the only question a trader asks of it ("is this price current?") in the relative form they actually want. The underlying values are still computed and still load-bearing, just no longer rendered: `liveFeedInfo.source` picks the delay threshold (45s for WebSocket vs. the REST interval), and `liveFeedInfo.receivedAt` is what `Chart delay` is derived from. `formatLocalFeedTime()` and the `latestCandleStartedAt` memo/prop had no other consumer and went with the rows. **Both copies of this popover must be edited together** — `MarketChart.jsx` renders one inside `ChartBottomBar` (left-anchored, in the chart footer) and a second in the in-chart bottom-right overlay badge (right-anchored, beside the order-price action). They are duplicated markup at different indentation, not a shared component, so a grep for a row label returns two hits and both are live.

The "candle interval start is kept separate so a current long-timeframe candle is not mislabeled as delayed" distinction still holds in the delay logic itself, which has always keyed on receipt time rather than candle-open time — dropping the row changed what is displayed, not how `Delayed` is decided.

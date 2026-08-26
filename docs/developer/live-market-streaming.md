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
4. A valid candle is normalized and merged by timestamp.
5. If no first candle arrives or the stream becomes stale, the chart polls `/api/klines?...&fresh=1`.
6. Replay mode stops streaming/polling; returning live creates a new subscription.

Only a valid normalized candle should change the UI to `Live`. Repeated timestamps replace the current candle; older/new candles remain chronologically unique.

## Maintenance

- Encapsulate exchange message shapes and subscription payloads in the stream module.
- Clear sockets, reconnect timers, stale watchdogs, and polling on dependency change/unmount.
- Keep production CSP/firewall access for all configured WebSocket hosts.
- Avoid `fitContent()` during every tick; preserve the user's viewport. This also covers a subtler case than a literal `fitContent()` call: the tick-driven `candleSeries.setData(visibleCandles...)`/`volumeSeries.setData(visibleVolume)` effect in `MarketChart.jsx` captures the visible logical range before each call and restores it afterward whenever the user isn't already pinned to the live edge, because `lightweight-charts`' own `shiftVisibleRangeOnNewBar` (on by default) silently re-anchors the viewport on `setData()` when the bar count grows — this is not dead code to simplify away; removing it reproduces the "can't place a drawing tool in the live chart's future whitespace" regression documented in [Trading chart](trading-chart.md).
- REST fallback polls every 10 seconds by default, pauses while the tab is hidden or offline, and resumes immediately when visible/online. The server coalesces identical latest-candle requests for five seconds.
- Reconnect delays include jitter. BingX uses separate Spot and swap WebSocket hosts. MEXC Spot decodes the current protobuf K-line channel; unsupported MEXC timeframes are not offered.

## Verification

- First-message timeout, disconnect, stale open socket, reconnect.
- REST fallback continues without request storms.
- Symbol/timeframe/exchange change creates exactly one active connection.
- Replay stops live activity.
- Duplicate/older timestamps and volume values are safe.

Related: [Market data](market-data-and-symbols.md), [Trading chart](trading-chart.md).
# Initial history readiness

Live candles are buffered until the matching REST history request completes. The loading skeleton remains visible until at least two valid historical candles are available, preventing a one-candle chart flash during exchange connection or market/timeframe changes. RSI and MACD pane sizes are calculated from the fixed chart viewport, so candle updates do not grow the chart.

The chart's bottom-right badge displays `Replay`, `Offline`, `Connecting`, `Reconnecting`, `Delayed`, `Live`, or `REST Polling`. Hovering or focusing it shows browser connectivity, WebSocket/REST source, market, last valid receipt time, receipt age, and the current candle's interval start in browser-local time. WebSocket data becomes delayed after 45 seconds without a valid candle; REST data becomes delayed after two missed polling intervals with a 20-second minimum. The displayed chart delay is receipt age inside BacktradeLab, not exchange network round-trip latency. Candle interval start is kept separate so a current long-timeframe candle is not mislabeled as delayed.

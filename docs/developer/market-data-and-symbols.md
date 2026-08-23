# Market Data and Symbols

## Purpose

The market layer discovers instruments from supported exchanges, normalizes historical candles, and stores each user's saved symbols.

| Route/file | Responsibility |
|---|---|
| `GET /api/market-symbol-options` | Public exchange symbol discovery |
| `GET /api/klines` | Public normalized candles |
| `GET /api/featured-coins` | Public fixed BTC/ETH/SOL market and fundamentals summary |
| `GET/POST/DELETE /market-symbols` | Authenticated saved-symbol collection |
| `GET /market-metadata` | Authenticated normalized exchange statistics and optional fundamentals |
| `POST /market-metadata/batch` | Authenticated metadata for up to 50 saved markets |
| `GET /market-overview` | Authenticated featured markets, active announcements, and configured tips |
| `MarketDataController.php` | Validation, exchange HTTP calls, normalization, caching |
| `MarketMetadataService.php` | Exchange ticker normalization and optional CoinMarketCap enrichment |
| `MarketOverviewService.php` | Compact Market Summary overview configuration and announcement excerpts |
| `MarketSymbol.php` | User-owned saved symbol |
| `utils/marketLabels.js` | Frontend market labels |

The public API routes are:

```php
Route::get('/market-symbol-options', [MarketDataController::class, 'availableSymbols']);
Route::get('/klines', [MarketDataController::class, 'klines']);
Route::get('/featured-coins', FeaturedCoinController::class);
```

The featured-coins endpoint accepts no market input. It exposes only the fixed Bybit Spot BTCUSDT, ETHUSDT, and SOLUSDT set, sanitizes the existing metadata service output, isolates failures per coin, and uses a dedicated per-IP rate limit.

## Data flow

1. The chart requests available symbols for an exchange/category.
2. `MarketDataController` validates the exchange/category and calls the appropriate public exchange API.
3. Responses are converted into a common symbol shape.
4. Candle requests validate symbol/timeframe/range and return normalized OHLCV rows.
5. Authenticated save/delete actions scope `market_symbols` to `adm_user_id`.

Workspace loads metadata only when Market Info is opened. Market Summary loads `/market-overview`, merges its configured featured markets with the user's saved markets, deduplicates by exchange/category/symbol, and makes one metadata batch request. Exchange statistics are cached for 10 seconds. CoinMarketCap is the primary fundamentals provider when `COINMARKETCAP_API_KEY` is configured; exact-symbol mappings and static coin information are cached for 24 hours and changing fundamentals for five minutes. When CoinMarketCap is unconfigured, unavailable, invalid, rate-limited, or has no exact match, an optional `COINGECKO_API_KEY` (`COINGECKO_MODE=demo` or `pro`) supplies the fallback with the same mapping and fundamentals cache durations. Provider failures produce nullable fundamentals and warnings while the overview, saved-market list, and chart candles continue normally. CoinMarketCap's free latest-data endpoints do not reliably provide ATH/ATL, so those fields remain nullable unless the CoinGecko fallback supplies them.

Featured market defaults and rotating educational tips live in `config/market_overview.php`. Deployments can override that configuration without coupling dashboard content to React. The default highlights are Bybit spot BTCUSDT, ETHUSDT, and SOLUSDT.

Normalized statistics include price/change/high/low, base volume, quote turnover, bid/ask, and supported derivative mark/index/funding/open-interest values. Fundamentals include identity/logo, rank, market cap, FDV, supply, ATH, and ATL.

Supported exchange-specific behavior is implemented in the controller and live-stream module; consult both before adding an exchange.

## Maintenance and failure handling

- Normalize timestamps, numeric OHLCV values, ordering, and duplicates at the boundary.
- Keep completed historical candles cacheable; `fresh=1` is used for live fallback.
- Cache fixed-end historical exchange pages using `MARKET_DATA_HISTORICAL_REQUEST_CACHE_SECONDS`; keep the latest page short-lived.
- Route exchange REST calls through `ExchangeMarketDataGateway`, which coalesces identical requests, enforces per-exchange budgets, serves stale successes during cooldowns, and honors 429/418 backoff.
- Normal history is capped by `MARKET_DATA_NORMAL_MAX_PAGES`; Replay uses `MARKET_DATA_REPLAY_MAX_PAGES`, accepts partial valid history, and tries at most one compatible fallback exchange.
- **Any no-`start` candle load pages concurrently, not sequentially — this now includes Replay, not just normal loads.** `klines()` fetches page 1 synchronously (`fetchKlineRows()`) to get a real anchor timestamp, then fetches pages 2..N in one batch via `ExchangeMarketDataGateway::pool()` (`Http::pool()` under the hood), with each page's `end` boundary *predicted* from the anchor using the interval's fixed duration (`intervalMilliseconds()`) rather than waiting on the previous page's actual response. This is safe because gaps/overlaps at predicted page boundaries are already tolerated by the existing dedup-by-timestamp (`$seen`) and `partial` reporting — it was never a hard invariant. `pool()` preserves the same per-exchange rate budget, cooldown, and fresh/stale caching as `get()` (added as a new method, `get()` itself is untouched, so every other `ExchangeMarketDataGateway` consumer — `MarketMetadataService`, etc. — is unaffected). Measured impact on the original normal-only version: a fresh 5000-candle load went from ~4s (5 sequential exchange round-trips) to ~1s. The shared strategy lives in `fetchPooledKlinePages()` (`klines()`'s `if (!$start)` branch), used for both the normal (`max_candles <= 5000`) and Replay/eager (`max_candles > 5000`, up to 20000) shapes — only a bounded `start`/`end` range query still uses the original adaptive sequential loop, since an explicit start boundary must be respected exactly rather than approximated from a predicted page grid. Replay was originally kept sequential on the reasoning that its deeper, potentially gappier history needed each page's real oldest timestamp to anchor the next request; in practice this meant every Replay symbol/timeframe switch paid for up to `MARKET_DATA_REPLAY_MAX_PAGES` (20) sequential round-trips before showing anything — slow enough to trip the frontend's 60s failsafe timeout on an unfamiliar symbol/exchange (see [Trading chart](trading-chart.md)'s candle fetch section). Extending pooling to Replay accepts the same predicted-boundary tradeoff already proven out for normal loads rather than introducing a new one. Measured directly against a live Bybit futures symbol: a cold 20000-candle Replay load (one page-1 request plus a ~19-page pooled burst) completed in ~2.7s, confirmed both by direct request timing and by the request's own log entries (`duration_ms` for the anchor request and for the pooled burst as a whole).
- **`MarketDataController::metadataBatch()`'s per-market lookups (`POST /market-metadata/batch`) are pooled too, not sequential.** It used to `->map()` over `MarketMetadataService::get()` for every market in the batch (up to 50) one at a time — each futures market alone is up to 3 sequential exchange calls (ticker, premium-index, open-interest) plus a CoinMarketCap/CoinGecko fundamentals lookup, and a failed fundamentals lookup (a symbol with no exact coin match) is never cached, so it re-pays that cost on every batch that includes it. Reproduced live: a batch mixing real and synthetic/invalid symbols across a few exchanges ran long enough to hit PHP's `max_execution_time` and die mid-request with a `Maximum execution time of 60 seconds exceeded` fatal (`Illuminate\Support\Sleep`). Because local dev runs a single-worker `php artisan serve` process (no `pcntl` on Windows — confirmed only one `php.exe` handles all connections), that one runaway request blocked every other request on the same server for its entire span, including unrelated candle fetches — which is what made an unrelated symbol switch look stuck, even though the candle endpoint itself resolved in under a second once the metadata request finally died and freed the process.
  `MarketMetadataService::getBatch()` is the new entry point: it resolves every market's cheap identity data up front, then fires **one** pooled `ExchangeMarketDataGateway::pool()` burst for every market's exchange-stats requests that isn't already warmly cached (same 10s cache, same tags/shape as the single-lookup path's `statsRequests()`/`statsAssemble()`, which `fetchExchangeStats()` now shares instead of duplicating five exchanges' parsing logic twice), then up to two more pooled bursts for fundamentals: one to resolve each *unique* base coin symbol against CoinMarketCap/CoinGecko (deduplicating identical coins across markets in the same batch — free win for a batch with several markets sharing one base asset), and one for the resulting coinIds' quote/info detail (CoinGecko's `/coins/markets` accepts a comma-list of ids natively, so that stage is a single plain call rather than a second pool). Measured directly (`MarketMetadataService::getBatch()` called standalone, bypassing HTTP/auth): a cold 20-market batch mixing five real coins and fifteen invalid/synthetic symbols across bybit resolved in ~5.8s total — the same shape that previously risked a 60s fatal. `MarketMetadataService::get()` (the single-market `/market-metadata` endpoint) is unchanged, including its `retry(2, 200)` per-call resilience; the pooled batch path intentionally does not retry within a pool (matching `ExchangeMarketDataGateway::pool()`'s own precedent) — a failed pooled lookup is just treated as unresolved for that market rather than retried, since retrying isn't a meaningful concept for calls already dispatched concurrently.
- **`availableSymbols()`'s "all exchanges" case (the picker's default — `exchange` query param omitted) also uses `ExchangeMarketDataGateway::pool()` now, not a sequential loop.** It used to `foreach` over `self::EXCHANGES` calling `fetchAvailableSymbolsForExchange()` (a single `get()`) one exchange at a time, so the total wait was the *sum* of all five exchanges' round-trips — one slow/inconsistent exchange (OKX's public instruments endpoint measured up to ~12s in one observation) delayed the whole picker regardless of how fast the others were. The per-exchange URL/query construction was extracted into `symbolsRequestSpec()` (shared by both the single-exchange path, still `get()`, and the new multi-exchange `fetchAvailableSymbolsForExchanges()`, which builds a `pool()` request list and processes results through the same `processSymbolsResponse()` used by the single-exchange path — same success/error/normalize handling either way, just concurrent). Measured impact on a cold cache: sequential sum ~5.8s → pooled ~2.5s, and worst-case latency changed from *additive* (one slow exchange delays everyone) to *bounded by the single slowest exchange*. A single requested exchange (`?exchange=okx`) is unaffected — no benefit to pooling one request.
- Validate saved-symbol ownership on delete.
- Expect partial exchange outages and return a usable error without leaking upstream details.
- When adding an exchange, update REST discovery, REST candles, WebSocket streaming, labels, UI options, CSP/network policy, and tests.

## Verification

- Each exchange/category/timeframe.
- Empty/invalid symbol and upstream timeout.
- Candle order and unique timestamps.
- Two users cannot see/delete each other's symbols.
- `DELETE /market-symbols` (no id) removes only the authenticated user's own saved symbols and leaves every other user's rows untouched; the response reports the actual deleted count.
- Cache and `fresh=1` behavior.
- Metadata authentication, validation, provider fixtures, caching, and graceful partial responses.
- Overview authentication, featured/saved deduplication, partial loading, empty-watchlist CTA, and responsive dark/light layouts.
- Dedicated public limits: symbol discovery 6/minute; candles 30/minute for both a full history load (symbol/timeframe/category switch, entering Replay) and the `fresh=1` latest-candle fallback, per user/IP. History was 10/minute — tight enough that scanning a normal watchlist within a minute routinely tripped it, forcing the client's 429-retry path (see [Trading chart](trading-chart.md)); raised to match the `fresh` ceiling since the real anti-abuse protection against hammering exchange APIs lives one layer down in `ExchangeMarketDataGateway` (per-exchange budgets, cooldowns, 429/418 backoff).
- Featured coins are limited to 30 requests/minute per IP and never expose provider credentials or raw upstream errors.
- `availableSymbols()` with no `exchange` param returns the same merged/deduped/sorted symbol set and per-exchange `errors` shape whether one exchange is slow or fails as it did before pooling; a single `?exchange=` request still uses the non-pooled path.

Related: [Live streaming](live-market-streaming.md), [Trading chart](trading-chart.md).

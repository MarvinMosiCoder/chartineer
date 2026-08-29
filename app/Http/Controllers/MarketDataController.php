<?php

namespace App\Http\Controllers;

use App\Models\MarketSymbol;
use App\Services\MarketMetadataService;
use App\Services\ExchangeMarketDataGateway;
use App\Exceptions\ExchangeRateLimitedException;
use Illuminate\Http\Client\Response;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Validation\Rule;

class MarketDataController extends Controller
{
    private const EXCHANGES = ['binance', 'bybit', 'okx', 'bingx', 'mexc'];

    /**
     * Matches App\Http\Middleware\CompressResponse — level 1 buys ~70% of a
     * kline payload's size for a quarter of level 6's CPU. See that class for
     * the measured comparison.
     */
    private const KLINE_CACHE_COMPRESSION_LEVEL = 1;

    public function __construct(private readonly ExchangeMarketDataGateway $marketGateway)
    {
    }

    public function metadata(Request $request, MarketMetadataService $metadata)
    {
        $validated = $request->validate([
            'exchange' => ['required', Rule::in(self::EXCHANGES)],
            'category' => ['required', Rule::in(['spot', 'linear', 'inverse'])],
            'symbol' => ['required', 'string', 'max:32', 'regex:/^[A-Za-z0-9]+$/'],
        ]);

        return response()->json($metadata->get(
            $validated['exchange'],
            $validated['category'],
            $validated['symbol']
        ));
    }

    public function metadataBatch(Request $request, MarketMetadataService $metadata)
    {
        $validated = $request->validate([
            'markets' => ['required', 'array', 'min:1', 'max:50'],
            'markets.*.exchange' => ['required', Rule::in(self::EXCHANGES)],
            'markets.*.category' => ['required', Rule::in(['spot', 'linear', 'inverse'])],
            'markets.*.symbol' => ['required', 'string', 'max:32', 'regex:/^[A-Za-z0-9]+$/'],
        ]);

        $markets = collect($validated['markets'])
            ->unique(fn ($market) => strtolower($market['exchange']).':'.strtolower($market['category']).':'.strtoupper($market['symbol']))
            ->values()
            ->all();

        return response()->json(['items' => $metadata->getBatch($markets)]);
    }

    public function symbols(Request $request)
    {
        $symbols = MarketSymbol::query()
            ->where('adm_user_id', $request->user()->id)
            ->where('is_active', true)
            ->orderBy('exchange')
            ->orderBy('symbol')
            ->get([
                'id',
                'symbol',
                'exchange',
                'exchange_symbol',
                'coin_name',
                'base_coin',
                'quote_coin',
                'category',
                'is_favorite',
            ]);

        return response()->json([
            'success' => true,
            'symbols' => $symbols,
        ]);
    }

    public function availableSymbols(Request $request)
    {
        $validated = $request->validate([
            'category' => ['nullable', Rule::in(['spot', 'linear', 'inverse'])],
            'exchange' => ['nullable', Rule::in(self::EXCHANGES)],
        ]);

        $category = $validated['category'] ?? 'spot';
        $requestedExchange = $validated['exchange'] ?? null;
        $cacheKey = implode(':', ['market-symbol-options', $category, $requestedExchange ?? 'all']);

        if ($cached = Cache::get($cacheKey)) {
            return response()->json($cached);
        }

        try {
            $symbols = [];
            $errors = [];
            $exchanges = $requestedExchange ? [$requestedExchange] : self::EXCHANGES;

            // A single requested exchange still goes through get() directly (no
            // benefit to pooling one request); the "all exchanges" case (the
            // picker's default) used to await each exchange's HTTP call one at a
            // time — OKX alone measured ~12s, so a cold cache paid that on top
            // of four more sequential round-trips. Fetched via pool() instead.
            $perExchange = count($exchanges) > 1
                ? $this->fetchAvailableSymbolsForExchanges($exchanges, $category)
                : [$exchanges[0] => $this->fetchAvailableSymbolsForExchange($exchanges[0], $category)];

            foreach ($exchanges as $exchange) {
                $result = $perExchange[$exchange];

                foreach ($result['symbols'] as $item) {
                    $symbols[$item['exchange'] . ':' . $item['symbol']] = $item;
                }

                if (!empty($result['error'])) {
                    $errors[$exchange] = $result['error'];
                }
            }

            uasort($symbols, function ($a, $b) {
                return [$a['symbol'], $a['exchange']] <=> [$b['symbol'], $b['exchange']];
            });

            $payload = [
                'success' => true,
                'symbols' => array_values($symbols),
                'errors' => $errors,
            ];

            // A partial exchange failure should be retried sooner than a complete response.
            Cache::put($cacheKey, $payload, now()->addSeconds($errors ? 30 : 600));

            return response()->json($payload);
        } catch (\Throwable $e) {
            return response()->json([
                'success' => false,
                'message' => 'Server error while fetching available symbols',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    public function storeSymbol(Request $request)
    {
        $validated = $request->validate([
            'symbol' => ['required', 'string', 'max:32', 'regex:/^[A-Za-z0-9]+$/'],
            'exchange' => ['nullable', Rule::in(self::EXCHANGES)],
            'exchange_symbol' => ['nullable', 'string', 'max:64'],
            'coin_name' => ['nullable', 'string', 'max:64'],
            'base_coin' => ['nullable', 'string', 'max:32'],
            'quote_coin' => ['nullable', 'string', 'max:32'],
            'category' => ['nullable', Rule::in(['spot', 'linear', 'inverse'])],
        ]);

        $symbol = strtoupper($validated['symbol']);
        $exchange = strtolower($validated['exchange'] ?? 'bybit');
        $category = $validated['category'] ?? 'spot';

        $marketSymbol = MarketSymbol::query()->updateOrCreate(
            [
                'adm_user_id' => $request->user()->id,
                'exchange' => $exchange,
                'category' => $category,
                'symbol' => $symbol,
            ],
            [
                'exchange_symbol' => strtoupper($validated['exchange_symbol'] ?? $symbol),
                'coin_name' => strtoupper($validated['coin_name'] ?? $validated['base_coin'] ?? ''),
                'base_coin' => strtoupper($validated['base_coin'] ?? ''),
                'quote_coin' => strtoupper($validated['quote_coin'] ?? ''),
                'category' => $category,
                'is_active' => true,
            ]
        );

        return response()->json([
            'success' => true,
            'symbol' => $marketSymbol->only([
                'id',
                'symbol',
                'exchange',
                'exchange_symbol',
                'coin_name',
                'base_coin',
                'quote_coin',
                'category',
            ]),
        ], $marketSymbol->wasRecentlyCreated ? 201 : 200);
    }

    public function destroySymbol(Request $request, MarketSymbol $marketSymbol)
    {
        abort_unless((int) $marketSymbol->adm_user_id === (int) $request->user()->id, 404);

        $marketSymbol->delete();

        return response()->json([
            'success' => true,
            'message' => 'Symbol removed from your saved markets.',
        ]);
    }

    // Bulk counterpart to destroySymbol() — one transaction instead of one
    // request per saved symbol. A "remove all" firing N individual DELETEs
    // from the browser would hit the market-write limiter (15/min) well
    // before a user with more than 15 saved symbols finished clearing them.
    public function destroyAllSymbols(Request $request)
    {
        $deleted = MarketSymbol::query()->where('adm_user_id', $request->user()->id)->delete();

        return response()->json([
            'success' => true,
            'deleted' => $deleted,
        ]);
    }

    // Deliberately its own upsert rather than reusing/extending storeSymbol():
    // favoriting must work for a symbol that isn't saved yet (favorited straight
    // from the Spot/Futures tabs), and must not depend on ordering with
    // MarketChart.jsx's separate, unawaited onAddSymbol call — being
    // self-sufficient here avoids a race where the toggle fires before that
    // save's row exists. storeSymbol()/handleAddSymbol also already carries
    // several hard-won timing/CSRF fixes (see docs/developer/trading-chart.md)
    // and runs on every symbol switch, so it's not worth the regression risk
    // to extend it for this.
    public function toggleFavoriteSymbol(Request $request)
    {
        $validated = $request->validate([
            'symbol' => ['required', 'string', 'max:32', 'regex:/^[A-Za-z0-9]+$/'],
            'exchange' => ['nullable', Rule::in(self::EXCHANGES)],
            'exchange_symbol' => ['nullable', 'string', 'max:64'],
            'coin_name' => ['nullable', 'string', 'max:64'],
            'base_coin' => ['nullable', 'string', 'max:32'],
            'quote_coin' => ['nullable', 'string', 'max:32'],
            'category' => ['nullable', Rule::in(['spot', 'linear', 'inverse'])],
            'is_favorite' => ['required', 'boolean'],
        ]);

        $symbol = strtoupper($validated['symbol']);
        $exchange = strtolower($validated['exchange'] ?? 'bybit');
        $category = $validated['category'] ?? 'spot';

        $marketSymbol = MarketSymbol::query()->updateOrCreate(
            [
                'adm_user_id' => $request->user()->id,
                'exchange' => $exchange,
                'category' => $category,
                'symbol' => $symbol,
            ],
            [
                'exchange_symbol' => strtoupper($validated['exchange_symbol'] ?? $symbol),
                'coin_name' => strtoupper($validated['coin_name'] ?? $validated['base_coin'] ?? ''),
                'base_coin' => strtoupper($validated['base_coin'] ?? ''),
                'quote_coin' => strtoupper($validated['quote_coin'] ?? ''),
                'category' => $category,
                'is_active' => true,
                'is_favorite' => $validated['is_favorite'],
            ]
        );

        return response()->json([
            'success' => true,
            'symbol' => $marketSymbol->only([
                'id',
                'symbol',
                'exchange',
                'exchange_symbol',
                'coin_name',
                'base_coin',
                'quote_coin',
                'category',
                'is_favorite',
            ]),
        ]);
    }

    // Bulk-unfavorite, not a delete: clears is_favorite on every favorited row
    // for this user without removing any market_symbols row, so watchlist
    // membership (which references symbols by key, not by favorite status)
    // is never affected — deliberately not the same shape as destroyAllSymbols().
    public function clearAllFavorites(Request $request)
    {
        $cleared = MarketSymbol::query()
            ->where('adm_user_id', $request->user()->id)
            ->where('is_favorite', true)
            ->update(['is_favorite' => false]);

        return response()->json([
            'success' => true,
            'cleared' => $cleared,
        ]);
    }

    public function klines(Request $request)
    {
        $validated = $request->validate([
            'symbol' => ['nullable', 'string', 'max:32', 'regex:/^[A-Za-z0-9]+$/'],
            'interval' => ['nullable', Rule::in(['1', '3', '5', '15', '30', '60', '120', '240', '360', '720', 'D', 'W', 'M'])],
            'category' => ['nullable', Rule::in(['spot', 'linear', 'inverse'])],
            'exchange' => ['nullable', Rule::in(self::EXCHANGES)],
            'limit' => ['nullable', 'integer', 'min:1', 'max:1000'],
            'max_candles' => ['nullable', 'integer', 'min:1', 'max:20000'],
            'start' => ['nullable', 'integer', 'min:1'],
            'end' => ['nullable', 'integer', 'min:1'],
            'fresh' => ['nullable', 'boolean'],
        ]);

        $symbol = strtoupper($validated['symbol'] ?? 'BTCUSDT');
        $interval = (string) ($validated['interval'] ?? '60');
        $category = $validated['category'] ?? 'spot';
        $exchange = strtolower($validated['exchange'] ?? 'bybit');

        // per-request chunk size for Bybit
        $chunkLimit = (int) ($validated['limit'] ?? 1000);

        // total candles you want to return to frontend
        $maxCandles = (int) ($validated['max_candles'] ?? 5000);

        $start = $validated['start'] ?? null;
        $end = $validated['end'] ?? null;
        $fresh = filter_var($validated['fresh'] ?? false, FILTER_VALIDATE_BOOL);

        if ($start && $end && $start > $end) {
            return response()->json(['success' => false, 'message' => 'Start must not be later than end.'], 422);
        }

        if (!$this->supportsInterval($exchange, $category, $interval)) {
            return response()->json(['success' => false, 'message' => 'The selected timeframe is not supported by this exchange.'], 422);
        }

        $allowedCategories = ['spot', 'linear', 'inverse'];
        $allowedIntervals = ['1', '3', '5', '15', '30', '60', '120', '240', '360', '720', 'D', 'W', 'M'];

        if (!in_array($exchange, self::EXCHANGES, true)) {
            return response()->json([
                'success' => false,
                'message' => 'Invalid exchange',
            ], 422);
        }

        if (!in_array($category, $allowedCategories, true)) {
            return response()->json([
                'success' => false,
                'message' => 'Invalid category',
            ], 422);
        }

        if (!in_array($interval, $allowedIntervals, true)) {
            return response()->json([
                'success' => false,
                'message' => 'Invalid interval',
            ], 422);
        }

        // v2 stores the gzipped JSON body rather than the PHP array. Bumping the
        // version rather than reusing v1 keeps this rollout from reading legacy
        // array entries as compressed strings.
        $cacheKey = implode(':', [
            'market-klines-v2',
            $exchange,
            $category,
            $symbol,
            $interval,
            $chunkLimit,
            $maxCandles,
            $start ?: 'none',
            $end ?: 'latest',
            $fresh ? 'fresh' : 'cached',
        ]);

        if (!$fresh && is_string($cached = Cache::get($cacheKey)) && $cached !== '') {
            return $this->cachedKlineResponse($cached, $request);
        }

        try {
            $futuresFallbacks = $end
                ? ['bybit', 'okx', 'binance', 'bingx', 'mexc']
                : ['bingx', 'bybit', 'mexc', 'okx', 'binance'];
            $candidateExchanges = $category === 'spot'
                ? [$exchange]
                : array_slice(array_values(array_filter(array_unique([$exchange, ...$futuresFallbacks]), fn ($candidate) => $this->supportsInterval($candidate, $category, $interval))), 0, 2);
            $allRows = [];
            $usedExchange = $exchange;
            $usedRequests = 0;
            $fallbackErrors = [];
            $retryAfter = 0;

            foreach ($candidateExchanges as $candidateExchange) {
                $marketSymbol = MarketSymbol::query()
                    ->where('exchange', $candidateExchange)
                    ->where('category', $category)
                    ->where('symbol', $symbol)
                    ->first();
                $exchangeSymbol = $marketSymbol?->exchange_symbol ?: $this->inferExchangeSymbol($candidateExchange, $symbol, $category);
                $candidateRows = [];
                $seen = [];

                // if no end passed, let the exchange return its latest batch
                $currentEnd = $end ? (int) $end : null;

                // hard loop guard
                $maxRequests = $maxCandles > 5000
                    ? (int) config('market-data.replay_max_pages', 20)
                    : (int) config('market-data.normal_max_pages', 10);
                $requests = 0;

                if (!$start) {
                    // Both the normal (<=5000-candle) and Replay/eager (>5000-
                    // candle) loads share this strategy whenever there's no
                    // explicit $start boundary to respect exactly: fetch page 1
                    // synchronously to get a real anchor timestamp, then fire the
                    // remaining pages concurrently (ExchangeMarketDataGateway::
                    // pool()) instead of one at a time. This used to be normal-
                    // path-only — Replay's up-to-20000-candle load kept the old
                    // fully sequential loop on the reasoning that its deeper,
                    // potentially gappier history needed each page's real oldest
                    // timestamp to anchor the next request. In practice that meant
                    // every Replay symbol/timeframe switch paid for up to
                    // replay_max_pages (20) sequential exchange round-trips before
                    // showing anything — slow enough to trip the frontend's 60s
                    // failsafe on an unfamiliar symbol/exchange. Predicted page
                    // boundaries can still drift on gappy history, but that's
                    // already tolerated by the dedup-by-timestamp ($seen) and
                    // `partial` reporting below for the normal path — extending it
                    // to Replay accepts the same, already-proven tradeoff rather
                    // than introducing a new one. See fetchPooledKlinePages() /
                    // fetchAdditionalKlinePages() for why only page 1 needs to be
                    // synchronous.
                    $paged = $this->fetchPooledKlinePages(
                        $candidateExchange, $exchangeSymbol, $symbol, $category, $interval,
                        $chunkLimit, $currentEnd, $maxCandles, $maxRequests
                    );

                    $candidateRows = $paged['rows'];
                    $requests = $paged['requests'];

                    if ($paged['error'] !== null && empty($candidateRows)) {
                        $fallbackErrors[$candidateExchange] = $paged['error'];
                        if ($paged['retryAfter'] > 0) {
                            $retryAfter = max($retryAfter, $paged['retryAfter']);
                        }
                    }
                } else {
                    // Bounded start/end range query: keep the original adaptive
                    // sequential loop regardless of $maxCandles. The caller gave
                    // an explicit start boundary that must be respected exactly,
                    // not approximated from a predicted page grid, so each page's
                    // real oldest timestamp still anchors the next request here.
                    while (count($candidateRows) < $maxCandles && $requests < $maxRequests) {
                        $rowsResult = $this->fetchKlineRows(
                            $candidateExchange,
                            $exchangeSymbol,
                            $symbol,
                            $category,
                            $interval,
                            $chunkLimit,
                            $currentEnd,
                            $start ? (int) $start : null
                        );

                        if (!$rowsResult['success']) {
                            $fallbackErrors[$candidateExchange] = $rowsResult['payload']['message'] ?? 'Failed to fetch market data';
                            if (($rowsResult['status'] ?? 0) === 429) {
                                $retryAfter = max($retryAfter, (int) ($rowsResult['payload']['retry_after'] ?? 1));
                            }
                            break;
                        }

                        $rows = $rowsResult['rows'];

                        if (!is_array($rows) || empty($rows)) {
                            break;
                        }

                        foreach ($rows as $row) {
                            $ts = (int) ($row[0] ?? 0);
                            if ($ts <= 0) {
                                continue;
                            }

                            if (isset($seen[$ts])) {
                                continue;
                            }

                            $seen[$ts] = true;
                            $candidateRows[] = $row;
                        }

                        // move further back in time using oldest candle from this batch
                        $batchTimestamps = array_values(array_filter(
                            array_map(fn ($row) => (int) ($row[0] ?? 0), $rows),
                            fn ($timestamp) => $timestamp > 0
                        ));

                        if (!$batchTimestamps) {
                            break;
                        }

                        $oldestTs = min($batchTimestamps);
                        $nextEnd = $oldestTs - 1;

                        if ($start && $nextEnd < (int) $start) {
                            break;
                        }

                        if ($currentEnd !== null && $nextEnd >= $currentEnd) {
                            break;
                        }

                        $currentEnd = $nextEnd;
                        $requests++;
                    }
                }

                if (!empty($candidateRows)) {
                    $allRows = $candidateRows;
                    $usedExchange = $candidateExchange;
                    $usedRequests = $requests;
                    break;
                }

                $fallbackErrors[$candidateExchange] ??= 'No candle data returned';
            }

            // sort oldest -> newest
            usort($allRows, function ($a, $b) {
                return (int)$a[0] <=> (int)$b[0];
            });

            if (empty($allRows)) {
                $response = response()->json([
                    'success' => false,
                    'message' => $retryAfter > 0 ? 'Market data is temporarily rate limited.' : 'No candle data returned for this market and timeframe',
                    'exchange' => $exchange,
                    'category' => $category,
                    'symbol' => $symbol,
                    'fallbackErrors' => $fallbackErrors,
                    ...($retryAfter > 0 ? ['retry_after' => $retryAfter] : []),
                ], $retryAfter > 0 ? 429 : 502);
                if ($retryAfter > 0) $response->header('Retry-After', (string) $retryAfter);
                return $response;
            }

            // trim to latest maxCandles if needed
            if (count($allRows) > $maxCandles) {
                $allRows = array_slice($allRows, -$maxCandles);
            }

            $candles = array_map(function ($item) {
                return [
                    'time'   => ((int) $item[0]) / 1000,
                    'open'   => (float) $item[1],
                    'high'   => (float) $item[2],
                    'low'    => (float) $item[3],
                    'close'  => (float) $item[4],
                    'volume' => (float) $item[5],
                ];
            }, $allRows);

            $payload = [
                'success' => true,
                'exchange' => $usedExchange,
                'requested_exchange' => $exchange,
                'count' => count($candles),
                'candles' => $candles,
                'partial' => count($candles) < $maxCandles,
                'upstream_pages' => $usedRequests,
            ];

            $json = json_encode($payload);
            $compressed = $json === false ? false : gzencode($json, self::KLINE_CACHE_COMPRESSION_LEVEL);

            if ($compressed === false) {
                // json_encode/gzencode failing is not a reason to fail the
                // request — fall back to the uncompressed path and let the
                // CompressResponse middleware handle the wire encoding.
                return response()->json($payload);
            }

            if (!$fresh) {
                Cache::put($cacheKey, $compressed, now()->addSeconds($this->klineCacheSeconds($interval, $end !== null)));
            }

            return $this->cachedKlineResponse($compressed, $request);
        } catch (ExchangeRateLimitedException $e) {
            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
                'exchange' => $e->exchange,
                'retry_after' => $e->retryAfter,
            ], 429)->header('Retry-After', (string) $e->retryAfter);
        } catch (\Throwable $e) {
            return response()->json([
                'success' => false,
                'message' => 'Server error while fetching market data',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    /** @return array{url: string, query: array} */
    private function symbolsRequestSpec(string $exchange, string $category): array
    {
        return match ($exchange) {
            'binance' => [
                'url' => $category === 'spot'
                    ? 'https://api.binance.com/api/v3/exchangeInfo'
                    : 'https://fapi.binance.com/fapi/v1/exchangeInfo',
                'query' => [],
            ],
            'okx' => [
                'url' => 'https://www.okx.com/api/v5/public/instruments',
                'query' => ['instType' => $category === 'spot' ? 'SPOT' : 'SWAP'],
            ],
            'bingx' => [
                'url' => $category === 'spot'
                    ? 'https://open-api.bingx.com/openApi/spot/v1/common/symbols'
                    : 'https://open-api.bingx.com/openApi/swap/v2/quote/contracts',
                'query' => [],
            ],
            'mexc' => [
                'url' => $category === 'spot'
                    ? 'https://api.mexc.com/api/v3/exchangeInfo'
                    : 'https://contract.mexc.com/api/v1/contract/detail',
                'query' => [],
            ],
            default => [
                'url' => 'https://api.bybit.com/v5/market/instruments-info',
                'query' => ['category' => $category, ...($category !== 'spot' ? ['limit' => 1000] : [])],
            ],
        };
    }

    private function processSymbolsResponse(string $exchange, string $category, ?Response $response): array
    {
        if (!$response) {
            return ['symbols' => [], 'error' => 'No data available (rate-limited or upstream failure).'];
        }

        if (!$response->successful()) {
            return ['symbols' => [], 'error' => 'HTTP ' . $response->status()];
        }

        $json = $response->json();

        return [
            'symbols' => $this->normalizeAvailableSymbols($exchange, $category, is_array($json) ? $json : []),
            'error' => null,
        ];
    }

    private function fetchAvailableSymbolsForExchange(string $exchange, string $category): array
    {
        try {
            $spec = $this->symbolsRequestSpec($exchange, $category);
            $response = $this->marketGateway->get($exchange, 'symbols', $spec['url'], $spec['query'], 30);

            return $this->processSymbolsResponse($exchange, $category, $response);
        } catch (\Throwable $e) {
            return [
                'symbols' => [],
                'error' => $e->getMessage(),
            ];
        }
    }

    /**
     * Same as calling fetchAvailableSymbolsForExchange() once per exchange, but
     * fires every exchange's HTTP call concurrently via the gateway's pool()
     * instead of paying each exchange's round-trip one after another — OKX's
     * public instruments endpoint alone measured ~12s, which used to dominate
     * a cold-cache "all exchanges" load on top of four more sequential calls.
     *
     * @param list<string> $exchanges
     * @return array<string, array{symbols: array, error: ?string}>
     */
    private function fetchAvailableSymbolsForExchanges(array $exchanges, string $category): array
    {
        $requests = [];
        foreach ($exchanges as $exchange) {
            $spec = $this->symbolsRequestSpec($exchange, $category);
            $requests[] = [
                'exchange' => $exchange,
                'endpoint' => 'symbols',
                'url' => $spec['url'],
                'query' => $spec['query'],
                'cacheSeconds' => 30,
            ];
        }

        try {
            $responses = $this->marketGateway->pool($requests);
        } catch (\Throwable $e) {
            return array_fill_keys($exchanges, ['symbols' => [], 'error' => $e->getMessage()]);
        }

        $results = [];
        foreach ($exchanges as $index => $exchange) {
            $results[$exchange] = $this->processSymbolsResponse($exchange, $category, $responses[$index] ?? null);
        }

        return $results;
    }

    private function normalizeAvailableSymbols(string $exchange, string $category, array $json): array
    {
        $symbols = [];

        if ($exchange === 'binance') {
            foreach (($json['symbols'] ?? []) as $item) {
                $status = $item['status'] ?? null;

                if ($status && !in_array($status, ['TRADING'], true)) {
                    continue;
                }

                $symbols[] = $this->symbolPayload(
                    $exchange,
                    strtoupper((string) ($item['symbol'] ?? '')),
                    strtoupper((string) ($item['symbol'] ?? '')),
                    $category,
                    $item['baseAsset'] ?? null,
                    $item['quoteAsset'] ?? null,
                    $status
                );
            }
        }

        if ($exchange === 'bybit') {
            if (($json['retCode'] ?? null) !== 0) {
                return [];
            }

            foreach (($json['result']['list'] ?? []) as $item) {
                $symbols[] = $this->symbolPayload(
                    $exchange,
                    strtoupper((string) ($item['symbol'] ?? '')),
                    strtoupper((string) ($item['symbol'] ?? '')),
                    $category,
                    $item['baseCoin'] ?? null,
                    $item['quoteCoin'] ?? null,
                    $item['status'] ?? null
                );
            }
        }

        if ($exchange === 'okx') {
            foreach (($json['data'] ?? []) as $item) {
                $exchangeSymbol = strtoupper((string) ($item['instId'] ?? ''));
                $normalizedSymbol = strtoupper(str_replace('-', '', str_replace('-SWAP', '', $exchangeSymbol)));
                $symbols[] = $this->symbolPayload(
                    $exchange,
                    $normalizedSymbol,
                    $exchangeSymbol,
                    $category,
                    $item['baseCcy'] ?? null,
                    $item['quoteCcy'] ?? $item['settleCcy'] ?? null,
                    $item['state'] ?? null
                );
            }
        }

        if ($exchange === 'bingx') {
            $list = $category === 'spot'
                ? ($json['data']['symbols'] ?? $json['data'] ?? [])
                : ($json['data'] ?? []);

            foreach ($list as $item) {
                $rawSymbol = (string) ($item['symbol'] ?? $item['contract'] ?? '');
                $symbols[] = $this->symbolPayload(
                    $exchange,
                    strtoupper(str_replace(['-', '_'], '', $rawSymbol)),
                    strtoupper($rawSymbol),
                    $category,
                    $item['baseAsset'] ?? $item['baseCoin'] ?? null,
                    $item['quoteAsset'] ?? $item['quoteCoin'] ?? null,
                    $item['status'] ?? null
                );
            }
        }

        if ($exchange === 'mexc') {
            $list = $category === 'spot'
                ? ($json['symbols'] ?? [])
                : ($json['data'] ?? []);

            foreach ($list as $item) {
                $rawSymbol = (string) ($item['symbol'] ?? '');
                $normalizedSymbol = strtoupper(str_replace('_', '', $rawSymbol));
                $symbols[] = $this->symbolPayload(
                    $exchange,
                    $normalizedSymbol,
                    strtoupper($rawSymbol),
                    $category,
                    $item['baseAsset'] ?? $item['baseCoinName'] ?? null,
                    $item['quoteAsset'] ?? $item['quoteCoinName'] ?? $item['quoteCoin'] ?? null,
                    $item['status'] ?? null
                );
            }
        }

        return array_values(array_filter($symbols, fn ($item) => !empty($item['symbol'])));
    }

    private function symbolPayload(
        string $exchange,
        string $symbol,
        string $exchangeSymbol,
        string $category,
        ?string $baseCoin,
        ?string $quoteCoin,
        ?string $status
    ): array {
        $baseCoin = strtoupper((string) $baseCoin);
        $quoteCoin = strtoupper((string) $quoteCoin);

        return [
            'symbol' => $symbol,
            'exchange' => $exchange,
            'exchangeLabel' => strtoupper($exchange),
            'exchange_symbol' => $exchangeSymbol ?: $symbol,
            'category' => $category,
            'coin_name' => $baseCoin ?: $symbol,
            'baseCoin' => $baseCoin,
            'quoteCoin' => $quoteCoin,
            'status' => $status,
        ];
    }

    /**
     * Builds the exchange-specific URL/query/cache-TTL for one kline page,
     * without firing it — shared by fetchKlineRows() (single, synchronous
     * page) and klines()'s pooled multi-page fetch, so both stay in sync.
     */
    private function buildKlineRequest(
        string $exchange,
        string $exchangeSymbol,
        string $symbol,
        string $category,
        string $interval,
        int $limit,
        ?int $end,
        ?int $start
    ): array {
        $cacheSeconds = $end !== null
            ? (int) config('market-data.historical_request_cache_seconds', 86400)
            : ($limit <= 2
                ? (int) config('market-data.latest_cache_seconds', 5)
                : (int) config('market-data.request_cache_seconds', 30));

        [$url, $query] = match ($exchange) {
            'binance' => [
                $category === 'spot'
                    ? 'https://api.binance.com/api/v3/klines'
                    : 'https://fapi.binance.com/fapi/v1/klines',
                [
                    'symbol' => $symbol,
                    'interval' => $this->mapInterval($exchange, $interval, $category),
                    'limit' => min($limit, 1000),
                    ...($end ? ['endTime' => $end] : []),
                    ...($start ? ['startTime' => $start] : []),
                ],
            ],
            'okx' => [
                'https://www.okx.com/api/v5/market/history-candles',
                [
                    'instId' => $exchangeSymbol,
                    'bar' => $this->mapInterval($exchange, $interval, $category),
                    'limit' => min($limit, 300),
                    ...($end ? ['after' => $end] : []),
                ],
            ],
            'bingx' => [
                $category === 'spot'
                    ? 'https://open-api.bingx.com/openApi/spot/v1/market/kline'
                    : 'https://open-api.bingx.com/openApi/swap/v3/quote/klines',
                [
                    'symbol' => $exchangeSymbol,
                    'interval' => $this->mapInterval($exchange, $interval, $category),
                    'limit' => min($limit, 1000),
                    ...($end ? ['endTime' => $end] : []),
                    ...($start ? ['startTime' => $start] : []),
                ],
            ],
            'mexc' => $category === 'spot'
                ? [
                    'https://api.mexc.com/api/v3/klines',
                    [
                        'symbol' => $symbol,
                        'interval' => $this->mapInterval($exchange, $interval, $category),
                        'limit' => min($limit, 1000),
                        ...($end ? ['endTime' => $end] : []),
                        ...($start ? ['startTime' => $start] : []),
                    ],
                ]
                : [
                    'https://contract.mexc.com/api/v1/contract/kline/' . $exchangeSymbol,
                    [
                        'interval' => $this->mapInterval($exchange, $interval, $category),
                        ...($end ? ['end' => (int) floor($end / 1000)] : []),
                        ...($start ? ['start' => (int) floor($start / 1000)] : []),
                    ],
                ],
            default => [
                'https://api.bybit.com/v5/market/kline',
                [
                    'category' => $category,
                    'symbol' => $symbol,
                    'interval' => $interval,
                    'limit' => $limit,
                    ...($end ? ['end' => $end] : []),
                    ...($start ? ['start' => $start] : []),
                ],
            ],
        };

        return ['url' => $url, 'query' => $query, 'cacheSeconds' => $cacheSeconds];
    }

    /**
     * Turns a raw (or null/failed) Response from the gateway into the same
     * {success, status, payload, rows} shape fetchKlineRows() has always
     * returned. $response is null when pool() couldn't get any data for
     * this request (rate-limited/cooldown with no stale fallback).
     */
    private function normalizeKlineResponse(string $exchange, ?Response $response): array
    {
        if (!$response) {
            return [
                'success' => false,
                'status' => 503,
                'payload' => [
                    'success' => false,
                    'message' => 'Market data is temporarily unavailable.',
                    'exchange' => $exchange,
                ],
                'rows' => [],
            ];
        }

        if (!$response->successful()) {
            return [
                'success' => false,
                'status' => $response->status(),
                'payload' => [
                    'success' => false,
                    'message' => 'Failed to fetch market data',
                    'status' => $response->status(),
                    'body' => $response->body(),
                ],
                'rows' => [],
            ];
        }

        $json = $response->json();

        if (!is_array($json)) {
            return [
                'success' => false,
                'status' => 502,
                'payload' => [
                    'success' => false,
                    'message' => 'Exchange returned an invalid market data response',
                    'exchange' => $exchange,
                    'body' => substr($response->body(), 0, 500),
                ],
                'rows' => [],
            ];
        }

        return [
            'success' => true,
            'status' => 200,
            'payload' => [],
            'rows' => $this->normalizeKlineRows($exchange, $json),
        ];
    }

    private function fetchKlineRows(
        string $exchange,
        string $exchangeSymbol,
        string $symbol,
        string $category,
        string $interval,
        int $limit,
        ?int $end,
        ?int $start
    ): array {
        try {
            $built = $this->buildKlineRequest($exchange, $exchangeSymbol, $symbol, $category, $interval, $limit, $end, $start);
            $response = $this->marketGateway->get($exchange, 'klines', $built['url'], $built['query'], $built['cacheSeconds']);

            return $this->normalizeKlineResponse($exchange, $response);
        } catch (ExchangeRateLimitedException $e) {
            return [
                'success' => false,
                'status' => 429,
                'payload' => [
                    'success' => false,
                    'message' => $e->getMessage(),
                    'exchange' => $e->exchange,
                    'retry_after' => $e->retryAfter,
                ],
                'rows' => [],
            ];
        } catch (\Throwable $e) {
            return [
                'success' => false,
                'status' => 500,
                'payload' => [
                    'success' => false,
                    'message' => 'Server error while fetching market data',
                    'error' => $e->getMessage(),
                ],
                'rows' => [],
            ];
        }
    }

    /**
     * Fetches page 1 synchronously for a real anchor timestamp, then fetches
     * up to $maxRequests-1 further pages concurrently via
     * fetchAdditionalKlinePages() until $maxCandles rows are collected or the
     * page budget runs out. Shared by the normal (<=5000-candle) and Replay/
     * eager (>5000-candle) no-$start load shapes in klines() — the two only
     * ever differed in $maxCandles/$maxRequests, never in fetch strategy.
     *
     * @return array{rows: array, requests: int, error: ?string, retryAfter: int}
     */
    private function fetchPooledKlinePages(
        string $exchange,
        string $exchangeSymbol,
        string $symbol,
        string $category,
        string $interval,
        int $chunkLimit,
        ?int $currentEnd,
        int $maxCandles,
        int $maxRequests
    ): array {
        $candidateRows = [];
        $seen = [];
        $requests = 0;
        $error = null;
        $retryAfter = 0;

        $page1 = $this->fetchKlineRows($exchange, $exchangeSymbol, $symbol, $category, $interval, $chunkLimit, $currentEnd, null);

        if (!$page1['success']) {
            $error = $page1['payload']['message'] ?? 'Failed to fetch market data';
            if (($page1['status'] ?? 0) === 429) {
                $retryAfter = max($retryAfter, (int) ($page1['payload']['retry_after'] ?? 1));
            }

            return ['rows' => $candidateRows, 'requests' => $requests, 'error' => $error, 'retryAfter' => $retryAfter];
        }

        $requests = 1;

        foreach ($page1['rows'] as $row) {
            $ts = (int) ($row[0] ?? 0);
            if ($ts > 0 && !isset($seen[$ts])) {
                $seen[$ts] = true;
                $candidateRows[] = $row;
            }
        }

        $page1Timestamps = array_values(array_filter(
            array_map(fn ($row) => (int) ($row[0] ?? 0), $page1['rows']),
            fn ($timestamp) => $timestamp > 0
        ));

        if ($page1Timestamps && count($candidateRows) < $maxCandles) {
            $anchorEnd = min($page1Timestamps) - 1;
            $additionalPages = min($maxRequests - 1, (int) ceil(($maxCandles - count($candidateRows)) / $chunkLimit));

            if ($additionalPages > 0) {
                $pageResults = $this->fetchAdditionalKlinePages(
                    $exchange, $exchangeSymbol, $symbol, $category, $interval,
                    $chunkLimit, $anchorEnd, $additionalPages
                );

                foreach ($pageResults as $pageResult) {
                    $requests++;
                    if (!$pageResult['success']) {
                        continue;
                    }

                    foreach ($pageResult['rows'] as $row) {
                        $ts = (int) ($row[0] ?? 0);
                        if ($ts > 0 && !isset($seen[$ts])) {
                            $seen[$ts] = true;
                            $candidateRows[] = $row;
                        }
                    }
                }
            }
        }

        return ['rows' => $candidateRows, 'requests' => $requests, 'error' => $error, 'retryAfter' => $retryAfter];
    }

    /**
     * Fetches pages 2..N of one exchange's candle history concurrently
     * (Http::pool() under the hood via ExchangeMarketDataGateway::pool()),
     * instead of one at a time. Page 1 must already be fetched by the
     * caller (via fetchKlineRows(), see fetchPooledKlinePages()) so we have
     * a real anchor timestamp; pages 2..N's `end` boundaries are then
     * predicted from that anchor using the interval's fixed duration, since
     * — unlike page 1, whose start point is unknown until the exchange
     * responds — every subsequent page's window is just "one interval-grid
     * further back." Used by both the normal and Replay/eager load shapes;
     * only a bounded $start/$end range query keeps the original sequential
     * loop in klines() instead.
     */
    private function fetchAdditionalKlinePages(
        string $exchange,
        string $exchangeSymbol,
        string $symbol,
        string $category,
        string $interval,
        int $limit,
        int $anchorEndExclusive,
        int $pageCount
    ): array {
        $intervalMs = $this->intervalMilliseconds($interval);
        if ($pageCount < 1 || $intervalMs < 1) {
            return [];
        }

        $requests = [];
        for ($page = 0; $page < $pageCount; $page++) {
            $pageEnd = $anchorEndExclusive - ($page * $limit * $intervalMs);
            $built = $this->buildKlineRequest($exchange, $exchangeSymbol, $symbol, $category, $interval, $limit, $pageEnd, null);
            $requests[] = ['exchange' => $exchange, 'endpoint' => 'klines', ...$built];
        }

        $responses = $this->marketGateway->pool($requests);

        return array_map(fn (?Response $response) => $this->normalizeKlineResponse($exchange, $response), $responses);
    }

    private function intervalMilliseconds(string $interval): int
    {
        return match ($interval) {
            '1' => 60_000,
            '3' => 180_000,
            '5' => 300_000,
            '15' => 900_000,
            '30' => 1_800_000,
            '60' => 3_600_000,
            '120' => 7_200_000,
            '240' => 14_400_000,
            '360' => 21_600_000,
            '720' => 43_200_000,
            'D' => 86_400_000,
            'W' => 604_800_000,
            'M' => 2_592_000_000, // ~30 days — only used as a page-window hint, not exact math
            default => 0,
        };
    }

    private function normalizeKlineRows(string $exchange, array $json): array
    {
        $rows = match ($exchange) {
            'binance' => $json,
            'okx' => $json['data'] ?? [],
            'bingx' => $json['data'] ?? [],
            'mexc' => $json['data']['time'] ?? null ? $this->normalizeMexcContractRows($json['data']) : $json,
            default => $json['result']['list'] ?? [],
        };

        if (!is_array($rows)) {
            return [];
        }

        return array_values(array_filter(array_map(function ($row) use ($exchange) {
            if (!is_array($row)) {
                return null;
            }

            if (in_array($exchange, ['bingx', 'mexc'], true) && isset($row['time'])) {
                return [
                    (int) $row['time'] * ((int) $row['time'] < 100000000000 ? 1000 : 1),
                    $row['open'] ?? 0,
                    $row['high'] ?? 0,
                    $row['low'] ?? 0,
                    $row['close'] ?? 0,
                    $row['volume'] ?? 0,
                ];
            }

            return [
                (int) ($row[0] ?? 0),
                $row[1] ?? 0,
                $row[2] ?? 0,
                $row[3] ?? 0,
                $row[4] ?? 0,
                $row[5] ?? 0,
            ];
        }, $rows)));
    }

    private function normalizeMexcContractRows(array $data): array
    {
        $times = $data['time'] ?? [];

        return array_map(function ($index, $time) use ($data) {
            return [
                'time' => $time,
                'open' => $data['open'][$index] ?? 0,
                'high' => $data['high'][$index] ?? 0,
                'low' => $data['low'][$index] ?? 0,
                'close' => $data['close'][$index] ?? 0,
                'volume' => $data['vol'][$index] ?? $data['volume'][$index] ?? 0,
            ];
        }, array_keys($times), $times);
    }

    private function inferExchangeSymbol(string $exchange, string $symbol, string $category = 'spot'): string
    {
        if ($exchange === 'okx') {
            foreach (['USDT', 'USDC', 'BTC', 'ETH'] as $quote) {
                if (str_ends_with($symbol, $quote)) {
                    $baseSymbol = substr($symbol, 0, -strlen($quote)) . '-' . $quote;
                    return $category === 'spot' ? $baseSymbol : $baseSymbol . '-SWAP';
                }
            }
        }

        if ($exchange === 'bingx') {
            foreach (['USDT', 'USDC', 'BTC', 'ETH'] as $quote) {
                if (str_ends_with($symbol, $quote)) {
                    return substr($symbol, 0, -strlen($quote)) . '-' . $quote;
                }
            }
        }

        if ($exchange === 'mexc') {
            foreach (['USDT', 'USDC', 'BTC', 'ETH'] as $quote) {
                if (str_ends_with($symbol, $quote)) {
                    return substr($symbol, 0, -strlen($quote)) . '_' . $quote;
                }
            }
        }

        return $symbol;
    }

    private function supportsInterval(string $exchange, string $category, string $interval): bool
    {
        if ($exchange !== 'mexc') return true;

        return in_array($interval, ['1', '5', '15', '30', '60', '240', 'D', 'W', 'M'], true);
    }

    private function mapInterval(string $exchange, string $interval, string $category = 'spot'): string
    {
        $minutes = [
            '1' => '1m',
            '3' => '3m',
            '5' => '5m',
            '15' => '15m',
            '30' => '30m',
            '60' => '1h',
            '120' => '2h',
            '240' => '4h',
            '360' => '6h',
            '720' => '12h',
            'D' => '1d',
            'W' => '1w',
            'M' => '1M',
        ];

        if ($exchange === 'okx') {
            return [
                '60' => '1H',
                '120' => '2H',
                '240' => '4H',
                '360' => '6H',
                '720' => '12H',
                'D' => '1D',
                'W' => '1W',
                'M' => '1M',
            ][$interval] ?? ($minutes[$interval] ?? $interval);
        }

        if ($exchange === 'mexc') {
            if ($category === 'spot') return $minutes[$interval] ?? $interval;

            return [
                '1' => 'Min1',
                '5' => 'Min5',
                '15' => 'Min15',
                '30' => 'Min30',
                '60' => 'Min60',
                '240' => 'Hour4',
                'D' => 'Day1',
                'W' => 'Week1',
                'M' => 'Month1',
            ][$interval] ?? ($minutes[$interval] ?? $interval);
        }

        return $minutes[$interval] ?? $interval;
    }

    /**
     * Serve an already-gzipped kline body.
     *
     * Kline payloads are cached compressed (see klines()), so the common warm
     * path hands the stored bytes straight to the client and skips both the
     * json_encode and the gzencode entirely — measured at ~25ms and ~7.5ms
     * respectively on a 5000-candle payload, on every single cache hit before
     * this. Setting Content-Encoding here also makes CompressResponse skip the
     * response rather than compressing it a second time.
     *
     * A client that did not advertise gzip (curl without --compressed, an
     * older HTTP client) gets the body inflated back; this is the rare path,
     * since browsers always send Accept-Encoding.
     */
    private function cachedKlineResponse(string $compressed, Request $request)
    {
        $acceptsGzip = str_contains(
            strtolower($request->headers->get('Accept-Encoding', '')),
            'gzip'
        );

        if ($acceptsGzip) {
            return response($compressed, 200, [
                'Content-Type' => 'application/json',
                'Content-Encoding' => 'gzip',
                'Vary' => 'Accept-Encoding',
            ]);
        }

        $json = gzdecode($compressed);

        if ($json === false) {
            return response()->json([
                'success' => false,
                'message' => 'Cached market data could not be read. Please try again.',
            ], 500);
        }

        return response($json, 200, [
            'Content-Type' => 'application/json',
            'Vary' => 'Accept-Encoding',
        ]);
    }

    private function klineCacheSeconds(string $interval, bool $isHistorical): int
    {
        if ($isHistorical) {
            return 3600;
        }

        // This is a replay/practice tool, not a live-trading terminal, so a few
        // extra seconds/minutes of staleness is an acceptable trade for far
        // fewer cache misses (each miss re-pages the exchange from scratch,
        // see klines()'s pagination loop above).
        return match ($interval) {
            '1', '3' => 30,
            '5', '15', '30' => 60,
            '60', '120', '240', '360', '720' => 180,
            default => 900,
        };
    }
}

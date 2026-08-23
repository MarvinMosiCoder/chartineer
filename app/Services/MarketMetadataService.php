<?php

namespace App\Services;

use App\Models\MarketSymbol;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Client\Pool;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use RuntimeException;
use Throwable;

class MarketMetadataService
{
    private ExchangeMarketDataGateway $marketGateway;

    public function __construct(?ExchangeMarketDataGateway $marketGateway = null)
    {
        $this->marketGateway = $marketGateway ?? app(ExchangeMarketDataGateway::class);
    }

    public function get(string $exchange, string $category, string $symbol): array
    {
        $exchange = strtolower($exchange);
        $category = strtolower($category);
        $symbol = strtoupper($symbol);
        $saved = $this->resolveSavedMarket($exchange, $category, $symbol);
        $native = $saved?->exchange_symbol ?: $this->inferNativeSymbol($exchange, $category, $symbol);
        [$base, $quote] = $this->marketCoins($saved, $symbol);
        $warnings = [];

        try {
            $exchangeData = Cache::remember(
                "market-metadata:exchange:v1:{$exchange}:{$category}:{$native}",
                now()->addSeconds(10),
                fn () => $this->fetchExchangeStats($exchange, $category, $native)
            );
            $exchangeAvailable = true;
        } catch (Throwable $exception) {
            report($exception);
            $exchangeData = $this->emptyStats();
            $exchangeAvailable = false;
            $warnings[] = 'Exchange statistics are temporarily unavailable.';
        }

        $fundamentals = null;
        $fundamentalsSource = null;
        $coinMarketCapKey = trim((string) config('services.coinmarketcap.api_key'));
        if ($base !== '' && $coinMarketCapKey !== '') {
            try {
                $fundamentals = $this->coinMarketCapFundamentals($base);
                if (!$fundamentals) $warnings[] = 'No exact CoinMarketCap match was found for this asset.';
                else $fundamentalsSource = 'coinmarketcap';
            } catch (Throwable $exception) {
                report($exception);
                $warnings[] = 'CoinMarketCap fundamentals are temporarily unavailable.';
            }
        }

        $coinGeckoKey = trim((string) config('services.coingecko.api_key'));
        if ($base !== '' && !$fundamentals && $coinGeckoKey !== '') {
            try {
                $fundamentals = $this->coinGeckoFundamentals($base);
                if (!$fundamentals) $warnings[] = 'No exact CoinGecko fallback match was found for this asset.';
                else $fundamentalsSource = 'coingecko';
            } catch (Throwable $exception) {
                report($exception);
                $warnings[] = 'CoinGecko fallback fundamentals are temporarily unavailable.';
            }
        }

        if ($base !== '' && $coinMarketCapKey === '' && $coinGeckoKey === '') {
            $warnings[] = 'Coin fundamentals providers are not configured; exchange statistics are still available.';
        }

        return [
            'market' => [
                'exchange' => $exchange,
                'category' => $category,
                'symbol' => $symbol,
                'native_symbol' => $native,
                'base_coin' => $base,
                'quote_coin' => $quote,
                'status' => $saved?->is_active === false ? 'inactive' : 'active',
            ],
            'stats' => $exchangeData,
            'fundamentals' => $fundamentals,
            'sources' => array_values(array_filter([$exchangeAvailable ? $exchange : null, $fundamentalsSource])),
            'warnings' => $warnings,
            'updated_at' => now()->toIso8601String(),
        ];
    }

    /**
     * Batched counterpart to get(), used by MarketDataController::metadataBatch().
     * A plain per-market ->map() over get() was fully sequential — one market's
     * exchange ticker (up to 3 calls for a futures market) and fundamentals
     * lookup finished before the next market's even started. For a batch of up
     * to 40 markets across several exchanges, that could genuinely add up past
     * PHP's execution-time ceiling (observed live: a "Maximum execution time of
     * 60 seconds exceeded" fatal), and — since the local dev server is a single
     * PHP worker — blocked every other request (including candle fetches) on
     * the same process for the same span. This fires every exchange-stats and
     * fundamentals HTTP call the whole batch needs in a small number of pooled
     * bursts instead: one pooled batch for exchange stats, plus up to two more
     * for fundamentals resolution, regardless of how many markets are in it.
     *
     * @param list<array{exchange: string, category: string, symbol: string}> $markets
     */
    public function getBatch(array $markets): array
    {
        $prepared = array_values(array_map(function (array $market) {
            $exchange = strtolower($market['exchange']);
            $category = strtolower($market['category']);
            $symbol = strtoupper($market['symbol']);
            $saved = $this->resolveSavedMarket($exchange, $category, $symbol);
            $native = $saved?->exchange_symbol ?: $this->inferNativeSymbol($exchange, $category, $symbol);
            [$base, $quote] = $this->marketCoins($saved, $symbol);

            return [
                'exchange' => $exchange, 'category' => $category, 'symbol' => $symbol,
                'saved' => $saved, 'native' => $native, 'base' => $base, 'quote' => $quote,
                'warnings' => [],
            ];
        }, $markets));

        [$exchangeData, $exchangeAvailable, $prepared] = $this->batchExchangeStats($prepared);
        [$fundamentals, $fundamentalsSource, $prepared] = $this->batchFundamentals($prepared);

        $coinMarketCapKey = trim((string) config('services.coinmarketcap.api_key'));
        $coinGeckoKey = trim((string) config('services.coingecko.api_key'));

        return array_map(function (array $p, int $i) use ($exchangeData, $exchangeAvailable, $fundamentals, $fundamentalsSource, $coinMarketCapKey, $coinGeckoKey) {
            $warnings = $p['warnings'];
            if ($p['base'] !== '' && $coinMarketCapKey === '' && $coinGeckoKey === '') {
                $warnings[] = 'Coin fundamentals providers are not configured; exchange statistics are still available.';
            }

            return [
                'market' => [
                    'exchange' => $p['exchange'],
                    'category' => $p['category'],
                    'symbol' => $p['symbol'],
                    'native_symbol' => $p['native'],
                    'base_coin' => $p['base'],
                    'quote_coin' => $p['quote'],
                    'status' => $p['saved']?->is_active === false ? 'inactive' : 'active',
                ],
                'stats' => $exchangeData[$i],
                'fundamentals' => $fundamentals[$i],
                'sources' => array_values(array_filter([$exchangeAvailable[$i] ? $p['exchange'] : null, $fundamentalsSource[$i]])),
                'warnings' => $warnings,
                'updated_at' => now()->toIso8601String(),
            ];
        }, $prepared, array_keys($prepared));
    }

    /**
     * Cache-first, then one pooled HTTP burst for whichever markets in the
     * batch don't already have fresh (10s) exchange stats cached.
     *
     * @return array{0: array<int, array>, 1: array<int, bool>, 2: list<array>} [statsByIndex, availableByIndex, $prepared (warnings appended)]
     */
    private function batchExchangeStats(array $prepared): array
    {
        $exchangeData = [];
        $exchangeAvailable = [];
        $pending = [];

        foreach ($prepared as $i => $p) {
            $cacheKey = "market-metadata:exchange:v1:{$p['exchange']}:{$p['category']}:{$p['native']}";
            $cached = Cache::get($cacheKey);
            if ($cached !== null) {
                $exchangeData[$i] = $cached;
                $exchangeAvailable[$i] = true;
                continue;
            }

            try {
                foreach ($this->statsRequests($p['exchange'], $p['category'], $p['native']) as $request) {
                    $pending[] = ['marketIndex' => $i] + $request;
                }
            } catch (Throwable $exception) {
                report($exception);
                $exchangeData[$i] = $this->emptyStats();
                $exchangeAvailable[$i] = false;
                $prepared[$i]['warnings'][] = 'Exchange statistics are temporarily unavailable.';
            }
        }

        if ($pending) {
            $responses = $this->marketGateway->pool(array_map(fn ($request) => [
                'exchange' => $request['exchange'],
                'endpoint' => $request['endpoint'],
                'url' => $request['url'],
                'query' => $request['query'],
                'cacheSeconds' => $request['cacheSeconds'],
            ], $pending));

            $byMarket = [];
            foreach ($pending as $index => $request) {
                $byMarket[$request['marketIndex']][$request['tag']] = $responses[$index] ?? null;
            }

            foreach ($byMarket as $i => $tagged) {
                $p = $prepared[$i];
                try {
                    $stats = $this->statsAssemble($p['exchange'], $p['category'], $tagged);
                    $exchangeData[$i] = $stats;
                    $exchangeAvailable[$i] = true;
                    Cache::put(
                        "market-metadata:exchange:v1:{$p['exchange']}:{$p['category']}:{$p['native']}",
                        $stats,
                        now()->addSeconds(10)
                    );
                } catch (Throwable $exception) {
                    report($exception);
                    $exchangeData[$i] = $this->emptyStats();
                    $exchangeAvailable[$i] = false;
                    $prepared[$i]['warnings'][] = 'Exchange statistics are temporarily unavailable.';
                }
            }
        }

        foreach ($prepared as $i => $p) {
            if (!array_key_exists($i, $exchangeData)) {
                $exchangeData[$i] = $this->emptyStats();
                $exchangeAvailable[$i] = false;
            }
        }

        return [$exchangeData, $exchangeAvailable, $prepared];
    }

    /**
     * @return array{0: array<int, ?array>, 1: array<int, ?string>, 2: list<array>} [fundamentalsByIndex, sourceByIndex, $prepared (warnings appended)]
     */
    private function batchFundamentals(array $prepared): array
    {
        $fundamentals = array_fill_keys(array_keys($prepared), null);
        $fundamentalsSource = array_fill_keys(array_keys($prepared), null);

        $coinMarketCapKey = trim((string) config('services.coinmarketcap.api_key'));
        $coinGeckoKey = trim((string) config('services.coingecko.api_key'));

        $eligible = array_values(array_filter(array_keys($prepared), fn ($i) => $prepared[$i]['base'] !== ''));
        if (!$eligible) {
            return [$fundamentals, $fundamentalsSource, $prepared];
        }

        if ($coinMarketCapKey !== '') {
            $resolved = $this->batchCoinMarketCap(array_map(fn ($i) => $prepared[$i]['base'], $eligible));
            foreach ($eligible as $i) {
                $found = $resolved[$prepared[$i]['base']] ?? null;
                if ($found) {
                    $fundamentals[$i] = $found;
                    $fundamentalsSource[$i] = 'coinmarketcap';
                } else {
                    $prepared[$i]['warnings'][] = 'No exact CoinMarketCap match was found for this asset.';
                }
            }
        }

        if ($coinGeckoKey !== '') {
            $stillNeeded = array_values(array_filter($eligible, fn ($i) => !$fundamentals[$i]));
            if ($stillNeeded) {
                $resolved = $this->batchCoinGecko(array_map(fn ($i) => $prepared[$i]['base'], $stillNeeded));
                foreach ($stillNeeded as $i) {
                    $found = $resolved[$prepared[$i]['base']] ?? null;
                    if ($found) {
                        $fundamentals[$i] = $found;
                        $fundamentalsSource[$i] = 'coingecko';
                    } else {
                        $prepared[$i]['warnings'][] = 'No exact CoinGecko fallback match was found for this asset.';
                    }
                }
            }
        }

        return [$fundamentals, $fundamentalsSource, $prepared];
    }

    /**
     * @param list<string> $bases
     * @return array<string, ?array> fundamentals keyed by base coin symbol
     */
    private function batchCoinMarketCap(array $bases): array
    {
        $bases = array_values(array_unique($bases));
        $result = array_fill_keys($bases, null);

        $coinIds = [];
        $needMap = [];
        foreach ($bases as $base) {
            $cached = Cache::get("market-metadata:coinmarketcap-map:v1:{$base}");
            if ($cached !== null) {
                $coinIds[$base] = $cached ?: null;
            } else {
                $needMap[] = $base;
            }
        }

        if ($needMap) {
            $mapResponses = Http::pool(function (Pool $pool) use ($needMap) {
                $calls = [];
                foreach ($needMap as $base) {
                    $calls[$base] = $this->cmcPoolRequest($pool, $base)
                        ->get('/v1/cryptocurrency/map', ['symbol' => $base, 'listing_status' => 'active']);
                }
                return $calls;
            });

            // A base with real candidate ids needs one more pooled call (ranked
            // by cmc_rank) to pick the right one among possible homonyms — the
            // exact two-hop shape the single-lookup path already uses.
            $candidateIdsByBase = [];
            foreach ($needMap as $base) {
                $response = $mapResponses[$base] ?? null;
                if (!$response instanceof Response || !$response->successful()) continue;
                $coins = $response->json('data') ?? [];
                if (!is_array($coins)) continue;
                $ids = array_values(array_filter(array_map(
                    fn ($coin) => strtoupper((string) ($coin['symbol'] ?? '')) === $base ? ($coin['id'] ?? null) : null,
                    $coins
                ), fn ($id) => is_numeric($id)));
                if ($ids) $candidateIdsByBase[$base] = $ids;
            }

            if ($candidateIdsByBase) {
                $rankResponses = Http::pool(function (Pool $pool) use ($candidateIdsByBase) {
                    $calls = [];
                    foreach ($candidateIdsByBase as $base => $ids) {
                        $calls[$base] = $this->cmcPoolRequest($pool, $base)
                            ->get('/v2/cryptocurrency/quotes/latest', ['id' => implode(',', $ids), 'convert' => 'USD']);
                    }
                    return $calls;
                });

                foreach ($candidateIdsByBase as $base => $ids) {
                    $response = $rankResponses[$base] ?? null;
                    $coinId = '';
                    if ($response instanceof Response && $response->successful()) {
                        $quotes = $response->json('data') ?? [];
                        if (is_array($quotes)) {
                            $matches = array_values(array_filter($quotes, fn ($coin) => is_array($coin) && strtoupper((string) ($coin['symbol'] ?? '')) === $base));
                            usort($matches, fn ($a, $b) => ($a['cmc_rank'] ?? PHP_INT_MAX) <=> ($b['cmc_rank'] ?? PHP_INT_MAX));
                            $coinId = $matches[0]['id'] ?? '';
                        }
                    }
                    $coinIds[$base] = $coinId ?: null;
                    Cache::put("market-metadata:coinmarketcap-map:v1:{$base}", $coinId, now()->addDay());
                }
            }

            foreach ($needMap as $base) {
                if (!array_key_exists($base, $coinIds)) {
                    $coinIds[$base] = null;
                    Cache::put("market-metadata:coinmarketcap-map:v1:{$base}", '', now()->addDay());
                }
            }
        }

        $resolvedBases = array_filter($coinIds, fn ($id) => $id !== null);
        if (!$resolvedBases) return $result;

        $coinIdToBases = [];
        foreach ($resolvedBases as $base => $coinId) $coinIdToBases[$coinId][] = $base;

        $quotes = [];
        $needQuote = [];
        $infos = [];
        $needInfo = [];
        foreach (array_keys($coinIdToBases) as $coinId) {
            $cachedQuote = Cache::get("market-metadata:coinmarketcap-quote:v1:{$coinId}");
            if ($cachedQuote !== null) $quotes[$coinId] = $cachedQuote; else $needQuote[] = $coinId;

            $cachedInfo = Cache::get("market-metadata:coinmarketcap-info:v1:{$coinId}");
            if ($cachedInfo !== null) $infos[$coinId] = $cachedInfo; else $needInfo[] = $coinId;
        }

        if ($needQuote || $needInfo) {
            $responses = Http::pool(function (Pool $pool) use ($needQuote, $needInfo) {
                $calls = [];
                foreach ($needQuote as $coinId) {
                    $calls["quote:{$coinId}"] = $this->cmcPoolRequest($pool, "quote:{$coinId}")
                        ->get('/v2/cryptocurrency/quotes/latest', ['id' => $coinId, 'convert' => 'USD']);
                }
                foreach ($needInfo as $coinId) {
                    $calls["info:{$coinId}"] = $this->cmcPoolRequest($pool, "info:{$coinId}")
                        ->get('/v2/cryptocurrency/info', ['id' => $coinId]);
                }
                return $calls;
            });

            foreach ($needQuote as $coinId) {
                $response = $responses["quote:{$coinId}"] ?? null;
                $data = ($response instanceof Response && $response->successful())
                    ? data_get($response->json(), "data.{$coinId}")
                    : null;
                $quotes[$coinId] = $data;
                Cache::put("market-metadata:coinmarketcap-quote:v1:{$coinId}", $data, now()->addMinutes(5));
            }
            foreach ($needInfo as $coinId) {
                $response = $responses["info:{$coinId}"] ?? null;
                $data = ($response instanceof Response && $response->successful())
                    ? data_get($response->json(), "data.{$coinId}", [])
                    : [];
                $infos[$coinId] = $data;
                Cache::put("market-metadata:coinmarketcap-info:v1:{$coinId}", $data, now()->addDay());
            }
        }

        foreach ($coinIdToBases as $coinId => $basesForCoin) {
            $fundamentals = $this->assembleCoinMarketCapFundamentals($quotes[$coinId] ?? null, $infos[$coinId] ?? [], $coinId);
            foreach ($basesForCoin as $base) $result[$base] = $fundamentals;
        }

        return $result;
    }

    /**
     * @param list<string> $bases
     * @return array<string, ?array> fundamentals keyed by base coin symbol
     */
    private function batchCoinGecko(array $bases): array
    {
        $bases = array_values(array_unique($bases));
        $result = array_fill_keys($bases, null);

        $coinIds = [];
        $needSearch = [];
        foreach ($bases as $base) {
            $cached = Cache::get("market-metadata:coingecko-map:v1:{$base}");
            if ($cached !== null) {
                $coinIds[$base] = $cached ?: null;
            } else {
                $needSearch[] = $base;
            }
        }

        if ($needSearch) {
            $responses = Http::pool(function (Pool $pool) use ($needSearch) {
                $calls = [];
                foreach ($needSearch as $base) {
                    $calls[$base] = $this->coinGeckoPoolRequest($pool, $base)->get('/search', ['query' => $base]);
                }
                return $calls;
            });

            foreach ($needSearch as $base) {
                $response = $responses[$base] ?? null;
                $coinId = '';
                if ($response instanceof Response && $response->successful()) {
                    $coins = $response->json('coins') ?? [];
                    if (is_array($coins)) {
                        $matches = array_values(array_filter($coins, fn ($coin) => strtoupper((string) ($coin['symbol'] ?? '')) === $base));
                        usort($matches, fn ($a, $b) => ($a['market_cap_rank'] ?? PHP_INT_MAX) <=> ($b['market_cap_rank'] ?? PHP_INT_MAX));
                        $coinId = $matches[0]['id'] ?? '';
                    }
                }
                $coinIds[$base] = $coinId ?: null;
                Cache::put("market-metadata:coingecko-map:v1:{$base}", $coinId, now()->addDay());
            }
        }

        $resolvedBases = array_filter($coinIds, fn ($id) => $id !== null);
        if (!$resolvedBases) return $result;

        $coinIdToBases = [];
        foreach ($resolvedBases as $base => $coinId) $coinIdToBases[$coinId][] = $base;

        $marketData = [];
        $needMarkets = [];
        foreach (array_keys($coinIdToBases) as $coinId) {
            $cached = Cache::get("market-metadata:coingecko:v1:{$coinId}");
            if ($cached !== null) { $marketData[$coinId] = $cached; continue; }
            $needMarkets[] = $coinId;
        }

        if ($needMarkets) {
            // Unlike CoinMarketCap, CoinGecko's /coins/markets natively accepts
            // a comma-separated ids list, so every still-uncached coin in this
            // batch is fetched in one plain call rather than one pooled request
            // per coin.
            $response = $this->coinGecko()->get('/coins/markets', [
                'vs_currency' => 'usd',
                'ids' => implode(',', $needMarkets),
                'price_change_percentage' => '24h',
            ]);

            $byId = [];
            if ($response->successful()) {
                foreach ((array) $response->json() as $coin) {
                    if (is_array($coin) && isset($coin['id'])) $byId[$coin['id']] = $coin;
                }
            }

            foreach ($needMarkets as $coinId) {
                $coin = $byId[$coinId] ?? null;
                $marketData[$coinId] = $coin;
                Cache::put("market-metadata:coingecko:v1:{$coinId}", $coin, now()->addMinutes(5));
            }
        }

        foreach ($coinIdToBases as $coinId => $basesForCoin) {
            $coin = $marketData[$coinId] ?? null;
            if (!is_array($coin)) continue;
            $fundamentals = $this->assembleCoinGeckoFundamentals($coin);
            foreach ($basesForCoin as $base) $result[$base] = $fundamentals;
        }

        return $result;
    }

    private function fetchExchangeStats(string $exchange, string $category, string $native): array
    {
        $responses = [];
        foreach ($this->statsRequests($exchange, $category, $native) as $request) {
            $responses[$request['tag']] = $this->marketGateway->get(
                $request['exchange'], $request['endpoint'], $request['url'], $request['query'], $request['cacheSeconds']
            );
        }

        return $this->statsAssemble($exchange, $category, $responses);
    }

    /**
     * @return list<array{tag: string, exchange: string, endpoint: string, url: string, query: array, cacheSeconds: int}>
     */
    private function statsRequests(string $exchange, string $category, string $native): array
    {
        return match ($exchange) {
            'binance' => $this->binanceStatsRequests($category, $native),
            'bybit' => $this->bybitStatsRequests($category, $native),
            'okx' => $this->okxStatsRequests($category, $native),
            'bingx' => $this->bingxStatsRequests($category, $native),
            'mexc' => $this->mexcStatsRequests($category, $native),
            default => throw new RuntimeException("Unsupported metadata exchange: {$exchange}"),
        };
    }

    /**
     * @param array<string, ?Response> $responses keyed by the tag from statsRequests()
     */
    private function statsAssemble(string $exchange, string $category, array $responses): array
    {
        return match ($exchange) {
            'binance' => $this->binanceStatsAssemble($category, $responses),
            'bybit' => $this->bybitStatsAssemble($responses),
            'okx' => $this->okxStatsAssemble($category, $responses),
            'bingx' => $this->bingxStatsAssemble($responses),
            'mexc' => $this->mexcStatsAssemble($category, $responses),
            default => throw new RuntimeException("Unsupported metadata exchange: {$exchange}"),
        };
    }

    private function binanceStatsRequests(string $category, string $native): array
    {
        $futures = $category !== 'spot';
        $base = $futures ? 'https://fapi.binance.com' : 'https://api.binance.com';
        $requests = [[
            'tag' => 'ticker', 'exchange' => 'binance', 'endpoint' => 'ticker',
            'url' => $base.($futures ? '/fapi/v1/ticker/24hr' : '/api/v3/ticker/24hr'),
            'query' => ['symbol' => $native], 'cacheSeconds' => 10,
        ]];

        if ($futures) {
            $requests[] = ['tag' => 'premium', 'exchange' => 'binance', 'endpoint' => 'premium-index', 'url' => $base.'/fapi/v1/premiumIndex', 'query' => ['symbol' => $native], 'cacheSeconds' => 10];
            $requests[] = ['tag' => 'interest', 'exchange' => 'binance', 'endpoint' => 'open-interest', 'url' => $base.'/fapi/v1/openInterest', 'query' => ['symbol' => $native], 'cacheSeconds' => 10];
        }

        return $requests;
    }

    private function binanceStatsAssemble(string $category, array $responses): array
    {
        $futures = $category !== 'spot';
        $tickerResponse = $responses['ticker'] ?? null;
        if (!$tickerResponse instanceof Response || !$tickerResponse->successful()) {
            throw new RuntimeException('Binance ticker request failed.');
        }
        $ticker = $tickerResponse->json();

        $extra = [];
        if ($futures) {
            $premium = $responses['premium'] ?? null;
            $interest = $responses['interest'] ?? null;
            if ($premium instanceof Response && $premium->successful()) $extra = array_merge($extra, $premium->json());
            if ($interest instanceof Response && $interest->successful()) $extra = array_merge($extra, $interest->json());
        }

        return $this->stats([
            'last_price' => $ticker['lastPrice'] ?? null,
            'change_24h_percent' => $ticker['priceChangePercent'] ?? null,
            'high_24h' => $ticker['highPrice'] ?? null,
            'low_24h' => $ticker['lowPrice'] ?? null,
            'volume_24h' => $ticker['volume'] ?? null,
            'turnover_24h' => $ticker['quoteVolume'] ?? null,
            'bid_price' => $ticker['bidPrice'] ?? null,
            'ask_price' => $ticker['askPrice'] ?? null,
            'mark_price' => $extra['markPrice'] ?? null,
            'index_price' => $extra['indexPrice'] ?? null,
            'funding_rate' => $extra['lastFundingRate'] ?? null,
            'next_funding_time' => $extra['nextFundingTime'] ?? null,
            'open_interest' => $extra['openInterest'] ?? null,
        ]);
    }

    private function bybitStatsRequests(string $category, string $native): array
    {
        return [[
            'tag' => 'ticker', 'exchange' => 'bybit', 'endpoint' => 'ticker',
            'url' => 'https://api.bybit.com/v5/market/tickers',
            'query' => ['category' => $category === 'spot' ? 'spot' : $category, 'symbol' => $native],
            'cacheSeconds' => 10,
        ]];
    }

    private function bybitStatsAssemble(array $responses): array
    {
        $response = $responses['ticker'] ?? null;
        if (!$response instanceof Response || !$response->successful()) {
            throw new RuntimeException('Bybit ticker request failed.');
        }
        $ticker = $response->json('result.list.0') ?? [];

        return $this->stats([
            'last_price' => $ticker['lastPrice'] ?? null,
            'change_24h_percent' => isset($ticker['price24hPcnt']) ? ((float) $ticker['price24hPcnt'] * 100) : null,
            'high_24h' => $ticker['highPrice24h'] ?? null,
            'low_24h' => $ticker['lowPrice24h'] ?? null,
            'volume_24h' => $ticker['volume24h'] ?? null,
            'turnover_24h' => $ticker['turnover24h'] ?? null,
            'bid_price' => $ticker['bid1Price'] ?? null,
            'ask_price' => $ticker['ask1Price'] ?? null,
            'mark_price' => $ticker['markPrice'] ?? null,
            'index_price' => $ticker['indexPrice'] ?? null,
            'funding_rate' => $ticker['fundingRate'] ?? null,
            'next_funding_time' => $ticker['nextFundingTime'] ?? null,
            'open_interest' => $ticker['openInterest'] ?? null,
        ]);
    }

    private function okxStatsRequests(string $category, string $native): array
    {
        $requests = [[
            'tag' => 'ticker', 'exchange' => 'okx', 'endpoint' => 'ticker',
            'url' => 'https://www.okx.com/api/v5/market/ticker', 'query' => ['instId' => $native], 'cacheSeconds' => 10,
        ]];

        if ($category !== 'spot') {
            $requests[] = ['tag' => 'mark', 'exchange' => 'okx', 'endpoint' => 'derivative-metadata', 'url' => 'https://www.okx.com/api/v5/public/mark-price', 'query' => ['instType' => 'SWAP', 'instId' => $native], 'cacheSeconds' => 10];
            $requests[] = ['tag' => 'funding', 'exchange' => 'okx', 'endpoint' => 'derivative-metadata', 'url' => 'https://www.okx.com/api/v5/public/funding-rate', 'query' => ['instId' => $native], 'cacheSeconds' => 10];
            $requests[] = ['tag' => 'oi', 'exchange' => 'okx', 'endpoint' => 'derivative-metadata', 'url' => 'https://www.okx.com/api/v5/public/open-interest', 'query' => ['instType' => 'SWAP', 'instId' => $native], 'cacheSeconds' => 10];
        }

        return $requests;
    }

    private function okxStatsAssemble(string $category, array $responses): array
    {
        $tickerResponse = $responses['ticker'] ?? null;
        if (!$tickerResponse instanceof Response || !$tickerResponse->successful()) {
            throw new RuntimeException('OKX ticker request failed.');
        }
        $ticker = $tickerResponse->json('data.0') ?? [];
        $last = $this->number($ticker['last'] ?? null);
        $open = $this->number($ticker['open24h'] ?? null);
        $change = $last !== null && $open && $open != 0 ? (($last - $open) / $open) * 100 : null;

        $extra = [];
        if ($category !== 'spot') {
            $mark = $responses['mark'] ?? null;
            if ($mark instanceof Response && $mark->successful()) {
                $extra['markPx'] = data_get($mark->json(), 'data.0.markPx');
            }
            $funding = $responses['funding'] ?? null;
            if ($funding instanceof Response && $funding->successful()) {
                $extra['fundingRate'] = data_get($funding->json(), 'data.0.fundingRate');
                $extra['nextFundingTime'] = data_get($funding->json(), 'data.0.nextFundingTime');
            }
            $oi = $responses['oi'] ?? null;
            if ($oi instanceof Response && $oi->successful()) {
                $extra['oi'] = data_get($oi->json(), 'data.0.oi');
            }
        }

        return $this->stats([
            'last_price' => $last,
            'change_24h_percent' => $change,
            'high_24h' => $ticker['high24h'] ?? null,
            'low_24h' => $ticker['low24h'] ?? null,
            'volume_24h' => $ticker['vol24h'] ?? null,
            'turnover_24h' => $ticker['volCcy24h'] ?? null,
            'bid_price' => $ticker['bidPx'] ?? null,
            'ask_price' => $ticker['askPx'] ?? null,
            'mark_price' => $extra['markPx'] ?? null,
            'funding_rate' => $extra['fundingRate'] ?? null,
            'next_funding_time' => $extra['nextFundingTime'] ?? null,
            'open_interest' => $extra['oi'] ?? null,
        ]);
    }

    private function bingxStatsRequests(string $category, string $native): array
    {
        $spot = $category === 'spot';
        $symbol = str_contains($native, '-') ? $native : preg_replace('/(USDT|USDC|USD)$/i', '-$1', $native);

        return [[
            'tag' => 'ticker', 'exchange' => 'bingx', 'endpoint' => 'ticker',
            'url' => $spot ? 'https://open-api.bingx.com/openApi/spot/v1/ticker/24hr' : 'https://open-api.bingx.com/openApi/swap/v2/quote/ticker',
            'query' => ['symbol' => $symbol], 'cacheSeconds' => 10,
        ]];
    }

    private function bingxStatsAssemble(array $responses): array
    {
        $response = $responses['ticker'] ?? null;
        if (!$response instanceof Response || !$response->successful()) {
            throw new RuntimeException('BingX ticker request failed.');
        }
        $ticker = $response->json('data') ?? [];
        if (array_is_list($ticker)) $ticker = $ticker[0] ?? [];

        return $this->stats([
            'last_price' => $ticker['lastPrice'] ?? $ticker['last'] ?? null,
            'change_24h_percent' => $ticker['priceChangePercent'] ?? null,
            'high_24h' => $ticker['highPrice'] ?? $ticker['highPrice24h'] ?? null,
            'low_24h' => $ticker['lowPrice'] ?? $ticker['lowPrice24h'] ?? null,
            'volume_24h' => $ticker['volume'] ?? $ticker['volume24h'] ?? null,
            'turnover_24h' => $ticker['quoteVolume'] ?? $ticker['turnover24h'] ?? null,
            'bid_price' => $ticker['bidPrice'] ?? $ticker['bid1Price'] ?? null,
            'ask_price' => $ticker['askPrice'] ?? $ticker['ask1Price'] ?? null,
            'mark_price' => $ticker['markPrice'] ?? null,
            'index_price' => $ticker['indexPrice'] ?? null,
            'funding_rate' => $ticker['lastFundingRate'] ?? $ticker['fundingRate'] ?? null,
            'next_funding_time' => $ticker['nextFundingTime'] ?? null,
            'open_interest' => $ticker['openInterest'] ?? null,
        ]);
    }

    private function mexcStatsRequests(string $category, string $native): array
    {
        $spot = $category === 'spot';

        return [[
            'tag' => 'ticker', 'exchange' => 'mexc', 'endpoint' => 'ticker',
            'url' => $spot ? 'https://api.mexc.com/api/v3/ticker/24hr' : 'https://contract.mexc.com/api/v1/contract/ticker',
            'query' => ['symbol' => $native], 'cacheSeconds' => 10,
        ]];
    }

    private function mexcStatsAssemble(string $category, array $responses): array
    {
        $spot = $category === 'spot';
        $response = $responses['ticker'] ?? null;
        if (!$response instanceof Response || !$response->successful()) {
            throw new RuntimeException('MEXC ticker request failed.');
        }
        $payload = $response->json();
        $ticker = $spot ? $payload : ($payload['data'] ?? []);
        if (array_is_list($ticker)) $ticker = $ticker[0] ?? [];

        return $this->stats([
            'last_price' => $ticker['lastPrice'] ?? null,
            'change_24h_percent' => $spot ? ($ticker['priceChangePercent'] ?? null) : (isset($ticker['riseFallRate']) ? ((float) $ticker['riseFallRate'] * 100) : null),
            'high_24h' => $ticker['highPrice'] ?? $ticker['high24Price'] ?? null,
            'low_24h' => $ticker['lowPrice'] ?? $ticker['lower24Price'] ?? null,
            'volume_24h' => $ticker['volume'] ?? $ticker['volume24'] ?? null,
            'turnover_24h' => $ticker['quoteVolume'] ?? $ticker['amount24'] ?? null,
            'bid_price' => $ticker['bidPrice'] ?? $ticker['bid1'] ?? null,
            'ask_price' => $ticker['askPrice'] ?? $ticker['ask1'] ?? null,
            'mark_price' => $ticker['fairPrice'] ?? null,
            'index_price' => $ticker['indexPrice'] ?? null,
            'funding_rate' => $ticker['fundingRate'] ?? null,
            'next_funding_time' => $ticker['nextSettleTime'] ?? null,
            'open_interest' => $ticker['holdVol'] ?? null,
        ]);
    }

    private function coinMarketCapFundamentals(string $base): ?array
    {
        $coinId = Cache::remember("market-metadata:coinmarketcap-map:v1:{$base}", now()->addDay(), function () use ($base) {
            $coins = $this->coinMarketCap()->get('/v1/cryptocurrency/map', [
                'symbol' => $base,
                'listing_status' => 'active',
            ])->throw()->json('data') ?? [];
            if (!is_array($coins)) throw new RuntimeException('CoinMarketCap returned an invalid map response.');
            $ids = array_values(array_filter(array_map(
                fn ($coin) => strtoupper((string) ($coin['symbol'] ?? '')) === $base ? ($coin['id'] ?? null) : null,
                $coins
            ), fn ($id) => is_numeric($id)));
            if (!$ids) return '';

            $quotes = $this->coinMarketCap()->get('/v2/cryptocurrency/quotes/latest', [
                'id' => implode(',', $ids),
                'convert' => 'USD',
            ])->throw()->json('data') ?? [];
            if (!is_array($quotes)) throw new RuntimeException('CoinMarketCap returned an invalid quotes response.');
            $matches = array_values(array_filter(
                $quotes,
                fn ($coin) => is_array($coin) && strtoupper((string) ($coin['symbol'] ?? '')) === $base
            ));
            usort($matches, fn ($a, $b) => ($a['cmc_rank'] ?? PHP_INT_MAX) <=> ($b['cmc_rank'] ?? PHP_INT_MAX));
            return $matches[0]['id'] ?? '';
        });
        if (!$coinId) return null;

        $quote = Cache::remember("market-metadata:coinmarketcap-quote:v1:{$coinId}", now()->addMinutes(5), function () use ($coinId) {
            $data = $this->coinMarketCap()->get('/v2/cryptocurrency/quotes/latest', [
                'id' => $coinId,
                'convert' => 'USD',
            ])->throw()->json();
            return data_get($data, 'data.'.(string) $coinId);
        });

        $info = Cache::remember("market-metadata:coinmarketcap-info:v1:{$coinId}", now()->addDay(), function () use ($coinId) {
            $data = $this->coinMarketCap()->get('/v2/cryptocurrency/info', ['id' => $coinId])->throw()->json();
            return data_get($data, 'data.'.(string) $coinId, []);
        });

        return $this->assembleCoinMarketCapFundamentals($quote, $info, $coinId);
    }

    private function assembleCoinMarketCapFundamentals(?array $quote, array $info, string $coinId): ?array
    {
        if (!is_array($quote)) return null;
        $usd = data_get($quote, 'quote.USD', []);

        return [
            'provider_id' => $quote['id'] ?? (int) $coinId,
            'name' => $quote['name'] ?? ($info['name'] ?? null),
            'symbol' => strtoupper((string) ($quote['symbol'] ?? $info['symbol'] ?? '')),
            'logo_url' => $info['logo'] ?? null,
            'market_cap_rank' => $this->number($quote['cmc_rank'] ?? null),
            'market_cap' => $this->number($usd['market_cap'] ?? null),
            'fully_diluted_valuation' => $this->number($usd['fully_diluted_market_cap'] ?? null),
            'circulating_supply' => $this->number($quote['circulating_supply'] ?? null),
            'total_supply' => $this->number($quote['total_supply'] ?? null),
            'max_supply' => $this->number($quote['max_supply'] ?? null),
            'ath' => null,
            'ath_date' => null,
            'atl' => null,
            'atl_date' => null,
            'last_updated' => $usd['last_updated'] ?? ($quote['last_updated'] ?? null),
        ];
    }

    private function cmcPoolRequest(Pool $pool, string $key): PendingRequest
    {
        return $pool->as($key)
            ->acceptJson()
            ->timeout(8)
            ->withOptions(['verify' => (bool) config('services.market_data.verify_tls', true)])
            ->withHeaders(['X-CMC_PRO_API_KEY' => config('services.coinmarketcap.api_key')])
            ->baseUrl('https://pro-api.coinmarketcap.com');
    }

    private function coinMarketCap(): PendingRequest
    {
        return $this->http()->baseUrl('https://pro-api.coinmarketcap.com')
            ->withHeaders(['X-CMC_PRO_API_KEY' => config('services.coinmarketcap.api_key')]);
    }

    private function coinGeckoFundamentals(string $base): ?array
    {
        $coinId = Cache::remember("market-metadata:coingecko-map:v1:{$base}", now()->addDay(), function () use ($base) {
            $coins = $this->coinGecko()->get('/search', ['query' => $base])->throw()->json('coins') ?? [];
            if (!is_array($coins)) throw new RuntimeException('CoinGecko returned an invalid search response.');
            $matches = array_values(array_filter($coins, fn ($coin) => strtoupper((string) ($coin['symbol'] ?? '')) === $base));
            usort($matches, fn ($a, $b) => ($a['market_cap_rank'] ?? PHP_INT_MAX) <=> ($b['market_cap_rank'] ?? PHP_INT_MAX));
            return $matches[0]['id'] ?? '';
        });
        if (!$coinId) return null;

        $coin = Cache::remember("market-metadata:coingecko:v1:{$coinId}", now()->addMinutes(5), function () use ($coinId) {
            $items = $this->coinGecko()->get('/coins/markets', [
                'vs_currency' => 'usd',
                'ids' => $coinId,
                'price_change_percentage' => '24h',
            ])->throw()->json();
            if (!is_array($items)) throw new RuntimeException('CoinGecko returned an invalid markets response.');
            return $items[0] ?? null;
        });

        return is_array($coin) ? $this->assembleCoinGeckoFundamentals($coin) : null;
    }

    private function assembleCoinGeckoFundamentals(array $coin): array
    {
        return [
            'provider_id' => $coin['id'] ?? null,
            'name' => $coin['name'] ?? null,
            'symbol' => strtoupper((string) ($coin['symbol'] ?? '')),
            'logo_url' => $coin['image'] ?? null,
            'market_cap_rank' => $this->number($coin['market_cap_rank'] ?? null),
            'market_cap' => $this->number($coin['market_cap'] ?? null),
            'fully_diluted_valuation' => $this->number($coin['fully_diluted_valuation'] ?? null),
            'circulating_supply' => $this->number($coin['circulating_supply'] ?? null),
            'total_supply' => $this->number($coin['total_supply'] ?? null),
            'max_supply' => $this->number($coin['max_supply'] ?? null),
            'ath' => $this->number($coin['ath'] ?? null),
            'ath_date' => $coin['ath_date'] ?? null,
            'atl' => $this->number($coin['atl'] ?? null),
            'atl_date' => $coin['atl_date'] ?? null,
            'last_updated' => $coin['last_updated'] ?? null,
        ];
    }

    private function coinGeckoPoolRequest(Pool $pool, string $key): PendingRequest
    {
        $mode = config('services.coingecko.mode', 'demo');
        $header = $mode === 'pro' ? 'x-cg-pro-api-key' : 'x-cg-demo-api-key';
        $baseUrl = $mode === 'pro' ? 'https://pro-api.coingecko.com/api/v3' : 'https://api.coingecko.com/api/v3';

        return $pool->as($key)
            ->acceptJson()
            ->timeout(8)
            ->withOptions(['verify' => (bool) config('services.market_data.verify_tls', true)])
            ->withHeaders([$header => config('services.coingecko.api_key')])
            ->baseUrl($baseUrl);
    }

    private function coinGecko(): PendingRequest
    {
        $mode = config('services.coingecko.mode', 'demo');
        $header = $mode === 'pro' ? 'x-cg-pro-api-key' : 'x-cg-demo-api-key';
        $baseUrl = $mode === 'pro' ? 'https://pro-api.coingecko.com/api/v3' : 'https://api.coingecko.com/api/v3';
        return $this->http()->baseUrl($baseUrl)->withHeaders([$header => config('services.coingecko.api_key')]);
    }

    private function http(): PendingRequest
    {
        return Http::acceptJson()->timeout(8)->retry(2, 200, throw: false)
            ->withOptions(['verify' => (bool) config('services.market_data.verify_tls', true)]);
    }

    private function stats(array $values): array
    {
        return array_map(fn ($value) => $this->number($value), array_replace($this->emptyStats(), $values));
    }

    private function emptyStats(): array
    {
        return array_fill_keys([
            'last_price', 'change_24h_percent', 'high_24h', 'low_24h', 'volume_24h', 'turnover_24h',
            'bid_price', 'ask_price', 'mark_price', 'index_price', 'funding_rate', 'next_funding_time', 'open_interest',
        ], null);
    }

    private function number(mixed $value): ?float
    {
        return is_numeric($value) ? (float) $value : null;
    }

    private function marketCoins(?MarketSymbol $saved, string $symbol): array
    {
        $base = strtoupper((string) ($saved?->base_coin ?: ''));
        $quote = strtoupper((string) ($saved?->quote_coin ?: ''));
        if ($base !== '') return [$base, $quote];
        foreach (['USDT', 'USDC', 'BUSD', 'USD', 'BTC', 'ETH'] as $candidate) {
            if (str_ends_with($symbol, $candidate) && strlen($symbol) > strlen($candidate)) {
                return [substr($symbol, 0, -strlen($candidate)), $candidate];
            }
        }
        return [$symbol, ''];
    }

    private function inferNativeSymbol(string $exchange, string $category, string $symbol): string
    {
        if ($exchange === 'okx') {
            foreach (['USDT', 'USDC', 'USD', 'BTC', 'ETH'] as $quote) {
                if (str_ends_with($symbol, $quote) && strlen($symbol) > strlen($quote)) {
                    $pair = substr($symbol, 0, -strlen($quote)).'-'.$quote;
                    return $category === 'spot' ? $pair : $pair.'-SWAP';
                }
            }
        }
        if ($exchange === 'bingx') {
            return preg_replace('/(USDT|USDC|USD)$/i', '-$1', $symbol);
        }
        if ($exchange === 'mexc' && $category !== 'spot') {
            return preg_replace('/(USDT|USDC|USD)$/i', '_$1', $symbol);
        }
        return $symbol;
    }

    protected function resolveSavedMarket(string $exchange, string $category, string $symbol): ?MarketSymbol
    {
        return MarketSymbol::query()->where('exchange', $exchange)->where('category', $category)
            ->where('symbol', $symbol)->first();
    }
}

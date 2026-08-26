<?php

namespace App\Services;

use App\Models\MarketBacktestAccount;
use App\Models\MarketBacktestMark;
use App\Models\MarketBacktestSession;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Schema;

class CrossMarkService
{
    public function __construct(private CrossMarginService $crossMarginService)
    {
    }

    public function record(
        MarketBacktestAccount $account,
        ?MarketBacktestSession $session,
        string $exchange,
        string $category,
        string $symbol,
        string $mode,
        float $price,
        int $candleTime
    ): MarketBacktestMark {
        if (!Schema::hasTable('market_backtest_marks')) {
            return new MarketBacktestMark([
                'market_backtest_account_id' => $account->id,
                'market_backtest_session_id' => $mode === 'replay' ? $session?->id : null,
                'exchange' => strtolower($exchange),
                'category' => strtolower($category),
                'symbol' => strtoupper($symbol),
                'mode' => $mode,
                'price' => $price,
                'candle_time' => $candleTime,
                'observed_at' => now(),
                'status' => 'fresh',
            ]);
        }

        $identity = [
            'market_backtest_account_id' => $account->id,
            'market_backtest_session_id' => $mode === 'replay' ? $session?->id : null,
            'exchange' => strtolower($exchange),
            'category' => strtolower($category),
            'symbol' => strtoupper($symbol),
            'mode' => $mode,
        ];

        // A nullable market_backtest_session_id (always null for live-mode rows) means the
        // table's unique index can't stop two concurrent record() calls for the same market —
        // SQL treats every NULL as distinct from every other NULL for uniqueness purposes, so
        // two overlapping updateOrCreate() calls (e.g. a request and the Live monitor, or two
        // requests racing) could each find no existing row and both INSERT. A short per-market
        // lock, the same pattern ExchangeMarketDataGateway already uses for its own upserts,
        // keeps this to the single upserted row the schema's unique index is meant to guarantee.
        $lockKey = 'cross-mark:record:'.implode(':', array_map(fn ($value) => $value ?? 'null', $identity));
        $upsert = fn () => MarketBacktestMark::query()->updateOrCreate($identity, [
            'price' => $price,
            'candle_time' => $candleTime,
            'observed_at' => now(),
            'status' => 'fresh',
        ]);

        try {
            return Cache::lock($lockKey, 10)->block(3, $upsert);
        } catch (\Illuminate\Contracts\Cache\LockTimeoutException) {
            // Losing the race to hold this lock must never fail the request that's placing an
            // order or rendering an account payload — fall back to an unlocked upsert. Worst
            // case under true contention is a harmless extra mark row for this market, which
            // mapForAccount()'s "most recently observed wins" ordering already tolerates.
            return $upsert();
        }
    }

    public function mapForAccount(
        MarketBacktestAccount $account,
        string $mode,
        ?MarketBacktestSession $session = null,
        ?CarbonInterface $freshAfter = null
    ): array {
        return array_map(
            fn (array $mark) => $mark['price'],
            $this->resolvedMarksForAccount($account, $mode, $session, $freshAfter)
        );
    }

    /**
     * Same market scan as mapForAccount(), but keeps each mark's candle_time
     * alongside its price. CrossLiquidationService needs the candle_time to
     * timestamp the liquidation's close trades; mapForAccount()'s plain
     * price-only shape stays as-is since CrossMarginService::calculate() only
     * ever needs a price map.
     *
     * @return array<string, array{price: float, candleTime: int}>
     */
    public function resolvedMarksForAccount(
        MarketBacktestAccount $account,
        string $mode,
        ?MarketBacktestSession $session = null,
        ?CarbonInterface $freshAfter = null
    ): array {
        if (!Schema::hasTable('market_backtest_marks')) return [];

        $query = MarketBacktestMark::query()
            ->where('market_backtest_account_id', $account->id)
            ->where('mode', $mode)
            ->where('status', 'fresh');

        if ($mode === 'replay') {
            $query->where('market_backtest_session_id', $session?->id);
        } else {
            $query->whereNull('market_backtest_session_id');
            if ($freshAfter) $query->where('observed_at', '>=', $freshAfter);
        }

        return $query->orderBy('observed_at')->get()->mapWithKeys(function (MarketBacktestMark $mark) {
            return [$this->crossMarginService->marketKey($mark) => [
                'price' => (float) $mark->price,
                'candleTime' => (int) $mark->candle_time,
            ]];
        })->all();
    }
}

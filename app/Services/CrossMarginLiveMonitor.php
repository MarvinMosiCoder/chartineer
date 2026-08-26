<?php

namespace App\Services;

use App\Models\MarketBacktestAccount;
use App\Models\MarketBacktestPosition;
use Illuminate\Support\Facades\Log;

/**
 * Keeps Live Cross marks fresh and evaluates every account's Cross portfolio
 * for maintenance breaches, independent of which chart a user currently has
 * open or whether a browser tab is connected — mirrors MarketAlertMonitor's
 * runOnce()-per-poll-cycle shape: coalesce distinct markets across every
 * account before fetching, and back off per-market on failure so one bad
 * symbol doesn't stall the whole cycle.
 */
class CrossMarginLiveMonitor
{
    private array $failures = [];

    public function __construct(
        private readonly MarketCurrentPriceService $prices,
        private readonly CrossMarkService $crossMarkService,
        private readonly CrossLiquidationService $crossLiquidationService
    ) {
    }

    public function runOnce(): array
    {
        $positions = MarketBacktestPosition::query()
            ->whereIn('status', ['open', 'pending'])
            ->where('margin_mode', 'cross')
            ->get(['id', 'market_backtest_account_id', 'exchange', 'category', 'symbol']);

        if ($positions->isEmpty()) {
            return ['marketsPolled' => 0, 'accountsEvaluated' => 0, 'liquidations' => 0];
        }

        $marketKey = fn (MarketBacktestPosition $position) => strtolower($position->exchange).':'.strtolower($position->category).':'.strtoupper($position->symbol);
        $markets = $positions->unique($marketKey);
        $prices = [];

        foreach ($markets as $market) {
            $key = $marketKey($market);
            if (($this->failures[$key]['retry_at'] ?? 0) > time()) {
                continue;
            }

            try {
                $prices[$key] = $this->prices->fetch($market->exchange, $market->category, $market->symbol);
                unset($this->failures[$key]);
            } catch (\Throwable $exception) {
                $attempt = min(6, ($this->failures[$key]['attempt'] ?? 0) + 1);
                $this->failures[$key] = ['attempt' => $attempt, 'retry_at' => time() + min(60, 2 ** $attempt)];
                Log::warning('Cross margin market poll failed.', [
                    'exchange' => $market->exchange,
                    'category' => $market->category,
                    'symbol' => $market->symbol,
                    'message' => $exception->getMessage(),
                ]);
            }
        }

        $accountIds = $positions->pluck('market_backtest_account_id')->unique()->values();
        $liquidations = 0;
        $now = time();

        foreach ($accountIds as $accountId) {
            $account = MarketBacktestAccount::query()->find($accountId);
            if (!$account) {
                continue;
            }

            $accountPositions = $positions->where('market_backtest_account_id', $accountId);

            foreach ($accountPositions as $position) {
                $key = $marketKey($position);
                if (!isset($prices[$key])) {
                    continue;
                }

                $this->crossMarkService->record(
                    $account,
                    null,
                    $position->exchange,
                    $position->category,
                    $position->symbol,
                    'live',
                    $prices[$key],
                    $now
                );
            }

            $result = $this->crossLiquidationService->evaluate($accountId, 'live', null, CrossMarginService::FEE_RATE);
            if ($result['liquidated']) {
                $liquidations++;
                Log::info('Cross margin portfolio liquidated.', [
                    'accountId' => $accountId,
                    'closedTrades' => $result['closedTrades'],
                ]);
            }
        }

        return [
            'marketsPolled' => count($prices),
            'accountsEvaluated' => $accountIds->count(),
            'liquidations' => $liquidations,
        ];
    }
}

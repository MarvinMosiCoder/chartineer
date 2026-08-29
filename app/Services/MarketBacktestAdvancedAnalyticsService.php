<?php

namespace App\Services;

use Illuminate\Support\Collection;

class MarketBacktestAdvancedAnalyticsService
{
    public function __construct(private MarketSessionService $sessions = new MarketSessionService()) {}

    public function build(Collection $positions, float $startingBalance): array
    {
        $pnls = $positions->reverse()->values()->map(fn ($position) => (float) $position->realized_pnl);
        $grossProfit = $pnls->filter(fn ($pnl) => $pnl > 0)->sum();
        $grossLoss = abs($pnls->filter(fn ($pnl) => $pnl < 0)->sum());
        $expectancy = $pnls->count() ? $pnls->avg() : 0;
        $equity = $startingBalance;
        $peak = $startingBalance;
        $maxDrawdown = 0;
        $maxDrawdownPercent = 0;
        $curve = [];
        $currentWinStreak = $currentLossStreak = $maxWinStreak = $maxLossStreak = 0;

        foreach ($pnls as $index => $pnl) {
            $equity += $pnl;
            $peak = max($peak, $equity);
            $drawdown = max(0, $peak - $equity);
            $maxDrawdown = max($maxDrawdown, $drawdown);
            $maxDrawdownPercent = max($maxDrawdownPercent, $peak > 0 ? ($drawdown / $peak) * 100 : 0);
            $curve[] = ['trade' => $index + 1, 'equity' => round($equity, 8), 'drawdown' => round($drawdown, 8)];

            if ($pnl > 0) {
                $currentWinStreak++;
                $currentLossStreak = 0;
                $maxWinStreak = max($maxWinStreak, $currentWinStreak);
            } elseif ($pnl < 0) {
                $currentLossStreak++;
                $currentWinStreak = 0;
                $maxLossStreak = max($maxLossStreak, $currentLossStreak);
            } else {
                $currentWinStreak = $currentLossStreak = 0;
            }
        }

        $netPnl = $pnls->sum();

        return [
            'expectancy' => round($expectancy, 8),
            'profitFactor' => $grossLoss > 0 ? round($grossProfit / $grossLoss, 4) : ($grossProfit > 0 ? null : 0),
            'maxDrawdown' => round($maxDrawdown, 8),
            'maxDrawdownPercent' => round($maxDrawdownPercent, 2),
            'recoveryFactor' => $maxDrawdown > 0 ? round($netPnl / $maxDrawdown, 4) : null,
            'maxWinStreak' => $maxWinStreak,
            'maxLossStreak' => $maxLossStreak,
            'equityCurve' => $curve,
            'byWeekday' => $this->groupPerformance($positions, fn ($position) => gmdate('D', (int) ($position->closed_at_time ?: 0))),
            'byHourUtc' => $this->groupPerformance($positions, fn ($position) => gmdate('H:00', (int) ($position->closed_at_time ?: 0))),
            'maeMfe' => $this->maeMfe($positions),
            // Session is attributed to the entry, not the close: the session is
            // the context you took the setup in, and a trade opened in London
            // that runs past the New York open is still a London trade. The
            // weekday/hour breakdowns above stay close-oriented.
            'byTradingSession' => $this->groupPerformance(
                $positions,
                fn ($position) => $this->sessions->label((int) ($position->opened_at_time ?: $position->closed_at_time ?: 0))
            ),
        ];
    }

    public function monteCarlo(Collection $positions, float $startingBalance, int $iterations = 500): array
    {
        $pnls = $positions->pluck('realized_pnl')->map(fn ($value) => (float) $value)->values()->all();
        if (count($pnls) < 5) return ['eligible' => false, 'requiredTrades' => 5, 'currentTrades' => count($pnls)];

        $finalBalances = [];
        $drawdowns = [];
        $ruinCount = 0;
        for ($iteration = 0; $iteration < $iterations; $iteration++) {
            $equity = $peak = $startingBalance;
            $maxDrawdownPct = 0;
            $ruined = false;
            for ($trade = 0; $trade < count($pnls); $trade++) {
                $equity += $pnls[random_int(0, count($pnls) - 1)];
                $peak = max($peak, $equity);
                $maxDrawdownPct = max($maxDrawdownPct, $peak > 0 ? (($peak - $equity) / $peak) * 100 : 100);
                if ($equity <= $startingBalance * 0.5) $ruined = true;
            }
            if ($ruined) $ruinCount++;
            $finalBalances[] = $equity;
            $drawdowns[] = $maxDrawdownPct;
        }
        sort($finalBalances);
        sort($drawdowns);

        return [
            'eligible' => true,
            'iterations' => $iterations,
            'tradesPerRun' => count($pnls),
            'endingBalanceP10' => round($this->percentile($finalBalances, 10), 8),
            'endingBalanceMedian' => round($this->percentile($finalBalances, 50), 8),
            'endingBalanceP90' => round($this->percentile($finalBalances, 90), 8),
            'drawdownMedianPercent' => round($this->percentile($drawdowns, 50), 2),
            'drawdownP90Percent' => round($this->percentile($drawdowns, 90), 2),
            'riskOfHalfBalancePercent' => round(($ruinCount / $iterations) * 100, 2),
        ];
    }

    private function groupPerformance(Collection $positions, callable $key): array
    {
        return $positions->filter(fn ($position) => $position->closed_at_time)->groupBy($key)->map(function ($group, $label) {
            $wins = $group->filter(fn ($position) => (float) $position->realized_pnl > 0)->count();
            return ['label' => $label, 'trades' => $group->count(), 'winRate' => round(($wins / $group->count()) * 100, 2), 'netPnl' => round($group->sum('realized_pnl'), 8)];
        })->values()->all();
    }

    private function maeMfe(Collection $positions): array
    {
        $rows = $positions->filter(fn ($p) => $p->favorable_price !== null && $p->adverse_price !== null && (float) $p->entry_price > 0);
        if ($rows->isEmpty()) {
            return ['eligible' => false, 'sampledTrades' => 0];
        }
        $mfePercents = []; $maePercents = []; $mfeAmounts = []; $maeAmounts = [];
        foreach ($rows as $position) {
            $entry = (float) $position->entry_price;
            $quantity = (float) ($position->original_quantity ?? $position->quantity);
            $isLong = $position->side === 'long';
            $mfeDistance = $isLong ? max(0, (float) $position->favorable_price - $entry) : max(0, $entry - (float) $position->favorable_price);
            $maeDistance = $isLong ? max(0, $entry - (float) $position->adverse_price) : max(0, (float) $position->adverse_price - $entry);
            $mfePercents[] = ($mfeDistance / $entry) * 100;
            $maePercents[] = ($maeDistance / $entry) * 100;
            $mfeAmounts[] = $mfeDistance * $quantity;
            $maeAmounts[] = $maeDistance * $quantity;
        }
        $count = count($mfePercents);
        return [
            'eligible' => true,
            'sampledTrades' => $count,
            'avgMfePercent' => round(array_sum($mfePercents) / $count, 4),
            'avgMaePercent' => round(array_sum($maePercents) / $count, 4),
            'avgMfeAmount' => round(array_sum($mfeAmounts) / $count, 8),
            'avgMaeAmount' => round(array_sum($maeAmounts) / $count, 8),
            'edgeRatio' => array_sum($maePercents) > 0 ? round(array_sum($mfePercents) / array_sum($maePercents), 4) : null,
        ];
    }

    private function percentile(array $values, int $percentile): float
    {
        $index = (int) floor(($percentile / 100) * (count($values) - 1));
        return (float) $values[$index];
    }
}

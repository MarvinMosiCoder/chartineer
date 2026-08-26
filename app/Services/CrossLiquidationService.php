<?php

namespace App\Services;

use App\Models\MarketBacktestAccount;
use App\Models\MarketBacktestSession;
use App\Models\MarketBacktestTrade;
use Illuminate\Support\Facades\DB;

class CrossLiquidationService
{
    public function __construct(
        private CrossMarkService $crossMarkService,
        private CrossMarginService $crossMarginService
    ) {
    }

    /**
     * Locks the account and every open Cross position, recalculates the
     * portfolio against a fresh mark map, and — only when equity has reached
     * the maintenance requirement — closes every open Cross position at its
     * mark in the same transaction. Re-running this after a liquidation (or
     * two concurrent callers racing on the same account) finds no open Cross
     * positions left and mutates nothing, so it is safe to call repeatedly
     * from a monitor loop or an optimistic frontend "evaluate now" request.
     */
    public function evaluate(
        int $accountId,
        string $mode,
        ?int $sessionId,
        float $feeRate
    ): array {
        return DB::transaction(function () use ($accountId, $mode, $sessionId, $feeRate) {
            $account = MarketBacktestAccount::query()
                ->whereKey($accountId)
                ->lockForUpdate()
                ->firstOrFail();

            $openPositions = $account->positions()
                ->where('status', 'open')
                ->where('margin_mode', 'cross')
                ->lockForUpdate()
                ->get();

            if ($openPositions->isEmpty()) {
                return $this->result('no_open_cross_positions');
            }

            $session = $sessionId ? MarketBacktestSession::query()->find($sessionId) : null;
            $pendingPositions = $account->positions()->where('status', 'pending')->get();
            $resolvedMarks = $this->crossMarkService->resolvedMarksForAccount(
                $account,
                $mode,
                $session,
                $mode === 'live' ? now()->subMinutes(2) : null
            );
            $marks = array_map(fn (array $mark) => $mark['price'], $resolvedMarks);

            $metrics = $this->crossMarginService->calculate(
                (float) $account->cash_balance,
                $openPositions,
                $pendingPositions,
                $marks,
                $feeRate
            );

            if (!$metrics['complete']) {
                return $this->result('incomplete_marks', $metrics);
            }

            if (!$metrics['liquidationRequired']) {
                return $this->result('above_maintenance', $metrics);
            }

            $closedTrades = [];
            $cashDelta = 0.0;
            $realizedPnlDelta = 0.0;
            $feesDelta = 0.0;

            foreach ($openPositions as $position) {
                $key = $this->crossMarginService->marketKey($position);
                $mark = (float) $resolvedMarks[$key]['price'];
                $candleTime = $resolvedMarks[$key]['candleTime'] ?? time();
                $quantity = (float) $position->quantity;
                $entryPrice = (float) $position->entry_price;
                $margin = (float) $position->margin;
                $exitNotional = round($quantity * $mark, 8);
                $exitFee = round($exitNotional * $feeRate, 8);
                $grossPnl = $position->side === 'long'
                    ? round(($mark - $entryPrice) * $quantity, 8)
                    : round(($entryPrice - $mark) * $quantity, 8);
                $netPnl = round($grossPnl - (float) $position->entry_fee - $exitFee, 8);

                $position->update([
                    'exit_price' => $mark,
                    'exit_fee' => round((float) $position->exit_fee + $exitFee, 8),
                    'realized_pnl' => round((float) $position->realized_pnl + $netPnl, 8),
                    'closed_at_time' => $candleTime,
                    'status' => 'closed',
                    'close_reason' => 'cross_liquidation',
                ]);

                MarketBacktestTrade::query()->create([
                    'market_backtest_account_id' => $account->id,
                    'market_backtest_session_id' => $position->market_backtest_session_id,
                    'market_backtest_position_id' => $position->id,
                    'symbol' => $position->symbol,
                    'side' => $position->side,
                    'action' => 'close',
                    'quantity' => $quantity,
                    'price' => $mark,
                    'notional' => $exitNotional,
                    'fee' => $exitFee,
                    'pnl' => $netPnl,
                    'executed_at_time' => $candleTime,
                ]);

                $cashDelta += $margin + $grossPnl - $exitFee;
                $realizedPnlDelta += $netPnl;
                $feesDelta += $exitFee;

                $closedTrades[] = [
                    'positionId' => $position->id,
                    'symbol' => $position->symbol,
                    'side' => $position->side,
                    'quantity' => $quantity,
                    'price' => $mark,
                    'netPnl' => $netPnl,
                ];
            }

            $account->update([
                'cash_balance' => round((float) $account->cash_balance + $cashDelta, 8),
                'realized_pnl' => round((float) $account->realized_pnl + $realizedPnlDelta, 8),
                'fees_paid' => round((float) $account->fees_paid + $feesDelta, 8),
            ]);

            return $this->result('maintenance_breached', $metrics, true, $closedTrades);
        });
    }

    private function result(string $reason, ?array $metrics = null, bool $liquidated = false, array $closedTrades = []): array
    {
        return [
            'liquidated' => $liquidated,
            'reason' => $reason,
            'metrics' => $metrics,
            'closedTrades' => $closedTrades,
        ];
    }
}

<?php

namespace App\Services;

use App\Models\MarketBacktestAccount;
use App\Models\MarketBacktestPosition;
use App\Models\MarketBacktestSnapshot;

class MarketBacktestReportService
{
    public function getReportPositions(
        MarketBacktestAccount $account,
        ?string $symbol = null,
        ?int $sessionId = null,
        int $limit = 500
    ) {
        return $account->positions()
            ->with('snapshots')
            ->where('status', 'closed')
            ->when($symbol, fn ($query) => $query->where('symbol', $symbol))
            ->when($sessionId, fn ($query) => $query->where('market_backtest_session_id', $sessionId))
            // Sorted by real insert time, not the simulated backtest/candle time
            // (`closed_at_time`) — a user can replay old historical dates today and
            // recent ones tomorrow, so simulated time doesn't reflect the order trades
            // were actually entered by the user. `id` is a tiebreaker for rows created
            // within the same second (created_at has only second precision).
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->limit($limit)
            ->get();
    }

    public function serializeReportPosition(MarketBacktestPosition $position): array
    {
        $pnl = (float) $position->realized_pnl;
        $margin = (float) ($position->original_margin ?? $position->margin);
        $leverage = $this->getPositionLeverage($position);
        $snapshots = $position->relationLoaded('snapshots')
            ? $position->snapshots
            : $position->snapshots()->get();
        $entrySnapshot = $snapshots->where('type', 'entry')->sortByDesc('created_at')->first();
        $exitSnapshot = $snapshots->where('type', 'exit')->sortByDesc('created_at')->first();

        return [
            'id' => $position->id,
            'sessionId' => $position->market_backtest_session_id,
            'symbol' => $position->symbol,
            'category' => $position->category,
            'side' => $position->side,
            'quantity' => (float) ($position->original_quantity ?? $position->quantity),
            'margin' => $margin,
            'leverage' => $leverage,
            'marginMode' => $position->margin_mode ?? 'isolated',
            'notional' => round($margin * $leverage, 8),
            'entryPrice' => (float) $position->entry_price,
            'exitPrice' => $position->exit_price !== null ? (float) $position->exit_price : null,
            'entryFee' => (float) ($position->original_entry_fee ?? $position->entry_fee),
            'exitFee' => (float) $position->exit_fee,
            'fee' => round((float) $position->entry_fee + (float) $position->exit_fee, 8),
            'pnl' => $pnl,
            'pnlPercent' => $margin > 0 ? round(($pnl / $margin) * 100, 4) : 0,
            'result' => $pnl > 0 ? 'win' : ($pnl < 0 ? 'loss' : 'breakeven'),
            'setupTag' => $position->setup_tag,
            'tags' => array_values($position->tags ?? []),
            'entryReason' => $position->entry_reason,
            'exitReason' => $position->exit_reason,
            'mistake' => $position->mistake,
            'emotion' => $position->emotion,
            'journalNotes' => $position->journal_notes,
            'closeReason' => $position->close_reason,
            'playbookId' => $position->market_backtest_playbook_id,
            'playbook' => $position->playbook_snapshot,
            'checklistAnswers' => array_values($position->checklist_answers ?? []),
            'checklistComplete' => $position->playbook_snapshot
                ? !in_array(false, array_values($position->checklist_answers ?? []), true)
                    && count($position->checklist_answers ?? []) === count($position->playbook_snapshot['checklist'] ?? [])
                : null,
            'entrySnapshotUrl' => $this->getSnapshotUrl($entrySnapshot),
            'exitSnapshotUrl' => $this->getSnapshotUrl($exitSnapshot),
            'openedAtTime' => $position->opened_at_time,
            'closedAtTime' => $position->closed_at_time,
            'createdAt' => optional($position->created_at)->toIso8601String(),
            'updatedAt' => optional($position->updated_at)->toIso8601String(),
        ];
    }

    private function getPositionLeverage(MarketBacktestPosition $position): float
    {
        $leverage = (float) ($position->leverage ?? 1);

        return $leverage > 0 ? $leverage : 1;
    }

    private function getPositionNotional(MarketBacktestPosition $position): float
    {
        return round((float) $position->margin * $this->getPositionLeverage($position), 8);
    }

    private function getSnapshotUrl(?MarketBacktestSnapshot $snapshot): ?string
    {
        if (!$snapshot) {
            return null;
        }

        if ($snapshot->path) {
            return $this->buildPublicStorageUrl($snapshot->path);
        }

        return $snapshot->url;
    }

    private function buildPublicStorageUrl(string $path): string
    {
        return url('storage/' . ltrim($path, '/'));
    }
}

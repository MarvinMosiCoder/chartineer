<?php

namespace App\Services;

use App\Models\AdmModels\AdmNotifications;
use App\Models\MarketBacktestAccount;
use App\Models\MarketBacktestPosition;
use App\Models\MarketBacktestTrade;

/**
 * Persists a notification for every backtest position fill and close, so the
 * lifecycle events that previously only appeared as a transient toast can be
 * reviewed later in the notifications feed.
 *
 * Keyed on the MarketBacktestTrade row id, never the position id: a position
 * with partial take-profit closes more than once, and keying on the position
 * would make firstOrCreate() silently swallow every close after the first.
 * One trade row exists per fill and per close, so the trade id is the only
 * identifier that is genuinely one-per-event.
 *
 * These rows are pruned on a 30-day window by `notifications:prune-trades`;
 * system and announcement notifications are never pruned.
 */
class BacktestTradeNotificationService
{
    public const SOURCE_OPEN = 'backtest_trade_open';
    public const SOURCE_CLOSE = 'backtest_trade_close';

    /**
     * Every source_type the "Trades" tab shows.
     *
     * `cross_liquidation` is included deliberately: CrossLiquidationService
     * already wrote those rows before this feature existed, and a portfolio
     * liquidation is a position-close event by any reading. Listing it here
     * moves that existing history into the Trades tab rather than leaving it
     * stranded among account/system messages.
     */
    public const TRADE_SOURCE_TYPES = [
        self::SOURCE_OPEN,
        self::SOURCE_CLOSE,
        'cross_liquidation',
    ];

    /**
     * Placing a pending order is deliberately not recorded here — only actual
     * executions are. openPosition() returns before creating a trade row when
     * the order is pending, so there is no per-event id to key on, and the
     * pending order produces a real fill (and a real trade row) later via
     * triggerPosition() anyway. Recording placement too would mean an extra
     * row per order with no execution behind it. The transient toast still
     * confirms placement at the moment it happens.
     */
    public function recordFill(MarketBacktestAccount $account, MarketBacktestPosition $position, MarketBacktestTrade $trade): void
    {
        $this->write(
            $account,
            $position,
            $trade,
            self::SOURCE_OPEN,
            'order filled',
            sprintf(
                '%s %s filled · %s · %s @ %s',
                $position->symbol,
                $this->sideLabel($position),
                $this->marginModeLabel($position),
                $this->number($trade->quantity),
                $this->number($trade->price)
            ),
            ['action' => 'fill']
        );
    }

    public function recordClose(
        MarketBacktestAccount $account,
        MarketBacktestPosition $position,
        MarketBacktestTrade $trade,
        string $reason,
        bool $isPartial = false
    ): void {
        $netPnl = (float) $trade->pnl;
        $mode = $this->marginModeLabel($position);

        $this->write(
            $account,
            $position,
            $trade,
            self::SOURCE_CLOSE,
            $this->closeTypeLabel($reason, $isPartial),
            sprintf(
                '%s %s · %s · %s%s',
                $position->symbol,
                $isPartial ? 'partially closed' : 'closed',
                $mode,
                $netPnl >= 0 ? '+' : '-',
                $this->money(abs($netPnl))
            ),
            [
                'action' => 'close',
                'close_reason' => $reason,
                'is_partial' => $isPartial,
                'net_pnl' => round($netPnl, 8),
            ]
        );
    }

    private function write(
        MarketBacktestAccount $account,
        MarketBacktestPosition $position,
        MarketBacktestTrade $trade,
        string $sourceType,
        string $type,
        string $content,
        array $extraMetadata
    ): void {
        AdmNotifications::query()->firstOrCreate(
            ['source_type' => $sourceType, 'source_id' => $trade->id],
            [
                'adm_user_id' => $account->adm_user_id,
                'type' => $type,
                'content' => $content,
                'metadata' => $extraMetadata + [
                    'position_id' => $position->id,
                    'symbol' => $position->symbol,
                    'side' => $position->side,
                    'market_category' => $position->category,
                    'margin_mode' => $position->margin_mode ?? 'isolated',
                    'quantity' => (float) $trade->quantity,
                    'price' => (float) $trade->price,
                ],
                'url' => '/notifications/view-all-notifications',
                'is_read' => false,
            ]
        );
    }

    private function closeTypeLabel(string $reason, bool $isPartial): string
    {
        if ($isPartial) return 'partial take profit';

        return match ($reason) {
            'stop_loss' => 'stop loss',
            'take_profit' => 'take profit',
            'partial_take_profit' => 'partial take profit',
            'liquidation' => 'liquidation',
            default => 'position closed',
        };
    }

    private function sideLabel(MarketBacktestPosition $position): string
    {
        if ($position->category === 'spot') return 'Buy';

        return $position->side === 'short' ? 'Short' : 'Long';
    }

    private function marginModeLabel(MarketBacktestPosition $position): string
    {
        return ($position->margin_mode ?? 'isolated') === 'cross' ? 'Cross' : 'Isolated';
    }

    private function money($value): string
    {
        return number_format((float) $value, 2, '.', ',');
    }

    private function number($value, int $decimals = 8): string
    {
        $number = (float) $value;

        return rtrim(rtrim(number_format($number, $decimals, '.', ','), '0'), '.') ?: '0';
    }
}

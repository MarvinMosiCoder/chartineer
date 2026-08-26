<?php

namespace App\Services;

use Illuminate\Support\Collection;

class CrossMarginService
{
    public const MAINTENANCE_RATE = 0.005;

    /**
     * The platform-wide simulated trading fee rate. Single source of truth so
     * every Cross-aware caller (order entry, the liquidation service, the Live
     * monitor) prices closing fees identically — a mismatch here would make an
     * account's own margin math disagree with what actually closes it.
     */
    public const FEE_RATE = 0.0004;

    public function calculate(
        float $cashBalance,
        iterable $openPositions,
        iterable $pendingPositions,
        array $marks,
        float $feeRate
    ): array {
        $open = Collection::make($openPositions)->filter(fn ($position) => $this->isCrossFuture($position));
        $pending = Collection::make($pendingPositions)->filter(fn ($position) => $this->isCrossFuture($position));
        $missingMarkets = [];
        $initialMargin = 0.0;
        $unrealizedPnl = 0.0;
        $closingFees = 0.0;
        $maintenanceBase = 0.0;

        foreach ($open as $position) {
            $key = $this->marketKey($position);
            $mark = isset($marks[$key]) ? (float) $marks[$key] : null;
            if (!$mark || $mark <= 0) {
                $missingMarkets[] = $key;
                continue;
            }

            $quantity = (float) $this->value($position, 'quantity', 0);
            $entry = (float) $this->value($position, 'entry_price', $this->value($position, 'entryPrice', 0));
            $margin = (float) $this->value($position, 'margin', 0);
            $side = $this->value($position, 'side', 'long');
            $notional = abs($quantity * $mark);
            $pnl = $side === 'short'
                ? ($entry - $mark) * $quantity
                : ($mark - $entry) * $quantity;

            $initialMargin += $margin;
            $unrealizedPnl += $pnl;
            $closingFees += $notional * $feeRate;
            $maintenanceBase += $notional * self::MAINTENANCE_RATE;
        }

        $pendingReserve = $pending->sum(function ($position) use ($feeRate) {
            $margin = (float) $this->value($position, 'margin', 0);
            $leverage = max(1.0, (float) $this->value($position, 'leverage', 1));
            $entryFee = $this->value($position, 'entry_fee', $this->value($position, 'entryFee'));

            return $margin + ($entryFee !== null ? (float) $entryFee : ($margin * $leverage * $feeRate));
        });

        $equity = $cashBalance + $initialMargin + $unrealizedPnl;
        $maintenance = $maintenanceBase + $closingFees;
        $available = max(0, $equity - $initialMargin - $pendingReserve - $closingFees);
        $complete = count($missingMarkets) === 0;

        return [
            'complete' => $complete,
            'missingMarkets' => array_values(array_unique($missingMarkets)),
            'initialMargin' => round($initialMargin, 8),
            'unrealizedPnl' => round($unrealizedPnl, 8),
            'closingFeeBuffer' => round($closingFees, 8),
            'maintenanceRequirement' => round($maintenance, 8),
            'pendingReserve' => round((float) $pendingReserve, 8),
            'equity' => round($equity, 8),
            'availableMargin' => round($available, 8),
            'marginRatio' => $maintenance > 0 ? round($equity / $maintenance, 8) : null,
            'liquidationRequired' => $complete && $open->isNotEmpty() && $equity <= $maintenance,
        ];
    }

    public function marketKey($position): string
    {
        return strtolower((string) $this->value($position, 'exchange', 'bybit')).':'
            .strtolower((string) $this->value($position, 'category', 'linear')).':'
            .strtoupper((string) $this->value($position, 'symbol', ''));
    }

    private function isCrossFuture($position): bool
    {
        return $this->value($position, 'margin_mode', $this->value($position, 'marginMode', 'isolated')) === 'cross'
            && $this->value($position, 'category', 'linear') !== 'spot';
    }

    private function value($item, string $key, $default = null)
    {
        if (is_array($item)) return $item[$key] ?? $default;

        return $item->{$key} ?? $default;
    }
}

<?php

namespace Tests\Unit;

use App\Services\CrossMarginService;
use PHPUnit\Framework\TestCase;

class CrossMarginServiceTest extends TestCase
{
    public function test_it_calculates_mixed_side_multi_symbol_cross_metrics(): void
    {
        $service = new CrossMarginService();
        $result = $service->calculate(700, [
            $this->position('BTCUSDT', 'long', 1, 100, 100),
            $this->position('ETHUSDT', 'short', 2, 50, 100),
        ], [], [
            'bybit:linear:BTCUSDT' => 110,
            'bybit:linear:ETHUSDT' => 45,
        ], 0.0004);

        $this->assertTrue($result['complete']);
        $this->assertSame(200.0, $result['initialMargin']);
        $this->assertSame(20.0, $result['unrealizedPnl']);
        $this->assertSame(920.0, $result['equity']);
        $this->assertSame(719.92, $result['availableMargin']);
        $this->assertFalse($result['liquidationRequired']);
    }

    public function test_it_includes_pending_cross_reservations_but_excludes_isolated_and_spot(): void
    {
        $service = new CrossMarginService();
        $result = $service->calculate(1000, [], [
            $this->position('BTCUSDT', 'long', 1, 100, 200),
            [...$this->position('ETHUSDT', 'long', 1, 100, 500), 'margin_mode' => 'isolated'],
            [...$this->position('SOLUSDT', 'long', 1, 100, 500), 'category' => 'spot'],
        ], [], 0.0004);

        $this->assertSame(200.08, $result['pendingReserve']);
        $this->assertSame(799.92, $result['availableMargin']);
    }

    public function test_missing_marks_make_the_result_incomplete_and_never_liquidate(): void
    {
        $service = new CrossMarginService();
        $result = $service->calculate(0, [
            $this->position('BTCUSDT', 'long', 1, 100, 10),
        ], [], [], 0.0004);

        $this->assertFalse($result['complete']);
        $this->assertSame(['bybit:linear:BTCUSDT'], $result['missingMarkets']);
        $this->assertFalse($result['liquidationRequired']);
    }

    public function test_it_flags_portfolio_liquidation_at_the_maintenance_boundary(): void
    {
        $service = new CrossMarginService();
        $position = $this->position('BTCUSDT', 'long', 10, 100, 100);
        $result = $service->calculate(-45, [$position], [], [
            'bybit:linear:BTCUSDT' => 95,
        ], 0.0004);

        $this->assertTrue($result['complete']);
        $this->assertTrue($result['liquidationRequired']);
        $this->assertLessThanOrEqual($result['maintenanceRequirement'], $result['equity']);
    }

    private function position(string $symbol, string $side, float $quantity, float $entry, float $margin): array
    {
        return [
            'exchange' => 'bybit',
            'category' => 'linear',
            'margin_mode' => 'cross',
            'symbol' => $symbol,
            'side' => $side,
            'quantity' => $quantity,
            'entry_price' => $entry,
            'margin' => $margin,
            'leverage' => 1,
        ];
    }
}

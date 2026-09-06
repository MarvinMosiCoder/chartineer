<?php

namespace Tests\Unit;

use App\Models\MarketBacktestChallenge;
use App\Services\PropChallengeService;
use Illuminate\Support\Collection;
use Tests\TestCase;

/**
 * The rule arithmetic, exercised without a database via evaluateTrades().
 *
 * These are the tests that matter most in this feature: a challenge's verdict is
 * the whole product, and every rule here has an off-by-one or an anchor that is
 * easy to get subtly wrong. Each rule is checked one unit under the threshold,
 * exactly at it, and past it.
 */
class PropChallengeServiceTest extends TestCase
{
    private const DAY = 86400;
    /** 2026-01-01 00:00:00 UTC */
    private const START = 1767225600;

    private function service(): PropChallengeService
    {
        return new PropChallengeService();
    }

    private function challenge(array $rules = []): MarketBacktestChallenge
    {
        $challenge = new MarketBacktestChallenge();
        $challenge->forceFill(array_merge([
            'starting_balance' => 50000,
            'drawdown_type' => 'static',
            'status' => MarketBacktestChallenge::STATUS_ACTIVE,
            'started_at_time' => self::START,
            'current_at_time' => self::START,
        ], $rules));

        return $challenge;
    }

    /** @param array<int, array{0:int,1:float}> $rows [dayOffset, pnl] */
    private function trades(array $rows): Collection
    {
        return collect($rows)->map(fn ($row, $index) => (object) [
            'id' => $index + 1,
            'closed_at_time' => self::START + ($row[0] * self::DAY) + 3600,
            'realized_pnl' => $row[1],
        ])->values();
    }

    private function at(int $dayOffset): int
    {
        return self::START + ($dayOffset * self::DAY) + 7200;
    }

    // ---------------------------------------------------------------- daily loss

    public function test_daily_loss_under_the_limit_does_not_breach(): void
    {
        $challenge = $this->challenge(['max_daily_loss_percent' => 5]); // 2,500 of 50,000
        $result = $this->service()->evaluateTrades($challenge, $this->trades([[0, -2499.99]]), $this->at(0));

        $this->assertNull($result['breach']);
        $this->assertSame(MarketBacktestChallenge::STATUS_ACTIVE, $result['verdict']);
        $this->assertEqualsWithDelta(0.01, $result['metrics']['dailyLossHeadroom'], 0.0001);
    }

    public function test_daily_loss_exactly_at_the_limit_breaches(): void
    {
        $challenge = $this->challenge(['max_daily_loss_percent' => 5]);
        $result = $this->service()->evaluateTrades($challenge, $this->trades([[0, -2500]]), $this->at(0));

        $this->assertSame(PropChallengeService::RULE_DAILY_LOSS, $result['breach']['rule']);
        $this->assertSame(MarketBacktestChallenge::STATUS_FAILED, $result['verdict']);
        $this->assertTrue($result['blocked']);
    }

    /** Yesterday's loss must not follow the trader into today. */
    public function test_daily_loss_resets_on_the_next_replay_day(): void
    {
        $challenge = $this->challenge(['max_daily_loss_percent' => 5]);
        $trades = $this->trades([[0, -2400], [1, -1000]]);

        $this->assertNull($this->service()->evaluateTrades($challenge, $trades, $this->at(1))['breach']);
    }

    public function test_a_null_rule_is_never_evaluated(): void
    {
        $challenge = $this->challenge(['max_daily_loss_percent' => null]);
        $result = $this->service()->evaluateTrades($challenge, $this->trades([[0, -40000]]), $this->at(0));

        $this->assertNull($result['breach']);
        $this->assertNull($result['metrics']['dailyLossHeadroom']);
    }

    // ----------------------------------------------------------------- drawdown

    public function test_static_drawdown_floor_is_fixed_to_the_starting_balance(): void
    {
        $challenge = $this->challenge(['max_total_drawdown_percent' => 10, 'drawdown_type' => 'static']);

        // Up 5,000 then down 9,999 → balance 45,001, floor 45,000. No breach.
        $safe = $this->service()->evaluateTrades($challenge, $this->trades([[0, 5000], [1, -9999]]), $this->at(1));
        $this->assertNull($safe['breach']);

        // One more unit down crosses it.
        $breached = $this->service()->evaluateTrades($challenge, $this->trades([[0, 5000], [1, -10000.01]]), $this->at(1));
        $this->assertSame(PropChallengeService::RULE_TOTAL_DRAWDOWN, $breached['breach']['rule']);
    }

    /**
     * The trailing floor follows the peak, but its size stays a percentage of the
     * starting balance — the allowance must not widen as the trader profits.
     */
    public function test_trailing_drawdown_floor_follows_the_peak_with_a_fixed_allowance(): void
    {
        $challenge = $this->challenge(['max_total_drawdown_percent' => 6, 'drawdown_type' => 'trailing']);

        // Peak 53,000 → floor 53,000 - 3,000 = 50,000. Balance 50,001 survives.
        $safe = $this->service()->evaluateTrades($challenge, $this->trades([[0, 3000], [1, -2999]]), $this->at(1));
        $this->assertNull($safe['breach']);
        $this->assertEqualsWithDelta(53000, $safe['metrics']['peakBalance'], 0.0001);

        // Balance 49,999 is below the moved floor, even though it is still above
        // the original starting balance minus the allowance.
        $breached = $this->service()->evaluateTrades($challenge, $this->trades([[0, 3000], [1, -3001]]), $this->at(1));
        $this->assertSame(PropChallengeService::RULE_TOTAL_DRAWDOWN, $breached['breach']['rule']);
    }

    public function test_peak_balance_never_falls_below_the_starting_balance(): void
    {
        $challenge = $this->challenge(['max_total_drawdown_percent' => 10, 'drawdown_type' => 'trailing']);
        $result = $this->service()->evaluateTrades($challenge, $this->trades([[0, -1000]]), $this->at(0));

        $this->assertEqualsWithDelta(50000, $result['metrics']['peakBalance'], 0.0001);
    }

    // ------------------------------------------------------------- calendar days

    public function test_days_elapsed_counts_calendar_dates_inclusive_not_24h_periods(): void
    {
        $challenge = $this->challenge(['max_calendar_days' => 3]);
        $service = $this->service();

        $this->assertSame(1, $service->evaluateTrades($challenge, collect(), self::START + 60)['metrics']['daysElapsed']);
        $this->assertSame(3, $service->evaluateTrades($challenge, collect(), $this->at(2))['metrics']['daysElapsed']);
        $this->assertNull($service->evaluateTrades($challenge, collect(), $this->at(2))['breach']);

        $over = $service->evaluateTrades($challenge, collect(), $this->at(3));
        $this->assertSame(PropChallengeService::RULE_CALENDAR_DAYS, $over['breach']['rule']);
    }

    // ------------------------------------------------------------------ passing

    public function test_hitting_the_target_with_enough_trading_days_passes(): void
    {
        $challenge = $this->challenge(['profit_target_percent' => 8, 'min_trading_days' => 4]);
        $trades = $this->trades([[0, 1000], [1, 1000], [2, 1000], [3, 1000]]); // 4,000 = 8%

        $result = $this->service()->evaluateTrades($challenge, $trades, $this->at(3));

        $this->assertSame(MarketBacktestChallenge::STATUS_PASSED, $result['verdict']);
        $this->assertSame(4, $result['metrics']['tradingDays']);
    }

    public function test_the_target_alone_does_not_pass_without_the_minimum_trading_days(): void
    {
        $challenge = $this->challenge(['profit_target_percent' => 8, 'min_trading_days' => 4]);
        $trades = $this->trades([[0, 4000]]); // target met on one day

        $result = $this->service()->evaluateTrades($challenge, $trades, $this->at(0));

        $this->assertSame(MarketBacktestChallenge::STATUS_ACTIVE, $result['verdict']);
        $this->assertSame(1, $result['metrics']['tradingDays']);
    }

    /** Only trading days count, not days merely elapsed. */
    public function test_trading_days_counts_days_with_a_closed_trade_only(): void
    {
        $challenge = $this->challenge(['profit_target_percent' => 8, 'min_trading_days' => 3]);
        $trades = $this->trades([[0, 2000], [5, 2000]]);

        $result = $this->service()->evaluateTrades($challenge, $trades, $this->at(5));

        $this->assertSame(2, $result['metrics']['tradingDays']);
        $this->assertSame(6, $result['metrics']['daysElapsed']);
        $this->assertSame(MarketBacktestChallenge::STATUS_ACTIVE, $result['verdict']);
    }

    public function test_a_challenge_with_no_target_never_passes_on_its_own(): void
    {
        $challenge = $this->challenge(['profit_target_percent' => null]);
        $result = $this->service()->evaluateTrades($challenge, $this->trades([[0, 999999]]), $this->at(0));

        $this->assertSame(MarketBacktestChallenge::STATUS_ACTIVE, $result['verdict']);
    }

    // -------------------------------------------------------------- consistency

    public function test_consistency_blocks_a_pass_when_one_day_carries_too_much_profit(): void
    {
        $challenge = $this->challenge([
            'profit_target_percent' => 8, 'min_trading_days' => 2, 'consistency_percent' => 40,
        ]);
        // 3,600 of 4,000 on one day = 90% > 40%.
        $trades = $this->trades([[0, 3600], [1, 400]]);

        $result = $this->service()->evaluateTrades($challenge, $trades, $this->at(1));

        $this->assertSame(MarketBacktestChallenge::STATUS_ACTIVE, $result['verdict']);
        $this->assertEqualsWithDelta(90.0, $result['metrics']['consistencyRatio'], 0.0001);
    }

    /**
     * Consistency must never *fail* a run: later profit dilutes an outsized day,
     * so a mid-window failure would report a verdict the same run could disprove.
     */
    public function test_consistency_never_produces_a_failure(): void
    {
        $challenge = $this->challenge([
            'profit_target_percent' => 8, 'min_trading_days' => 2, 'consistency_percent' => 40,
        ]);
        $lopsided = $this->trades([[0, 3600], [1, 400]]);

        $this->assertNull($this->service()->evaluateTrades($challenge, $lopsided, $this->at(1))['breach']);

        // Two more even days dilute the big one and the same run now passes.
        $diluted = $this->trades([[0, 3600], [1, 400], [2, 2500], [3, 2500]]);
        $this->assertSame(
            MarketBacktestChallenge::STATUS_PASSED,
            $this->service()->evaluateTrades($challenge, $diluted, $this->at(3))['verdict']
        );
    }

    // ---------------------------------------------------------------- precedence

    public function test_daily_loss_is_reported_before_drawdown_when_both_break_together(): void
    {
        $challenge = $this->challenge([
            'max_daily_loss_percent' => 5,    // 2,500
            'max_total_drawdown_percent' => 4, // floor 48,000
        ]);
        // A single 3,000 loss breaches both at once.
        $result = $this->service()->evaluateTrades($challenge, $this->trades([[0, -3000]]), $this->at(0));

        $this->assertSame(PropChallengeService::RULE_DAILY_LOSS, $result['breach']['rule']);
    }

    public function test_a_failure_outranks_a_met_profit_target(): void
    {
        $challenge = $this->challenge([
            'profit_target_percent' => 8, 'min_trading_days' => 1, 'max_daily_loss_percent' => 5,
        ]);
        // Target met on day 0, then a 2,600 loss on day 1 breaches the daily cap.
        $trades = $this->trades([[0, 4000], [1, -2600]]);

        $result = $this->service()->evaluateTrades($challenge, $trades, $this->at(1));

        $this->assertSame(MarketBacktestChallenge::STATUS_FAILED, $result['verdict']);
        $this->assertSame(PropChallengeService::RULE_DAILY_LOSS, $result['breach']['rule']);
    }

    // ------------------------------------------------------------------ metrics

    public function test_headroom_metrics_report_room_left_not_room_used(): void
    {
        $challenge = $this->challenge([
            'profit_target_percent' => 8, 'max_daily_loss_percent' => 5, 'max_total_drawdown_percent' => 10,
        ]);
        $result = $this->service()->evaluateTrades($challenge, $this->trades([[0, -1000]]), $this->at(0));

        $this->assertEqualsWithDelta(1500, $result['metrics']['dailyLossHeadroom'], 0.0001);
        $this->assertEqualsWithDelta(4000, $result['metrics']['drawdownHeadroom'], 0.0001);
        $this->assertEqualsWithDelta(-25.0, $result['metrics']['progressPercent'], 0.0001);
    }

    public function test_an_empty_challenge_reports_clean_metrics(): void
    {
        $result = $this->service()->evaluateTrades($this->challenge(), collect(), self::START);

        $this->assertEqualsWithDelta(50000, $result['metrics']['balance'], 0.0001);
        $this->assertSame(0, $result['metrics']['tradingDays']);
        $this->assertNull($result['metrics']['consistencyRatio']);
        $this->assertNull($result['breach']);
    }
}

<?php

namespace Tests\Feature;

use App\Models\AdmModels\AdmPrivileges;
use App\Models\AdmUser;
use App\Models\MarketBacktestAccount;
use App\Models\MarketBacktestPosition;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\TestCase;

class CrossMarginTakeProfitRealDatabaseTest extends TestCase
{
    use DatabaseTransactions;

    public function test_take_profit_closes_a_cross_position_via_process_candle(): void
    {
        $user = AdmUser::query()->create([
            'name' => 'Cross Margin TP Test',
            'email' => uniqid('cross-margin-tp-', true).'@example.test',
            'password' => bcrypt('password'),
            'status' => 'ACTIVE',
            'replay_trial_ends_at' => now()->addDays(7),
            'id_adm_privileges' => AdmPrivileges::query()->where('is_superadmin', false)->value('id'),
        ]);

        $open = $this->actingAs($user)->postJson('/market-backtest/positions', [
            'symbol' => 'BTCUSDT',
            'side' => 'long',
            'category' => 'linear',
            'margin_mode' => 'cross',
            'leverage' => 5,
            'notional' => 500,
            'price' => 100,
            'take_profit' => 110,
            'stop_loss' => 90,
        ]);
        $open->assertOk();
        $this->assertSame('cross', $open->json('account.openPositions.0.marginMode'));
        $this->assertEquals(110, $open->json('account.openPositions.0.takeProfit'));

        $account = MarketBacktestAccount::query()->where('adm_user_id', $user->id)->firstOrFail();
        $position = MarketBacktestPosition::query()->where('market_backtest_account_id', $account->id)->firstOrFail();

        $response = $this->actingAs($user)->postJson("/market-backtest/positions/{$position->id}/process-candle", [
            'high' => 115,
            'low' => 105,
            'price' => 112,
            'executed_at_time' => time(),
        ]);

        // A triggered level delegates straight to closePosition(), whose response has no
        // `triggered` key at all (that key only exists on the "nothing crossed" early-return
        // branch) — the presence of `closedTrade` is what proves this actually fired.
        $response->assertOk();
        $this->assertSame('take_profit', $response->json('closedTrade.reason'));
        $this->assertSame('closed', $position->fresh()->status);
        $this->assertSame('take_profit', $position->fresh()->close_reason);
    }
}

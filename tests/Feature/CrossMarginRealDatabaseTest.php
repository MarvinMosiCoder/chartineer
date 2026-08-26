<?php

namespace Tests\Feature;

use App\Models\AdmModels\AdmPrivileges;
use App\Models\AdmUser;
use App\Models\MarketBacktestAccount;
use App\Models\MarketBacktestMark;
use App\Models\MarketBacktestPosition;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\TestCase;

/**
 * Exercises Cross Margin through the REAL production routes (routes/web.php),
 * the REAL middleware stack (auth, account.active, replay.access, throttle),
 * and the REAL migrated MySQL schema — unlike the other Cross Margin feature
 * tests, which register bare test-only routes against an in-memory sqlite
 * schema built by hand. That sqlite coverage is still valuable for fast,
 * isolated unit-of-work testing, but it can't catch a routing/middleware
 * wiring mistake or a MySQL-specific schema behavior. Wrapped in
 * DatabaseTransactions so every row this test creates — including the
 * throwaway user — is rolled back when the test ends; nothing is left in
 * the real database.
 */
class CrossMarginRealDatabaseTest extends TestCase
{
    use DatabaseTransactions;

    public function test_cross_margin_works_end_to_end_through_the_real_routes_and_schema(): void
    {
        $user = AdmUser::query()->create([
            'name' => 'Cross Margin Real DB Test',
            'email' => uniqid('cross-margin-realdb-', true).'@example.test',
            'password' => bcrypt('password'),
            'status' => 'ACTIVE',
            'replay_trial_ends_at' => now()->addDays(7),
            'id_adm_privileges' => AdmPrivileges::query()->where('is_superadmin', false)->value('id'),
        ]);

        // 1) First open a Cross position — this also lazily creates the account.
        $open = $this->actingAs($user)->postJson('/market-backtest/positions', [
            'symbol' => 'BTCUSDT',
            'side' => 'long',
            'category' => 'linear',
            'margin_mode' => 'cross',
            'leverage' => 5,
            'notional' => 500,
            'price' => 100,
        ]);
        $open->assertOk();
        $this->assertSame('cross', $open->json('account.openPositions.0.marginMode'));
        $this->assertNull($open->json('account.openPositions.0.liquidationPrice'));
        $this->assertEquals(500.0, $open->json('account.cross.initialMargin'));
        $this->assertTrue((bool) $open->json('account.cross.complete'));

        $account = MarketBacktestAccount::query()->where('adm_user_id', $user->id)->firstOrFail();
        $position = MarketBacktestPosition::query()->where('market_backtest_account_id', $account->id)->firstOrFail();

        $this->assertDatabaseHas('market_backtest_marks', [
            'market_backtest_account_id' => $account->id,
            'exchange' => 'bybit',
            'category' => 'linear',
            'symbol' => 'BTCUSDT',
            'mode' => 'live',
        ]);

        // 2) A second Cross entry that would overdraw the shared available margin is rejected.
        $rejected = $this->actingAs($user)->postJson('/market-backtest/positions', [
            'symbol' => 'ETHUSDT',
            'side' => 'long',
            'category' => 'linear',
            'margin_mode' => 'cross',
            'leverage' => 1,
            'notional' => 1000000,
            'price' => 50,
        ]);
        $rejected->assertUnprocessable();

        // 3) Spot never accepts Cross.
        $this->actingAs($user)->postJson('/market-backtest/positions', [
            'symbol' => 'SOLUSDT',
            'side' => 'long',
            'category' => 'spot',
            'margin_mode' => 'cross',
            'notional' => 10,
            'price' => 20,
        ])->assertUnprocessable()->assertJsonPath('message', 'Spot positions do not support Cross Margin.');

        // 4) Reading the account reflects a rising mark price and updates unrealized PnL.
        $show = $this->actingAs($user)->getJson('/market-backtest/account?'.http_build_query([
            'symbol' => 'BTCUSDT',
            'exchange' => 'bybit',
            'category' => 'linear',
            'mode' => 'live',
            'price' => 120,
        ]));
        $show->assertOk();
        $this->assertEquals(500.0, $show->json('account.cross.initialMargin'));
        $this->assertGreaterThan(0, $show->json('account.cross.unrealizedPnl'));

        // 5) An explicit Cross evaluation on a healthy portfolio makes no changes.
        $evaluate = $this->actingAs($user)->postJson('/market-backtest/cross/evaluate', ['mode' => 'live']);
        $evaluate->assertOk();
        $this->assertNull($evaluate->json('liquidation'));

        // 6) Manual close recalculates the remaining (now-empty) Cross portfolio and reconciles cash.
        $close = $this->actingAs($user)->postJson("/market-backtest/positions/{$position->id}/close", [
            'price' => 120,
        ]);
        $close->assertOk();
        $this->assertSame('BTCUSDT', $close->json('closedTrade.symbol'));
        $this->assertEquals(0.0, $close->json('account.cross.initialMargin'));

        $this->assertSame('closed', $position->fresh()->status);
        $this->assertGreaterThan(1000, (float) $account->fresh()->cash_balance);

        // 7) A now-breached Cross portfolio is actually liquidated end-to-end via the real
        // evaluate endpoint, against the real schema's unique/foreign-key constraints.
        $liquidatable = MarketBacktestPosition::query()->create([
            'market_backtest_account_id' => $account->id,
            'symbol' => 'BTCUSDT',
            'exchange' => 'bybit',
            'category' => 'linear',
            'margin_mode' => 'cross',
            'side' => 'long',
            'quantity' => 10,
            'entry_price' => 100,
            'margin' => 100,
            'leverage' => 10,
            'entry_fee' => 0.4,
            'status' => 'open',
        ]);
        MarketBacktestMark::query()->create([
            'market_backtest_account_id' => $account->id,
            'market_backtest_session_id' => null,
            'exchange' => 'bybit',
            'category' => 'linear',
            'symbol' => 'BTCUSDT',
            'mode' => 'live',
            'price' => 50,
            'candle_time' => time(),
            'observed_at' => now(),
            'status' => 'fresh',
        ]);
        $account->update(['cash_balance' => 0]);

        $liquidationResponse = $this->actingAs($user)->postJson('/market-backtest/cross/evaluate', ['mode' => 'live']);
        $liquidationResponse->assertOk();
        $this->assertSame('maintenance_breached', $liquidationResponse->json('liquidation.reason'));
        $this->assertSame('closed', $liquidatable->fresh()->status);
        $this->assertSame('cross_liquidation', $liquidatable->fresh()->close_reason);
    }
}

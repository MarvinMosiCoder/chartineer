<?php

namespace Tests\Feature;

use App\Models\AdmModels\AdmNotifications;
use App\Models\AdmModels\AdmPrivileges;
use App\Models\AdmUser;
use App\Models\MarketBacktestAccount;
use App\Models\MarketBacktestPosition;
use App\Services\BacktestTradeNotificationService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\TestCase;

/**
 * Runs against the real schema (like the Cross Margin real-database tests)
 * rather than the sqlite-backed feature tests, which skip in this environment.
 */
class BacktestTradeNotificationTest extends TestCase
{
    use DatabaseTransactions;

    private function makeUser(): AdmUser
    {
        return AdmUser::query()->create([
            'name' => 'Trade Notification Test',
            'email' => uniqid('trade-notif-', true).'@example.test',
            'password' => bcrypt('password'),
            'status' => 'ACTIVE',
            'replay_trial_ends_at' => now()->addDays(7),
            'id_adm_privileges' => AdmPrivileges::query()->where('is_superadmin', false)->value('id'),
        ]);
    }

    private function tradeNotifications(AdmUser $user)
    {
        return AdmNotifications::query()
            ->where('adm_user_id', $user->id)
            ->whereIn('source_type', BacktestTradeNotificationService::TRADE_SOURCE_TYPES)
            ->orderBy('id')
            ->get();
    }

    public function test_a_fill_and_a_triggered_close_each_record_one_notification(): void
    {
        $user = $this->makeUser();

        $this->actingAs($user)->postJson('/market-backtest/positions', [
            'symbol' => 'BTCUSDT', 'side' => 'long', 'category' => 'linear',
            'margin_mode' => 'cross', 'leverage' => 5, 'notional' => 500,
            'price' => 100, 'take_profit' => 110, 'stop_loss' => 90,
        ])->assertOk();

        $fills = $this->tradeNotifications($user);
        $this->assertCount(1, $fills, 'opening a position should record exactly one fill notification');
        $this->assertSame('backtest_trade_open', $fills->first()->source_type);
        $this->assertSame('order filled', $fills->first()->type);
        // The bug this guards: adm_user_id lives on the account, not the position.
        $this->assertSame($user->id, $fills->first()->adm_user_id);

        $account = MarketBacktestAccount::query()->where('adm_user_id', $user->id)->firstOrFail();
        $position = MarketBacktestPosition::query()->where('market_backtest_account_id', $account->id)->firstOrFail();

        $this->actingAs($user)->postJson("/market-backtest/positions/{$position->id}/process-candle", [
            'high' => 115, 'low' => 105, 'price' => 112, 'executed_at_time' => time(),
        ])->assertOk();

        $all = $this->tradeNotifications($user);
        $this->assertCount(2, $all, 'the take-profit close should add a second notification');

        $close = $all->last();
        $this->assertSame('backtest_trade_close', $close->source_type);
        $this->assertSame('take profit', $close->type);
        $this->assertSame('take_profit', $close->metadata['close_reason']);
        $this->assertSame('BTCUSDT', $close->metadata['symbol']);
        // Not an application error, so it must never be filed as one.
        $this->assertNotSame('error', $close->type);
    }

    public function test_the_feed_separates_trade_notifications_from_system_ones(): void
    {
        $user = $this->makeUser();

        AdmNotifications::query()->create([
            'adm_user_id' => $user->id, 'type' => 'info',
            'content' => 'Welcome to BacktradeLab', 'url' => '/', 'is_read' => false,
        ]);

        $this->actingAs($user)->postJson('/market-backtest/positions', [
            'symbol' => 'BTCUSDT', 'side' => 'long', 'category' => 'linear',
            'margin_mode' => 'cross', 'leverage' => 5, 'notional' => 500, 'price' => 100,
        ])->assertOk();

        $feed = $this->actingAs($user)->getJson('/notifications/feed')->assertOk();

        $this->assertSame(1, $feed->json('unread_trades'));
        $this->assertGreaterThanOrEqual(1, $feed->json('unread_system'));

        $categories = collect($feed->json('notifications'))->pluck('category', 'content');
        $this->assertSame('system', $categories['Welcome to BacktradeLab']);
        $this->assertContains('trade', $categories->values());
    }

    public function test_pruning_removes_only_aged_trade_notifications(): void
    {
        $user = $this->makeUser();

        $trade = AdmNotifications::query()->create([
            'adm_user_id' => $user->id, 'type' => 'stop loss', 'content' => 'old trade',
            'url' => '/', 'is_read' => true, 'source_type' => 'backtest_trade_close', 'source_id' => 999999,
        ]);
        $system = AdmNotifications::query()->create([
            'adm_user_id' => $user->id, 'type' => 'info', 'content' => 'old system message',
            'url' => '/', 'is_read' => true,
        ]);
        // created_at is not fillable, so age both rows after the fact.
        AdmNotifications::query()->whereIn('id', [$trade->id, $system->id])
            ->update(['created_at' => now()->subDays(45)]);

        $this->artisan('notifications:prune-trades')->assertExitCode(0);

        $this->assertNull(AdmNotifications::query()->find($trade->id), 'aged trade notification should be pruned');
        $this->assertNotNull(
            AdmNotifications::query()->find($system->id),
            'system notifications must never be pruned, at any age'
        );
    }
}

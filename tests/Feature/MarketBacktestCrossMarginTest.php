<?php

namespace Tests\Feature;

use App\Http\Controllers\MarketBacktestController;
use App\Http\Middleware\HandleInertiaRequests;
use App\Models\AdmUser;
use App\Models\MarketBacktestAccount;
use App\Models\MarketBacktestPosition;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class MarketBacktestCrossMarginTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        if (!in_array('sqlite', \PDO::getAvailableDrivers(), true)) {
            $this->markTestSkipped('The pdo_sqlite extension is required for isolated backtest feature tests.');
        }

        config()->set('database.default', 'sqlite');
        config()->set('database.connections.sqlite.database', ':memory:');
        DB::purge('sqlite');
        DB::reconnect('sqlite');

        $this->withoutMiddleware(HandleInertiaRequests::class);
        $this->createSchema();

        Route::middleware(['web', 'auth'])->post(
            '/_test/market-backtest/positions',
            [MarketBacktestController::class, 'openPosition']
        );
        Route::middleware(['web', 'auth'])->post(
            '/_test/market-backtest/positions/{position}/trigger',
            [MarketBacktestController::class, 'triggerPosition']
        );
        Route::middleware(['web', 'auth'])->post(
            '/_test/market-backtest/positions/{position}/cancel',
            [MarketBacktestController::class, 'cancelPosition']
        );
        Route::middleware(['web', 'auth'])->post(
            '/_test/market-backtest/positions/{position}/close',
            [MarketBacktestController::class, 'closePosition']
        );
    }

    public function test_cross_entry_is_accepted_exactly_at_the_available_margin_boundary(): void
    {
        [$user, $account] = $this->accountWithCash(1000);
        $this->seedPendingCross($account, margin: 499.81, entryFee: 0);

        // availableMargin = 1000 - pendingReserve(499.81) = 500.19
        // requiredCash for margin 500 @ 1x, price 100 = 500 + (500 * 0.0004) = 500.2 > 500.19
        $this->actingAs($user)->postJson('/_test/market-backtest/positions', $this->crossOrderPayload('ETHUSDT', 500, 1, 50))
            ->assertUnprocessable()
            ->assertJsonPath('message', 'Insufficient shared Cross available margin.');

        $this->assertSame(0, MarketBacktestPosition::query()->where('symbol', 'ETHUSDT')->count());
    }

    public function test_cross_entry_is_accepted_when_required_cash_exactly_equals_available_margin(): void
    {
        [$user, $account] = $this->accountWithCash(1000);
        $this->seedPendingCross($account, margin: 499.8, entryFee: 0);

        // availableMargin = 1000 - 499.8 = 500.2, requiredCash for margin 500 @ 1x = 500.2 (equal, not over)
        $response = $this->actingAs($user)->postJson('/_test/market-backtest/positions', $this->crossOrderPayload('ETHUSDT', 500, 1, 50))
            ->assertOk();
        $this->assertEquals(0.0, $response->json('account.cross.availableMargin'));

        $this->assertSame(1, MarketBacktestPosition::query()->where('symbol', 'ETHUSDT')->where('status', 'open')->count());
    }

    public function test_cross_entry_is_blocked_until_every_open_cross_market_has_a_current_mark(): void
    {
        [$user, $account] = $this->accountWithCash(1000);

        MarketBacktestPosition::query()->create([
            'market_backtest_account_id' => $account->id,
            'symbol' => 'BTCUSDT',
            'exchange' => 'bybit',
            'category' => 'linear',
            'margin_mode' => 'cross',
            'side' => 'long',
            'quantity' => 1,
            'entry_price' => 100,
            'margin' => 100,
            'leverage' => 1,
            'entry_fee' => 0.04,
            'status' => 'open',
        ]);

        $response = $this->actingAs($user)->postJson('/_test/market-backtest/positions', $this->crossOrderPayload('ETHUSDT', 50, 1, 50))
            ->assertUnprocessable();

        $this->assertSame('bybit:linear:BTCUSDT', $response->json('missingMarkets.0'));
        $this->assertSame(0, MarketBacktestPosition::query()->where('symbol', 'ETHUSDT')->count());
    }

    public function test_cross_entry_can_be_backed_by_unrealized_profit_in_another_open_cross_position(): void
    {
        [$user, $account] = $this->accountWithCash(10);

        MarketBacktestPosition::query()->create([
            'market_backtest_account_id' => $account->id,
            'symbol' => 'BTCUSDT',
            'exchange' => 'bybit',
            'category' => 'linear',
            'margin_mode' => 'cross',
            'side' => 'long',
            'quantity' => 1,
            'entry_price' => 100,
            'margin' => 50,
            'leverage' => 1,
            'entry_fee' => 0.04,
            'status' => 'open',
        ]);
        \App\Models\MarketBacktestMark::query()->create([
            'market_backtest_account_id' => $account->id,
            'market_backtest_session_id' => null,
            'exchange' => 'bybit',
            'category' => 'linear',
            'symbol' => 'BTCUSDT',
            'mode' => 'live',
            'price' => 1000,
            'candle_time' => 1700000000,
            'observed_at' => now(),
            'status' => 'fresh',
        ]);

        // cash_balance (10) alone can't cover a 200-margin entry, but BTCUSDT's huge unrealized
        // profit (900) means the pooled Cross portfolio can — this must not be rejected by an
        // isolated-style "cash on hand" check the way it would be for an Isolated order.
        $response = $this->actingAs($user)->postJson('/_test/market-backtest/positions', $this->crossOrderPayload('ETHUSDT', 200, 1, 50))
            ->assertOk();

        $this->assertSame(1, MarketBacktestPosition::query()->where('symbol', 'ETHUSDT')->where('status', 'open')->count());
        $this->assertEquals(250.0, $response->json('account.cross.initialMargin'));
        $this->assertEqualsWithDelta(-190.08, (float) $account->fresh()->cash_balance, 0.0000001);
    }

    public function test_spot_orders_cannot_select_cross_margin_mode(): void
    {
        [$user] = $this->accountWithCash(1000);

        $this->actingAs($user)->postJson('/_test/market-backtest/positions', [
            'symbol' => 'BTCUSDT',
            'side' => 'long',
            'category' => 'spot',
            'margin_mode' => 'cross',
            'notional' => 100,
            'price' => 100,
        ])->assertUnprocessable()->assertJsonPath('message', 'Spot positions do not support Cross Margin.');
    }

    public function test_pending_cross_order_reserves_capacity_without_touching_cash_until_triggered(): void
    {
        [$user, $account] = $this->accountWithCash(1000);

        $payload = $this->crossOrderPayload('BTCUSDT', 500, 1, 100);
        $payload['order_type'] = 'limit';

        $response = $this->actingAs($user)->postJson('/_test/market-backtest/positions', $payload)
            ->assertOk();

        $this->assertSame(1000.0, (float) $account->fresh()->cash_balance);
        $this->assertSame(500.2, $response->json('account.cross.pendingReserve'));
        $this->assertSame(499.8, $response->json('account.cross.availableMargin'));

        $position = MarketBacktestPosition::query()->where('symbol', 'BTCUSDT')->where('status', 'pending')->firstOrFail();

        // Cancelling immediately frees the reservation.
        $cancelResponse = $this->actingAs($user)->postJson("/_test/market-backtest/positions/{$position->id}/cancel")
            ->assertOk();

        $this->assertEquals(0.0, $cancelResponse->json('account.cross.pendingReserve'));
        $this->assertEquals(1000.0, $cancelResponse->json('account.cross.availableMargin'));
        $this->assertSame('cancelled', $position->fresh()->status);
    }

    public function test_triggering_a_pending_cross_order_converts_reservation_into_an_open_position(): void
    {
        [$user, $account] = $this->accountWithCash(1000);

        $payload = $this->crossOrderPayload('BTCUSDT', 500, 1, 100);
        $payload['order_type'] = 'limit';
        $this->actingAs($user)->postJson('/_test/market-backtest/positions', $payload)->assertOk();

        $position = MarketBacktestPosition::query()->where('symbol', 'BTCUSDT')->where('status', 'pending')->firstOrFail();

        $response = $this->actingAs($user)->postJson("/_test/market-backtest/positions/{$position->id}/trigger", [
            'price' => 100,
        ])->assertOk();

        $this->assertSame('open', $position->fresh()->status);
        $this->assertSame(499.8, (float) $account->fresh()->cash_balance);
        $this->assertEquals(500.0, $response->json('account.cross.initialMargin'));
        $this->assertEquals(0.0, $response->json('account.cross.pendingReserve'));
    }

    public function test_manual_close_of_one_cross_position_recalculates_the_remaining_portfolio(): void
    {
        [$user, $account] = $this->accountWithCash(1000);

        $this->actingAs($user)->postJson('/_test/market-backtest/positions', $this->crossOrderPayload('BTCUSDT', 300, 1, 100))->assertOk();
        $btc = MarketBacktestPosition::query()->where('symbol', 'BTCUSDT')->firstOrFail();

        $this->actingAs($user)->postJson('/_test/market-backtest/positions', $this->crossOrderPayload('ETHUSDT', 200, 1, 50))->assertOk();

        $response = $this->actingAs($user)->postJson("/_test/market-backtest/positions/{$btc->id}/close", [
            'price' => 110,
        ])->assertOk();

        $this->assertSame('closed', $btc->fresh()->status);
        $this->assertSame('BTCUSDT', $response->json('closedTrade.symbol'));
        $this->assertEqualsWithDelta(30.0 - (300 * 0.0004) - (330 * 0.0004), $response->json('closedTrade.netPnl'), 0.0000001);

        // Only ETHUSDT remains in the Cross portfolio after BTCUSDT's manual close.
        $this->assertEquals(200.0, $response->json('account.cross.initialMargin'));
    }

    public function test_isolated_and_spot_positions_are_excluded_from_cross_accounting(): void
    {
        [$user, $account] = $this->accountWithCash(1000);

        $this->actingAs($user)->postJson('/_test/market-backtest/positions', [
            'symbol' => 'BTCUSDT',
            'side' => 'long',
            'category' => 'linear',
            'margin_mode' => 'isolated',
            'leverage' => 2,
            'notional' => 200,
            'price' => 100,
        ])->assertOk();

        $this->actingAs($user)->postJson('/_test/market-backtest/positions', [
            'symbol' => 'SOLUSDT',
            'side' => 'long',
            'category' => 'spot',
            'notional' => 100,
            'price' => 20,
        ])->assertOk();

        $response = $this->actingAs($user)->postJson('/_test/market-backtest/positions', $this->crossOrderPayload('ETHUSDT', 150, 1, 50))
            ->assertOk();

        $this->assertEquals(150.0, $response->json('account.cross.initialMargin'));

        $isolated = MarketBacktestPosition::query()->where('symbol', 'BTCUSDT')->firstOrFail();
        $this->assertNotNull($isolated->liquidation_price);
    }

    private function crossOrderPayload(string $symbol, float $margin, float $leverage, float $price): array
    {
        return [
            'symbol' => $symbol,
            'side' => 'long',
            'category' => 'linear',
            'margin_mode' => 'cross',
            'leverage' => $leverage,
            'notional' => $margin,
            'price' => $price,
        ];
    }

    private function accountWithCash(float $cash): array
    {
        $user = AdmUser::query()->create([
            'name' => 'Trader',
            'email' => uniqid('trader-', true).'@example.test',
            'password' => 'password',
            'status' => 'ACTIVE',
        ]);
        $account = MarketBacktestAccount::query()->create([
            'adm_user_id' => $user->id,
            'name' => 'Demo Account',
            'quote_currency' => 'USDT',
            'starting_balance' => $cash,
            'cash_balance' => $cash,
            'realized_pnl' => 0,
            'fees_paid' => 0,
            'is_active' => true,
        ]);

        return [$user, $account];
    }

    private function seedPendingCross(MarketBacktestAccount $account, float $margin, float $entryFee): MarketBacktestPosition
    {
        return MarketBacktestPosition::query()->create([
            'market_backtest_account_id' => $account->id,
            'symbol' => 'BTCUSDT',
            'exchange' => 'bybit',
            'category' => 'linear',
            'margin_mode' => 'cross',
            'side' => 'long',
            'quantity' => 1,
            'entry_price' => 100,
            'margin' => $margin,
            'leverage' => 1,
            'entry_fee' => $entryFee,
            'status' => 'pending',
        ]);
    }

    private function createSchema(): void
    {
        Schema::create('adm_users', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('email')->unique();
            $table->string('password')->nullable();
            $table->string('status')->default('ACTIVE');
            $table->string('timezone')->nullable();
            $table->rememberToken();
            $table->timestamps();
        });
        Schema::create('market_backtest_accounts', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('adm_user_id');
            $table->string('name')->default('Demo Account');
            $table->string('quote_currency')->default('USDT');
            $table->decimal('starting_balance', 24, 8)->default(1000);
            $table->decimal('cash_balance', 24, 8)->default(1000);
            $table->decimal('realized_pnl', 24, 8)->default(0);
            $table->decimal('fees_paid', 24, 8)->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });
        Schema::create('market_backtest_sessions', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('adm_user_id');
            $table->unsignedBigInteger('market_backtest_account_id');
            $table->string('name');
            $table->string('symbol');
            $table->string('exchange')->nullable();
            $table->string('market_category')->nullable();
            $table->string('timeframe')->nullable();
            $table->decimal('starting_balance', 24, 8)->default(0);
            $table->unsignedBigInteger('started_at_time')->nullable();
            $table->unsignedBigInteger('ended_at_time')->nullable();
            $table->string('status')->default('active');
            $table->timestamps();
        });
        Schema::create('market_backtest_risk_settings', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('adm_user_id')->unique();
            $table->string('mode', 16)->default('warning');
            $table->decimal('max_daily_loss', 24, 8)->nullable();
            $table->unsignedSmallInteger('max_trades_per_day')->nullable();
            $table->unsignedSmallInteger('max_concurrent_positions')->nullable();
            $table->unsignedSmallInteger('max_consecutive_losses')->nullable();
            $table->boolean('is_enabled')->default(false);
            $table->timestamps();
        });
        Schema::create('market_backtest_positions', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('market_backtest_account_id');
            $table->unsignedBigInteger('market_backtest_session_id')->nullable();
            $table->unsignedBigInteger('market_backtest_playbook_id')->nullable();
            $table->string('symbol');
            $table->string('exchange', 32)->default('bybit');
            $table->string('category')->default('linear');
            $table->string('margin_mode', 16)->default('isolated');
            $table->string('side');
            $table->string('order_type')->default('market');
            $table->decimal('quantity', 24, 10);
            $table->decimal('original_quantity', 24, 10)->nullable();
            $table->decimal('entry_price', 24, 8);
            $table->decimal('margin', 24, 8);
            $table->decimal('original_margin', 24, 8)->nullable();
            $table->decimal('leverage', 8, 2)->default(1);
            $table->decimal('entry_fee', 24, 8)->default(0);
            $table->decimal('original_entry_fee', 24, 8)->nullable();
            $table->decimal('exit_fee', 24, 8)->default(0);
            $table->decimal('realized_pnl', 24, 8)->default(0);
            $table->decimal('exit_price', 24, 8)->nullable();
            $table->unsignedBigInteger('opened_at_time')->nullable();
            $table->unsignedBigInteger('closed_at_time')->nullable();
            $table->decimal('stop_loss', 24, 8)->nullable();
            $table->decimal('take_profit', 24, 8)->nullable();
            $table->decimal('liquidation_price', 24, 8)->nullable();
            $table->decimal('trailing_stop_percent', 8, 4)->nullable();
            $table->decimal('break_even_trigger_percent', 8, 4)->nullable();
            $table->decimal('partial_take_profit_percent', 8, 4)->nullable();
            $table->boolean('partial_take_profit_executed')->default(false);
            $table->decimal('favorable_price', 24, 8)->nullable();
            $table->decimal('adverse_price', 24, 8)->nullable();
            $table->string('close_reason', 32)->nullable();
            $table->string('status')->default('open');
            $table->string('setup_tag')->nullable();
            $table->json('tags')->nullable();
            $table->text('entry_reason')->nullable();
            $table->text('exit_reason')->nullable();
            $table->text('mistake')->nullable();
            $table->string('emotion')->nullable();
            $table->text('journal_notes')->nullable();
            $table->json('playbook_snapshot')->nullable();
            $table->json('checklist_answers')->nullable();
            $table->timestamps();
        });
        Schema::create('market_backtest_trades', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('market_backtest_account_id');
            $table->unsignedBigInteger('market_backtest_session_id')->nullable();
            $table->unsignedBigInteger('market_backtest_position_id')->nullable();
            $table->string('symbol');
            $table->string('side');
            $table->string('action');
            $table->decimal('quantity', 24, 10);
            $table->decimal('price', 24, 8);
            $table->decimal('notional', 24, 8);
            $table->decimal('fee', 24, 8)->default(0);
            $table->decimal('pnl', 24, 8)->nullable();
            $table->unsignedBigInteger('executed_at_time')->nullable();
            $table->timestamps();
        });
        Schema::create('market_backtest_marks', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('market_backtest_account_id');
            $table->unsignedBigInteger('market_backtest_session_id')->nullable();
            $table->string('exchange', 32);
            $table->string('category', 32);
            $table->string('symbol', 32);
            $table->string('mode', 16);
            $table->decimal('price', 24, 8);
            $table->unsignedBigInteger('candle_time');
            $table->timestamp('observed_at');
            $table->string('status', 16)->default('fresh');
            $table->timestamps();
        });
    }
}

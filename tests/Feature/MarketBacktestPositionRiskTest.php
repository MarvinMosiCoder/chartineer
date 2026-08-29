<?php

namespace Tests\Feature;

use App\Http\Controllers\MarketBacktestController;
use App\Http\Controllers\Users\ProfilePageController;
use App\Http\Middleware\HandleInertiaRequests;
use App\Models\AdmUser;
use App\Models\MarketBacktestAccount;
use App\Models\MarketBacktestPosition;
use App\Models\MarketBacktestTrade;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class MarketBacktestPositionRiskTest extends TestCase
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

        Route::middleware(['web', 'auth'])->put(
            '/_test/market-backtest/positions/{position}/risk',
            [MarketBacktestController::class, 'updatePositionRisk']
        );
        Route::middleware(['web', 'auth'])->patch(
            '/_test/profile/timezone',
            [ProfilePageController::class, 'updateTimezone']
        );
    }

    public function test_open_entry_reprice_keeps_quantity_and_updates_account_and_opening_trade(): void
    {
        [$user, $account, $position, $trade] = $this->openPosition();

        $this->actingAs($user)->putJson("/_test/market-backtest/positions/{$position->id}/risk", [
            'entry_price' => 120,
            'stop_loss' => 90,
            'take_profit' => 130,
            'price' => 125,
        ])->assertOk()
            ->assertJsonPath('account.openPositions.0.entryPrice', 120)
            ->assertJsonPath('account.openPositions.0.quantity', 10);

        $position->refresh();
        $trade->refresh();
        $account->refresh();

        $this->assertSame(120.0, (float) $position->entry_price);
        $this->assertSame(10.0, (float) $position->quantity);
        $this->assertSame(120.0, (float) $position->margin);
        $this->assertSame(0.48, (float) $position->entry_fee);
        $this->assertSame(120.0, (float) $trade->price);
        $this->assertSame(1200.0, (float) $trade->notional);
        $this->assertSame(0.48, (float) $trade->fee);
        $this->assertSame(879.52, (float) $account->cash_balance);
        $this->assertSame(0.48, (float) $account->fees_paid);
    }

    public function test_reprice_rolls_back_when_the_additional_commitment_exceeds_cash(): void
    {
        [$user, $account, $position, $trade] = $this->openPosition(cashBalance: 5);

        $this->actingAs($user)->putJson("/_test/market-backtest/positions/{$position->id}/risk", [
            'entry_price' => 200,
            'stop_loss' => 90,
            'take_profit' => 230,
        ])->assertUnprocessable();

        $this->assertSame(100.0, (float) $position->fresh()->entry_price);
        $this->assertSame(100.0, (float) $trade->fresh()->price);
        $this->assertSame(5.0, (float) $account->fresh()->cash_balance);
    }

    public function test_reprice_rejects_invalid_risk_levels_without_partial_updates(): void
    {
        [$user, $account, $position, $trade] = $this->openPosition();

        $this->actingAs($user)->putJson("/_test/market-backtest/positions/{$position->id}/risk", [
            'entry_price' => 140,
            'stop_loss' => 90,
            'take_profit' => 130,
        ])->assertUnprocessable();

        $this->assertSame(100.0, (float) $position->fresh()->entry_price);
        $this->assertSame(100.0, (float) $trade->fresh()->price);
        $this->assertSame(899.6, (float) $account->fresh()->cash_balance);
    }

    public function test_another_user_cannot_reprice_the_position(): void
    {
        [, , $position] = $this->openPosition();
        $other = $this->user('other@example.test');

        $this->actingAs($other)->putJson("/_test/market-backtest/positions/{$position->id}/risk", [
            'entry_price' => 110,
        ])->assertNotFound();

        $this->assertSame(100.0, (float) $position->fresh()->entry_price);
    }

    public function test_timezone_endpoint_updates_only_a_valid_iana_timezone(): void
    {
        $user = $this->user('timezone@example.test');

        $this->actingAs($user)->patchJson('/_test/profile/timezone', [
            'timezone' => 'Asia/Manila',
        ])->assertOk()->assertJsonPath('timezone', 'Asia/Manila');

        $this->assertSame('Asia/Manila', $user->fresh()->timezone);

        $this->patchJson('/_test/profile/timezone', [
            'timezone' => 'Not/A_Timezone',
        ])->assertUnprocessable()->assertJsonValidationErrors('timezone');
        $this->assertSame('Asia/Manila', $user->fresh()->timezone);
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
        Schema::create('market_backtest_positions', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('market_backtest_account_id');
            $table->unsignedBigInteger('market_backtest_session_id')->nullable();
            $table->string('symbol');
            $table->string('side');
            $table->decimal('quantity', 24, 10);
            $table->decimal('entry_price', 24, 8);
            $table->decimal('margin', 24, 8);
            $table->decimal('leverage', 8, 2)->default(1);
            $table->decimal('entry_fee', 24, 8)->default(0);
            $table->decimal('exit_fee', 24, 8)->default(0);
            $table->decimal('realized_pnl', 24, 8)->default(0);
            $table->decimal('exit_price', 24, 8)->nullable();
            $table->unsignedBigInteger('opened_at_time')->nullable();
            $table->unsignedBigInteger('closed_at_time')->nullable();
            $table->decimal('stop_loss', 24, 8)->nullable();
            $table->decimal('take_profit', 24, 8)->nullable();
            $table->string('status')->default('open');
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
    }

    private function user(string $email): AdmUser
    {
        return AdmUser::query()->create([
            'name' => 'Trader',
            'email' => $email,
            'password' => 'password',
            'status' => 'ACTIVE',
        ]);
    }

    /**
     * The path the chart's ghost SL/TP lines open up: a position that has never
     * had a stop or target gets one set for the first time. Every other test
     * here starts from a position that already carries both, so nothing covered
     * setting one from null.
     */
    public function test_it_sets_stop_loss_and_take_profit_on_a_position_that_had_neither(): void
    {
        [$user, , $position] = $this->openPosition();
        $position->update(['stop_loss' => null, 'take_profit' => null]);

        $this->actingAs($user)->putJson("/_test/market-backtest/positions/{$position->id}/risk", [
            'stop_loss' => 92,
            'take_profit' => 118,
            'price' => 105,
        ])->assertOk()
            ->assertJsonPath('account.openPositions.0.stopLoss', 92)
            ->assertJsonPath('account.openPositions.0.takeProfit', 118);

        $position->refresh();

        $this->assertSame(92.0, (float) $position->stop_loss);
        $this->assertSame(118.0, (float) $position->take_profit);
    }

    /**
     * The chart clamps a dragged level to just inside the entry rather than onto
     * it, because landing exactly on the entry is still rejected here. This pins
     * the rule the clamp's epsilon exists to satisfy.
     */
    public function test_it_rejects_a_stop_loss_that_merely_equals_the_entry_price(): void
    {
        [$user, , $position] = $this->openPosition();
        $position->update(['stop_loss' => null]);

        $this->actingAs($user)->putJson("/_test/market-backtest/positions/{$position->id}/risk", [
            'stop_loss' => 100,
            'price' => 105,
        ])->assertStatus(422);

        $this->actingAs($user)->putJson("/_test/market-backtest/positions/{$position->id}/risk", [
            'stop_loss' => 100 * (1 - 0.0001),
            'price' => 105,
        ])->assertOk();
    }

    private function openPosition(float $cashBalance = 899.6): array
    {
        $user = $this->user(uniqid('trader-', true).'@example.test');
        $account = MarketBacktestAccount::query()->create([
            'adm_user_id' => $user->id,
            'name' => 'Demo Account',
            'quote_currency' => 'USDT',
            'starting_balance' => 1000,
            'cash_balance' => $cashBalance,
            'realized_pnl' => 0,
            'fees_paid' => 0.4,
            'is_active' => true,
        ]);
        $position = MarketBacktestPosition::query()->create([
            'market_backtest_account_id' => $account->id,
            'symbol' => 'BTCUSDT',
            'side' => 'long',
            'quantity' => 10,
            'entry_price' => 100,
            'margin' => 100,
            'leverage' => 10,
            'entry_fee' => 0.4,
            'stop_loss' => 90,
            'take_profit' => 130,
            'status' => 'open',
        ]);
        $trade = MarketBacktestTrade::query()->create([
            'market_backtest_account_id' => $account->id,
            'market_backtest_position_id' => $position->id,
            'symbol' => 'BTCUSDT',
            'side' => 'long',
            'action' => 'open',
            'quantity' => 10,
            'price' => 100,
            'notional' => 1000,
            'fee' => 0.4,
            'executed_at_time' => 1700000000,
        ]);

        return [$user, $account, $position, $trade];
    }
}

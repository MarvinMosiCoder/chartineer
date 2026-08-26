<?php

namespace Tests\Feature;

use App\Http\Controllers\MarketBacktestController;
use App\Http\Middleware\HandleInertiaRequests;
use App\Models\AdmUser;
use App\Models\MarketBacktestAccount;
use App\Models\MarketBacktestMark;
use App\Models\MarketBacktestPosition;
use App\Models\MarketBacktestTrade;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class MarketBacktestCrossLiquidationTest extends TestCase
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
            '/_test/market-backtest/cross/evaluate',
            [MarketBacktestController::class, 'evaluateCrossPortfolio']
        );
    }

    public function test_liquidation_closes_all_and_only_cross_positions_and_reconciles_the_account(): void
    {
        [$user, $account] = $this->accountWithCash(0);

        $btc = $this->openCross($account, 'BTCUSDT', 'long', 10, 100, 100, 10, 0.4);
        $eth = $this->openCross($account, 'ETHUSDT', 'short', 5, 50, 50, 5, 0.1);
        $isolated = $this->openIsolated($account, 'SOLUSDT', 'long', 20, 20, 100, 5, 0.4);
        $spot = $this->openSpot($account, 'ADAUSDT', 10, 1, 5, 0.002);

        $this->seedMark($account, 'BTCUSDT', 50);
        $this->seedMark($account, 'ETHUSDT', 50);

        $response = $this->actingAs($user)->postJson('/_test/market-backtest/cross/evaluate', [
            'mode' => 'live',
        ])->assertOk();

        $this->assertTrue($response->json('liquidation.reason') === 'maintenance_breached');
        $this->assertCount(2, $response->json('liquidation.closedTrades'));

        $this->assertSame('closed', $btc->fresh()->status);
        $this->assertSame('cross_liquidation', $btc->fresh()->close_reason);
        $this->assertSame('closed', $eth->fresh()->status);
        $this->assertSame('cross_liquidation', $eth->fresh()->close_reason);

        // Isolated and Spot positions are never part of the liquidation batch.
        $this->assertSame('open', $isolated->fresh()->status);
        $this->assertSame('open', $spot->fresh()->status);

        $this->assertSame(2, MarketBacktestTrade::query()->where('action', 'close')->count());

        $account->refresh();
        $this->assertEqualsWithDelta(-350.3, (float) $account->cash_balance, 0.0000001);
        $this->assertEqualsWithDelta(-500.8, (float) $account->realized_pnl, 0.0000001);
        $this->assertEqualsWithDelta(0.3, (float) $account->fees_paid, 0.0000001);
    }

    public function test_repeated_evaluation_after_liquidation_is_idempotent_and_creates_no_duplicate_trades(): void
    {
        [$user, $account] = $this->accountWithCash(0);
        $this->openCross($account, 'BTCUSDT', 'long', 10, 100, 100, 10, 0.4);
        $this->seedMark($account, 'BTCUSDT', 50);

        $this->actingAs($user)->postJson('/_test/market-backtest/cross/evaluate', ['mode' => 'live'])->assertOk();
        $this->assertSame(1, MarketBacktestTrade::query()->where('action', 'close')->count());

        $second = $this->actingAs($user)->postJson('/_test/market-backtest/cross/evaluate', ['mode' => 'live'])->assertOk();

        $this->assertNull($second->json('liquidation'));
        $this->assertSame(1, MarketBacktestTrade::query()->where('action', 'close')->count());
    }

    public function test_no_liquidation_when_equity_is_comfortably_above_maintenance(): void
    {
        [$user, $account] = $this->accountWithCash(1000);
        $position = $this->openCross($account, 'BTCUSDT', 'long', 1, 100, 100, 1, 0.04);
        $this->seedMark($account, 'BTCUSDT', 101);

        $response = $this->actingAs($user)->postJson('/_test/market-backtest/cross/evaluate', ['mode' => 'live'])->assertOk();

        $this->assertNull($response->json('liquidation'));
        $this->assertSame('open', $position->fresh()->status);
    }

    public function test_no_liquidation_when_a_cross_market_is_missing_its_mark(): void
    {
        [$user, $account] = $this->accountWithCash(0);
        $position = $this->openCross($account, 'BTCUSDT', 'long', 10, 100, 100, 10, 0.4);
        // No mark seeded for BTCUSDT — even though equity would otherwise be deeply negative,
        // missing marks must never be treated as a green light to liquidate.

        $response = $this->actingAs($user)->postJson('/_test/market-backtest/cross/evaluate', ['mode' => 'live'])->assertOk();

        $this->assertNull($response->json('liquidation'));
        $this->assertSame('open', $position->fresh()->status);
        $this->assertSame(0, MarketBacktestTrade::query()->where('action', 'close')->count());
    }

    private function openCross(MarketBacktestAccount $account, string $symbol, string $side, float $qty, float $entry, float $margin, float $leverage, float $entryFee): MarketBacktestPosition
    {
        return MarketBacktestPosition::query()->create([
            'market_backtest_account_id' => $account->id,
            'symbol' => $symbol,
            'exchange' => 'bybit',
            'category' => 'linear',
            'margin_mode' => 'cross',
            'side' => $side,
            'quantity' => $qty,
            'entry_price' => $entry,
            'margin' => $margin,
            'leverage' => $leverage,
            'entry_fee' => $entryFee,
            'status' => 'open',
        ]);
    }

    private function openIsolated(MarketBacktestAccount $account, string $symbol, string $side, float $qty, float $entry, float $margin, float $leverage, float $entryFee): MarketBacktestPosition
    {
        return MarketBacktestPosition::query()->create([
            'market_backtest_account_id' => $account->id,
            'symbol' => $symbol,
            'exchange' => 'bybit',
            'category' => 'linear',
            'margin_mode' => 'isolated',
            'side' => $side,
            'quantity' => $qty,
            'entry_price' => $entry,
            'margin' => $margin,
            'leverage' => $leverage,
            'entry_fee' => $entryFee,
            'liquidation_price' => 1,
            'status' => 'open',
        ]);
    }

    private function openSpot(MarketBacktestAccount $account, string $symbol, float $qty, float $entry, float $margin, float $entryFee): MarketBacktestPosition
    {
        return MarketBacktestPosition::query()->create([
            'market_backtest_account_id' => $account->id,
            'symbol' => $symbol,
            'exchange' => 'bybit',
            'category' => 'spot',
            'margin_mode' => 'isolated',
            'side' => 'long',
            'quantity' => $qty,
            'entry_price' => $entry,
            'margin' => $margin,
            'leverage' => 1,
            'entry_fee' => $entryFee,
            'status' => 'open',
        ]);
    }

    private function seedMark(MarketBacktestAccount $account, string $symbol, float $price): void
    {
        MarketBacktestMark::query()->create([
            'market_backtest_account_id' => $account->id,
            'market_backtest_session_id' => null,
            'exchange' => 'bybit',
            'category' => 'linear',
            'symbol' => $symbol,
            'mode' => 'live',
            'price' => $price,
            'candle_time' => 1700000000,
            'observed_at' => now(),
            'status' => 'fresh',
        ]);
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
            'starting_balance' => 1000,
            'cash_balance' => $cash,
            'realized_pnl' => 0,
            'fees_paid' => 0,
            'is_active' => true,
        ]);

        return [$user, $account];
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

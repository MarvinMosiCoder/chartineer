<?php

namespace Tests\Feature;

use App\Models\AdmUser;
use App\Models\MarketBacktestAccount;
use App\Models\MarketBacktestPosition;
use App\Services\CrossMarginLiveMonitor;
use App\Services\MarketCurrentPriceService;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class CrossMarginLiveMonitorTest extends TestCase
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

        $this->createSchema();
    }

    public function test_a_shared_market_is_only_fetched_once_across_accounts_and_positions(): void
    {
        [, $accountA] = $this->accountWithCash(1000);
        [, $accountB] = $this->accountWithCash(1000);

        // Both accounts hold BTCUSDT Cross; the monitor must coalesce this into one fetch.
        $this->openCross($accountA, 'BTCUSDT', 'long', 1, 100, 100, 1, 0.04);
        $this->openCross($accountB, 'BTCUSDT', 'short', 1, 100, 100, 1, 0.04);

        $prices = $this->mock(MarketCurrentPriceService::class);
        $prices->shouldReceive('fetch')->once()->with('bybit', 'linear', 'BTCUSDT')->andReturn(100.0);

        $result = $this->app->make(CrossMarginLiveMonitor::class)->runOnce();

        $this->assertSame(1, $result['marketsPolled']);
        $this->assertSame(2, $result['accountsEvaluated']);
        $this->assertSame(0, $result['liquidations']);
    }

    public function test_a_maintenance_breach_liquidates_only_the_affected_account(): void
    {
        [, $healthy] = $this->accountWithCash(1000);
        [, $breached] = $this->accountWithCash(0);

        $this->openCross($healthy, 'ETHUSDT', 'long', 1, 100, 100, 1, 0.04);
        $this->openCross($breached, 'BTCUSDT', 'long', 10, 100, 100, 10, 0.4);

        $prices = $this->mock(MarketCurrentPriceService::class);
        $prices->shouldReceive('fetch')->once()->with('bybit', 'linear', 'ETHUSDT')->andReturn(100.0);
        $prices->shouldReceive('fetch')->once()->with('bybit', 'linear', 'BTCUSDT')->andReturn(50.0);

        $result = $this->app->make(CrossMarginLiveMonitor::class)->runOnce();

        $this->assertSame(2, $result['marketsPolled']);
        $this->assertSame(1, $result['liquidations']);

        $this->assertSame('open', MarketBacktestPosition::query()->where('symbol', 'ETHUSDT')->firstOrFail()->status);
        $this->assertSame('closed', MarketBacktestPosition::query()->where('symbol', 'BTCUSDT')->firstOrFail()->status);
    }

    public function test_a_failed_market_fetch_does_not_prevent_evaluating_accounts_on_other_markets(): void
    {
        [, $affected] = $this->accountWithCash(0);
        [, $unaffected] = $this->accountWithCash(0);

        $this->openCross($affected, 'BTCUSDT', 'long', 10, 100, 100, 10, 0.4);
        $this->openCross($unaffected, 'ETHUSDT', 'long', 10, 100, 100, 10, 0.4);

        $prices = $this->mock(MarketCurrentPriceService::class);
        $prices->shouldReceive('fetch')->once()->with('bybit', 'linear', 'BTCUSDT')->andThrow(new \RuntimeException('exchange unreachable'));
        $prices->shouldReceive('fetch')->once()->with('bybit', 'linear', 'ETHUSDT')->andReturn(50.0);

        $result = $this->app->make(CrossMarginLiveMonitor::class)->runOnce();

        $this->assertSame(1, $result['marketsPolled']);
        // BTCUSDT's account has no fresh mark this cycle, so it must not be liquidated
        // even though its numbers would clearly breach maintenance once priced.
        $this->assertSame('open', MarketBacktestPosition::query()->where('symbol', 'BTCUSDT')->firstOrFail()->status);
        $this->assertSame('closed', MarketBacktestPosition::query()->where('symbol', 'ETHUSDT')->firstOrFail()->status);
        $this->assertSame(1, $result['liquidations']);
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
        Schema::create('adm_notifications', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('adm_user_id');
            $table->string('type')->default('info');
            $table->string('source_type', 50)->nullable();
            $table->unsignedBigInteger('source_id')->nullable();
            $table->json('metadata')->nullable();
            $table->string('content');
            $table->string('url')->nullable();
            $table->boolean('is_read')->default(false);
            $table->timestamp('dismissed_at')->nullable();
            $table->timestamps();
            $table->unique(['source_type', 'source_id'], 'adm_notifications_source_unique');
        });
    }
}

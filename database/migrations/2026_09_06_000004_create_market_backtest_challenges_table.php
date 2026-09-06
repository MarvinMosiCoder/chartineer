<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    /**
     * A prop-firm challenge: an isolated account, a rule set, a replay window
     * and a verdict.
     *
     * Every rule column is nullable and a null rule is never evaluated — that
     * is what lets the `custom` template express any subset of the rules
     * without a second table or a JSON blob.
     *
     * There is deliberately no daily-aggregate table. Per-day PnL, peak balance
     * and trading-day counts are derived from market_backtest_positions
     * (closed_at_time, realized_pnl), the same way
     * MarketBacktestRiskGuardrailService already derives its daily figures; a
     * rollup would be a second source of truth to keep in step with edits,
     * liquidations and cancellations.
     */
    public function up(): void
    {
        if (Schema::hasTable('market_backtest_challenges')) {
            return;
        }

        Schema::create('market_backtest_challenges', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('adm_user_id');
            $table->unsignedBigInteger('market_backtest_account_id');

            $table->string('template_key', 40)->default('custom');
            $table->string('name');
            $table->decimal('starting_balance', 24, 8);
            $table->string('quote_currency', 12)->default('USDT');

            // Rules. Null means "not part of this evaluation".
            $table->decimal('profit_target_percent', 8, 4)->nullable();
            $table->decimal('max_daily_loss_percent', 8, 4)->nullable();
            $table->decimal('max_total_drawdown_percent', 8, 4)->nullable();
            $table->string('drawdown_type', 12)->default('static');
            $table->unsignedSmallInteger('min_trading_days')->nullable();
            $table->unsignedSmallInteger('max_calendar_days')->nullable();
            $table->decimal('consistency_percent', 8, 4)->nullable();

            // The replay window. Timestamps are replay time, never wall clock.
            $table->string('exchange', 30);
            $table->string('market_category', 30);
            $table->string('symbol', 40);
            $table->string('timeframe', 10);
            $table->unsignedBigInteger('started_at_time');
            $table->unsignedBigInteger('current_at_time');

            // The verdict and its evidence.
            $table->string('status', 16)->default('active');
            $table->string('failed_rule', 40)->nullable();
            $table->unsignedBigInteger('failed_at_time')->nullable();
            $table->string('failed_reason', 255)->nullable();
            $table->unsignedBigInteger('completed_at_time')->nullable();

            $table->timestamps();

            $table->index(['adm_user_id', 'status']);
            $table->index('market_backtest_account_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('market_backtest_challenges');
    }
};

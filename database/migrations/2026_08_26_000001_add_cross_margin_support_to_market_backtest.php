<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('market_backtest_positions', function (Blueprint $table) {
            if (!Schema::hasColumn('market_backtest_positions', 'exchange')) {
                $table->string('exchange', 32)->default('bybit')->after('symbol');
            }
            if (!Schema::hasColumn('market_backtest_positions', 'margin_mode')) {
                $table->string('margin_mode', 16)->default('isolated')->after('category');
            }
        });

        DB::table('market_backtest_positions')->whereNull('margin_mode')->update(['margin_mode' => 'isolated']);

        if (!Schema::hasTable('market_backtest_marks')) {
            Schema::create('market_backtest_marks', function (Blueprint $table) {
                $table->id();
                $table->foreignId('market_backtest_account_id')->constrained('market_backtest_accounts')->cascadeOnDelete();
                $table->foreignId('market_backtest_session_id')->nullable()->constrained('market_backtest_sessions')->cascadeOnDelete();
                $table->string('exchange', 32);
                $table->string('category', 32);
                $table->string('symbol', 32);
                $table->string('mode', 16);
                $table->decimal('price', 24, 8);
                $table->unsignedBigInteger('candle_time');
                $table->timestamp('observed_at');
                $table->string('status', 16)->default('fresh');
                $table->timestamps();

                $table->unique(
                    ['market_backtest_account_id', 'market_backtest_session_id', 'exchange', 'category', 'symbol', 'mode'],
                    'mbm_account_session_market_mode_unique'
                );
                $table->index(['mode', 'status', 'observed_at'], 'mbm_mode_status_observed_idx');
            });
        }

        Schema::table('market_backtest_positions', function (Blueprint $table) {
            $table->index(
                ['market_backtest_account_id', 'status', 'margin_mode'],
                'mbp_account_status_margin_mode_idx'
            );
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('market_backtest_marks');

        Schema::table('market_backtest_positions', function (Blueprint $table) {
            $table->dropIndex('mbp_account_status_margin_mode_idx');
            if (Schema::hasColumn('market_backtest_positions', 'margin_mode')) {
                $table->dropColumn('margin_mode');
            }
            if (Schema::hasColumn('market_backtest_positions', 'exchange')) {
                $table->dropColumn('exchange');
            }
        });
    }
};

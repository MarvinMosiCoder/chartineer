<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('adm_users', function (Blueprint $table) {
            $table->string('last_market_symbol', 32)->nullable()->after('theme');
            $table->string('last_market_exchange', 32)->nullable()->after('last_market_symbol');
            $table->string('last_market_category', 16)->nullable()->after('last_market_exchange');
            $table->string('last_market_timeframe', 8)->nullable()->after('last_market_category');
        });
    }

    public function down(): void
    {
        Schema::table('adm_users', function (Blueprint $table) {
            $table->dropColumn(['last_market_symbol', 'last_market_exchange', 'last_market_category', 'last_market_timeframe']);
        });
    }
};

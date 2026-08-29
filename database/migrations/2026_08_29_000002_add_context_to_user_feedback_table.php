<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('user_feedback', function (Blueprint $table) {
            // Chart state captured at submission time by the Product Hub modal
            // ({symbol, exchange, category, timeframe, replayMode}) — additive to
            // page_url, which keeps recording the raw URL as before.
            $table->json('context')->nullable()->after('page_url');
        });
    }

    public function down(): void
    {
        Schema::table('user_feedback', function (Blueprint $table) {
            $table->dropColumn('context');
        });
    }
};

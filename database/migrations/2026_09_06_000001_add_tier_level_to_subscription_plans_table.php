<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    /**
     * Plans previously differed only by duration and price; every one of them
     * granted the same single `replay_access_ends_at` entitlement. `tier_level`
     * is what makes a plan mean something, and is server-controlled — it is
     * never accepted from a customer-facing request.
     */
    public function up(): void
    {
        if (!Schema::hasColumn('subscription_plans', 'tier_level')) {
            Schema::table('subscription_plans', function (Blueprint $table) {
                $table->unsignedTinyInteger('tier_level')->default(1)->after('duration_days');
            });
        }

        $now = now();
        foreach (['weekly' => 1, 'monthly' => 2, 'yearly' => 3] as $code => $level) {
            DB::table('subscription_plans')
                ->where('code', $code)
                ->update(['tier_level' => $level, 'updated_at' => $now]);
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('subscription_plans', 'tier_level')) {
            Schema::table('subscription_plans', function (Blueprint $table) {
                $table->dropColumn('tier_level');
            });
        }
    }
};

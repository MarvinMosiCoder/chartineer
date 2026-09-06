<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    /**
     * `subscription_requests` is an immutable transaction snapshot — it already
     * copies amount, currency, and duration_days off the plan at checkout time
     * rather than reading them back later. Tier belongs in that same snapshot:
     * without it, activation would resolve the tier by plan code at webhook
     * time, so a plan retuned (or deactivated) between checkout and payment
     * would grant something other than what the customer actually bought.
     *
     * Nullable so the rows written before tiers existed stay legible as "no
     * snapshot"; SubscriptionEntitlementService falls back to a plan lookup for
     * those, then to Starter.
     */
    public function up(): void
    {
        if (!Schema::hasColumn('subscription_requests', 'tier_level')) {
            Schema::table('subscription_requests', function (Blueprint $table) {
                $table->unsignedTinyInteger('tier_level')->nullable()->after('duration_days');
            });
        }

        // Backfill historical rows from the plan they name, so an admin
        // reconciling or restoring an old transaction resolves a real tier.
        foreach (['weekly' => 1, 'monthly' => 2, 'yearly' => 3] as $code => $level) {
            DB::table('subscription_requests')
                ->where('plan', $code)
                ->whereNull('tier_level')
                ->update(['tier_level' => $level]);
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('subscription_requests', 'tier_level')) {
            Schema::table('subscription_requests', function (Blueprint $table) {
                $table->dropColumn('tier_level');
            });
        }
    }
};

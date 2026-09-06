<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    /**
     * Which tier the user's current paid window grants. `replay_access_ends_at`
     * still decides *whether* access is live; this decides *how much*.
     *
     * Nullable rather than defaulted: a null here alongside a live
     * `replay_access_ends_at` is read as Starter by SubscriptionTierService, so
     * a row written before this migration degrades to the lowest paid tier
     * instead of losing access outright.
     */
    public function up(): void
    {
        if (!Schema::hasColumn('adm_users', 'replay_access_tier')) {
            Schema::table('adm_users', function (Blueprint $table) {
                $table->unsignedTinyInteger('replay_access_tier')->nullable()->after('replay_access_ends_at');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('adm_users', 'replay_access_tier')) {
            Schema::table('adm_users', function (Blueprint $table) {
                $table->dropColumn('replay_access_tier');
            });
        }
    }
};

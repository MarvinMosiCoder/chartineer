<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Announcements are global rows shared by every user, so a user deleting one
     * from their notification history can only be recorded per user — on the
     * pivot. A row with `hidden_at` set is also, by definition, read.
     */
    public function up(): void
    {
        Schema::table('announcement_user', function (Blueprint $table) {
            $table->timestamp('hidden_at')->nullable()->after('adm_user_id');
        });
    }

    public function down(): void
    {
        Schema::table('announcement_user', function (Blueprint $table) {
            $table->dropColumn('hidden_at');
        });
    }
};

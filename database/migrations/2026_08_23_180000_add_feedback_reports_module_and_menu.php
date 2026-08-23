<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('adm_modules')) {
            DB::table('adm_modules')->updateOrInsert(['name' => 'Feedback Analytics'], [
                'name' => 'Feedback Analytics',
                'icon' => 'fa fa-comments',
                'path' => 'reports_feedback',
                'table_name' => 'user_feedback',
                'controller' => 'FeedbackReportController',
                'is_protected' => 1,
                'is_active' => 1,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        if (!Schema::hasTable('adm_admin_menuses')) return;

        // The "Reports" parent already exists (created by
        // 2026_08_23_170000_add_revenue_reports_module_and_menu.php) — look it up by
        // slug rather than assuming an id, since this migration may run against a
        // database where that parent landed on a different row id than a fresh seed.
        $reportsParentId = DB::table('adm_admin_menuses')->where('slug', 'reports_group')->where('type', 'URL')->value('id');
        if (!$reportsParentId) return;

        $now = now();
        // Named "Feedback", not "Reports" — same name-collision footgun documented
        // on "Payments"/"Transactions" and "Reports"/"Revenue".
        DB::table('adm_admin_menuses')->insert([
            ['name' => 'Feedback', 'type' => 'Route', 'slug' => 'admin/reports/feedback', 'icon' => 'fa fa-comments', 'parent_id' => $reportsParentId, 'is_active' => 1, 'sorting' => 2, 'created_at' => $now, 'updated_at' => $now],
        ]);
    }

    public function down(): void
    {
        if (Schema::hasTable('adm_admin_menuses')) {
            DB::table('adm_admin_menuses')->where('name', 'Feedback')->where('type', 'Route')->where('slug', 'admin/reports/feedback')->delete();
        }

        if (Schema::hasTable('adm_modules')) {
            DB::table('adm_modules')->where('name', 'Feedback Analytics')->delete();
        }
    }
};

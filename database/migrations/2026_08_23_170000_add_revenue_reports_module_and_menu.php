<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('adm_modules')) {
            DB::table('adm_modules')->updateOrInsert(['name' => 'Revenue Reports'], [
                'name' => 'Revenue Reports',
                'icon' => 'fa fa-chart-line',
                'path' => 'reports_revenue',
                'table_name' => 'subscription_requests',
                'controller' => 'RevenueReportController',
                'is_protected' => 1,
                'is_active' => 1,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        if (!Schema::hasTable('adm_admin_menuses')) return;

        $now = now();
        $nextSorting = 1 + (int) DB::table('adm_admin_menuses')->where('parent_id', 0)->max('sorting');

        $reportsParentId = DB::table('adm_admin_menuses')->insertGetId([
            'name' => 'Reports', 'type' => 'URL', 'slug' => 'reports_group', 'icon' => 'fa fa-chart-line',
            'parent_id' => 0, 'is_active' => 1, 'sorting' => $nextSorting,
            'created_at' => $now, 'updated_at' => $now,
        ]);

        // Named "Revenue", not "Reports" — the seeder equivalent of this migration
        // (database/seeders/AdminSidebarMenuses.php) matches rows by `name` via
        // updateOrInsert(), so reusing the parent dropdown's own label here would
        // collide with it and corrupt both rows on re-seed (see the same footgun
        // already documented for "Payments"/"Transactions" in that seeder).
        DB::table('adm_admin_menuses')->insert([
            ['name' => 'Revenue', 'type' => 'Route', 'slug' => 'admin/reports/revenue', 'icon' => 'fa fa-chart-line', 'parent_id' => $reportsParentId, 'is_active' => 1, 'sorting' => 1, 'created_at' => $now, 'updated_at' => $now],
        ]);
    }

    public function down(): void
    {
        if (Schema::hasTable('adm_admin_menuses')) {
            $now = now();
            DB::table('adm_admin_menuses')->where('name', 'Revenue')->where('type', 'Route')->delete();
            DB::table('adm_admin_menuses')->where('name', 'Reports')->where('type', 'URL')->delete();
        }

        if (Schema::hasTable('adm_modules')) {
            DB::table('adm_modules')->where('name', 'Revenue Reports')->delete();
        }
    }
};

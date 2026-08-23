<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class AdminSidebarMenuses extends Seeder
{
    /**
     * Run the database seeds.
     *
     * @return void
     */
    public function run() {
        self::menus();
    }

    public function menus() {
        $data = [
            [
                'name'              => 'Privileges',
                'type'              => 'Route',
                'slug'              => 'privileges',
                'color'             => NULL,
                'icon'              => 'fa fa-crown',
                'parent_id'         => 0,
                'is_active'         => 1,
                'sorting'           => 0,
                'created_at'        => date('Y-m-d H:i:s')
            ],
            [
                'name'              => 'Users Management',
                'type'              => 'Route',
                'slug'              => 'users',
                'color'             => NULL,
                'icon'              => 'fa fa-users',
                'parent_id'         => 0,
                'is_active'         => 1,
                'sorting'           => 2,
                'created_at'        => date('Y-m-d H:i:s')
            ],
            [
                'name'              => 'Menu Management',
                'type'              => 'Route',
                'slug'              => 'menu_management',
                'color'             => NULL,
                'icon'              => 'fa fa-bars',
                'parent_id'         => 0,
                'is_active'         => 0,
                'sorting'           => 3,
                'created_at'        => date('Y-m-d H:i:s')
            ],
            [
                'name'              => 'Module Generator',
                'type'              => 'Route',
                'slug'              => 'module_generator',
                'color'             => NULL,
                'icon'              => 'fa fa-th',
                'parent_id'         => 0,
                'is_active'         => 0,
                'sorting'           => 4,
                'created_at'        => date('Y-m-d H:i:s')
            ],
            [
                'name'              => 'API Generator',
                'type'              => 'Route',
                'slug'              => 'api_generator',
                'color'             => NULL,
                'icon'              => 'fa fa-code-merge',
                'parent_id'         => 0,
                'is_active'         => 0,
                'sorting'           => 5,
                'created_at'        => date('Y-m-d H:i:s')
            ],
            [
                'name'              => 'Admin Settings',
                'type'              => 'URL',
                'slug'              => 'adm_settings',
                'color'             => NULL,
                'icon'              => 'fa fa-cogs',
                'parent_id'         => 0,
                'is_active'         => 1,
                'sorting'           => 6,
                'created_at'        => date('Y-m-d H:i:s')
            ],
            [
                'name'              => 'App Settings',
                'type'              => 'Route',
                'slug'              => 'settings',
                'color'             => NULL,
                'icon'              => 'fa fa-cogs',
                'parent_id'         => 6,
                'is_active'         => 1,
                'sorting'           => 1,
                'created_at'        => date('Y-m-d H:i:s')
            ],
            [
                'name'              => 'Announcements',
                'type'              => 'Route',
                'slug'              => 'announcements',
                'color'             => NULL,
                'icon'              => 'fa fa-info-circle',
                'parent_id'         => 6,
                'is_active'         => 1,
                'sorting'           => 2,
                'created_at'        => date('Y-m-d H:i:s')
            ],
            [
                'name'              => 'Notifications',
                'type'              => 'Route',
                'slug'              => 'notifications',
                'color'             => NULL,
                'icon'              => 'fa fa-bell',
                'parent_id'         => 6,
                'is_active'         => 1,
                'sorting'           => 3,
                'created_at'        => date('Y-m-d H:i:s')
            ],
            [
                'name'              => 'Log User Access',
                'type'              => 'Route',
                'slug'              => 'logs',
                'color'             => NULL,
                'icon'              => 'fa fa-history',
                'parent_id'         => 0,
                'is_active'         => 1,
                'sorting'           => 7,
                'created_at'        => date('Y-m-d H:i:s')
            ],
            [
                // Was "Module Activity History" / slug 'module_activity_history' — that slug never had a
                // real route behind it. Renamed and repointed at the real payment activity viewer, and
                // moved under the new "Payments" dropdown (id 13) below. See
                // database/migrations/2026_08_08_000006_move_payment_menus_into_admin_sidebar.php, which
                // applies this same change to already-seeded databases.
                'name'              => 'Payment Activity',
                'type'              => 'Route',
                'slug'              => 'admin/payment-activity',
                'color'             => NULL,
                'icon'              => 'fa fa-history',
                'parent_id'         => 13,
                'is_active'         => 1,
                'sorting'           => 3,
                'created_at'        => date('Y-m-d H:i:s')
            ],
            [
                // slug was 'system_error_logs', another label with no route ever behind it — repointed
                // at the real error log viewer built alongside Payment Activity. Stays top-level.
                'name'              => 'System Error Logs',
                'type'              => 'Route',
                'slug'              => 'admin/system-errors',
                'color'             => NULL,
                'icon'              => 'fa fa-history',
                'parent_id'         => 0,
                'is_active'         => 1,
                'sorting'           => 9,
                'created_at'        => date('Y-m-d H:i:s')
            ],
            [
                // New dropdown parent (id 13 on a fresh seed) grouping the payment-related admin pages
                // that used to be plain links in AdminNavbar.jsx's top nav.
                'name'              => 'Payments',
                'type'              => 'URL',
                'slug'              => 'payments_group',
                'color'             => NULL,
                'icon'              => 'fa fa-credit-card',
                'parent_id'         => 0,
                'is_active'         => 1,
                'sorting'           => 5,
                'created_at'        => date('Y-m-d H:i:s')
            ],
            [
                // Named "Transactions", not "Payments" — this seeder matches rows by `name` via
                // updateOrInsert(), so reusing the parent dropdown's own label here would make this
                // entry and the "Payments" URL-type parent above collide on the same name and corrupt
                // each other on every re-seed (confirmed the hard way; fixed live data by hand once).
                'name'              => 'Transactions',
                'type'              => 'Route',
                'slug'              => 'admin/subscriptions',
                'color'             => NULL,
                'icon'              => 'fa fa-credit-card',
                'parent_id'         => 13,
                'is_active'         => 1,
                'sorting'           => 1,
                'created_at'        => date('Y-m-d H:i:s')
            ],
            [
                'name'              => 'Pricing',
                'type'              => 'Route',
                'slug'              => 'admin/subscription-plans',
                'color'             => NULL,
                'icon'              => 'fa fa-tags',
                'parent_id'         => 13,
                'is_active'         => 1,
                'sorting'           => 2,
                'created_at'        => date('Y-m-d H:i:s')
            ],
            [
                // New dropdown parent, appended after "Payments" (id 13) so it lands
                // at id 16 on a fresh seed — the fixed id "Revenue" below hardcodes.
                // Must stay the last top-level entry added; inserting anything above
                // this line on a fresh table would shift every hardcoded parent_id
                // in this file (see the note on "Payments" above).
                'name'              => 'Reports',
                'type'              => 'URL',
                'slug'              => 'reports_group',
                'color'             => NULL,
                'icon'              => 'fa fa-chart-line',
                'parent_id'         => 0,
                'is_active'         => 1,
                'sorting'           => 6,
                'created_at'        => date('Y-m-d H:i:s')
            ],
            [
                // Named "Revenue", not "Reports" — matches rows by `name` via
                // updateOrInsert(), so reusing the parent dropdown's own label would
                // collide with it (same footgun documented for "Payments"/"Transactions").
                'name'              => 'Revenue',
                'type'              => 'Route',
                'slug'              => 'admin/reports/revenue',
                'color'             => NULL,
                'icon'              => 'fa fa-chart-line',
                'parent_id'         => 16,
                'is_active'         => 1,
                'sorting'           => 1,
                'created_at'        => date('Y-m-d H:i:s')
            ],
            [
                // Second child under the same "Reports" parent (id 16 on a fresh
                // seed, established above). Named "Feedback", not "Reports".
                'name'              => 'Feedback',
                'type'              => 'Route',
                'slug'              => 'admin/reports/feedback',
                'color'             => NULL,
                'icon'              => 'fa fa-comments',
                'parent_id'         => 16,
                'is_active'         => 1,
                'sorting'           => 2,
                'created_at'        => date('Y-m-d H:i:s')
            ],
        ];
        foreach ($data as $indexmenu) {
            DB::table('adm_admin_menuses')->updateOrInsert(['name' => $indexmenu['name']], $indexmenu);
        }
    }

}

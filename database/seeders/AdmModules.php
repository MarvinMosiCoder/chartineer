<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class AdmModules extends Seeder
{
    /**
     * Run the database seeds.
     *
     * @return void
     */
    public function run()
    {
        // DB::table('cms_moduls')->where('id', '>=', 12)->delete();
        // DB::statement('ALTER TABLE cms_moduls AUTO_INCREMENT = 12');
        $data = [
            [

                'created_at' => date('Y-m-d H:i:s'),
                'name' => 'Notifications',
                'icon' => 'fa fa-cog',
                'path' => 'notifications',
                'table_name' => 'adm_notifications',
                'controller' => 'NotificationsController',
                'is_protected' => 1,
                'is_active' => 1,
            ],
            [

                'created_at' => date('Y-m-d H:i:s'),
                'name' => 'Privileges',
                'icon' => 'fa fa-crown',
                'path' => 'privileges',
                'table_name' => 'adm_privileges',
                'controller' => 'PrivilegesController',
                'is_protected' => 1,
                'is_active' => 1,
            ],
            [

                'created_at' => date('Y-m-d H:i:s'),
                'name' => 'Users Management',
                'icon' => 'fa fa-users',
                'path' => 'users',
                'table_name' => 'adm_users',
                'controller' => 'AdminUsersController',
                'is_protected' => 1,
                'is_active' => 1,
            ],
            [

                'created_at' => date('Y-m-d H:i:s'),
                'name' => 'Settings',
                'icon' => 'fa fa-cog',
                'path' => 'settings',
                'table_name' => 'adm_settings',
                'controller' => 'SettingsController',
                'is_protected' => 1,
                'is_active' => 1,
            ],
            [

                'created_at' => date('Y-m-d H:i:s'),
                'name' => 'Module Generator',
                'icon' => 'fa fa-th',
                'path' => 'module_generator',
                'table_name' => 'adm_moduls',
                'controller' => 'ModulsController',
                'is_protected' => 1,
                'is_active' => 1,
            ],
            [

                'created_at' => date('Y-m-d H:i:s'),
                'name' => 'Menu Management',
                'icon' => 'fa fa-bars',
                'path' => 'menu_management',
                'table_name' => 'adm_menus',
                'controller' => 'MenusController',
                'is_protected' => 1,
                'is_active' => 1,
            ],
            [

                'created_at' => date('Y-m-d H:i:s'),
                'name' => 'Email Templates',
                'icon' => 'fa fa-envelope-o',
                'path' => 'email_templates',
                'table_name' => 'adm_email_templates',
                'controller' => 'EmailTemplatesController',
                'is_protected' => 1,
                'is_active' => 1,
            ],
            [

                'created_at' => date('Y-m-d H:i:s'),
                'name' => 'Statistic Builder',
                'icon' => 'fa fa-dashboard',
                'path' => 'statistic_builder',
                'table_name' => 'adm_statistics',
                'controller' => 'StatisticBuilderController',
                'is_protected' => 1,
                'is_active' => 1,
            ],
            [

                'created_at' => date('Y-m-d H:i:s'),
                'name' => 'API Generator',
                'icon' => 'fa fa-cloud-download',
                'path' => 'api_generator',
                'table_name' => '',
                'controller' => 'AdminApiController',
                'is_protected' => 1,
                'is_active' => 1,
            ],
            [

                'created_at' => date('Y-m-d H:i:s'),
                'name' => 'Announcements',
                'icon' => 'fa fa-info-circle',
                'path' => 'announcements',
                'table_name' => 'announcements',
                'controller' => 'AnnouncementsController',
                'is_protected' => 1,
                'is_active' => 1,
            ],
            [

                'created_at' => date('Y-m-d H:i:s'),
                'name' => 'Log User Access',
                'icon' => 'fa fa-history',
                'path' => 'logs',
                'table_name' => 'adm_logs',
                'controller' => 'LogsController',
                'is_protected' => 1,
                'is_active' => 1,
            ],
            [

                'created_at' => date('Y-m-d H:i:s'),
                'name' => 'Dashboard',
                'icon' => 'images/navigation/dashboard-icon.png',
                'path' => 'dashboard',
                'table_name' => 'dashboard',
                'controller' => 'Dashboard\DashboardController',
                'is_protected' => 0,
                'is_active' => 1,
            ],
            [

                'created_at' => date('Y-m-d H:i:s'),
                'name' => 'Revenue Reports',
                'icon' => 'fa fa-chart-line',
                'path' => 'reports_revenue',
                'table_name' => 'subscription_requests',
                'controller' => 'RevenueReportController',
                'is_protected' => 1,
                'is_active' => 1,
            ],
            [

                'created_at' => date('Y-m-d H:i:s'),
                'name' => 'Feedback Analytics',
                'icon' => 'fa fa-comments',
                'path' => 'reports_feedback',
                'table_name' => 'user_feedback',
                'controller' => 'FeedbackReportController',
                'is_protected' => 1,
                'is_active' => 1,
            ]
        ];

        foreach ($data as $module) {
            DB::table('adm_modules')->updateOrInsert(['name' => $module['name']], $module);
        }

    }
}
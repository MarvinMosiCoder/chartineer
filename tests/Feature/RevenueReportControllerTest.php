<?php

namespace Tests\Feature;

use App\Http\Middleware\HandleInertiaRequests;
use App\Models\AdmUser;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class RevenueReportControllerTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        if (!in_array('sqlite', \PDO::getAvailableDrivers(), true)) {
            $this->markTestSkipped('The pdo_sqlite extension is required for isolated revenue report tests.');
        }

        config()->set('database.default', 'sqlite');
        config()->set('database.connections.sqlite.database', ':memory:');
        DB::purge('sqlite');
        DB::reconnect('sqlite');
        $this->withoutMiddleware(HandleInertiaRequests::class);

        Schema::create('adm_users', function (Blueprint $table) {
            $table->id(); $table->string('name'); $table->string('email')->unique();
            $table->string('password')->nullable(); $table->string('status')->default('ACTIVE');
            $table->unsignedBigInteger('id_adm_privileges')->nullable();
            $table->rememberToken(); $table->timestamps();
        });
        Schema::create('adm_privileges', function (Blueprint $table) {
            $table->id(); $table->string('name'); $table->boolean('is_admin')->default(false);
            $table->boolean('is_superadmin')->default(false); $table->string('theme_color')->nullable();
        });
        Schema::create('adm_modules', function (Blueprint $table) {
            $table->id(); $table->string('name'); $table->string('path'); $table->boolean('is_active')->default(true);
        });
        Schema::create('adm_privileges_roles', function (Blueprint $table) {
            $table->id();
            $table->boolean('is_visible')->default(false); $table->boolean('is_create')->default(false);
            $table->boolean('is_read')->default(false); $table->boolean('is_edit')->default(false);
            $table->boolean('is_delete')->default(false); $table->boolean('is_void')->default(false);
            $table->boolean('is_override')->default(false);
            $table->unsignedBigInteger('id_adm_privileges'); $table->unsignedBigInteger('id_adm_modules');
            $table->timestamps();
        });
        Schema::create('subscription_requests', function (Blueprint $table) {
            $table->id(); $table->unsignedBigInteger('adm_user_id'); $table->string('plan')->default('monthly');
            $table->decimal('amount', 12, 2)->nullable(); $table->string('currency', 3)->default('PHP');
            $table->string('status')->default('pending');
            $table->timestamp('paid_at')->nullable(); $table->timestamp('refunded_at')->nullable();
            $table->decimal('refund_amount', 12, 2)->nullable();
            $table->timestamps();
        });
        Schema::create('subscription_plans', function (Blueprint $table) {
            $table->id(); $table->string('code')->unique(); $table->string('name');
        });

        DB::table('subscription_plans')->insert([
            ['code' => 'monthly', 'name' => 'Monthly'],
            ['code' => 'yearly', 'name' => 'Yearly'],
        ]);

        DB::table('adm_modules')->insert(['id' => 1, 'name' => 'Revenue Reports', 'path' => 'reports_revenue', 'is_active' => true]);
    }

    public function test_denies_admin_without_granted_permission(): void
    {
        $admin = $this->admin(isAdmin: true, isSuperadmin: false);

        $this->actingAs($admin)
            ->getJson('/admin/reports/revenue/items?granularity=month')
            ->assertForbidden();
    }

    public function test_allows_admin_once_permission_granted_and_returns_bucketed_series(): void
    {
        $admin = $this->admin(isAdmin: true, isSuperadmin: false);
        $this->grantView($admin->id_adm_privileges);
        $customer = $this->customer();

        $this->seedRevenueFixtures($customer->id);

        $this->actingAs($admin)
            ->getJson('/admin/reports/revenue/items?granularity=month&from=2026-01-01&to=2026-02-28')
            ->assertOk()
            ->assertJsonPath('series.0.period', '2026-01')
            ->assertJsonPath('series.0.grossPaid', 1000)
            ->assertJsonPath('series.0.refunds', 200)
            ->assertJsonPath('series.0.netRevenue', 800)
            ->assertJsonPath('series.0.transactionCount', 1)
            ->assertJsonPath('series.1.period', '2026-02')
            ->assertJsonPath('series.1.grossPaid', 500)
            ->assertJsonPath('series.1.netRevenue', 500)
            ->assertJsonPath('comparison.currentNetRevenue', 1300)
            ->assertJsonPath('comparison.previousNetRevenue', 0)
            ->assertJsonPath('comparison.percentChange', null)
            ->assertJsonCount(2, 'planBreakdown');
    }

    public function test_superadmin_bypasses_permission_check(): void
    {
        $admin = $this->admin(isAdmin: false, isSuperadmin: true);
        $customer = $this->customer();
        $this->seedRevenueFixtures($customer->id);

        $this->actingAs($admin)
            ->getJson('/admin/reports/revenue/items?granularity=month&from=2026-01-01&to=2026-02-28')
            ->assertOk()
            ->assertJsonPath('comparison.currentNetRevenue', 1300);
    }

    public function test_plan_breakdown_reconciles_with_series_totals(): void
    {
        $admin = $this->admin(isAdmin: true, isSuperadmin: false);
        $this->grantView($admin->id_adm_privileges);
        $customer = $this->customer();
        $this->seedRevenueFixtures($customer->id);

        $response = $this->actingAs($admin)
            ->getJson('/admin/reports/revenue/items?granularity=month&from=2026-01-01&to=2026-02-28')
            ->assertOk()
            ->json();

        $monthly = collect($response['planBreakdown'])->firstWhere('plan', 'monthly');
        $yearly = collect($response['planBreakdown'])->firstWhere('plan', 'yearly');

        $this->assertEquals(800, $monthly['netRevenue']);
        $this->assertEquals(500, $yearly['netRevenue']);
        $this->assertSame('Monthly', $monthly['planName']);
    }

    public function test_csv_export_returns_expected_header_and_rows(): void
    {
        $admin = $this->admin(isAdmin: true, isSuperadmin: false);
        $this->grantView($admin->id_adm_privileges);
        $customer = $this->customer();
        $this->seedRevenueFixtures($customer->id);

        $response = $this->actingAs($admin)
            ->get('/admin/reports/revenue/export?granularity=month&from=2026-01-01&to=2026-02-28')
            ->assertOk();

        $csv = $response->streamedContent();
        $this->assertStringContainsString('Period,"Gross Paid (PHP)","Refunds (PHP)","Net Revenue (PHP)",Transactions', $csv);
        $this->assertStringContainsString('2026-01,1000,200,800,1', $csv);
        $this->assertStringContainsString('2026-02,500,0,500,1', $csv);
    }

    private function seedRevenueFixtures(int $customerId): void
    {
        // Paid, PHP, lands in the January 2026 bucket.
        DB::table('subscription_requests')->insert([
            'adm_user_id' => $customerId, 'plan' => 'monthly', 'amount' => 1000, 'currency' => 'PHP',
            'status' => 'paid', 'paid_at' => '2026-01-15 10:00:00', 'created_at' => now(), 'updated_at' => now(),
        ]);
        // Refund against the above, same January bucket.
        DB::table('subscription_requests')->insert([
            'adm_user_id' => $customerId, 'plan' => 'monthly', 'amount' => 1000, 'currency' => 'PHP',
            'status' => 'archived', 'refunded_at' => '2026-01-25 09:00:00', 'refund_amount' => 200,
            'created_at' => now(), 'updated_at' => now(),
        ]);
        // Paid, PHP, February bucket, different plan.
        DB::table('subscription_requests')->insert([
            'adm_user_id' => $customerId, 'plan' => 'yearly', 'amount' => 500, 'currency' => 'PHP',
            'status' => 'paid', 'paid_at' => '2026-02-10 12:00:00', 'created_at' => now(), 'updated_at' => now(),
        ]);
        // Paid, but USD — excluded from PHP-only revenue totals.
        DB::table('subscription_requests')->insert([
            'adm_user_id' => $customerId, 'plan' => 'monthly', 'amount' => 999, 'currency' => 'USD',
            'status' => 'paid', 'paid_at' => '2026-01-20 08:00:00', 'created_at' => now(), 'updated_at' => now(),
        ]);
        // Pending — excluded entirely.
        DB::table('subscription_requests')->insert([
            'adm_user_id' => $customerId, 'plan' => 'monthly', 'amount' => 100, 'currency' => 'PHP',
            'status' => 'pending', 'created_at' => now(), 'updated_at' => now(),
        ]);
    }

    private function admin(bool $isAdmin, bool $isSuperadmin): AdmUser
    {
        $privilegeId = DB::table('adm_privileges')->insertGetId([
            'name' => $isSuperadmin ? 'Superadmin' : 'Admin', 'is_admin' => $isAdmin, 'is_superadmin' => $isSuperadmin,
        ]);
        $userId = DB::table('adm_users')->insertGetId([
            'name' => 'Admin', 'email' => uniqid('admin').'@example.test', 'status' => 'ACTIVE',
            'id_adm_privileges' => $privilegeId, 'created_at' => now(), 'updated_at' => now(),
        ]);

        return AdmUser::query()->findOrFail($userId);
    }

    private function customer(): AdmUser
    {
        $id = DB::table('adm_users')->insertGetId([
            'name' => 'Customer', 'email' => uniqid('customer').'@example.test', 'status' => 'ACTIVE',
            'created_at' => now(), 'updated_at' => now(),
        ]);

        return AdmUser::query()->findOrFail($id);
    }

    private function grantView(int $privilegeId): void
    {
        DB::table('adm_privileges_roles')->insert([
            'is_visible' => true, 'id_adm_privileges' => $privilegeId, 'id_adm_modules' => 1,
            'created_at' => now(), 'updated_at' => now(),
        ]);
    }
}

<?php

namespace Tests\Feature;

use App\Http\Middleware\HandleInertiaRequests;
use App\Models\AdmUser;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class FeedbackReportControllerTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        if (!in_array('sqlite', \PDO::getAvailableDrivers(), true)) {
            $this->markTestSkipped('The pdo_sqlite extension is required for isolated feedback report tests.');
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
        Schema::create('user_feedback', function (Blueprint $table) {
            $table->id(); $table->unsignedBigInteger('adm_user_id'); $table->string('category');
            $table->string('title'); $table->text('description'); $table->string('status')->default('submitted');
            $table->string('priority')->default('normal'); $table->text('admin_response')->nullable();
            $table->timestamp('responded_at')->nullable();
            $table->timestamps();
        });

        DB::table('adm_modules')->insert(['id' => 1, 'name' => 'Feedback Analytics', 'path' => 'reports_feedback', 'is_active' => true]);
    }

    public function test_denies_admin_without_granted_permission(): void
    {
        $admin = $this->admin(isAdmin: true, isSuperadmin: false);

        $this->actingAs($admin)
            ->getJson('/admin/reports/feedback/items')
            ->assertForbidden();
    }

    public function test_allows_admin_once_permission_granted_and_returns_category_breakdown(): void
    {
        $admin = $this->admin(isAdmin: true, isSuperadmin: false);
        $this->grantView($admin->id_adm_privileges);
        $customer = $this->customer();
        $this->seedFeedbackFixtures($customer->id);

        $response = $this->actingAs($admin)
            ->getJson('/admin/reports/feedback/items?from=2026-01-01&to=2026-01-31')
            ->assertOk()
            ->assertJsonPath('totalCount', 3)
            ->json();

        $bug = collect($response['categoryBreakdown'])->firstWhere('category', 'bug');
        $enhancement = collect($response['categoryBreakdown'])->firstWhere('category', 'enhancement');

        $this->assertSame(2, $bug['count']);
        $this->assertEquals(66.7, $bug['percent']);
        $this->assertSame(2, $bug['urgentHighCount']);
        $this->assertSame(1, $enhancement['count']);
        $this->assertSame(0, $enhancement['urgentHighCount']);
        // Sorted by count descending: bug (2) before enhancement (1).
        $this->assertSame('bug', $response['categoryBreakdown'][0]['category']);
    }

    public function test_superadmin_bypasses_permission_check(): void
    {
        $admin = $this->admin(isAdmin: false, isSuperadmin: true);
        $customer = $this->customer();
        $this->seedFeedbackFixtures($customer->id);

        $this->actingAs($admin)
            ->getJson('/admin/reports/feedback/items?from=2026-01-01&to=2026-01-31')
            ->assertOk()
            ->assertJsonPath('totalCount', 3);
    }

    public function test_priority_status_and_response_time_breakdowns(): void
    {
        $admin = $this->admin(isAdmin: true, isSuperadmin: false);
        $this->grantView($admin->id_adm_privileges);
        $customer = $this->customer();
        $this->seedFeedbackFixtures($customer->id);

        $response = $this->actingAs($admin)
            ->getJson('/admin/reports/feedback/items?from=2026-01-01&to=2026-01-31')
            ->assertOk()
            ->json();

        $priorities = collect($response['priorityBreakdown'])->pluck('count', 'value');
        $this->assertSame(1, $priorities['urgent']);
        $this->assertSame(1, $priorities['high']);
        $this->assertSame(1, $priorities['normal']);
        $this->assertSame(0, $priorities['low']);

        $this->assertSame(2, $response['statusBreakdown']['open']);
        $this->assertSame(1, $response['statusBreakdown']['resolved']);

        // Responded: item 2 (24h later) and item 3 (48h later) -> median 36.
        $this->assertEquals(36.0, $response['responseTime']['medianResponseHours']);
        $this->assertSame(1, $response['responseTime']['awaitingResponseCount']);
        $this->assertEquals(33.3, $response['responseTime']['awaitingResponsePercent']);

        $totalTrend = collect($response['volumeTrend'])->sum('count');
        $this->assertSame(3, $totalTrend);
    }

    public function test_csv_export_returns_expected_header_and_rows(): void
    {
        $admin = $this->admin(isAdmin: true, isSuperadmin: false);
        $this->grantView($admin->id_adm_privileges);
        $customer = $this->customer();
        $this->seedFeedbackFixtures($customer->id);

        $response = $this->actingAs($admin)
            ->get('/admin/reports/feedback/export?from=2026-01-01&to=2026-01-31')
            ->assertOk();

        $csv = $response->streamedContent();
        $this->assertStringContainsString('Category,Count,Percent,"Urgent/High Count"', $csv);
        $this->assertStringContainsString('bug,2,66.7,2', $csv);
        $this->assertStringContainsString('enhancement,1,33.3,0', $csv);
    }

    private function seedFeedbackFixtures(int $customerId): void
    {
        // In range: bug/urgent, unresponded.
        DB::table('user_feedback')->insert([
            'adm_user_id' => $customerId, 'category' => 'bug', 'title' => 'Chart freezes', 'description' => 'The chart freezes on load.',
            'status' => 'submitted', 'priority' => 'urgent', 'responded_at' => null,
            'created_at' => '2026-01-10 09:00:00', 'updated_at' => '2026-01-10 09:00:00',
        ]);
        // In range: bug/high, responded 24h later, completed.
        DB::table('user_feedback')->insert([
            'adm_user_id' => $customerId, 'category' => 'bug', 'title' => 'Wrong totals', 'description' => 'Totals are off by one.',
            'status' => 'completed', 'priority' => 'high', 'responded_at' => '2026-01-13 09:00:00',
            'created_at' => '2026-01-12 09:00:00', 'updated_at' => '2026-01-13 09:00:00',
        ]);
        // In range: enhancement/normal, responded 48h later, planned.
        DB::table('user_feedback')->insert([
            'adm_user_id' => $customerId, 'category' => 'enhancement', 'title' => 'Dark mode', 'description' => 'Please add dark mode everywhere.',
            'status' => 'planned', 'priority' => 'normal', 'responded_at' => '2026-01-17 09:00:00',
            'created_at' => '2026-01-15 09:00:00', 'updated_at' => '2026-01-17 09:00:00',
        ]);
        // Out of range — must be excluded from the January report.
        DB::table('user_feedback')->insert([
            'adm_user_id' => $customerId, 'category' => 'payment', 'title' => 'Double charge', 'description' => 'I was charged twice.',
            'status' => 'declined', 'priority' => 'low', 'responded_at' => null,
            'created_at' => '2026-02-01 09:00:00', 'updated_at' => '2026-02-01 09:00:00',
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

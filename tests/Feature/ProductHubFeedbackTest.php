<?php

namespace Tests\Feature;

use App\Http\Middleware\HandleInertiaRequests;
use App\Models\AdmUser;
use App\Models\UserFeedback;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * Covers the Product Hub half of the feedback pipeline: the new chart/trading/replay
 * categories, the chart context a submission carries, and image attachments — which
 * must land on the PRIVATE `local` disk and only ever be readable through the
 * authorized download route. See docs/developer/feedback.md.
 */
class ProductHubFeedbackTest extends TestCase
{
    private int $superadminRoleId;

    protected function setUp(): void
    {
        parent::setUp();

        if (!in_array('sqlite', \PDO::getAvailableDrivers(), true)) {
            $this->markTestSkipped('The pdo_sqlite extension is required for isolated feedback tests.');
        }

        config()->set('database.default', 'sqlite');
        config()->set('database.connections.sqlite.database', ':memory:');
        DB::purge('sqlite');
        DB::reconnect('sqlite');
        $this->withoutMiddleware(HandleInertiaRequests::class);

        Storage::fake('local');
        Storage::fake('public');

        Schema::create('adm_users', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('email')->unique();
            $table->unsignedBigInteger('id_adm_privileges')->nullable();
            $table->string('status')->default('ACTIVE');
            $table->rememberToken();
            $table->timestamps();
        });

        // Superadmin is resolved through adm_privileges, not a session flag — see
        // AdminAccessService::role().
        Schema::create('adm_privileges', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->boolean('is_admin')->default(false);
            $table->boolean('is_superadmin')->default(false);
            $table->string('theme_color')->nullable();
            $table->timestamps();
        });

        $this->superadminRoleId = DB::table('adm_privileges')->insertGetId([
            'name' => 'Superadmin', 'is_admin' => true, 'is_superadmin' => true,
            'created_at' => now(), 'updated_at' => now(),
        ]);

        Schema::create('subscription_requests', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('adm_user_id');
            $table->string('plan')->default('monthly');
            $table->decimal('amount', 12, 2)->nullable();
            $table->string('currency', 3)->default('PHP');
            $table->string('status')->default('paid');
            $table->timestamps();
        });

        Schema::create('user_feedback', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('adm_user_id');
            $table->unsignedBigInteger('subscription_request_id')->nullable();
            $table->string('category', 32);
            $table->string('payment_reason_code', 40)->nullable();
            $table->string('title', 160);
            $table->text('description');
            $table->string('page_url', 500)->nullable();
            $table->json('context')->nullable();
            $table->string('status', 24)->default('submitted');
            $table->string('priority', 16)->default('normal');
            $table->text('admin_response')->nullable();
            $table->unsignedBigInteger('responded_by')->nullable();
            $table->timestamp('responded_at')->nullable();
            $table->timestamps();
        });

        Schema::create('user_feedback_messages', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('user_feedback_id');
            $table->unsignedBigInteger('adm_user_id');
            $table->text('message')->nullable();
            $table->timestamp('read_at')->nullable();
            $table->timestamps();
        });

        Schema::create('user_feedback_attachments', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('user_feedback_id');
            $table->string('path', 500);
            $table->string('name', 255);
            $table->string('mime', 100);
            $table->unsignedInteger('size');
            $table->timestamps();
        });
    }

    public function test_a_chart_suggestion_is_accepted_and_keeps_its_chart_context(): void
    {
        $user = $this->user('trader@example.test');

        $response = $this->actingAs($user)->postJson('/feedback/items', [
            'category' => 'chart',
            'title' => 'Let me pin the drawing toolbar',
            'description' => 'The drawing toolbar collapses every time I switch symbols.',
            'context' => ['symbol' => 'BTCUSDT', 'exchange' => 'bybit', 'category' => 'linear', 'timeframe' => '15m', 'replayMode' => true],
        ])->assertCreated();

        $response->assertJsonPath('feedback.category', 'chart')
            ->assertJsonPath('feedback.isProduct', true)
            ->assertJsonPath('feedback.context.symbol', 'BTCUSDT')
            ->assertJsonPath('feedback.context.timeframe', '15m')
            ->assertJsonPath('feedback.context.replayMode', true);
    }

    public function test_unknown_context_keys_are_dropped_rather_than_stored(): void
    {
        $user = $this->user('context@example.test');

        $this->actingAs($user)->postJson('/feedback/items', [
            'category' => 'trading',
            'title' => 'Order ticket defaults',
            'description' => 'Remember the last order size I used on this symbol.',
            'context' => ['symbol' => 'ETHUSDT', 'evil' => 'should not persist'],
        ])->assertCreated();

        $context = UserFeedback::query()->latest('id')->first()->context;
        $this->assertSame(['symbol' => 'ETHUSDT'], $context);
    }

    public function test_a_retired_category_still_validates_for_historical_rows(): void
    {
        $user = $this->user('legacy@example.test');

        $this->actingAs($user)->postJson('/feedback/items', [
            'category' => 'enhancement',
            'title' => 'Legacy category still accepted',
            'description' => 'Retired categories must not start failing validation.',
        ])->assertCreated()->assertJsonPath('feedback.isProduct', true);
    }

    public function test_images_are_stored_on_the_private_disk_and_never_the_public_one(): void
    {
        $user = $this->user('upload@example.test');

        $response = $this->actingAs($user)->post('/feedback/items', [
            'category' => 'bug',
            'title' => 'Candles render twice',
            'description' => 'Every candle draws a duplicate wick after a timeframe switch.',
            'attachments' => [
                UploadedFile::fake()->image('one.png'),
                UploadedFile::fake()->image('two.png'),
            ],
        ])->assertCreated();

        $this->assertCount(2, $response->json('feedback.attachments'));

        $paths = DB::table('user_feedback_attachments')->pluck('path');
        $this->assertCount(2, $paths);
        foreach ($paths as $path) {
            Storage::disk('local')->assertExists($path);
            Storage::disk('public')->assertMissing($path);
            $this->assertStringStartsWith("feedback-attachments/{$user->id}/", $path);
        }
    }

    public function test_a_fifth_image_a_non_image_and_an_oversize_file_are_rejected(): void
    {
        $user = $this->user('limits@example.test');
        $base = [
            'category' => 'chart',
            'title' => 'Attachment limits',
            'description' => 'This submission exists only to exercise attachment validation.',
        ];

        $this->actingAs($user)->post('/feedback/items', [...$base, 'attachments' => [
            UploadedFile::fake()->image('a.png'), UploadedFile::fake()->image('b.png'),
            UploadedFile::fake()->image('c.png'), UploadedFile::fake()->image('d.png'),
            UploadedFile::fake()->image('e.png'),
        ]])->assertStatus(302)->assertSessionHasErrors('attachments');

        $this->actingAs($user)->post('/feedback/items', [...$base, 'attachments' => [
            UploadedFile::fake()->create('notes.pdf', 12, 'application/pdf'),
        ]])->assertStatus(302)->assertSessionHasErrors('attachments.0');

        $this->actingAs($user)->post('/feedback/items', [...$base, 'attachments' => [
            UploadedFile::fake()->image('huge.png')->size(5000),
        ]])->assertStatus(302)->assertSessionHasErrors('attachments.0');

        $this->assertSame(0, DB::table('user_feedback_attachments')->count());
    }

    public function test_an_attachment_is_readable_by_its_owner_and_by_a_superadmin_but_not_a_stranger(): void
    {
        $owner = $this->user('owner@example.test');
        $stranger = $this->user('stranger@example.test');
        $admin = $this->user('admin@example.test', $this->superadminRoleId);

        $this->actingAs($owner)->post('/feedback/items', [
            'category' => 'performance',
            'title' => 'Replay stutters at 8x',
            'description' => 'Playback drops frames once the speed goes past four times.',
            'attachments' => [UploadedFile::fake()->image('shot.png')],
        ])->assertCreated();

        $attachmentId = DB::table('user_feedback_attachments')->value('id');

        $this->actingAs($owner)->get("/feedback/attachments/{$attachmentId}")->assertOk();
        $this->actingAs($admin)->get("/feedback/attachments/{$attachmentId}")->assertOk();
        $this->actingAs($stranger)->get("/feedback/attachments/{$attachmentId}")->assertNotFound();
    }

    public function test_deleting_a_ticket_removes_its_files_from_disk(): void
    {
        $user = $this->user('cleanup@example.test');

        $this->actingAs($user)->post('/feedback/items', [
            'category' => 'other',
            'title' => 'Cleanup check',
            'description' => 'Deleting the ticket must take its uploaded files with it.',
            'attachments' => [UploadedFile::fake()->image('gone.png')],
        ])->assertCreated();

        $path = DB::table('user_feedback_attachments')->value('path');
        Storage::disk('local')->assertExists($path);

        UserFeedback::query()->latest('id')->first()->delete();

        Storage::disk('local')->assertMissing($path);
    }

    private function user(string $email, ?int $privilegeId = null): AdmUser
    {
        $id = DB::table('adm_users')->insertGetId([
            'name' => 'Test', 'email' => $email, 'id_adm_privileges' => $privilegeId, 'status' => 'ACTIVE',
            'created_at' => now(), 'updated_at' => now(),
        ]);

        return AdmUser::query()->findOrFail($id);
    }
}

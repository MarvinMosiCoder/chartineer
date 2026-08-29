<?php

namespace Tests\Feature;

use App\Http\Middleware\HandleInertiaRequests;
use App\Models\AdmUser;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class UserFeedbackPaymentContextTest extends TestCase
{
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

        Schema::create('adm_users', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('email')->unique();
            $table->string('status')->default('ACTIVE');
            $table->rememberToken();
            $table->timestamps();
        });

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

        // store() has loaded these counts since the support-chat feature landed; the
        // fixture never gained the table, which stayed invisible while the whole
        // suite skipped for want of pdo_sqlite.
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

    public function test_a_payment_ticket_can_attach_the_users_own_transaction_and_reason(): void
    {
        $user = $this->user('customer@example.test');
        $paymentId = DB::table('subscription_requests')->insertGetId([
            'adm_user_id' => $user->id, 'plan' => 'monthly', 'amount' => 499, 'currency' => 'PHP',
            'status' => 'paid', 'created_at' => now(), 'updated_at' => now(),
        ]);

        $this->actingAs($user)->postJson('/feedback/items', [
            'category' => 'payment',
            'title' => 'Charged twice for monthly plan',
            'description' => 'I was charged twice for the same monthly plan purchase.',
            'subscription_request_id' => $paymentId,
            'payment_reason_code' => 'duplicate',
        ])->assertCreated()
            ->assertJsonPath('feedback.subscriptionRequest.id', $paymentId)
            ->assertJsonPath('feedback.paymentReasonCode', 'duplicate');
    }

    public function test_a_transaction_belonging_to_another_user_is_rejected(): void
    {
        $user = $this->user('customer2@example.test');
        $otherUser = $this->user('other@example.test');
        $otherPaymentId = DB::table('subscription_requests')->insertGetId([
            'adm_user_id' => $otherUser->id, 'plan' => 'monthly', 'amount' => 499, 'currency' => 'PHP',
            'status' => 'paid', 'created_at' => now(), 'updated_at' => now(),
        ]);

        $this->actingAs($user)->postJson('/feedback/items', [
            'category' => 'payment',
            'title' => 'Trying to attach someone elses payment',
            'description' => 'This should be rejected by ownership validation.',
            'subscription_request_id' => $otherPaymentId,
        ])->assertStatus(422);
    }

    public function test_payment_fields_are_ignored_for_a_non_payment_category(): void
    {
        $user = $this->user('customer3@example.test');
        $paymentId = DB::table('subscription_requests')->insertGetId([
            'adm_user_id' => $user->id, 'plan' => 'monthly', 'amount' => 499, 'currency' => 'PHP',
            'status' => 'paid', 'created_at' => now(), 'updated_at' => now(),
        ]);

        $this->actingAs($user)->postJson('/feedback/items', [
            'category' => 'bug',
            'title' => 'Chart freezes on load',
            'description' => 'The chart freezes when I load the replay panel.',
            'subscription_request_id' => $paymentId,
            'payment_reason_code' => 'duplicate',
        ])->assertCreated()
            ->assertJsonPath('feedback.subscriptionRequest', null)
            ->assertJsonPath('feedback.paymentReasonCode', null);
    }

    private function user(string $email): AdmUser
    {
        $id = DB::table('adm_users')->insertGetId([
            'name' => 'Test', 'email' => $email, 'status' => 'ACTIVE',
            'created_at' => now(), 'updated_at' => now(),
        ]);
        return AdmUser::query()->findOrFail($id);
    }
}

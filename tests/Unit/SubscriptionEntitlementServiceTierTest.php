<?php

namespace Tests\Unit;

use App\Models\AdmUser;
use App\Models\SubscriptionRequest;
use App\Services\Payments\SubscriptionEntitlementService;
use Carbon\Carbon;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * Covers what activate() does with tiers and with the widened start boundary.
 *
 * Uses the same isolated in-memory SQLite schema as the other entitlement tests
 * rather than the configured database.
 */
class SubscriptionEntitlementServiceTierTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        if (!in_array('sqlite', \PDO::getAvailableDrivers(), true)) {
            $this->markTestSkipped('The pdo_sqlite extension is required for isolated entitlement tests.');
        }

        config()->set('database.default', 'sqlite');
        config()->set('database.connections.sqlite.database', ':memory:');
        DB::purge('sqlite');
        DB::reconnect('sqlite');

        Schema::create('adm_users', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('email')->unique();
            $table->string('password')->nullable();
            $table->string('status')->default('ACTIVE');
            $table->timestamp('replay_trial_started_at')->nullable();
            $table->timestamp('replay_trial_ends_at')->nullable();
            $table->timestamp('replay_access_ends_at')->nullable();
            $table->unsignedTinyInteger('replay_access_tier')->nullable();
            $table->timestamp('renewal_reminder_sent_at')->nullable();
            $table->rememberToken();
            $table->timestamps();
        });

        Schema::create('subscription_requests', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('adm_user_id');
            $table->string('plan')->default('monthly');
            $table->string('payment_method')->default('paymongo_checkout');
            $table->string('payment_reference')->nullable();
            $table->decimal('amount', 12, 2)->nullable();
            $table->string('currency', 3)->default('PHP');
            $table->unsignedInteger('duration_days')->nullable();
            $table->unsignedTinyInteger('tier_level')->nullable();
            $table->boolean('livemode')->default(false);
            $table->string('provider')->default('paymongo');
            $table->string('provider_payment_id')->nullable();
            $table->string('provider_checkout_id')->nullable();
            $table->string('status')->default('pending');
            $table->string('provider_status_message', 500)->nullable();
            $table->string('admin_notes', 2000)->nullable();
            $table->timestamp('paid_at')->nullable();
            $table->timestamp('failed_at')->nullable();
            $table->timestamps();
        });

        Schema::create('subscription_plans', function (Blueprint $table) {
            $table->id();
            $table->string('code')->unique();
            $table->string('name');
            $table->unsignedInteger('duration_days');
            $table->unsignedTinyInteger('tier_level')->default(1);
            $table->timestamps();
        });

        Schema::create('adm_notifications', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('adm_user_id');
            $table->string('type')->default('info');
            $table->string('source_type', 50)->nullable();
            $table->unsignedBigInteger('source_id')->nullable();
            $table->json('metadata')->nullable();
            $table->string('content');
            $table->string('url')->nullable();
            $table->boolean('is_read')->default(false);
            $table->timestamps();
        });

        DB::table('subscription_plans')->insert([
            ['code' => 'weekly', 'name' => 'Weekly', 'duration_days' => 7, 'tier_level' => 1, 'created_at' => now(), 'updated_at' => now()],
            ['code' => 'monthly', 'name' => 'Monthly', 'duration_days' => 30, 'tier_level' => 2, 'created_at' => now(), 'updated_at' => now()],
            ['code' => 'yearly', 'name' => 'Yearly', 'duration_days' => 365, 'tier_level' => 3, 'created_at' => now(), 'updated_at' => now()],
        ]);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_activation_with_no_existing_window_starts_now_at_the_plan_tier(): void
    {
        Carbon::setTestNow('2026-09-06 12:00:00');
        $user = $this->user();
        $payment = $this->payment($user, ['plan' => 'monthly', 'duration_days' => 30, 'tier_level' => 2]);

        app(SubscriptionEntitlementService::class)->activate($payment, $this->providerPayment($payment));

        $fresh = $user->fresh();
        $this->assertSame(2, $fresh->replay_access_tier);
        $this->assertSame('2026-10-06 12:00:00', $fresh->replay_access_ends_at->format('Y-m-d H:i:s'));
    }

    /**
     * The whole point of the trial-conversion path: the trial is not shortened
     * and the paid window queues behind it, so no paid day is lost to overlap.
     */
    public function test_activation_during_a_trial_queues_behind_the_trial(): void
    {
        Carbon::setTestNow('2026-09-06 12:00:00');
        $user = $this->user();
        $trialEnds = now()->addDays(5);
        $user->forceFill([
            'replay_trial_started_at' => now()->subDays(2),
            'replay_trial_ends_at' => $trialEnds,
        ])->save();

        $payment = $this->payment($user, ['plan' => 'weekly', 'duration_days' => 7, 'tier_level' => 1]);
        app(SubscriptionEntitlementService::class)->activate($payment, $this->providerPayment($payment));

        $fresh = $user->fresh();
        $this->assertSame($trialEnds->format('Y-m-d H:i:s'), $fresh->replay_trial_ends_at->format('Y-m-d H:i:s'),
            'The trial must not be shortened by a purchase.');
        $this->assertSame($trialEnds->copy()->addDays(7)->format('Y-m-d H:i:s'),
            $fresh->replay_access_ends_at->format('Y-m-d H:i:s'),
            'The paid window must start when the trial ends, not at purchase time.');
        $this->assertSame(1, $fresh->replay_access_tier);
    }

    public function test_upgrade_carries_remaining_paid_days_and_raises_the_tier(): void
    {
        Carbon::setTestNow('2026-09-06 12:00:00');
        $user = $this->user();
        $currentEnds = now()->addDays(4);
        $user->forceFill(['replay_access_ends_at' => $currentEnds, 'replay_access_tier' => 1])->save();

        $payment = $this->payment($user, ['plan' => 'yearly', 'duration_days' => 365, 'tier_level' => 3]);
        app(SubscriptionEntitlementService::class)->activate($payment, $this->providerPayment($payment));

        $fresh = $user->fresh();
        $this->assertSame(3, $fresh->replay_access_tier);
        $this->assertSame($currentEnds->copy()->addDays(365)->format('Y-m-d H:i:s'),
            $fresh->replay_access_ends_at->format('Y-m-d H:i:s'),
            'The four remaining Starter days must carry over.');
    }

    /**
     * The checkout guard blocks a downgrade, but admin reconciliation and the
     * scheduled poller bypass it. A late, lower-tier payment must not demote a
     * user who already holds something higher.
     */
    public function test_a_late_lower_tier_activation_never_demotes_a_higher_live_tier(): void
    {
        Carbon::setTestNow('2026-09-06 12:00:00');
        $user = $this->user();
        $user->forceFill(['replay_access_ends_at' => now()->addDays(200), 'replay_access_tier' => 3])->save();

        $payment = $this->payment($user, ['plan' => 'weekly', 'duration_days' => 7, 'tier_level' => 1]);
        app(SubscriptionEntitlementService::class)->activate($payment, $this->providerPayment($payment));

        $this->assertSame(3, $user->fresh()->replay_access_tier);
    }

    /** Legacy rows predating the snapshot column resolve through the plan. */
    public function test_activation_without_a_snapshot_falls_back_to_the_plan_tier(): void
    {
        Carbon::setTestNow('2026-09-06 12:00:00');
        $user = $this->user();
        $payment = $this->payment($user, ['plan' => 'yearly', 'duration_days' => 365, 'tier_level' => null]);

        app(SubscriptionEntitlementService::class)->activate($payment, $this->providerPayment($payment));

        $this->assertSame(3, $user->fresh()->replay_access_tier);
    }

    /**
     * The snapshot is authoritative: retuning a plan after checkout must not
     * change what the customer already paid for.
     */
    public function test_the_snapshot_wins_over_a_retuned_plan(): void
    {
        Carbon::setTestNow('2026-09-06 12:00:00');
        $user = $this->user();
        $payment = $this->payment($user, ['plan' => 'yearly', 'duration_days' => 365, 'tier_level' => 3]);

        DB::table('subscription_plans')->where('code', 'yearly')->update(['tier_level' => 1]);
        app(SubscriptionEntitlementService::class)->activate($payment, $this->providerPayment($payment));

        $this->assertSame(3, $user->fresh()->replay_access_tier);
    }

    private function user(): AdmUser
    {
        $id = DB::table('adm_users')->insertGetId([
            'name' => 'Test User', 'email' => 'user'.uniqid().'@example.test', 'status' => 'ACTIVE',
            'created_at' => now(), 'updated_at' => now(),
        ]);

        return AdmUser::query()->findOrFail($id);
    }

    private function payment(AdmUser $user, array $overrides = []): SubscriptionRequest
    {
        $id = DB::table('subscription_requests')->insertGetId(array_merge([
            'adm_user_id' => $user->id, 'plan' => 'monthly', 'provider' => 'paymongo',
            'provider_payment_id' => 'pay_'.uniqid(), 'amount' => 1000, 'currency' => 'PHP',
            'duration_days' => 30, 'tier_level' => 2, 'status' => 'pending', 'livemode' => false,
            'created_at' => now(), 'updated_at' => now(),
        ], $overrides));

        return SubscriptionRequest::query()->findOrFail($id);
    }

    private function providerPayment(SubscriptionRequest $payment): array
    {
        return [
            'id' => $payment->provider_payment_id,
            'amount' => (int) round((float) $payment->amount * 100),
            'currency' => $payment->currency,
            'livemode' => (bool) $payment->livemode,
            'paid_at' => now()->timestamp,
        ];
    }
}

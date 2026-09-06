<?php

namespace Tests\Unit;

use App\Models\AdmUser;
use App\Services\AdminAccessService;
use App\Services\SubscriptionTierService;
use Illuminate\Http\Exceptions\HttpResponseException;
use Tests\TestCase;

/**
 * Tier resolution is pure logic over config plus two timestamps on the user, so
 * these run without a database. AdminAccessService is stubbed because its real
 * isSuperadmin() reads the privileges table, which is not what is under test.
 */
class SubscriptionTierServiceTest extends TestCase
{
    private function service(bool $superadmin = false): SubscriptionTierService
    {
        $access = $this->createMock(AdminAccessService::class);
        $access->method('isSuperadmin')->willReturn($superadmin);

        return new SubscriptionTierService($access);
    }

    private function user(array $attributes = []): AdmUser
    {
        $user = new AdmUser();
        $user->forceFill($attributes);

        return $user;
    }

    public function test_no_user_and_no_windows_resolve_to_no_access(): void
    {
        $service = $this->service();

        $this->assertSame(0, $service->effectiveTier(null));
        $this->assertSame(0, $service->effectiveTier($this->user()));
    }

    public function test_live_paid_window_resolves_to_its_stored_tier(): void
    {
        $tier = $this->service()->effectiveTier($this->user([
            'replay_access_ends_at' => now()->addDays(5),
            'replay_access_tier' => 2,
        ]));

        $this->assertSame(2, $tier);
    }

    public function test_lapsed_paid_window_resolves_to_no_access(): void
    {
        $tier = $this->service()->effectiveTier($this->user([
            'replay_access_ends_at' => now()->subSecond(),
            'replay_access_tier' => 3,
        ]));

        $this->assertSame(0, $tier);
    }

    /** A row written before the tier column existed must degrade, not lose access. */
    public function test_live_paid_window_with_no_stored_tier_degrades_to_starter(): void
    {
        $tier = $this->service()->effectiveTier($this->user([
            'replay_access_ends_at' => now()->addDay(),
            'replay_access_tier' => null,
        ]));

        $this->assertSame(1, $tier);
    }

    public function test_trial_grants_the_configured_trial_level(): void
    {
        config()->set('subscription_tiers.trial_level', 3);

        $tier = $this->service()->effectiveTier($this->user([
            'replay_trial_ends_at' => now()->addDays(3),
        ]));

        $this->assertSame(3, $tier);
    }

    /** Converting mid-trial must never feel like a downgrade for the overlap. */
    public function test_higher_trial_wins_over_a_lower_live_paid_window(): void
    {
        config()->set('subscription_tiers.trial_level', 3);

        $tier = $this->service()->effectiveTier($this->user([
            'replay_trial_ends_at' => now()->addDays(3),
            'replay_access_ends_at' => now()->addDays(10),
            'replay_access_tier' => 1,
        ]));

        $this->assertSame(3, $tier);
    }

    public function test_superadmin_resolves_to_the_maximum_tier_without_any_window(): void
    {
        $this->assertSame(3, $this->service(superadmin: true)->effectiveTier($this->user()));
    }

    public function test_paid_tier_ignores_the_trial(): void
    {
        $service = $this->service();
        $user = $this->user([
            'replay_trial_ends_at' => now()->addDays(3),
        ]);

        $this->assertSame(3, $service->effectiveTier($user));
        $this->assertSame(0, $service->paidTier($user), 'A trial is not a paid window.');
    }

    public function test_unknown_capability_fails_closed(): void
    {
        $service = $this->service();

        $this->assertNull($service->requiredTier('not_a_real_capability'));
        $this->assertFalse($service->allows(
            $this->user(['replay_access_ends_at' => now()->addDay(), 'replay_access_tier' => 3]),
            'not_a_real_capability'
        ));
    }

    public function test_capability_sets_nest_by_tier(): void
    {
        $service = $this->service();

        $starter = $service->capabilitiesFor(1);
        $pro = $service->capabilitiesFor(2);
        $elite = $service->capabilitiesFor(3);

        $this->assertEmpty(array_diff($starter, $pro));
        $this->assertEmpty(array_diff($pro, $elite));
        $this->assertContains('playbooks', $pro);
        $this->assertNotContains('playbooks', $starter);
        $this->assertContains('cross_margin', $elite);
        $this->assertNotContains('cross_margin', $pro);
    }

    public function test_lowest_tier_allowing_finds_the_cheapest_upgrade(): void
    {
        $service = $this->service();

        $this->assertSame(2, $service->lowestTierAllowing('playbooks', 1));
        $this->assertSame(3, $service->lowestTierAllowing('playbooks', 11));
        $this->assertSame(3, $service->lowestTierAllowing('share_links', 1));
        $this->assertNull($service->lowestTierAllowing('alerts', 100000));
    }

    public function test_quota_permits_creation_below_the_limit(): void
    {
        $service = $this->service();
        $pro = $this->user(['replay_access_ends_at' => now()->addDay(), 'replay_access_tier' => 2]);

        $service->assertWithinQuota($pro, 'playbooks', 9);

        $this->assertTrue(true, 'Creating the tenth playbook on Pro must not abort.');
    }

    public function test_quota_refuses_creation_at_the_limit_and_names_the_upgrade(): void
    {
        $service = $this->service();
        $pro = $this->user(['replay_access_ends_at' => now()->addDay(), 'replay_access_tier' => 2]);

        try {
            $service->assertWithinQuota($pro, 'playbooks', 10);
            $this->fail('Creating an eleventh playbook on Pro should have been refused.');
        } catch (HttpResponseException $exception) {
            $payload = json_decode($exception->getResponse()->getContent(), true);

            $this->assertSame(422, $exception->getResponse()->getStatusCode());
            $this->assertSame('tier_quota_reached', $payload['code']);
            $this->assertSame(10, $payload['limit']);
            $this->assertSame(3, $payload['requiredTier']);
            $this->assertSame('Elite', $payload['requiredTierName']);
        }
    }

    /**
     * A downgraded user keeps their rows; only new ones are refused. This is the
     * over-quota case that must not throw anything other than the normal refusal.
     */
    public function test_over_quota_after_a_downgrade_is_refused_not_fatal(): void
    {
        $service = $this->service();
        $starter = $this->user(['replay_access_ends_at' => now()->addDay(), 'replay_access_tier' => 1]);

        $this->expectException(HttpResponseException::class);
        $service->assertWithinQuota($starter, 'playbooks', 12);
    }

    public function test_unlimited_quota_never_refuses(): void
    {
        $service = $this->service();
        $elite = $this->user(['replay_access_ends_at' => now()->addDay(), 'replay_access_tier' => 3]);

        $service->assertWithinQuota($elite, 'playbooks', 5000);

        $this->assertNull($service->limit($elite, 'playbooks'));
    }
}

<?php

namespace Tests\Unit;

use App\Http\Middleware\EnsureReplayAccess;
use App\Models\AdmUser;
use App\Services\AdminAccessService;
use App\Services\SubscriptionTierService;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Tests\TestCase;

/**
 * Exercises the gate itself rather than the route stack, so every tier/capability
 * combination is cheap to cover. The route wiring that supplies the capability
 * argument is asserted separately by the routes' own middleware list.
 */
class EnsureReplayAccessTierTest extends TestCase
{
    private function middleware(bool $superadmin = false): EnsureReplayAccess
    {
        $access = $this->createMock(AdminAccessService::class);
        $access->method('isSuperadmin')->willReturn($superadmin);

        return new EnsureReplayAccess(new SubscriptionTierService($access));
    }

    private function requestFor(?AdmUser $user): Request
    {
        $request = Request::create('/market-backtest/playbooks', 'GET');
        $request->setUserResolver(fn () => $user);

        return $request;
    }

    private function userAtTier(?int $tier): AdmUser
    {
        $user = new AdmUser();
        $user->forceFill($tier === null ? [] : [
            'replay_access_ends_at' => now()->addDays(5),
            'replay_access_tier' => $tier,
        ]);

        return $user;
    }

    private function dispatch(EnsureReplayAccess $middleware, ?AdmUser $user, ?string $capability = null)
    {
        return $middleware->handle(
            $this->requestFor($user),
            fn () => new Response('reached', 200),
            $capability
        );
    }

    public function test_user_with_no_access_is_refused_with_402(): void
    {
        $response = $this->dispatch($this->middleware(), $this->userAtTier(null));

        $this->assertSame(402, $response->getStatusCode());
        $this->assertSame('replay_subscription_required', $response->getData(true)['code']);
    }

    public function test_starter_reaches_an_ungated_replay_route(): void
    {
        $response = $this->dispatch($this->middleware(), $this->userAtTier(1));

        $this->assertSame(200, $response->getStatusCode());
        $this->assertSame('reached', $response->getContent());
    }

    public function test_starter_is_refused_a_pro_capability_and_told_which_plan_grants_it(): void
    {
        $response = $this->dispatch($this->middleware(), $this->userAtTier(1), 'playbooks');
        $payload = $response->getData(true);

        $this->assertSame(402, $response->getStatusCode());
        $this->assertSame(2, $payload['requiredTier']);
        $this->assertSame('Pro', $payload['requiredTierName']);
        $this->assertSame(1, $payload['currentTier']);
        $this->assertStringContainsString('Pro', $payload['message']);
    }

    public function test_pro_reaches_a_pro_capability(): void
    {
        $this->assertSame(200, $this->dispatch($this->middleware(), $this->userAtTier(2), 'playbooks')->getStatusCode());
    }

    public function test_pro_is_refused_an_elite_capability(): void
    {
        $response = $this->dispatch($this->middleware(), $this->userAtTier(2), 'monte_carlo');

        $this->assertSame(402, $response->getStatusCode());
        $this->assertSame(3, $response->getData(true)['requiredTier']);
    }

    public function test_elite_reaches_every_capability(): void
    {
        $middleware = $this->middleware();
        $elite = $this->userAtTier(3);

        foreach (array_keys(config('subscription_tiers.capabilities')) as $capability) {
            $this->assertSame(200, $this->dispatch($middleware, $elite, $capability)->getStatusCode(),
                "Elite should reach '{$capability}'.");
        }
    }

    public function test_superadmin_bypasses_every_gate_with_no_subscription(): void
    {
        $middleware = $this->middleware(superadmin: true);
        $noAccess = $this->userAtTier(null);

        $this->assertSame(200, $this->dispatch($middleware, $noAccess)->getStatusCode());
        $this->assertSame(200, $this->dispatch($middleware, $noAccess, 'monte_carlo')->getStatusCode());
    }

    /** A typo in a route's middleware argument must lock the route, never open it. */
    public function test_unknown_capability_is_refused_even_for_elite(): void
    {
        $response = $this->dispatch($this->middleware(), $this->userAtTier(3), 'playboks');

        $this->assertSame(402, $response->getStatusCode());
    }

    public function test_trial_user_reaches_elite_capabilities(): void
    {
        config()->set('subscription_tiers.trial_level', 3);

        $user = new AdmUser();
        $user->forceFill(['replay_trial_ends_at' => now()->addDays(4)]);

        $this->assertSame(200, $this->dispatch($this->middleware(), $user, 'monte_carlo')->getStatusCode());
    }
}

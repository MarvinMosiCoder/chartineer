<?php
namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use App\Services\SubscriptionTierService;

/**
 * Gates a route on the user's subscription tier.
 *
 * Called with no argument (`replay.access`) it means "any paid tier", which is
 * the behavior every pre-tier route already had — those call sites are
 * unchanged. Called with a capability name (`replay.access:playbooks`) it also
 * requires the tier that capability is configured to need.
 */
class EnsureReplayAccess
{
    public function __construct(private readonly SubscriptionTierService $tiers)
    {
    }

    public function handle(Request $request, Closure $next, ?string $capability = null)
    {
        $user = $request->user();
        if (!$user) abort(401);

        // Superadmins resolve to the maximum tier inside the service.
        $tier = $this->tiers->effectiveTier($user);

        if ($tier < 1) {
            return $this->denied($user, 1, $user->replay_trial_started_at
                ? 'Your replay access has expired.'
                : 'Activate your free seven-day trial to use replay and backtesting.');
        }

        if ($capability === null) {
            return $next($request);
        }

        $required = $this->tiers->requiredTier($capability);

        // An unknown capability name fails closed. A typo in a route's
        // middleware argument locks that route rather than opening it.
        if ($required === null) {
            return $this->denied($user, $this->tiers->requiredTier('cross_margin') ?? 3,
                'This feature is unavailable on your current plan.');
        }

        if ($tier < $required) {
            $name = $this->tiers->tierName($required);

            return $this->denied($user, $required, "This feature is included with the {$name} plan.");
        }

        return $next($request);
    }

    private function denied($user, int $required, string $message)
    {
        return response()->json([
            'message' => $message,
            'code' => 'replay_subscription_required',
            'trialAvailable' => !$user->replay_trial_started_at,
            'requiredTier' => $required,
            'requiredTierName' => $this->tiers->tierName($required),
            'currentTier' => $this->tiers->effectiveTier($user),
        ], 402);
    }
}

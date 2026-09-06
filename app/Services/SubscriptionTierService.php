<?php

namespace App\Services;

use App\Models\AdmUser;

/**
 * Resolves what a user is currently entitled to.
 *
 * Access used to be a single boolean-in-time (`replay_access_ends_at` either
 * in the future or not). It is now that same timestamp plus a level, and every
 * gate in the app is the same comparison: `effectiveTier() >= requiredTier()`.
 *
 * Superadmins resolve to the maximum tier here rather than at each call site,
 * so a controller doing payload-level gating cannot forget the bypass that
 * EnsureReplayAccess has always had.
 */
class SubscriptionTierService
{
    public const NO_ACCESS = 0;

    public function __construct(private readonly AdminAccessService $adminAccess)
    {
    }

    /**
     * The highest tier the user currently holds, across trial and paid windows.
     *
     * Both can be live at once — a plan bought during a trial queues behind it
     * (see SubscriptionEntitlementService::activate) — and the higher wins for
     * the overlap, so converting mid-trial never feels like a downgrade.
     */
    public function effectiveTier(?AdmUser $user): int
    {
        if (!$user) {
            return self::NO_ACCESS;
        }

        if ($this->adminAccess->isSuperadmin($user)) {
            return $this->maxLevel();
        }

        return max($this->trialTier($user), $this->paidTier($user));
    }

    /**
     * The tier of the user's paid window, or 0 when it is absent or lapsed.
     *
     * A live window with a null `replay_access_tier` reads as Starter: rows
     * written before the tier column existed degrade to the lowest paid tier
     * rather than losing access outright.
     */
    public function paidTier(?AdmUser $user): int
    {
        if (!$user || !$user->replay_access_ends_at || now()->greaterThan($user->replay_access_ends_at)) {
            return self::NO_ACCESS;
        }

        return $this->clamp((int) ($user->replay_access_tier ?? 1));
    }

    public function trialTier(?AdmUser $user): int
    {
        if (!$user || !$user->replay_trial_ends_at || now()->greaterThan($user->replay_trial_ends_at)) {
            return self::NO_ACCESS;
        }

        return $this->clamp((int) config('subscription_tiers.trial_level', 3));
    }

    /**
     * Minimum tier a capability needs, or null when the name is unknown.
     *
     * Callers treat null as unreachable. A typo in a route's middleware
     * argument therefore locks the route rather than silently opening it.
     */
    public function requiredTier(string $capability): ?int
    {
        $required = config("subscription_tiers.capabilities.$capability");

        return is_numeric($required) ? $this->clamp((int) $required) : null;
    }

    public function allows(?AdmUser $user, string $capability): bool
    {
        $required = $this->requiredTier($capability);

        return $required !== null && $this->effectiveTier($user) >= $required;
    }

    /**
     * Creation quota for the user's tier, or null for unlimited.
     *
     * A user with no access gets the strictest configured tier's quota rather
     * than zero, so a free-tier limit stays expressible in config.
     */
    public function limit(?AdmUser $user, string $key): ?int
    {
        $tier = max($this->effectiveTier($user), 1);
        $limits = config("subscription_tiers.limits.$tier", []);

        return array_key_exists($key, $limits) ? $limits[$key] : null;
    }

    public function tierName(int $tier): ?string
    {
        return config("subscription_tiers.names.$tier");
    }

    /**
     * Refuses a creation that would take the user past their tier's quota.
     *
     * Checked at the point of creation only. A user who drops below the tier
     * that granted their current count keeps every existing row — nothing is
     * deleted on downgrade, they are simply refused new ones.
     */
    public function assertWithinQuota(?AdmUser $user, string $key, int $currentCount): void
    {
        $limit = $this->limit($user, $key);
        if ($limit === null || $currentCount < $limit) {
            return;
        }

        $upgrade = $this->lowestTierAllowing($key, $currentCount + 1);
        $message = $limit === 0
            ? 'This feature is not included with your current plan.'
            : "You've reached your plan's limit of {$limit}.";

        abort(response()->json([
            'success' => false,
            'message' => $upgrade === null
                ? $message
                : $message.' The '.$this->tierName($upgrade).' plan raises this limit.',
            'code' => 'tier_quota_reached',
            'limit' => $limit,
            'currentTier' => $this->effectiveTier($user),
            'requiredTier' => $upgrade,
            'requiredTierName' => $upgrade === null ? null : $this->tierName($upgrade),
        ], 422));
    }

    /**
     * Lowest tier whose quota for $key admits $needed, or null when no
     * configured tier does.
     */
    public function lowestTierAllowing(string $key, int $needed): ?int
    {
        $limits = config('subscription_tiers.limits', []);
        ksort($limits);

        foreach ($limits as $tier => $values) {
            $limit = $values[$key] ?? null;
            if ($limit === null || $needed <= $limit) {
                return (int) $tier;
            }
        }

        return null;
    }

    /**
     * Every capability name a tier unlocks. Drives the plans modal's feature
     * list and the frontend's `can()` checks from the same map enforcement uses.
     *
     * @return array<int, string>
     */
    public function capabilitiesFor(int $tier): array
    {
        $capabilities = config('subscription_tiers.capabilities', []);

        return array_values(array_keys(array_filter(
            $capabilities,
            fn ($required) => is_numeric($required) && $tier >= (int) $required
        )));
    }

    /**
     * Payload shared by /replay-access and the Inertia bootstrap, so the
     * frontend never infers a tier from plan codes.
     */
    public function payloadFor(?AdmUser $user): array
    {
        $tier = $this->effectiveTier($user);

        return [
            'tier' => $tier,
            'tierName' => $this->tierName($tier),
            'capabilities' => $this->capabilitiesFor($tier),
            'limits' => config("subscription_tiers.limits.".max($tier, 1), []),
        ];
    }

    private function maxLevel(): int
    {
        $names = config('subscription_tiers.names', []);

        return $names === [] ? 3 : max(array_keys($names));
    }

    private function clamp(int $tier): int
    {
        return max(self::NO_ACCESS, min($tier, $this->maxLevel()));
    }
}

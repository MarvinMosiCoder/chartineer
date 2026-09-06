/**
 * Normalizes a failed request into something AccessNotice can render.
 *
 * Returns a plain string for ordinary failures — the shape every caller's
 * `error` state already held — and an object for the subscription/tier
 * refusals, so the notice can name the plan that unlocks the feature and offer
 * a way to get it instead of showing a bare red bar.
 */

const GATED_CODES = ['replay_subscription_required', 'tier_quota_reached'];

export function toAccessError(err, fallback = 'Something went wrong.') {
    const response = err?.response;
    const data = response?.data ?? {};
    const message = data.message ?? err?.message ?? fallback;

    const gated = response?.status === 402 || GATED_CODES.includes(data.code);
    if (!gated) return message;

    return {
        gated: true,
        code: data.code ?? 'replay_subscription_required',
        message,
        requiredTier: data.requiredTier ?? null,
        requiredTierName: data.requiredTierName ?? null,
        currentTier: data.currentTier ?? 0,
        trialAvailable: data.trialAvailable === true,
        limit: data.limit ?? null,
    };
}

export const isGatedError = (error) => Boolean(error) && typeof error === 'object' && error.gated === true;

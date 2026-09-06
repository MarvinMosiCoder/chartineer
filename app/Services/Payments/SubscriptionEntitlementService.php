<?php

namespace App\Services\Payments;

use App\Models\AdmModels\AdmNotifications;
use App\Models\AdmUser;
use App\Models\SubscriptionPlan;
use App\Models\SubscriptionRequest;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use RuntimeException;

class SubscriptionEntitlementService
{
    public function __construct(private readonly PaymentActivityLogger $activityLog)
    {
    }

    public function activate(SubscriptionRequest $payment, array $providerPayment): SubscriptionRequest
    {
        return DB::transaction(function () use ($payment, $providerPayment) {
            $lockedPayment = SubscriptionRequest::whereKey($payment->id)->lockForUpdate()->firstOrFail();
            if ($lockedPayment->status === 'paid') return $lockedPayment;
            if ($lockedPayment->provider !== 'paymongo') throw new RuntimeException('Only PayMongo payments can be activated automatically.');
            if (!$lockedPayment->duration_days || $lockedPayment->duration_days < 1) throw new RuntimeException('The purchased access duration is invalid.');
            $this->assertProviderPaymentMatches($lockedPayment, $providerPayment);

            $user = AdmUser::whereKey($lockedPayment->adm_user_id)->lockForUpdate()->firstOrFail();

            // The paid window starts after every window the user already holds,
            // the free trial included. A plan bought on trial day two therefore
            // queues behind the trial rather than overlapping it: the user
            // keeps their remaining free days and still gets the full paid
            // duration. Considering only replay_access_ends_at (as this did
            // before tiers) would have silently burned the overlap.
            $startsAt = collect([now(), $user->replay_access_ends_at, $user->replay_trial_ends_at])
                ->filter()
                ->sortByDesc(fn (Carbon $date) => $date->getTimestamp())
                ->first()
                ->copy();
            $endsAt = $startsAt->addDays($lockedPayment->duration_days);

            // Normally the checkout guard has already ensured this is an
            // upgrade, so the purchased tier is the higher one. max() covers
            // the paths that bypass that guard — admin reconciliation and the
            // scheduled PayMongo poller — where an older, lower-tier payment
            // could otherwise land after a higher one and downgrade the user.
            $currentTier = $user->replay_access_ends_at && $user->replay_access_ends_at->isFuture()
                ? (int) ($user->replay_access_tier ?? 1)
                : 0;
            $tier = max($currentTier, $this->planTierFor($lockedPayment));
            $paidAt = isset($providerPayment['paid_at']) && is_numeric($providerPayment['paid_at'])
                ? Carbon::createFromTimestamp((int) $providerPayment['paid_at'])
                : now();

            $lockedPayment->update([
                'status' => 'paid',
                'payment_method' => $providerPayment['method'] ?? 'paymongo_checkout',
                'payment_reference' => $providerPayment['reference'] ?? $lockedPayment->payment_reference,
                'provider_payment_id' => $providerPayment['id'] ?? $lockedPayment->provider_payment_id,
                'provider_status_message' => null,
                'paid_at' => $paidAt,
                'failed_at' => null,
            ]);
            $user->forceFill([
                'replay_access_ends_at' => $endsAt,
                'replay_access_tier' => $tier,
                'renewal_reminder_sent_at' => null,
            ])->save();

            AdmNotifications::query()->create([
                'adm_user_id' => $user->id,
                'type' => 'subscription',
                'content' => 'PayMongo payment confirmed. Replay access is active until '.$endsAt->format('M j, Y g:i A').'.',
                'url' => '/subscription',
                'is_read' => 0,
            ]);

            $this->activityLog->log($lockedPayment, $user, 'payment_activated',
                "Access activated until {$endsAt->format('M j, Y g:i A')} ({$lockedPayment->duration_days} days, {$lockedPayment->plan} plan, tier {$tier}).");

            return $lockedPayment->fresh();
        });
    }

    public function revoke(SubscriptionRequest $payment, string $reason, array $context = []): SubscriptionRequest
    {
        return DB::transaction(function () use ($payment, $reason, $context) {
            $lockedPayment = SubscriptionRequest::whereKey($payment->id)->lockForUpdate()->firstOrFail();
            if ($lockedPayment->status === 'refunded') return $lockedPayment;

            $user = AdmUser::whereKey($lockedPayment->adm_user_id)->lockForUpdate()->firstOrFail();
            $hadFutureAccess = $user->replay_access_ends_at && $user->replay_access_ends_at->isFuture();
            $otherPaidPurchaseExists = SubscriptionRequest::where('adm_user_id', $user->id)
                ->where('id', '!=', $lockedPayment->id)
                ->where('status', 'paid')
                ->exists();

            if ($hadFutureAccess) {
                $user->forceFill(['replay_access_ends_at' => now()->subSecond()])->save();
            }

            $lockedPayment->update([
                'status' => 'refunded',
                'refunded_at' => now(),
                'refund_reason' => $lockedPayment->refund_reason ?: $reason,
            ]);

            AdmNotifications::query()->create([
                'adm_user_id' => $user->id,
                'type' => 'subscription',
                'content' => 'Your payment for the '.$lockedPayment->plan.' plan was refunded/reversed. Replay access has been removed. Refunds are typically credited back to your original payment method within 2-3 business days.',
                'url' => '/subscription',
                'is_read' => 0,
            ]);

            Log::info('Subscription access revoked for user '.$user->id.' via subscription_request '.$lockedPayment->id.': '.$reason, $context);

            if ($otherPaidPurchaseExists) {
                Log::warning('Refund fully cleared replay access for user '.$user->id.' via subscription_request '.$lockedPayment->id
                    .' while other paid, non-refunded purchases exist for this user — access may have been over-revoked. Manual review recommended.');
            }

            $this->activityLog->log($lockedPayment, $user, 'access_revoked', $reason, $context,
                $context['triggered_by'] ?? 'system');

            return $lockedPayment->fresh();
        });
    }

    /**
     * Re-grants replay access after an admin refund's revoke() cleared a user's access that
     * was still legitimately covered by a different, unrefunded purchase (e.g. a duplicate
     * payment refund). $payment is the refunded transaction this restoration is attributed to,
     * for audit purposes only — it is not re-activated and its status/refund fields are untouched.
     */
    public function restoreAccess(SubscriptionRequest $payment, int $days, string $reason, AdmUser $admin): SubscriptionRequest
    {
        return DB::transaction(function () use ($payment, $days, $reason, $admin) {
            $lockedPayment = SubscriptionRequest::whereKey($payment->id)->lockForUpdate()->firstOrFail();
            $user = AdmUser::whereKey($lockedPayment->adm_user_id)->lockForUpdate()->firstOrFail();

            $startsAt = $user->replay_access_ends_at && $user->replay_access_ends_at->isFuture()
                ? $user->replay_access_ends_at->copy()
                : now();
            $endsAt = $startsAt->addDays($days);

            // Restore the tier the referenced purchase actually granted, not
            // whatever stale value the column happens to hold and not something
            // the admin picked — an admin can choose how many days to restore,
            // never which tier. A plan that no longer exists falls back to the
            // user's current value and says so in the log.
            $restoredTier = $this->planTierFor($lockedPayment, 0);
            if ($restoredTier === 0) {
                $restoredTier = (int) ($user->replay_access_tier ?? 1);
                Log::warning('Restoring access for user '.$user->id.' via subscription_request '.$lockedPayment->id
                    .": plan '{$lockedPayment->plan}' no longer exists; kept the user's existing tier {$restoredTier}.");
            }

            $user->forceFill([
                'replay_access_ends_at' => $endsAt,
                'replay_access_tier' => max((int) ($user->replay_access_tier ?? 0), $restoredTier),
            ])->save();

            $note = now()->format('Y-m-d H:i').' — admin:'.$admin->id." restored {$days} day(s) of access: {$reason}";
            $lockedPayment->update(['admin_notes' => trim(($lockedPayment->admin_notes ? $lockedPayment->admin_notes."\n" : '').$note)]);

            AdmNotifications::query()->create([
                'adm_user_id' => $user->id,
                'type' => 'subscription',
                'content' => 'Your replay access was restored and is now active until '.$endsAt->format('M j, Y g:i A').'.',
                'url' => '/subscription',
                'is_read' => 0,
            ]);

            Log::info('Subscription access restored for user '.$user->id.' via subscription_request '.$lockedPayment->id
                .' by admin '.$admin->id.": {$days} day(s). {$reason}");

            $this->activityLog->log($lockedPayment, $user, 'access_restored',
                "{$days} day(s) restored: {$reason}", [], 'admin:'.$admin->id);

            return $lockedPayment->fresh();
        });
    }

    /**
     * The tier a transaction grants.
     *
     * Prefers the snapshot taken at checkout, so a plan retuned or deactivated
     * between purchase and payment cannot change what the customer bought.
     * Rows written before that column existed fall back to a lookup by plan
     * code, then to $default.
     */
    private function planTierFor(SubscriptionRequest $payment, int $default = 1): int
    {
        if ($payment->tier_level !== null) {
            return (int) $payment->tier_level;
        }

        $tier = SubscriptionPlan::where('code', $payment->plan)->value('tier_level');

        return $tier === null ? $default : (int) $tier;
    }

    public function assertProviderPaymentMatches(SubscriptionRequest $payment, array $providerPayment): void
    {
        if ((int) ($providerPayment['amount'] ?? -1) !== PayMongoClient::toCentavos($payment->amount)) {
            throw new RuntimeException('PayMongo payment amount mismatch.');
        }
        if (strtoupper((string) ($providerPayment['currency'] ?? '')) !== strtoupper($payment->currency)) {
            throw new RuntimeException('PayMongo payment currency mismatch.');
        }
        if ((bool) ($providerPayment['livemode'] ?? false) !== (bool) $payment->livemode) {
            throw new RuntimeException('PayMongo payment mode mismatch.');
        }
    }
}

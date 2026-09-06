<?php

namespace App\Http\Controllers;

use App\Models\AdmUser;
use App\Models\SubscriptionMessage;
use App\Models\SubscriptionPlan;
use App\Models\SubscriptionRequest;
use App\Services\Payments\PayMongoCheckoutService;
use App\Services\Payments\PaymentActivityLogger;
use App\Services\Payments\SubscriptionEntitlementService;
use App\Services\AdminAccessService;
use App\Services\SubscriptionTierService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Inertia\Inertia;
use RuntimeException;
use Throwable;

class ReplayAccessController extends Controller
{
    public function __construct(
        private readonly PayMongoCheckoutService $checkouts,
        private readonly AdminAccessService $adminAccess,
        private readonly SubscriptionEntitlementService $entitlements,
        private readonly PaymentActivityLogger $activityLog,
        private readonly SubscriptionTierService $tiers,
    ) {}

    public function plans(Request $request)
    {
        $query = SubscriptionPlan::whereIn('code', ['weekly', 'monthly', 'yearly'])->orderBy('sort_order');
        if (!$this->adminAccess->isSuperadmin($request->user())) $query->where('is_active', true);

        // `capabilities` is derived from the plan's tier, not from the
        // admin-authored `features` blurb, so what the modal advertises and what
        // the middleware enforces come from the same map. Keeping the two
        // separate is how all three plans ended up describing themselves
        // identically in the first place.
        $plans = $query->get()->map(function (SubscriptionPlan $plan) {
            $tier = (int) ($plan->tier_level ?? 1);
            $lower = $tier > 1 ? $this->tiers->capabilitiesFor($tier - 1) : [];

            return array_merge($plan->toArray(), [
                'tier_level' => $tier,
                'tier_name' => $this->tiers->tierName($tier),
                'capabilities' => $this->tiers->capabilitiesFor($tier),
                // What this plan adds over the one below it — the only part a
                // buyer comparing two cards actually needs to read.
                'added_capabilities' => array_values(array_diff($this->tiers->capabilitiesFor($tier), $lower)),
            ]);
        });

        return response()->json([
            'plans' => $plans,
            'checkout' => $this->checkouts->availability(),
        ]);
    }

    public function adminPlansPage(Request $request)
    {
        $this->requireAdmin($request);
        return Inertia::render('Subscriptions/AdminPlans');
    }

    public function updatePlans(Request $request)
    {
        $this->requireAdmin($request);
        $data = $request->validate([
            'plans' => 'required|array|min:1', 'plans.*.id' => 'required|exists:subscription_plans,id',
            'plans.*.price' => 'nullable|numeric|min:0.01|max:99999999', 'plans.*.duration_days' => 'required|integer|min:1|max:3650',
            'plans.*.description' => 'nullable|string|max:160',
            'plans.*.features' => 'nullable|array|max:8',
            'plans.*.features.*' => 'required|string|max:80',
            'plans.*.is_featured' => 'required|boolean', 'plans.*.is_active' => 'required|boolean',
        ]);
        foreach ($data['plans'] as $item) {
            $item['features'] = SubscriptionPlan::normalizeFeatures($item['features'] ?? []);
            SubscriptionPlan::whereKey($item['id'])->update($item);
        }

        return response()->json(['success' => true, 'plans' => SubscriptionPlan::orderBy('sort_order')->get()]);
    }

    public function userPage(Request $request)
    {
        $user = $request->user();
        $trialActive = $user->replay_trial_ends_at && now()->lte($user->replay_trial_ends_at);
        $paidActive = $user->replay_access_ends_at && now()->lte($user->replay_access_ends_at);
        $activeUntil = collect([$user->replay_trial_ends_at, $user->replay_access_ends_at])
            ->filter()->sortByDesc(fn ($date) => $date->getTimestamp())->first();

        return Inertia::render('Subscriptions/UserIndex', [
            'subscription' => [
                'status' => $paidActive ? 'active' : ($trialActive ? 'trial' : ($user->replay_trial_started_at ? 'expired' : 'available')),
                'allowed' => $this->adminAccess->isSuperadmin($request->user()) || $trialActive || $paidActive,
                'trialAvailable' => !$user->replay_trial_started_at && !$paidActive,
                'trialStartedAt' => optional($user->replay_trial_started_at)->toIso8601String(),
                'trialEndsAt' => optional($user->replay_trial_ends_at)->toIso8601String(),
                'accessEndsAt' => optional($user->replay_access_ends_at)->toIso8601String(),
                'activeUntil' => optional($activeUntil)->toIso8601String(),
                'daysRemaining' => $activeUntil && now()->lte($activeUntil) ? now()->diffInDays($activeUntil) + 1 : 0,
                'requests' => SubscriptionRequest::where('adm_user_id', $user->id)
                    ->withCount('messages')->latest()->get()->map(fn ($payment) => $this->paymentPayload($payment)),
                'checkout' => $this->checkouts->availability(),
                'activeAccess' => $this->activeAccessPayload($user),
                'entitlements' => $this->tiers->payloadFor($user),
            ],
        ]);
    }

    public function myRequests(Request $request)
    {
        $items = SubscriptionRequest::where('adm_user_id', $request->user()->id)
            ->whereNotIn('status', ['creating'])
            ->latest()
            ->limit(50)
            ->get(['id', 'plan', 'amount', 'currency', 'status', 'paid_at', 'created_at']);

        return response()->json(['requests' => $items->map(fn (SubscriptionRequest $item) => [
            'id' => $item->id,
            'plan' => $item->plan,
            'amount' => $item->amount,
            'currency' => $item->currency ?: 'PHP',
            'status' => $item->status,
            'date' => optional($item->paid_at ?? $item->created_at)->toIso8601String(),
        ])]);
    }

    public function status(Request $request)
    {
        $user = $request->user();
        $activeUntil = collect([$user->replay_trial_ends_at, $user->replay_access_ends_at])
            ->filter()->sortByDesc(fn ($date) => $date->getTimestamp())->first();
        $paidActive = $user->replay_access_ends_at && now()->lte($user->replay_access_ends_at);

        return response()->json([
            'allowed' => $this->adminAccess->isSuperadmin($request->user()) || ($activeUntil && now()->lte($activeUntil)),
            'trialAvailable' => !$user->replay_trial_started_at && !$paidActive,
            'trialStartedAt' => optional($user->replay_trial_started_at)->toIso8601String(),
            'trialEndsAt' => optional($user->replay_trial_ends_at)->toIso8601String(),
            'accessEndsAt' => optional($user->replay_access_ends_at)->toIso8601String(),
            'latestRequest' => optional(SubscriptionRequest::where('adm_user_id', $user->id)->latest()->first(), fn ($payment) => $this->paymentPayload($payment)),
            'checkout' => $this->checkouts->availability(),
            'activeAccess' => $this->activeAccessPayload($user),
            // Entitlements come from the server so the frontend never infers a
            // tier from plan codes.
            'entitlements' => $this->tiers->payloadFor($user),
        ]);
    }

    public function activateTrial(Request $request)
    {
        $result = DB::transaction(function () use ($request) {
            $user = AdmUser::whereKey($request->user()->id)->lockForUpdate()->firstOrFail();
            if ($user->replay_trial_started_at) return ['activated' => false, 'user' => $user];
            if ($user->replay_access_ends_at && now()->lte($user->replay_access_ends_at)) {
                return ['activated' => false, 'user' => $user, 'paid_active' => true];
            }
            $startedAt = now();
            $user->forceFill(['replay_trial_started_at' => $startedAt, 'replay_trial_ends_at' => $startedAt->copy()->addDays(7)])->save();
            return ['activated' => true, 'user' => $user->fresh()];
        });

        $user = $result['user'];
        if (!$result['activated']) {
            $active = $user->replay_trial_ends_at && now()->lte($user->replay_trial_ends_at);
            if ($result['paid_active'] ?? false) {
                return response()->json([
                    'message' => 'Your paid replay access is already active. Your free trial remains available after it ends.',
                    'allowed' => true, 'trialAvailable' => false,
                    'accessEndsAt' => optional($user->replay_access_ends_at)->toIso8601String(),
                ], 409);
            }
            return response()->json([
                'message' => $active ? 'Your free trial is already active.' : 'Your free trial has already been used.',
                'allowed' => $active || ($user->replay_access_ends_at && now()->lte($user->replay_access_ends_at)),
                'trialAvailable' => false,
                'trialEndsAt' => optional($user->replay_trial_ends_at)->toIso8601String(),
            ], $active ? 200 : 409);
        }

        $this->activityLog->log(null, $user, 'trial_activated',
            'Free 7-day trial activated, ends '.$user->replay_trial_ends_at->format('M j, Y g:i A').'.');

        return response()->json([
            'success' => true, 'message' => 'Your free seven-day trial is now active.', 'allowed' => true,
            'trialAvailable' => false,
            'trialStartedAt' => optional($user->replay_trial_started_at)->toIso8601String(),
            'trialEndsAt' => optional($user->replay_trial_ends_at)->toIso8601String(),
        ], 201);
    }

    public function createCheckout(Request $request)
    {
        $this->checkouts->expireStalePending($request->user());
        $data = $request->validate(['plan' => 'required|string|max:50', 'submission_token' => 'required|uuid']);
        $plan = SubscriptionPlan::where('code', $data['plan'])->where('is_active', true)->firstOrFail();

        // The guard is phrased against the *paid* window, not against access in
        // general. A running trial therefore no longer blocks a purchase — a
        // user convinced on trial day two can pay immediately instead of
        // waiting out the week and remembering to come back. But once a paid
        // window exists (including one queued behind a still-running trial),
        // only a strictly higher tier may be bought, so a converted trial user
        // cannot stack a lower tier over a higher one and leave
        // replay_access_tier holding the wrong value.
        $paidTier = $this->tiers->paidTier($request->user());
        if ($paidTier > 0 && (int) $plan->tier_level <= $paidTier) {
            $current = $this->tiers->tierName($paidTier);

            return response()->json([
                'message' => (int) $plan->tier_level === $paidTier
                    ? "Your {$current} access is already active. You can choose another plan after it expires."
                    : "Your {$current} access is already active. Only an upgrade to a higher plan is available until it expires.",
                'currentTier' => $paidTier,
                'currentTierName' => $current,
            ], 409);
        }

        try {
            $payment = $this->checkouts->create($request->user(), $plan, $data['submission_token']);
            if (!$payment->provider_checkout_url || !in_array($payment->status, ['pending', 'paid'], true)) {
                throw new RuntimeException($payment->provider_status_message ?: 'This checkout is not available.');
            }
            return response()->json([
                'checkout_url' => $payment->provider_checkout_url,
                'payment' => $this->paymentPayload($payment),
            ], $payment->wasRecentlyCreated ? 201 : 200);
        } catch (Throwable $exception) {
            report($exception);
            return response()->json(['message' => $exception->getMessage() ?: 'Unable to start PayMongo checkout.'], 503);
        }
    }

    public function checkoutReturn(Request $request, string $token)
    {
        $payment = SubscriptionRequest::where('submission_token', $token)
            ->where('adm_user_id', $request->user()->id)->firstOrFail();
        $result = 'pending';
        try {
            $payment = $this->checkouts->reconcile($payment);
            $result = $payment->status;
        } catch (Throwable $exception) {
            report($exception);
        }

        return redirect()->route('subscription.index', ['payment' => $result, 'ref' => $payment->id]);
    }

    public function checkoutStatus(Request $request, SubscriptionRequest $subscriptionRequest)
    {
        $this->authorizePayment($request, $subscriptionRequest);
        if ($subscriptionRequest->provider === 'paymongo' && $subscriptionRequest->status === 'pending') {
            try {
                $subscriptionRequest = $this->checkouts->reconcile($subscriptionRequest);
            } catch (Throwable $exception) {
                report($exception);
            }
        }
        return response()->json(['payment' => $this->paymentPayload($subscriptionRequest->fresh())]);
    }

    public function adminPage(Request $request)
    {
        $this->requireAdmin($request);
        return Inertia::render('Subscriptions/AdminIndex');
    }

    public function adminIndex(Request $request)
    {
        $this->requireAdmin($request);
        $query = SubscriptionRequest::query()->with('user:id,name,email')->withCount('messages')->latest();
        if ($request->filled('provider')) $query->where('provider', $request->string('provider')->toString());
        if ($request->filled('status')) $query->where('status', $request->string('status')->toString());
        if ($request->filled('mode')) $query->where('livemode', $request->string('mode')->toString() === 'live');
        if ($request->filled('search')) {
            $search = $request->string('search')->toString();
            $query->where(function ($nested) use ($search) {
                $nested->where('payment_reference', 'like', "%{$search}%")
                    ->orWhere('provider_checkout_id', 'like', "%{$search}%")
                    ->orWhereHas('user', fn ($userQuery) => $userQuery->where('name', 'like', "%{$search}%")->orWhere('email', 'like', "%{$search}%"));
            });
        }

        return $query->paginate(30)->through(fn ($payment) => $this->paymentPayload($payment, true));
    }

    public function adminReconcile(Request $request, SubscriptionRequest $subscriptionRequest)
    {
        $this->requireAdmin($request);
        try {
            $payment = $this->checkouts->reconcile($subscriptionRequest);
            return response()->json(['success' => true, 'payment' => $this->paymentPayload($payment, true)]);
        } catch (Throwable $exception) {
            report($exception);
            return response()->json(['message' => $exception->getMessage() ?: 'Unable to reconcile the payment.'], 422);
        }
    }

    public function adminRefund(Request $request, SubscriptionRequest $subscriptionRequest)
    {
        $this->requireAdmin($request);
        $data = $request->validate([
            'reason_code' => 'required|string|in:duplicate,fraudulent,requested_by_customer,others',
            'reason' => 'required|string|min:10|max:500',
        ]);
        try {
            $payment = $this->checkouts->refund($subscriptionRequest, $data['reason_code'], $data['reason'], $request->user());
            return response()->json(['success' => true, 'payment' => $this->paymentPayload($payment, true)]);
        } catch (Throwable $exception) {
            report($exception);
            return response()->json(['message' => $exception->getMessage() ?: 'Unable to refund this payment.'], 422);
        }
    }

    public function adminRestoreAccess(Request $request, SubscriptionRequest $subscriptionRequest)
    {
        $this->requireAdmin($request);
        $data = $request->validate([
            'days' => 'required|integer|min:1|max:3650',
            'reason' => 'required|string|min:10|max:500',
        ]);
        try {
            $payment = $this->entitlements->restoreAccess($subscriptionRequest, $data['days'], $data['reason'], $request->user());
            return response()->json(['success' => true, 'payment' => $this->paymentPayload($payment, true)]);
        } catch (Throwable $exception) {
            report($exception);
            return response()->json(['message' => $exception->getMessage() ?: 'Unable to restore access for this user.'], 422);
        }
    }

    public function messages(Request $request, SubscriptionRequest $subscriptionRequest)
    {
        $this->authorizePayment($request, $subscriptionRequest);
        return response()->json([
            'request' => $this->paymentPayload($subscriptionRequest),
            'messages' => $subscriptionRequest->messages()->with('user:id,name')->oldest()->get()
                ->map(fn ($message) => $this->messagePayload($message, $request)),
            'read_only' => true,
        ]);
    }

    public function proof(Request $request, SubscriptionRequest $subscriptionRequest)
    {
        $this->authorizePayment($request, $subscriptionRequest);
        abort_unless($subscriptionRequest->payment_proof_path && Storage::disk('public')->exists($subscriptionRequest->payment_proof_path), 404);
        return Storage::disk('public')->response($subscriptionRequest->payment_proof_path);
    }

    public function messageAttachment(Request $request, SubscriptionMessage $subscriptionMessage)
    {
        $this->authorizePayment($request, $subscriptionMessage->subscriptionRequest);
        abort_unless($subscriptionMessage->attachment_path && Storage::disk('public')->exists($subscriptionMessage->attachment_path), 404);
        return Storage::disk('public')->download($subscriptionMessage->attachment_path, $subscriptionMessage->attachment_name);
    }

    public function completeTour(Request $request)
    {
        if (!$request->user()->chart_tour_completed_at) $request->user()->forceFill(['chart_tour_completed_at' => now()])->save();
        return response()->json(['success' => true]);
    }

    private function authorizePayment(Request $request, SubscriptionRequest $payment): bool
    {
        $isAdmin = $this->adminAccess->isSuperadmin($request->user());
        abort_unless($isAdmin || $payment->adm_user_id === $request->user()->id, 403);
        return $isAdmin;
    }

    private function requireAdmin(Request $request): void
    {
        abort_unless($this->adminAccess->isSuperadmin($request->user()), 403);
    }

    private function paymentPayload(SubscriptionRequest $payment, bool $includeUser = false): array
    {
        $payload = [
            'id' => $payment->id,
            'plan' => $payment->plan,
            'provider' => $payment->provider,
            'payment_method' => $payment->payment_method,
            'payment_reference' => $payment->payment_reference,
            'provider_checkout_id' => $payment->provider_checkout_id,
            'provider_payment_id' => $payment->provider_payment_id,
            'amount' => $payment->amount,
            'currency' => $payment->currency ?: 'PHP',
            'duration_days' => $payment->duration_days,
            'mode' => $payment->livemode ? 'live' : 'test',
            'status' => $payment->status,
            'provider_status_message' => $payment->provider_status_message,
            'admin_notes' => $payment->admin_notes,
            'paid_at' => optional($payment->paid_at)->toIso8601String(),
            'failed_at' => optional($payment->failed_at)->toIso8601String(),
            'refunded_at' => optional($payment->refunded_at)->toIso8601String(),
            'refund_amount' => $payment->refund_amount,
            'refund_status' => $payment->refund_status,
            'reviewed_at' => optional($payment->reviewed_at)->toIso8601String(),
            'created_at' => optional($payment->created_at)->toIso8601String(),
            'messages_count' => $payment->messages_count ?? $payment->messages()->count(),
            'payment_proof_url' => $payment->payment_proof_path ? route('subscription.proof', $payment) : null,
            'legacy' => $payment->provider === 'manual',
        ];
        if ($includeUser) {
            $payload['user'] = $payment->user;
            $payload['refund_reason'] = $payment->refund_reason;
        }
        return $payload;
    }

    private function activeAccessPayload(AdmUser $user): ?array
    {
        $paidActive = $user->replay_access_ends_at && now()->lte($user->replay_access_ends_at);
        $trialActive = $user->replay_trial_ends_at && now()->lte($user->replay_trial_ends_at);
        if (!$paidActive && !$trialActive) return null;
        $payment = $paidActive ? SubscriptionRequest::where('adm_user_id', $user->id)
            ->where('status', 'paid')->latest('paid_at')->first() : null;
        return [
            'kind' => $paidActive ? 'paid' : 'trial', 'plan' => $payment?->plan,
            'endsAt' => optional($paidActive ? $user->replay_access_ends_at : $user->replay_trial_ends_at)->toIso8601String(),
            // The effective tier, not the paid one: during a trial that outranks
            // the purchased plan the user really is at the higher tier.
            'tier' => $this->tiers->effectiveTier($user),
            'tierName' => $this->tiers->tierName($this->tiers->effectiveTier($user)),
            'paidTier' => $this->tiers->paidTier($user),
            'trialEndsAt' => optional($user->replay_trial_ends_at)->toIso8601String(),
        ];
    }

    private function messagePayload(SubscriptionMessage $message, Request $request): array
    {
        return [
            'id' => $message->id, 'message' => $message->message, 'user' => $message->user,
            'mine' => $message->adm_user_id === $request->user()->id,
            'attachment_name' => $message->attachment_name, 'attachment_mime' => $message->attachment_mime,
            'attachment_url' => $message->attachment_path ? route('subscription.message-attachment', $message) : null,
            'created_at' => $message->created_at,
        ];
    }
}

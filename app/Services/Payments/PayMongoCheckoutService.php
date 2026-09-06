<?php

namespace App\Services\Payments;

use App\Models\AdmUser;
use App\Models\SubscriptionPlan;
use App\Models\SubscriptionRequest;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use RuntimeException;
use Throwable;

class PayMongoCheckoutService
{
    public function __construct(
        private readonly PayMongoClient $client,
        private readonly SubscriptionEntitlementService $entitlements,
        private readonly PaymentActivityLogger $activityLog,
    ) {}

    public function create(AdmUser $user, SubscriptionPlan $plan, string $token): SubscriptionRequest
    {
        $this->client->assertAvailable();
        if ($plan->price === null || PayMongoClient::toCentavos($plan->price) <= 0) {
            throw new RuntimeException('This plan does not have a valid checkout price.');
        }

        $existing = SubscriptionRequest::where('submission_token', $token)
            ->where('adm_user_id', $user->id)
            ->first();
        if ($existing) return $existing;

        try {
            $payment = SubscriptionRequest::create([
                'adm_user_id' => $user->id,
                'plan' => $plan->code,
                'payment_method' => 'paymongo_checkout',
                'amount' => $plan->price,
                'currency' => strtoupper($plan->currency ?: 'PHP'),
                'duration_days' => $plan->duration_days,
                'tier_level' => $plan->tier_level ?? 1,
                'provider' => 'paymongo',
                'status' => 'creating',
                'submission_token' => $token,
                'livemode' => $this->client->expectedLivemode(),
            ]);
        } catch (QueryException $exception) {
            $payment = SubscriptionRequest::where('submission_token', $token)
                ->where('adm_user_id', $user->id)
                ->first();
            if (!$payment) throw $exception;
            return $payment;
        }

        try {
            $resource = $this->client->createCheckout($payment, [
                'name' => $plan->name,
                'description' => $plan->description,
            ], [
                'name' => $user->name,
                'email' => $user->email,
            ]);
            $attributes = $resource['attributes'] ?? [];
            $checkoutId = $resource['id'] ?? null;
            $checkoutUrl = $attributes['checkout_url'] ?? null;
            $livemode = (bool) ($attributes['livemode'] ?? false);

            if (!$checkoutId || !$checkoutUrl) throw new RuntimeException('PayMongo did not return a checkout URL.');
            if ($livemode !== $this->client->expectedLivemode()) throw new RuntimeException('PayMongo returned the wrong payment mode.');

            $payment->update([
                'provider_checkout_id' => $checkoutId,
                'provider_checkout_url' => $checkoutUrl,
                'payment_reference' => $attributes['reference_number'] ?? $token,
                'livemode' => $livemode,
                'status' => 'pending',
                'provider_status_message' => null,
            ]);

            $fresh = $payment->fresh();
            $this->activityLog->log($fresh, $user, 'checkout_created',
                "Checkout created for {$plan->name} plan ({$fresh->currency} ".number_format((float) $fresh->amount, 2).').');

            return $fresh;
        } catch (Throwable $exception) {
            $payment->update([
                'status' => 'failed',
                'failed_at' => now(),
                'provider_status_message' => $this->safeMessage($exception),
            ]);
            $this->activityLog->log($payment, $user, 'checkout_failed', 'Checkout creation failed: '.$this->safeMessage($exception));
            throw $exception;
        }
    }

    /**
     * Called right before starting a new checkout. A user who abandons checkout (browser back,
     * closes the tab) and then starts over gets a fresh submission_token every time — the modal
     * generates a new one on mount — so create() alone has no way to recognize it's the same
     * purchase intent and would otherwise mint an unbounded number of orphaned pending rows,
     * each with a checkout_url the user can never get back to. This settles every existing
     * pending PayMongo transaction for the user first: if the provider says it actually
     * completed (or failed/expired) in the meantime, reconcile() applies that real outcome
     * normally; if the provider still shows it open, it's abandoned locally as 'expired' since
     * the user is choosing to start a different attempt right now.
     */
    public function expireStalePending(AdmUser $user): void
    {
        $pending = SubscriptionRequest::where('adm_user_id', $user->id)
            ->where('provider', 'paymongo')
            ->where('status', 'pending')
            ->get();

        foreach ($pending as $payment) {
            try {
                if (!$payment->provider_checkout_id) {
                    $payment->update(['status' => 'expired', 'failed_at' => now(), 'provider_status_message' => 'Abandoned before a checkout session was created.']);
                    continue;
                }
                $reconciled = $this->reconcile($payment);
                if ($reconciled->status === 'pending') {
                    $reconciled->update([
                        'status' => 'expired',
                        'failed_at' => now(),
                        'provider_status_message' => 'Abandoned: a new checkout was started before this one completed.',
                    ]);
                    $this->activityLog->log($reconciled, $user, 'checkout_expired', 'Abandoned: a new checkout was started before this one completed.');
                }
            } catch (Throwable $exception) {
                report($exception);
            }
        }
    }

    public function reconcile(SubscriptionRequest $payment): SubscriptionRequest
    {
        if ($payment->provider !== 'paymongo') throw new RuntimeException('This is not a PayMongo transaction.');
        if ($payment->status === 'paid') return $payment;
        if (!$payment->provider_checkout_id) throw new RuntimeException('This payment has no PayMongo Checkout Session.');

        $resource = $this->client->retrieveCheckout($payment->provider_checkout_id);
        return $this->applyCheckoutResource($payment, $resource);
    }

    public function processPaidResource(array $resource): SubscriptionRequest
    {
        $this->client->assertAvailable();
        $checkoutId = $resource['id'] ?? null;
        $token = data_get($resource, 'attributes.metadata.subscription_token');
        if (!$checkoutId && !$token) {
            throw new RuntimeException('PayMongo Checkout Session has no usable identifier.');
        }

        $payment = SubscriptionRequest::query()
            ->where('provider', 'paymongo')
            ->where(function ($query) use ($checkoutId, $token) {
                if ($checkoutId) $query->where('provider_checkout_id', $checkoutId);
                if ($token) $query->orWhere('submission_token', $token);
            })
            ->first();

        if (!$payment) throw new RuntimeException('No local payment matches this PayMongo Checkout Session.');
        if (!$payment->provider_checkout_id && $checkoutId) $payment->update(['provider_checkout_id' => $checkoutId]);

        return $this->applyCheckoutResource($payment->fresh(), $resource, true);
    }

    public function refund(SubscriptionRequest $payment, string $reasonCode, string $reasonNote, AdmUser $admin): SubscriptionRequest
    {
        if ($payment->provider !== 'paymongo') throw new RuntimeException('This is not a PayMongo transaction.');
        if (!$payment->provider_payment_id) throw new RuntimeException('This payment has no PayMongo payment id to refund.');

        $locked = DB::transaction(function () use ($payment) {
            $row = SubscriptionRequest::whereKey($payment->id)->lockForUpdate()->firstOrFail();
            if ($row->status !== 'paid') throw new RuntimeException('Only a successfully paid transaction can be refunded.');
            $row->update(['status' => 'refunding']);
            return $row;
        });

        try {
            $resource = $this->client->refundPayment($locked->provider_payment_id, PayMongoClient::toCentavos($locked->amount), $reasonCode);
            $attributes = $resource['attributes'] ?? [];
            $status = strtolower((string) ($attributes['status'] ?? ''));
            if (!in_array($status, ['pending', 'succeeded'], true)) {
                throw new RuntimeException('PayMongo did not accept the refund request (status: '.($status ?: 'unknown').').');
            }

            $locked->update([
                'provider_refund_id' => $resource['id'] ?? null,
                'refund_status' => $status,
                'refund_amount' => isset($attributes['amount']) ? PayMongoClient::fromCentavos((int) $attributes['amount']) : $locked->amount,
            ]);

            return $this->entitlements->revoke($locked->fresh(), $reasonNote, ['id' => $resource['id'] ?? null, 'triggered_by' => 'admin:'.$admin->id]);
        } catch (Throwable $exception) {
            $locked->update(['status' => 'paid', 'provider_status_message' => mb_substr('Refund attempt failed: '.$exception->getMessage(), 0, 500)]);
            throw $exception;
        }
    }

    public function processRefundResource(array $resource): SubscriptionRequest
    {
        $paymentId = $this->extractPaymentId($resource);
        if (!$paymentId) throw new RuntimeException('Refund webhook resource did not contain a recognizable payment id.');
        $payment = SubscriptionRequest::where('provider', 'paymongo')->where('provider_payment_id', $paymentId)->first();
        if (!$payment) throw new RuntimeException('No local payment matches PayMongo payment id '.$paymentId.' from refund webhook.');

        $status = strtolower((string) data_get($resource, 'attributes.status', 'succeeded'));
        if ($status === 'failed') {
            $payment->update(['refund_status' => 'failed', 'provider_status_message' => 'PayMongo reported a failed refund attempt via webhook.']);
            return $payment->fresh();
        }
        if ($payment->status !== 'paid') return $payment->fresh();

        return $this->entitlements->revoke($payment, 'PayMongo refund webhook ('.$status.').', ['id' => $resource['id'] ?? null]);
    }

    public function processDisputeResource(array $resource): SubscriptionRequest
    {
        $paymentId = $this->extractPaymentId($resource);
        if (!$paymentId) throw new RuntimeException('Dispute webhook resource did not contain a recognizable payment id.');
        $payment = SubscriptionRequest::where('provider', 'paymongo')->where('provider_payment_id', $paymentId)->first();
        if (!$payment) throw new RuntimeException('No local payment matches PayMongo payment id '.$paymentId.' from dispute webhook.');
        if ($payment->status !== 'paid') return $payment->fresh();

        return $this->entitlements->revoke($payment, 'PayMongo dispute/chargeback webhook.', ['id' => $resource['id'] ?? null]);
    }

    public function availability(): array
    {
        return $this->client->availability();
    }

    private function applyCheckoutResource(SubscriptionRequest $payment, array $resource, bool $paidEvent = false): SubscriptionRequest
    {
        $checkoutId = $resource['id'] ?? null;
        $attributes = $resource['attributes'] ?? [];
        $livemode = (bool) ($attributes['livemode'] ?? false);
        if (!$checkoutId || $checkoutId !== $payment->provider_checkout_id) throw new RuntimeException('PayMongo Checkout Session mismatch.');
        if ($livemode !== (bool) $payment->livemode || $livemode !== $this->client->expectedLivemode()) {
            throw new RuntimeException('PayMongo payment mode mismatch.');
        }

        $providerPayment = collect($attributes['payments'] ?? [])->first(function ($item) {
            return data_get($item, 'attributes.status') === 'paid';
        });

        if ($providerPayment || $paidEvent) {
            if (!$providerPayment) throw new RuntimeException('Paid webhook did not include a paid payment resource.');
            $paymentAttributes = $providerPayment['attributes'] ?? [];
            $expectedAmount = PayMongoClient::toCentavos($payment->amount);
            if ((int) ($paymentAttributes['amount'] ?? -1) !== $expectedAmount) throw new RuntimeException('PayMongo payment amount mismatch.');
            if (strtoupper((string) ($paymentAttributes['currency'] ?? '')) !== strtoupper($payment->currency)) {
                throw new RuntimeException('PayMongo payment currency mismatch.');
            }

            return $this->entitlements->activate($payment, [
                'id' => $providerPayment['id'] ?? null,
                'method' => data_get($paymentAttributes, 'source.type', 'paymongo_checkout'),
                'reference' => $attributes['reference_number'] ?? $payment->payment_reference,
                'paid_at' => $paymentAttributes['paid_at'] ?? null,
                'amount' => (int) $paymentAttributes['amount'],
                'currency' => strtoupper((string) $paymentAttributes['currency']),
                'livemode' => $livemode,
            ]);
        }

        $providerStatus = strtolower((string) ($attributes['status'] ?? 'pending'));
        if (in_array($providerStatus, ['expired', 'cancelled', 'failed'], true)) {
            $payment->update([
                'status' => $providerStatus === 'cancelled' ? 'expired' : $providerStatus,
                'failed_at' => now(),
                'provider_status_message' => 'PayMongo Checkout Session is '.$providerStatus.'.',
            ]);
            $this->activityLog->log($payment, null, 'checkout_' . ($providerStatus === 'cancelled' ? 'expired' : $providerStatus),
                'PayMongo Checkout Session is '.$providerStatus.'.');
        } elseif ($payment->status !== 'pending') {
            $payment->update(['status' => 'pending', 'provider_status_message' => null]);
        }

        return $payment->fresh();
    }

    private function safeMessage(Throwable $exception): string
    {
        return mb_substr($exception->getMessage() ?: 'PayMongo checkout failed.', 0, 500);
    }

    private function extractPaymentId(array $resource): ?string
    {
        if (($resource['type'] ?? null) === 'payment') return $resource['id'] ?? null;
        return data_get($resource, 'attributes.payment_id') ?: null;
    }
}

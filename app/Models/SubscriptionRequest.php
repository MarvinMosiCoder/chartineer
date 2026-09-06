<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SubscriptionRequest extends Model
{
    // Explicit allowlist, not `$guarded = []` — this table backs financial transaction
    // state (amount, status, livemode, paid_at). Every current create()/update() call
    // site in App\Services\Payments already passes explicit arrays derived from
    // server-trusted sources (the looked-up SubscriptionPlan, PayMongo API responses),
    // never raw request input, so this doesn't change today's behavior — it's a
    // safety net against a future call site accidentally mass-assigning request input.
    protected $fillable = [
        'adm_user_id', 'plan', 'payment_method', 'payment_reference', 'payment_proof_path',
        'amount', 'currency', 'duration_days', 'tier_level', 'provider', 'provider_payment_id',
        'provider_checkout_id', 'provider_checkout_url', 'provider_refund_id', 'status',
        'submission_token', 'livemode', 'provider_status_message', 'admin_notes',
        'reviewed_by', 'reviewed_at', 'paid_at', 'failed_at', 'refunded_at',
        'refund_amount', 'refund_status', 'refund_reason',
    ];
    protected $casts = [
        'tier_level' => 'integer',
        'reviewed_at' => 'datetime',
        'paid_at' => 'datetime',
        'failed_at' => 'datetime',
        'refunded_at' => 'datetime',
        'livemode' => 'boolean',
        'amount' => 'decimal:2',
        'refund_amount' => 'decimal:2',
    ];
    public function user() { return $this->belongsTo(AdmUser::class, 'adm_user_id'); }
    public function messages() { return $this->hasMany(SubscriptionMessage::class); }
}

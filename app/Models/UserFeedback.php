<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Facades\Storage;

class UserFeedback extends Model
{
    protected $fillable = [
        'adm_user_id',
        'subscription_request_id',
        'category',
        'payment_reason_code',
        'title',
        'description',
        'page_url',
        'context',
        'status',
        'priority',
        'admin_response',
        'responded_by',
        'responded_at',
    ];

    protected $casts = [
        'responded_at' => 'datetime',
        'context' => 'array',
    ];

    protected static function booted(): void
    {
        // The FK cascade clears attachment rows but leaves their files on disk.
        // Without this the uploads for every deleted ticket stay there forever.
        static::deleting(function (self $feedback) {
            $paths = $feedback->attachments()->pluck('path')->all();
            if ($paths) {
                Storage::disk('local')->delete($paths);
            }
        });
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(AdmUser::class, 'adm_user_id');
    }

    public function responder(): BelongsTo
    {
        return $this->belongsTo(AdmUser::class, 'responded_by');
    }

    public function messages(): HasMany
    {
        return $this->hasMany(UserFeedbackMessage::class, 'user_feedback_id');
    }

    public function attachments(): HasMany
    {
        return $this->hasMany(UserFeedbackAttachment::class, 'user_feedback_id');
    }

    public function subscriptionRequest(): BelongsTo
    {
        return $this->belongsTo(SubscriptionRequest::class);
    }
}

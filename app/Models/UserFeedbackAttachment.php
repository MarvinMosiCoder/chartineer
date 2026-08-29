<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class UserFeedbackAttachment extends Model
{
    protected $fillable = [
        'user_feedback_id',
        'path',
        'name',
        'mime',
        'size',
    ];

    protected $casts = [
        'size' => 'integer',
    ];

    public function feedback(): BelongsTo
    {
        return $this->belongsTo(UserFeedback::class, 'user_feedback_id');
    }
}

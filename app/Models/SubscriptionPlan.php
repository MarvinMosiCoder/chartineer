<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SubscriptionPlan extends Model
{
    // Explicit allowlist, not `$guarded = []` — see the same note on SubscriptionRequest.
    // Only reached today via the superadmin-gated, validated updatePlans() endpoint.
    protected $fillable = [
        'code', 'name', 'duration_days', 'tier_level', 'price', 'currency', 'description',
        'features', 'is_featured', 'is_active', 'sort_order',
    ];
    protected $casts = [
        'price' => 'decimal:2',
        'tier_level' => 'integer',
        'features' => 'array',
        'is_featured' => 'boolean',
        'is_active' => 'boolean',
    ];

    public static function normalizeFeatures(?array $features): array
    {
        return collect($features ?? [])
            ->map(fn ($feature) => trim((string) $feature))
            ->filter()
            ->unique(fn ($feature) => mb_strtolower($feature))
            ->take(8)
            ->values()
            ->all();
    }
}

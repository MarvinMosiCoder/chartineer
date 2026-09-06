<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MarketBacktestChallenge extends Model
{
    public const STATUS_ACTIVE = 'active';
    public const STATUS_PASSED = 'passed';
    public const STATUS_FAILED = 'failed';
    public const STATUS_ABANDONED = 'abandoned';

    protected $fillable = [
        'adm_user_id', 'market_backtest_account_id',
        'template_key', 'name', 'starting_balance', 'quote_currency',
        'profit_target_percent', 'max_daily_loss_percent', 'max_total_drawdown_percent',
        'drawdown_type', 'min_trading_days', 'max_calendar_days', 'consistency_percent',
        'exchange', 'market_category', 'symbol', 'timeframe',
        'started_at_time', 'current_at_time',
        'status', 'failed_rule', 'failed_at_time', 'failed_reason', 'completed_at_time',
    ];

    protected $casts = [
        'starting_balance' => 'decimal:8',
        'profit_target_percent' => 'decimal:4',
        'max_daily_loss_percent' => 'decimal:4',
        'max_total_drawdown_percent' => 'decimal:4',
        'consistency_percent' => 'decimal:4',
        'min_trading_days' => 'integer',
        'max_calendar_days' => 'integer',
        'started_at_time' => 'integer',
        'current_at_time' => 'integer',
        'failed_at_time' => 'integer',
        'completed_at_time' => 'integer',
    ];

    public function account(): BelongsTo
    {
        return $this->belongsTo(MarketBacktestAccount::class, 'market_backtest_account_id');
    }

    public function isActive(): bool
    {
        return $this->status === self::STATUS_ACTIVE;
    }

    /** A finished challenge keeps its account and trades so the verdict stays inspectable. */
    public function isFinished(): bool
    {
        return in_array($this->status, [self::STATUS_PASSED, self::STATUS_FAILED, self::STATUS_ABANDONED], true);
    }
}

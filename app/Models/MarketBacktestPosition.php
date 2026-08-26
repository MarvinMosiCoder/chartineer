<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MarketBacktestPosition extends Model
{
    protected $fillable = [
        'market_backtest_account_id',
        'market_backtest_session_id',
        'market_backtest_playbook_id',
        'symbol',
        'exchange',
        'category',
        'margin_mode',
        'side',
        'order_type',
        'quantity',
        'original_quantity',
        'entry_price',
        'margin',
        'original_margin',
        'leverage',
        'entry_fee',
        'original_entry_fee',
        'exit_fee',
        'realized_pnl',
        'exit_price',
        'opened_at_time',
        'closed_at_time',
        'stop_loss',
        'take_profit',
        'liquidation_price',
        'trailing_stop_percent',
        'break_even_trigger_percent',
        'partial_take_profit_percent',
        'favorable_price',
        'adverse_price',
        'partial_take_profit_executed',
        'status',
        'close_reason',
        'setup_tag',
        'tags',
        'entry_reason',
        'exit_reason',
        'mistake',
        'emotion',
        'journal_notes',
        'playbook_snapshot',
        'checklist_answers',
    ];

    protected $casts = [
        'quantity' => 'decimal:10',
        'original_quantity' => 'decimal:10',
        'entry_price' => 'decimal:8',
        'margin' => 'decimal:8',
        'original_margin' => 'decimal:8',
        'leverage' => 'decimal:2',
        'entry_fee' => 'decimal:8',
        'original_entry_fee' => 'decimal:8',
        'exit_fee' => 'decimal:8',
        'realized_pnl' => 'decimal:8',
        'exit_price' => 'decimal:8',
        'stop_loss' => 'decimal:8',
        'take_profit' => 'decimal:8',
        'liquidation_price' => 'decimal:8',
        'trailing_stop_percent' => 'decimal:4',
        'break_even_trigger_percent' => 'decimal:4',
        'partial_take_profit_percent' => 'decimal:4',
        'favorable_price' => 'decimal:8',
        'adverse_price' => 'decimal:8',
        'partial_take_profit_executed' => 'boolean',
        'tags' => 'array',
        'playbook_snapshot' => 'array',
        'checklist_answers' => 'array',
    ];

    public function account()
    {
        return $this->belongsTo(MarketBacktestAccount::class, 'market_backtest_account_id');
    }

    public function session()
    {
        return $this->belongsTo(MarketBacktestSession::class, 'market_backtest_session_id');
    }

    public function trades()
    {
        return $this->hasMany(MarketBacktestTrade::class);
    }

    public function snapshots()
    {
        return $this->hasMany(MarketBacktestSnapshot::class);
    }

    public function playbook()
    {
        return $this->belongsTo(MarketBacktestPlaybook::class, 'market_backtest_playbook_id');
    }
}

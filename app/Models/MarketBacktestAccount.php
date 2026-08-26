<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MarketBacktestAccount extends Model
{
    protected $fillable = [
        'adm_user_id',
        'name',
        'quote_currency',
        'starting_balance',
        'cash_balance',
        'realized_pnl',
        'fees_paid',
        'is_active',
    ];

    protected $casts = [
        'starting_balance' => 'decimal:8',
        'cash_balance' => 'decimal:8',
        'realized_pnl' => 'decimal:8',
        'fees_paid' => 'decimal:8',
        'is_active' => 'boolean',
    ];

    public function positions()
    {
        return $this->hasMany(MarketBacktestPosition::class);
    }

    public function sessions()
    {
        return $this->hasMany(MarketBacktestSession::class);
    }

    public function trades()
    {
        return $this->hasMany(MarketBacktestTrade::class);
    }

    public function marks()
    {
        return $this->hasMany(MarketBacktestMark::class);
    }
}

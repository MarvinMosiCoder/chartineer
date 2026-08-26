<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MarketBacktestMark extends Model
{
    protected $fillable = [
        'market_backtest_account_id',
        'market_backtest_session_id',
        'exchange',
        'category',
        'symbol',
        'mode',
        'price',
        'candle_time',
        'observed_at',
        'status',
    ];

    protected $casts = [
        'price' => 'decimal:8',
        'candle_time' => 'integer',
        'observed_at' => 'datetime',
    ];

    public function account()
    {
        return $this->belongsTo(MarketBacktestAccount::class, 'market_backtest_account_id');
    }

    public function session()
    {
        return $this->belongsTo(MarketBacktestSession::class, 'market_backtest_session_id');
    }
}

<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MarketSymbol extends Model
{
    protected $fillable = [
        'adm_user_id',
        'symbol',
        'exchange',
        'exchange_symbol',
        'coin_name',
        'base_coin',
        'quote_coin',
        'category',
        'is_active',
        'is_favorite',
    ];

    public function user()
    {
        return $this->belongsTo(AdmUser::class, 'adm_user_id');
    }

    protected $casts = [
        'is_active' => 'boolean',
        'is_favorite' => 'boolean',
    ];
}

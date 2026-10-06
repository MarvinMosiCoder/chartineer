<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MemecoinTrade extends Model
{
    protected $fillable = ['adm_user_id', 'report_id', 'chain', 'address', 'symbol', 'entry_price', 'amount_usd', 'entry_reason', 'entered_at', 'exit_price', 'exit_reason', 'exited_at'];
    protected $hidden = ['adm_user_id'];
    protected $casts = ['entry_price' => 'float', 'amount_usd' => 'float', 'exit_price' => 'float', 'entered_at' => 'datetime', 'exited_at' => 'datetime'];
    protected $appends = ['pnl_pct'];

    public function getPnlPctAttribute(): ?float
    {
        return $this->exit_price === null ? null : ($this->exit_price / $this->entry_price - 1) * 100;
    }
}

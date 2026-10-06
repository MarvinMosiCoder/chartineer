<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MemecoinReport extends Model
{
    protected $fillable = ['adm_user_id', 'chain', 'address', 'address_hash', 'fingerprint', 'symbol', 'name', 'verdict', 'score', 'checked_at', 'report'];
    protected $casts = ['report' => 'array', 'checked_at' => 'datetime', 'score' => 'integer'];
}

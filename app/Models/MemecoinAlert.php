<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MemecoinAlert extends Model
{
    protected $fillable = ['adm_user_id', 'wallet_address', 'wallet_list', 'wallet_label', 'mint', 'amount', 'signature', 'event_hash', 'block_time', 'seen'];
    protected $hidden = ['adm_user_id', 'event_hash'];
    protected $casts = ['amount' => 'float', 'block_time' => 'datetime', 'seen' => 'boolean'];
}

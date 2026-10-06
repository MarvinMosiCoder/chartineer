<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MemecoinWallet extends Model
{
    protected $fillable = ['adm_user_id', 'address', 'address_hash', 'list', 'label', 'note', 'last_signature', 'last_checked_at'];
    protected $hidden = ['adm_user_id', 'address_hash', 'last_signature'];
    protected $casts = ['last_checked_at' => 'datetime'];
}

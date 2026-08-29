<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use App\Models\AdmUser;
class Announcement extends Model
{
    use HasFactory;

    protected $table = 'announcements';

    protected $fillable = [
        'title',
        'message',
        'status',
        'created_at',
        'created_by',
        'updated_by',
        'updated_at',
    ];

    public function admUsers()
    {
        return $this->belongsToMany(AdmUser::class,'announcement_user')->withPivot('hidden_at')->withTimestamps();
    }
}

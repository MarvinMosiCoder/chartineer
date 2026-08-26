<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;
use App\Models\Announcement;
use App\Models\AdmModels\AdmNotifications;
use App\Models\AdmModels\AdmPrivileges;
class AdmUser extends Authenticatable
{
    use HasApiTokens, HasFactory, Notifiable;

    /**
     * The attributes that are mass assignable.
     *
     * @var array<int, string>
     */
    
    protected $fillable = [
        'name',
        'name_changed_at',
        'username',
        'username_changed_at',
        'email',
        'password',
        'status',
        'deactivated_at',
        'deactivation_reason',
        'deactivated_by',
        'theme',
        'timezone',
        'trading_experience',
        'social_provider',
        'social_provider_id',
        'password_login_enabled',
        'last_market_symbol',
        'last_market_exchange',
        'last_market_category',
        'last_market_timeframe',
        'replay_trial_started_at',
        'replay_trial_ends_at',
        'replay_access_ends_at',
        'renewal_reminder_sent_at',
        'chart_tour_completed_at',
        'journal_tour_completed_at',
        'mentor_tour_completed_at',
        'training_tour_completed_at',
        'alert_sound_enabled',
        'terms_accepted_at',
        'privacy_accepted_at',
        'legal_effective_date',
        'id_adm_privileges',
        'created_at',
        'updated_at'
    ];

    protected $filterable = [
        'name',
        'email',
        'id_adm_privileges',
        'status',
        'created_at'
    ];

    /**
     * The attributes that should be hidden for serialization.
     *
     * @var array<int, string>
     */
    protected $hidden = [
        'password',
        'remember_token',
    ];

    /**
     * The attributes that should be cast.
     *
     * @var array<string, string>
     */
    protected $casts = [
        'email_verified_at' => 'datetime',
        'password' => 'hashed',
        'password_login_enabled' => 'boolean',
        'replay_trial_started_at' => 'datetime',
        'replay_trial_ends_at' => 'datetime',
        'replay_access_ends_at' => 'datetime',
        'renewal_reminder_sent_at' => 'datetime',
        'chart_tour_completed_at' => 'datetime',
        'journal_tour_completed_at' => 'datetime',
        'mentor_tour_completed_at' => 'datetime',
        'training_tour_completed_at' => 'datetime',
        'deactivated_at' => 'datetime',
        'alert_sound_enabled' => 'boolean',
        'terms_accepted_at' => 'datetime',
        'privacy_accepted_at' => 'datetime',
        'username_changed_at' => 'datetime',
        'name_changed_at' => 'datetime',
    ];

    /**
     * Generates a unique placeholder handle (e.g. "User482913") for a new account, so every
     * user has a username from creation instead of it sitting null until they set one.
     */
    public static function generateUniqueUsername(): string
    {
        do {
            $candidate = 'User'.random_int(100000, 999999);
        } while (self::where('username', $candidate)->exists());

        return $candidate;
    }

    public function scopeGetData($query){
        return $query->leftJoin('adm_privileges','adm_users.id_adm_privileges','adm_privileges.id')
            ->select('adm_users.*',
            'adm_users.name as user_name',
                    'adm_users.id as u_id',
                    'adm_privileges.*',
                    'adm_privileges.name as privilege_name');
                
    }

    public static function boot(){
        parent::boot();
        static::creating(function($model){
            // Only fall back to the current request when the caller didn't already
            // provide a value via create()/fill() — this hook previously overwrote
            // explicitly-passed attributes unconditionally, which broke every caller
            // whose request shape didn't happen to carry 'email'/'name'/'privilege_id'
            // (e.g. social registration bypasses Eloquent create() entirely to dodge
            // this) and any direct AdmUser::create() call outside a real HTTP request
            // (tests, console, jobs).
            if (is_null($model->email) && request()->filled('email')) {
                $model->email = request()->input('email');
            }
            if (is_null($model->name) && request()->filled('name')) {
                $model->name = request()->input('name');
            }
            if (is_null($model->id_adm_privileges) && request()->filled('privilege_id')) {
                $model->id_adm_privileges = request()->input('privilege_id');
            }
            if (is_null($model->password)) {
                $model->password = 'qwerty';
            }
        });
    }

    public function announcements(){
        return $this->belongsToMany(Announcement::class,'announcement_user')->withTimestamps();
    }
    
    public function notifications()
    {
        return $this->hasMany(AdmNotifications::class);
    }

    public function scopeSearchAndFilter($query, $request){
        $filter_column = $request['filter_column'] ?? [];
        if ($request['search']) {
            $search = $request['search'];
            $query->where(function ($query) use ($search) {
                foreach ($this->filterable as $field) {
                    if ($field === 'id_adm_privileges') {
                        $query->orWhereHas('role', function ($query) use ($search) {
                            $query->where('id_adm_privileges', 'LIKE', "%$search%");
                        });
                    }else{
                        $query->orWhere($field, 'LIKE', "%$search%");
                    }
                }
            });
        } 
        else {
            //filter function
            $query->where(function($w) use ($filter_column) {
                if(is_array($filter_column)){
                    foreach((array)$filter_column as $key=>$fc) {
                        if(!in_array($key,['privilege'])){
                            $value = @$fc['value'];
                            $type  = @$fc['type'];

                            if($type == 'empty') {
                                $w->whereNull($key)->orWhere($key,'');
                                continue;
                            }

                            if($value=='' || $type=='') continue;

                            if($type == 'between') continue;

                            switch($type) {
                                default:
                                    if($key && $type && $value) $w->where($key,$type,$value);
                                break;
                                case 'like':
                                case 'not like':
                                    $value = '%'.$value.'%';
                                    if($key && $type && $value) $w->where($key,$type,$value);
                                break;
                                case 'in':
                                case 'not in':
                                    if($value) {
                                        $value = explode(',',$value);
                                        if($key && $value) $w->whereIn($key,$value);
                                    }
                                break;
                            }
                        }else{
                            $value = @$fc['value'];
                            $type  = @$fc['type'];

                            if($type == 'empty') {
                                $w->whereNull($key)->orWhere($key,'');
                                continue;
                            }

                            if($value=='' || $type=='') continue;

                            if($type == 'between') continue;

                            switch($type) {
                                default:
                                    if($key && $type && $value)
                                    $w->orWhereHas('role', function ($w) use ($type,$value) {
                                        $w->where('name', $type, $value);
                                    });
                                break;
                                case 'like':
                                case 'not like':
                                    $value = '%'.$value.'%';
                                    if($key && $type && $value) 
                                    $w->orWhereHas('role', function ($w) use ($type,$value) {
                                        $w->where('name', $type, $value);
                                    });
                                break;
                                case 'in':
                                case 'not in':
                                    if($value) {
                                        $value = explode(',',$value);
                                        if($key && $value)
                                        $w->orWhereHas('role', function ($w) use ($value) {
                                            $w->whereIn('name', $value);
                                        });
                                    }
                                break;
                            }
                        }
                    }
                }
            });
            if(is_array($filter_column)){
                foreach((array)$filter_column as $key=>$fc) {
                    if(!in_array($key,['privilege'])){
                        $value = @$fc['value'];
                        $type  = @$fc['type'];
                        $sorting = @$fc['sort'];
    
                        if($sorting!='') {
                            if($key) {
                                $query->orderby($key,$sorting);
                                $filter_is_orderby = true;
                            }
                        }
    
                        if ($type=='between') {
                            if($key && $value) $query->whereBetween($key,$value);
                        }
    
                        else {
                            continue;
                        }
                    }
                }
            }
        }

        return $query;
    }

    public function role()
    {
        return $this->belongsTo(AdmPrivileges::class, 'id_adm_privileges', 'id');
    }

    public function scopeFilterData($query){
        return $query->select(
            'name AS name',
            'email AS email',
            'id_adm_privileges AS privilege',
            'status AS status',
            'created_at AS created_at',
            'created_by AS created_by',
            'updated_at AS updated_at',
            'updated_by AS updated_by'
        );
    }
}

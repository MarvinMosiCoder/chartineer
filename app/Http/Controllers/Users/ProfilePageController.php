<?php

namespace App\Http\Controllers\Users;

use app\Helpers\CommonHelpers;
use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use App\Models\AdmUser;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use App\Models\AdmModels\AdmUserProfiles;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Session;
use Illuminate\Validation\Rule;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use App\Services\AccountDeactivationService;
class ProfilePageController extends Controller
{

    public function getIndex()
    {
        $data = [];
        $data['page_title'] = 'Profile';
        $data['user'] = DB::table('adm_users')
            ->select(
                'adm_users.*',
                'adm_users.id as user_id',
                'adm_privileges.name as privilege_name',
                'adm_user_profiles.adm_user_id as profile_user_id',
                'adm_user_profiles.file_name as profile',
            )
            ->leftJoin('adm_privileges', 'adm_users.id_adm_privileges', '=', 'adm_privileges.id')
            ->leftJoin('adm_user_profiles', function($join) {
                $join->on('adm_users.id', '=', 'adm_user_profiles.adm_user_id')
                ->whereNull('adm_user_profiles.archived');
            })
            ->where('adm_users.id', CommonHelpers::myId())
            ->first();
        return Inertia::render('AdmVram/ProfilePage',$data);
    }

    public function saveEditImage(Request $request) {
        $file = $request->file('profile_image');
        $isExist = AdmUserProfiles::where('adm_user_id',CommonHelpers::myId())->exists();
        
        if($isExist){
            DB::table('adm_user_profiles')->where('adm_user_id',CommonHelpers::myId())->update([
                'archived' => date('Y-m-d h:i:s')
            ]);
        }

        // Create a new profile record
        $profile = AdmUserProfiles::create([
            'adm_user_id' => CommonHelpers::myId(),
            'ext' => $file->getClientOriginalExtension(),
            'created_by' => CommonHelpers::myId()
        ]);
    
        // Generate the filename
        $filename = CommonHelpers::myId() . "-" . $profile->id . "." . $file->getClientOriginalExtension();
    
        // Update the profile record with the filename
        $profile->update([
            'file_name' => $filename
        ]);
    
        // Move the file to the desired location
        $file->move(public_path('images/profile'), $filename);
    
        return response()->json(["message" => "Image uploaded!", "status" => "success"]);
    }
    
    private const AVATAR_KEYS = ['bull', 'bear', 'ape', 'shiba', 'fox', 'wolf', 'whale', 'shark', 'lion', 'turtle', 'eagle', 'octopus'];

    public function selectAvatar(Request $request)
    {
        $validated = $request->validate([
            'avatar_key' => ['required', Rule::in(self::AVATAR_KEYS)],
        ]);
        $userId = CommonHelpers::myId();

        DB::table('adm_user_profiles')->where('adm_user_id', $userId)->update([
            'archived' => date('Y-m-d h:i:s'),
        ]);

        $profile = AdmUserProfiles::create([
            'adm_user_id' => $userId,
            'file_name' => 'avatar:'.$validated['avatar_key'],
            'created_by' => $userId,
        ]);

        return response()->json(['message' => 'Avatar updated!', 'status' => 'success', 'file_name' => $profile->file_name]);
    }

    public function getProfiles(){
        $profiles = AdmUserProfiles::where('adm_user_id',CommonHelpers::myId())
            ->whereNotNull('file_name')
            ->where('file_name', 'not like', 'avatar:%')
            ->get();
        return response()->json($profiles);
    }

    public function updateProfile(Request $request){
        $id = $request['id'];
        $action = $request['action'];
        if(!$id){
            return response()->json(['message' => 'Nothing selected!', 'status' => 'warning']);
        }
        if($action == 'update'){
            DB::table('adm_user_profiles')->where('adm_user_id', CommonHelpers::myId())->update([
                'archived' => date('Y-m-d h:i:s')
            ]);
            DB::table('adm_user_profiles')->where('id', $id)->update([
                'archived' => NULL
            ]);
            return response()->json(['message' => 'Profile changed!', 'status' => 'success']);
        } elseif ($action == 'delete') {
            $filename = AdmUserProfiles::find($id);
            $imagePath = public_path('images/profile/'.$filename->file_name);
            if (File::exists($imagePath)) {
                File::delete($imagePath);
                DB::table('adm_user_profiles')->where('id', $id)->delete();
                return response()->json(['message' => 'Image deleted successfully!', 'status' => 'success']);
            } else {
                return response()->json(['message' => 'Image not found.', 'status' => 'warning']);
            }
        } elseif ($action == 'download') {
            $profile = AdmUserProfiles::find($id);
            if ($profile && $profile->file_name) {
                $filePath = public_path('images/profile/'.$profile->file_name);
                if (File::exists($filePath)) {
                    return response()->download($filePath, $profile->file_name);
                } else {
                    return response()->json(['message' => 'File not found.', 'status' => 'warning']);
                }
            } else {
                return response()->json(['message' => 'Profile not found.', 'status' => 'error']);
            }
        } else {
            return response()->json(['message' => 'Invalid action.', 'status' => 'error']);
        }
        
    }

    public function updateTheme(Request $request){
        $id = CommonHelpers::myId();
        $theme = $request['theme'];
        $update = AdmUser::where('id',$id)->update([
            'theme' => $theme,      
        ]);
        Session::put('dark_theme', $theme);
       
        return response()->json(["message"=>"Theme changed!", "status"=>"success"]);
        
    }

    private const USERNAME_CHANGE_COOLDOWN_DAYS = 30;

    public function updateDetails(Request $request)
    {
        $user = $request->user();
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'username' => ['nullable', 'string', 'min:3', 'max:60', 'regex:/^[A-Za-z0-9._-]+$/', Rule::unique('adm_users', 'username')->ignore($user->id)],
            'timezone' => ['nullable', 'timezone'],
            'trading_experience' => ['nullable', Rule::in(['beginner', 'intermediate', 'advanced', 'professional'])],
        ]);

        $nameChanged = $validated['name'] !== $user->name;
        if ($nameChanged && $user->name_changed_at) {
            return response()->json([
                'status' => 'error',
                'message' => 'Your display name has already been changed once and cannot be changed again from your profile. Contact support if it needs to be corrected.',
            ], 422);
        }

        $usernameChanged = array_key_exists('username', $validated) && $validated['username'] !== $user->username;
        if ($usernameChanged && $user->username_changed_at) {
            $nextChangeAllowedAt = $user->username_changed_at->copy()->addDays(self::USERNAME_CHANGE_COOLDOWN_DAYS);
            if ($nextChangeAllowedAt->isFuture()) {
                return response()->json([
                    'status' => 'error',
                    'message' => 'You can change your username again on '.$nextChangeAllowedAt->format('M j, Y').'.',
                ], 422);
            }
        }

        $user->update($validated);
        $timestamps = [];
        if ($nameChanged) $timestamps['name_changed_at'] = now();
        if ($usernameChanged) $timestamps['username_changed_at'] = now();
        if ($timestamps) $user->forceFill($timestamps)->save();

        return response()->json(['status' => 'success', 'message' => 'Profile details updated.']);
    }

    public function updateTimezone(Request $request)
    {
        $validated = $request->validate([
            'timezone' => ['required', 'timezone'],
        ]);

        $request->user()->update([
            'timezone' => $validated['timezone'],
        ]);

        return response()->json([
            'status' => 'success',
            'message' => 'Timezone updated.',
            'timezone' => $validated['timezone'],
        ]);
    }

    public function updateLastMarketSymbol(Request $request)
    {
        $validated = $request->validate([
            'symbol' => ['required', 'string', 'max:32', 'regex:/^[A-Za-z0-9]+$/'],
            'exchange' => ['required', 'string', 'max:32'],
            'category' => ['required', Rule::in(['spot', 'linear', 'inverse'])],
            'timeframe' => ['required', 'string', 'max:8', 'regex:/^[0-9]+[mhdw]$/'],
        ]);

        $request->user()->update([
            'last_market_symbol' => strtoupper($validated['symbol']),
            'last_market_exchange' => strtolower($validated['exchange']),
            'last_market_category' => $validated['category'],
            'last_market_timeframe' => $validated['timeframe'],
        ]);

        return response()->json(['status' => 'success']);
    }

    public function deactivate(Request $request, AccountDeactivationService $deactivationService)
    {
        $user = $request->user();
        $validated = $request->validate([
            'confirmation' => ['required', 'in:DEACTIVATE'],
            'password' => [$user->password_login_enabled ? 'required' : 'nullable', 'string'],
            'reason' => ['nullable', 'string', 'max:500'],
        ]);

        if ($user->password_login_enabled && !Hash::check($validated['password'], $user->password)) {
            return response()->json([
                'message' => 'The password is incorrect.',
                'errors' => ['password' => ['The password is incorrect.']],
            ], 422);
        }

        $deactivationService->deactivate($user, $user->id, $validated['reason'] ?? 'Voluntary account deactivation');

        Auth::logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->json([
            'status' => 'success',
            'message' => 'Your account has been deactivated.',
            'redirect' => route('login'),
        ]);
    }
    
}

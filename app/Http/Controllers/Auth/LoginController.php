<?php

namespace App\Http\Controllers\Auth;

use App\Helpers\CommonHelpers;
use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\LoginRequest;
use App\Models\AdmUser;
use App\Providers\AppServiceProvider;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Session;
use Laravel\Socialite\Facades\Socialite;
use Inertia\Inertia;
use Inertia\Response;
use DB;
use Carbon\Carbon;
use Exception;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;
use App\Models\Announcement;
use App\Models\AdmModels\AdmSettings;
use App\Models\AdmModels\AdmAdminMenus;
use App\Models\AdmModels\AdmMenus;
use App\Models\AdmModels\admMenusPrivileges;
use App\Services\AdminAccessService;

class LoginController extends Controller
{
    public function __construct(private readonly AdminAccessService $adminAccess)
    {
    }

    /**
     * Display the login view.
     */
    public function index()
    {
        if(auth()->check()){
            return redirect()->intended($this->loginDestination());
        }
        return Inertia::render('Auth/Login');
    }

    public function adminIndex(): Response|RedirectResponse
    {
        if (auth()->check()) {
            return redirect($this->adminAccess->isAdmin(auth()->user()) ? 'dashboard' : 'market');
        }

        return Inertia::render('Auth/AdminLogin');
    }

    public function checkEmail(Request $request)
    {
        $data = $request->validate([
            'email' => ['required', 'email', 'max:255'],
        ]);
        $email = Str::lower(trim($data['email']));

        return response()->json([
            'exists' => AdmUser::query()
                ->join('adm_privileges', 'adm_privileges.id', '=', 'adm_users.id_adm_privileges')
                ->whereRaw('LOWER(adm_users.email) = ?', [$email])
                ->where('adm_privileges.is_admin', false)
                ->where('adm_privileges.is_superadmin', false)
                ->exists(),
        ]);
    }

    /**
     * Handle an incoming authentication request.
     */
    public function authenticate(Request $request): RedirectResponse
    {
        $credentials = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required'],
        ]);
        $users = AdmUser::where("email", $credentials['email'])->first();

        if ($this->adminAccess->isAdmin($users)) {
            return redirect('login')->withErrors(['message' => 'The provided credentials do not match our records.']);
        }
       
        [$error, $session_details] = $this->validateLoginUser($users);
        if($error){
            return redirect('login')->withErrors(['message' => $error]);
        }

        if ($users && $users->password_login_enabled === false) {
            if ($users->social_provider === 'facebook') {
                return redirect('login')->withErrors([
                    'message' => 'Facebook sign-in has been replaced. Use Forgot Password to set a password, or sign in with Google or Apple using the same email address.',
                ])->onlyInput('email');
            }
            $providerName = ucfirst($users->social_provider ?: 'social');
            return redirect('login')->withErrors([
                'message' => "This account currently uses {$providerName} sign-in. Sign in with {$providerName}, then create a local password from Profile → Change password if you want email/password access.",
            ])->onlyInput('email');
        }

        if (Auth::attempt($credentials)) {
            RateLimiter::clear('login-identity:'.sha1(Str::lower(trim($credentials['email'])).'|'.$request->ip()));
            $this->completeLogin($request, Auth::user(), $session_details);
            return redirect()->intended($this->loginDestination($session_details));
        }
        return back()->withErrors([
            'email' => 'The provided credentials do not match our records',
            'password' => 'Incorrect email or password'
        ])->onlyInput(['email', 'password']);
    }

    public function adminAuthenticate(Request $request): RedirectResponse
    {
        $credentials = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required'],
        ]);
        $user = AdmUser::query()->whereRaw('LOWER(email) = ?', [Str::lower(trim($credentials['email']))])->first();
        $genericError = ['message' => 'The provided credentials do not match our records.'];

        if (!$user || !$this->adminAccess->isAdmin($user) || $user->password_login_enabled === false) {
            return back()->withErrors($genericError)->onlyInput('email');
        }

        [$error, $sessionDetails] = $this->validateLoginUser($user);
        if ($error || !Auth::attempt(['email' => $user->email, 'password' => $credentials['password']])) {
            return back()->withErrors($genericError)->onlyInput('email');
        }

        RateLimiter::clear('login-identity:'.sha1(Str::lower($user->email).'|'.$request->ip()));
        $this->completeLogin($request, Auth::user(), $sessionDetails);

        return redirect()->intended('dashboard');
    }

    public function redirectToProvider(string $provider)
    {
        try {
            $driver = Socialite::driver($provider);

            if ($provider === 'google') {
                $driver->with(['prompt' => 'select_account']);
            }

            return $driver->redirect();
        } catch (\Throwable $exception) {
            if ($provider !== 'apple') throw $exception;
            Log::warning('Apple sign-in redirect failed', ['exception' => get_class($exception)]);

            return redirect('login')->withErrors([
                'message' => 'Apple sign-in is currently unavailable. Please use Google or email/password.',
            ]);
        }
    }

    public function handleProviderCallback(Request $request, string $provider): RedirectResponse
    {
        try {
            if ($provider === 'apple') app(AppleCallbackController::class)->restore($request);
            $socialUser = Socialite::driver($provider)->user();
        } catch (\Throwable $exception) {
            Log::warning('Social login callback failed', [
                'provider' => $provider,
                'exception' => get_class($exception),
            ]);

            return redirect('login')->withErrors([
                'message' => 'Unable to sign in with '.ucfirst($provider).'. Please try again.',
            ]);
        }

        $email = $socialUser->getEmail();
        $email = is_string($email) ? Str::lower(trim($email)) : null;
        $providerId = (string) $socialUser->getId();
        if ($providerId === '') {
            return redirect('login')->withErrors(['message' => 'Unable to verify your sign-in identity. Please try again.']);
        }
        $users = AdmUser::where('social_provider', $provider)->where('social_provider_id', $providerId)->first();
        if (!$users && $email) {
            $users = AdmUser::whereRaw('LOWER(email) = ?', [$email])->first();
        }
        if (!$users && !$email) {
            return redirect('login')->withErrors([
                'message' => ucfirst($provider).' did not return an email address. Please use an account with a verified email.',
            ]);
        }

        if (!$users) {
            $request->session()->put('pending_social_registration', [
                'provider' => $provider,
                'provider_id' => $providerId,
                'name' => $socialUser->getName() ?: Str::before($email, '@'),
                'email' => Str::lower($email),
                'created_at' => now()->timestamp,
            ]);
            return redirect()->route('social.registration.confirm');
        }

        [$error, $session_details] = $this->validateLoginUser($users);
        if($error){
            return redirect('login')->withErrors([
                'message' => $error,
            ]);
        }

        if ($this->adminAccess->isAdmin($users)) {
            return redirect('login')->withErrors(['message' => 'Please use the administrator login page.']);
        }

        $usesTemporaryPassword = \Hash::check('qwerty', $users->password);
        $users->forceFill([
            'social_provider' => $provider,
            'social_provider_id' => $providerId,
            'password_login_enabled' => $usesTemporaryPassword ? false : (bool) $users->password_login_enabled,
        ])->save();

        Auth::login($users);
        $this->completeLogin($request, $users, $session_details, true);

        return redirect()->intended($this->loginDestination($session_details));
    }

    public function showSocialRegistration(Request $request): Response|RedirectResponse
    {
        $pending = $this->pendingSocialRegistration($request);
        if (!$pending) return redirect('login')->withErrors(['message' => 'Your social registration session expired. Please try again.']);

        return Inertia::render('Auth/SocialRegistrationConfirm', [
            'pending' => ['provider' => $pending['provider'], 'name' => $pending['name'], 'email' => $pending['email']],
            'legal' => config('legal'),
        ]);
    }

    public function completeSocialRegistration(Request $request): RedirectResponse
    {
        $request->validate(['accepted' => ['accepted']]);
        $pending = $this->pendingSocialRegistration($request);
        if (!$pending) return redirect('login')->withErrors(['message' => 'Your social registration session expired. Please try again.']);

        $existing = AdmUser::where('email', $pending['email'])->first();
        if ($existing) {
            $request->session()->forget('pending_social_registration');
            return redirect('login')->withErrors(['message' => 'An account now exists for this email. Please sign in again.']);
        }
        $defaultPrivilegeId = DB::table('adm_privileges')
            ->where('name', 'Users')->where('is_admin', false)->where('is_superadmin', false)->value('id');
        if (!$defaultPrivilegeId) return back()->withErrors(['accepted' => 'No trader role is configured. Please contact Administrator.']);

        $now = now();
        $userId = DB::table('adm_users')->insertGetId([
            'name' => $pending['name'], 'username' => AdmUser::generateUniqueUsername(), 'email' => $pending['email'], 'email_verified_at' => $now,
            'password' => Hash::make(Str::random(64)), 'id_adm_privileges' => $defaultPrivilegeId,
            'status' => 'ACTIVE', 'social_provider' => $pending['provider'],
            'social_provider_id' => $pending['provider_id'], 'password_login_enabled' => false,
            'terms_accepted_at' => $now, 'privacy_accepted_at' => $now,
            'legal_effective_date' => config('legal.effective_date'), 'created_at' => $now, 'updated_at' => $now,
        ]);
        $user = AdmUser::findOrFail($userId);
        [$error, $sessionDetails] = $this->validateLoginUser($user);
        if ($error) return redirect('login')->withErrors(['message' => $error]);

        $request->session()->forget('pending_social_registration');
        Auth::login($user);
        $request->session()->regenerate();
        $this->completeLogin($request, $user, $sessionDetails, true);
        return redirect()->intended($this->loginDestination($sessionDetails));
    }

    public function cancelSocialRegistration(Request $request): RedirectResponse
    {
        $request->session()->forget('pending_social_registration');
        return redirect()->route('login');
    }

    private function pendingSocialRegistration(Request $request): ?array
    {
        $pending = $request->session()->get('pending_social_registration');
        if (!is_array($pending) || !isset($pending['provider'], $pending['provider_id'], $pending['email'], $pending['created_at'])
            || !in_array($pending['provider'], ['google', 'apple'], true)
            || now()->timestamp - (int) $pending['created_at'] > 900) {
            $request->session()->forget('pending_social_registration');
            return null;
        }
        return $pending;
    }

    private function loginDestination(?array $sessionDetails = null): string
    {
        $isAdmin = $sessionDetails
            ? ((bool) $sessionDetails['priv']->is_admin || (bool) $sessionDetails['priv']->is_superadmin)
            : $this->adminAccess->isAdmin(auth()->user());

        return $isAdmin ? 'dashboard' : 'market';
    }

    private function validateLoginUser($users): array
    {
        if(!$users){
            return ['The provided credentials do not match our records!', null];
        }

        $session_details = self::getOtherSessionDetails($users->id_adm_privileges, $users->id);

        if(!$session_details['priv']){
            return ['No privilege set! Please contact Administrator!', null];
        }

        if($users->status == 0 || $users->status == 'INACTIVE'){
            Session::flush();
            return ["Account Doesn't Exist/Deactivated", null];
        }

        return [null, $session_details];
    }

    private function completeLogin(Request $request, AdmUser $users, array $session_details, bool $isSocialLogin = false): void
    {
        $request->session()->regenerate();
        $menus_privileges = admMenusPrivileges::where('id_adm_privileges',  $session_details['priv']->id)
            ->pluck('id_adm_menus');

        $menus = AdmMenus::with([
            'children' => function ($query) use ($menus_privileges) {
                $query->whereIn('id', $menus_privileges)
                ->where('is_active', 1)
                ->orderBy('sorting');
            }
        ])
            ->whereIn('id', $menus_privileges)
            ->where('parent_id', 0)
            ->where('is_active', 1)
            ->orderBy('sorting')
            ->get();

        $admin_menus = AdmAdminMenus::with([
            'children' => function ($query)  {
                $query->orderBy('sorting');
            }
        ])
            ->where('parent_id', 0)
            ->where('is_active', 1)
            ->orderBy('sorting')
            ->get();

        Session::put('user_menus', $menus);
        Session::put('admin_menus', $admin_menus);

        Session::put('admin_id', $users->id);
        Session::put('admin_is_superadmin', $session_details['priv']->is_superadmin);
        Session::put('admin_is_admin', (bool) $session_details['priv']->is_admin || (bool) $session_details['priv']->is_superadmin);
        Session::put("admin_privileges", $session_details['priv']->id);
        Session::put('admin_privileges_roles', $session_details['roles']);
        Session::put('theme_color', $session_details['priv']->theme_color);
        Session::put('dark_theme', $users->theme ?? NULL);
        Session::put('profile', $session_details['profile']->file_name ?? NULL);
        CommonHelpers::insertLog(trans("adm_default.log_login", ['email' => $users->email, 'ip' => $request->server('REMOTE_ADDR')]));

        if(!$isSocialLogin){
            $today = Carbon::now();
            $lastChangePass = $users->last_password_updated ? Carbon::parse($users->last_password_updated) : null;
            $needsPasswordChange = \Hash::check('qwerty', $users->password) || !$lastChangePass || $lastChangePass->diffInMonths($today) > 3;
            if($needsPasswordChange){
                Log::debug("message: {$needsPasswordChange}");
                Session::put('check_user',true);
            }
        }

        $unreadAnnouncements = Announcement::whereDoesntHave('admUsers', function($query) use ($users) {
            $query->where('adm_user_id', $users->id);
        })->where('status','ACTIVE')->get();
        if($unreadAnnouncements->isNotEmpty()){
            Session::put('unread-announcement',true);
        }

        $exist = Auth::user()->notifications()->where('type', 'system users')->exists();
        if(!$exist){
            $appname = AdmSettings::where('name','appname')->pluck('content')->first() ?? 'Vram AT.';
            CommonHelpers::sendNotification([
                'content' => "Welcome to ".$appname." We're excited to have you here!.",
                'id_adm_users' => [$users->id],
                'type' => 'system users',
                'is_read' => 0,
                'to' => url('/')
            ]);
        }
    }

    public function getOtherSessionDetails($id, $userId = null){
        $data = [];
        $data['profile'] = DB::table('adm_user_profiles')->where('adm_user_id',$userId ?? $id)->whereNull('archived')->first();
        $data['priv'] = DB::table("adm_privileges")->where("id", $id)->first();
        $data['roles'] = DB::table('adm_privileges_roles')->where('id_adm_privileges', $id)->join('adm_modules', 'adm_modules.id', '=', 'id_adm_modules')->select('adm_modules.name', 'adm_modules.path', 'is_visible', 'is_create', 'is_read', 'is_edit', 'is_delete', 'is_void', 'is_override')->get();
		return $data;
    }

    public function logout(Request $request): RedirectResponse
    {
        CommonHelpers::insertLog(trans("adm_default.log_logout", ['email' => Auth::user()->email, 'ip' => $request->server('REMOTE_ADDR')]));
        $isAdmin = $this->adminAccess->isAdmin(Auth::user());
        Auth::logout();
        $request->session()->invalidate();

        $request->session()->regenerateToken();
        return redirect($isAdmin ? route('admin.login') : route('login'));
    }

    public function endSession(Request $request){

        Auth::logout();
    
        $request->session()->invalidate();
        $request->session()->regenerateToken();
    }
}

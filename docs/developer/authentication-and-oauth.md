# Authentication and OAuth

## Purpose

Traders sign in at `/login` with email/password or Google/Facebook. Administrative accounts use the separate email/password-only `/admin/login`. Both use the same `adm_users` identity table and Laravel session guard; current database privileges determine authorization. Successful traders enter `/market`; administrators enter `/dashboard`.

## Routes and files

| Route/file | Responsibility |
|---|---|
| `GET /login`, `POST /login-save` | Render and process password login |
| `GET/POST /admin/login` | Render and process the admin-only password login |
| `GET /auth/{provider}/redirect`, callback | Socialite OAuth flow |
| `/reset_password*`, `/send_resetpass_email*` | Password-reset screens and actions |
| `app/Http/Controllers/Auth/LoginController.php` | Authentication, OAuth account matching/creation, session setup, logout |
| `app/Http/Controllers/Auth/ResetPasswordController.php` | Reset validation and password history |
| `resources/js/Pages/Auth/*.jsx` | Login and reset UI |
| `config/services.php` | OAuth provider configuration |

Login is throttled at the route:

```php
Route::post('login-save', [LoginController::class, 'authenticate'])
    ->middleware('throttle:login');
```

## Flow

1. `Login.jsx` posts credentials to `/login-save`.
2. Laravel validates the account, status, and password.
3. `LoginController` loads privilege, menus, profile, theme, notification, and announcement session data.
4. Laravel regenerates the authenticated session and redirects by the current database role. The trader endpoint rejects administrative accounts; the admin endpoint rejects non-admin accounts with a generic error.
5. OAuth redirects through Socialite. The callback matches provider identity, then email, and may create a non-superadmin account.
6. `LoginController::completeLogin()` also decides whether this account must change its password now: still on the literal seeded default (`Hash::check('qwerty', ...)`), or `last_password_updated` is null/older than 3 months. If so it sets `Session::put('check_user', true)`. `CheckUserForceChangePassword` (`check.user` middleware alias) redirects any request carrying that flag to `show-change-force-password`.

`check.user` is deliberately attached only to specific routes, never to a whole route group: it's a plain `redirect()->route(...)`, which would break AJAX/JSON calls (e.g. the trading UI's `market-backtest/*` endpoints) if it fired on them. It must be attached to whichever named routes `loginDestination()` actually sends a session to right after login — currently `dashboard` (admins) and `market` (traders) — otherwise an account can land on its home page without ever being prompted, even though the session flag is set. Adding a new post-login landing destination requires adding `check.user` to it explicitly.

`adm_users` stores identity, provider fields, password-login state, status, privilege, onboarding, trial, and paid-access fields. Password history is stored in `adm_password_histories`.

`Login.jsx` shares the homepage's no-dependency motion style (see [Public and legal pages](public-and-legal-pages.md)): mount-in `animate-fadeInUp` on the header/aside/form, ambient `animate-floatY` glow blobs behind the page, a two-step progress indicator (Email/Password) above the form, and `focus-within` rings on the input wrappers. The step content is wrapped in a `<div key={step}>` so switching steps replays the entrance animation.

`AdminLogin.jsx` reuses the same header/blob/card shell and theme tokens as `Login.jsx` (reads the `backtradelab-theme` value from `localStorage` at mount to pick dark/light, defaulting to dark) but keeps the single-step email+password form — there is no email pre-check or OAuth on the admin path. It links back to `/` and to `/login` for a trader who lands there by mistake.

`ResetPassword.jsx` (`/reset_password`, the "forgot password" request form) and `ResetPasswordEmail.jsx` (`/reset_password_email/{email}`, the new-password form reached from the emailed link) use the same header/blob/card shell too, with self-contained `localStorage`-driven theme state — like `Login.jsx`/`AdminLogin.jsx`, these are `Auth/*` pages and never get the authenticated `ThemeProvider`. Both were rewritten off the legacy `InputComponentPassword`/`InputWithLogo`/`TableButton`/`LoginDetails` components: `InputComponentPassword` calls `useTheme()` unguarded, which throws when there is no `ThemeProvider` above it, so `ResetPasswordEmail.jsx` crashed on mount before this rewrite. The password-strength meter and mismatch checks are unchanged; only the presentation and the crash are fixed.

Logging out redirects by role: `LoginController::logout()` captures `adminAccess->isAdmin(Auth::user())` before calling `Auth::logout()`/invalidating the session, then sends admins to `route('admin.login')` and everyone else to `route('login')`.

`ResetPasswordController::resetPassword()` sets `password_login_enabled = true` alongside the new password hash, so a social-only account (Google/Facebook, `password_login_enabled = false`) that completes the "forgot password" email flow gains password login the same way the in-app change-password form (`ForceChangePasswordController::postUpdatePassword()`) already did — otherwise the new password would be saved but still rejected at login.

The password-reset email (`app/Mail/Mailer.php`, the only Mailable in this app, sent from `ResetPasswordController.php:35`) sets its `from` name and its `resources/views/mailbody.blade.php` footer from `AdmSettings::where('name','appname')` — the same Settings-page value used everywhere else in the UI (navbar brand, browser tab title) — rather than `config('mail.from.name')`. `MAIL_FROM_NAME` in `.env` defaults to `${APP_NAME}`, which is a separate, easy-to-forget value that doesn't track the admin-configurable app name at all (it was still the Laravel default in this environment); the template also had a hardcoded "VRAM" leftover in its footer before this. If a dedicated payment/receipt Mailable is ever added, give it the same `AdmSettings`-sourced `from` rather than relying on `.env`. Note this doesn't affect PayMongo's own hosted checkout page or its `send_email_receipt: true` receipt email — the merchant/business name shown there comes entirely from the PayMongo account's own Business Profile settings in their dashboard; nothing in this codebase's checkout-session request controls it (see [Subscriptions, trials, and PayMongo](subscriptions-trials-and-paymongo.md)).

## Security and maintenance

- Keep OAuth secrets in `.env`; expose only callback URLs publicly.
- Do not allow OAuth registration to choose superadmin privilege.
- Keep social authentication and registration unavailable from the admin login.
- Treat `is_admin`, `is_superadmin`, and module permissions from the database as authoritative; session role values are presentation caches only.
- Reject inactive accounts in every login path.
- Regenerate sessions on authentication and invalidate them on logout.
- Preserve named login/reset/social rate limiters when editing routes.
- When adding a provider, update `whereIn`, `config/services.php`, `.env.example`, callback logic, login UI, and tests.

## Verification

- Correct/incorrect password and throttling.
- Inactive user rejection.
- Known and unknown OAuth email behavior.
- Provider callback error/cancel behavior.
- Normal-user versus superadmin redirect.
- Reset token, password rules, and password-history rejection.
- Password submission shows the theme-aware, accessible “Signing in” overlay until navigation or an authentication error; the email lookup retains its smaller button state.

Related: [Users, profiles, and deactivation](users-profiles-and-deactivation.md), [Roles](roles-privileges-menus.md).
# Two-step login and social consent

Email login first collects a syntactically valid email and checks `/login/check-email` for an existing account before showing the password step. The lookup has dedicated identity/IP rate limits. Password submission remains protected by the existing login rate limits.

After the email step, the login form retains the email internally and displays only the password field. A "Change email" link on the password step returns to the email step without a reload (email value kept, password/errors cleared). Reloading the login page always starts again at the email step.

`Login.jsx`'s email/password fields are plain `<div>` wrappers with a `<span>` caption, not `<label>` elements — a `<label>` wrapping more than one labelable element (inputs, buttons) makes the browser treat the first one as the label's implicit associated control, so clicking any other control inside it (e.g. the show/hide-password toggle) also synthetically clicks that first control. Keep new controls inside the password/email field blocks out of any shared `<label>`.

Known Google/Facebook users sign in directly. Unknown identities are kept in the server session for up to 15 minutes and sent to `/social-registration/confirm`. No user is created until the visitor accepts the Terms and Privacy Policy and selects **Create account**. Acceptance timestamps and the configured legal effective date are stored. Cancel or expiry clears the pending identity.

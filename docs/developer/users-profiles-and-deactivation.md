# Users, Profiles, and Deactivation

## Purpose and entry points

Authenticated users manage profile details, image, theme, and password under `/profile` and password pages. Administrators create/edit users and change status through user-management routes.

`PATCH /profile/timezone` accepts one validated IANA timezone for the authenticated user. The chart footer uses this endpoint so changing the live clock timezone does not require resubmitting the rest of the profile.

| File | Responsibility |
|---|---|
| `ProfilePageController.php` | Profile reads/updates and self-deactivation |
| `AdminUsersController.php` | Admin CRUD, password, bulk status |
| `ForceChangePasswordController.php` | Required password-change and waiver flow |
| `AccountDeactivationService.php` | Shared deactivate/reactivate transaction |
| `AdmUser.php`, `AdmUserProfiles.php` | Account and extended profile records |
| `Pages/AdmVram/ProfilePage.jsx` | Profile and danger-zone UI |

## Deactivation flow

1. `POST /profile/deactivate` requires `auth`, `account.active`, throttling, confirmation text, and—when applicable—the current password.
2. `AccountDeactivationService::deactivate()` marks the account inactive, records actor/reason/time, revokes Sanctum tokens, and disables active price alerts.
3. The controller logs out and invalidates the current session.
4. Other sessions are stopped by `account.active` on their next request.

Deactivation is non-destructive: trading, drawings, replay, journal, feedback, and subscription records remain. Reactivation clears deactivation metadata but does not re-enable alerts.

## Username: auto-generated, unique, cooldown-limited; Display name: one-time change

`adm_users` has both `name` (required, not unique — the "Display name", still used everywhere a real name matters: PayMongo billing/receipts, admin user lists, notifications) and `username` (nullable, unique, alphanumeric plus `.`/`_`/`-`, 3–60 chars). They are intentionally separate fields with different purposes; nothing here removes or renames `name`.

**Display name is limited to exactly one self-service change, ever** — not a cooldown. `name_changed_at` starts `null`; the first time a user actually changes `name` via `PUT /profile/details`, it's set and the field is permanently locked from that account's own profile page afterward (`ProfilePageController::updateDetails()` returns `422` with "Your display name has already been changed once..." on any further attempt, regardless of how much time has passed). Re-submitting the *same* current value never counts as a change and never touches the lock. There is currently no admin override UI to un-lock a display name later (e.g. to fix a typo after the one change is used) — that would need to be built separately if it comes up. `Pages/AdmVram/ProfilePage.jsx` disables the Display name input once `user.name_changed_at` is set.

- **Auto-generated at account creation.** There is no self-service email/password registration in this app — accounts are only created via Google/Apple OAuth (`LoginController::completeSocialRegistration()`) or by an admin (`AdminUsersController::postAddSave()`). Both now call `AdmUser::generateUniqueUsername()`, which loops `'User'.random_int(100000, 999999)` until it finds a value not already taken, so every new account gets a placeholder handle (e.g. `User482913`) instead of `username` sitting `null` until the user bothers to set one. Existing accounts created before this change are left untouched — nothing was backfilled, since retroactively replacing an already-active user's displayed identity with a random string would be a surprising side effect, not a feature.
- **Editable in `/profile`**, same `PUT /profile/details` endpoint as `name`/timezone/trading experience.
- **Rate-limited to one change per `ProfilePageController::USERNAME_CHANGE_COOLDOWN_DAYS` (30) days.** `updateDetails()` compares the incoming `username` against the current value; if it's actually changing and `username_changed_at` is set and less than 30 days old, the request is rejected with `422` and a message naming the exact date the next change is allowed (`You can change your username again on M j, Y.`). On a successful change, `username_changed_at` is set to `now()`. Updating `name` or other fields without touching `username` never touches this cooldown. `Pages/AdmVram/ProfilePage.jsx` computes the same 30-day window client-side to disable the username input and show the unlock date proactively — this is a UX convenience only, the server-side check is the actual enforcement.
- **Displayed in the system navbars only, with a fallback.** `TraderNavbar.jsx`, `AdminNavbar.jsx`, and the legacy `AppNavbar.jsx` show `auth.user.username || auth.user.name` instead of just `name`, so the top-bar identity reads as a username/handle. Every other place `name` is used — PayMongo checkout billing, admin user tables, notification content, the Market overview "Welcome back" greeting — deliberately still uses the real `name` and was not touched; the fallback to `name` also covers any pre-existing account that doesn't have a `username` yet.

## Profile picture: uploads and system avatars

`adm_user_profiles` holds the picture history (`file_name`, `ext`, `created_by`, `archived` — one active row per user, older ones archived, matching the existing activate/archive pattern). System-provided avatars reuse this exact same table and activate/archive mechanism rather than adding a new column or table: selecting one stores a synthetic `file_name` of `avatar:<key>` (e.g. `avatar:bull`) with `ext` left null. This was deliberate — `file_name` already flows unchanged through several fragile, only-loosely-related legacy paths (`Session::put('profile', ...)` at login in `LoginController`, the `ProfileContext` React context fed from that session value, the `auth.profile` lazy Inertia prop, and `ProfilePageController::getIndex()`'s own SQL-aliased `user.profile`), so encoding the avatar as a `file_name` convention means all of that kept working with zero changes, versus threading a brand-new field through four different plumbing paths.

- **Catalog**: `resources/js/Components/Profile/avatarCatalog.js` (`AVATAR_CATALOG`) — 12 crypto/animal-themed emoji avatars (bull, bear, ape, shiba, fox, wolf, whale, shark, lion, turtle, eagle, octopus), each with a label and a Tailwind gradient. `ProfilePageController::AVATAR_KEYS` is the server-side mirror used for validation (`Rule::in`) — add a new avatar by appending to both lists.
- **Selecting one**: `POST /profile/avatar` (`ProfilePageController::selectAvatar()`) archives the user's current active `adm_user_profiles` row (identical to the existing upload-switch logic) and creates a new one with `file_name = 'avatar:<key>'`.
- **Rendering**: `getAvatarFromFileName(fileName)` (same catalog file) returns the matching catalog entry or `null` for any string not starting with `avatar:` (i.e. every real uploaded filename). `Components/Profile/AvatarBadge.jsx` renders the gradient+emoji circle. Every place that used to unconditionally render `file_name` as `<img src="/images/profile/{file_name}">` — `Pages/AdmVram/ProfilePage.jsx`'s main circle and `Layouts/layout/AppNavbar.jsx`'s two header/dropdown avatars — now checks `getAvatarFromFileName()` first and renders `AvatarBadge` instead of an `<img>` when it matches, falling back to the image (or initials, if neither) otherwise. `TraderNavbar.jsx`/`AdminNavbar.jsx` don't render a profile picture at all today, only initials/name, so they needed no change.
- **Uploads gallery stays avatar-free**: `getProfiles()` (backing the "Your uploads" tab / `GET /profiles`) explicitly excludes `file_name like 'avatar:%'` rows, so system avatars never show up mixed into the list of previously uploaded photos, and vice versa — `Pages/AdmVram/ProfilePage.jsx`'s picture-change modal has two tabs, "Your uploads" and "Choose avatar", each showing only its own kind.
- **Single entry point**: the camera icon overlaid on the avatar circle opens this same modal (defaulting to the "Your uploads" tab) instead of jumping straight to the OS file picker like it used to. The actual file-choose input and its "Upload" button now live inside the "Your uploads" tab itself (calling the same `handleSubmit`/`POST /save-edit-image` as before — the upload endpoint/logic is unchanged, only where the trigger UI lives moved). A "Change profile picture" text button below the form opens the same modal as a second, more discoverable entry point.
- Display name/username fallback (`user.username || user.name`) is used consistently for the big name label and initials-avatar-fallback on this page too, matching the navbars.

## Ownership and safety

- A profile action must use the authenticated user, never a request-supplied user ID.
- Admin status changes must prevent self-deactivation.
- File uploads require image type/size validation and controlled storage paths.
- Password changes must enforce current-password/history rules and perform one logout request.

## Verification

- Update name/profile image/theme.
- New OAuth and admin-created accounts always receive a unique, correctly formatted (`User` + 6 digits) `username`.
- Changing `username` sets `username_changed_at`; a second change within 30 days is rejected with the exact unlock date; changing `name` alone never touches the username cooldown; a change exactly at/after the 30-day mark succeeds.
- The first `name` change succeeds and sets `name_changed_at`; any further attempt is rejected regardless of elapsed time; re-submitting the unchanged current name is never blocked and never touches the lock; changing only `username` never touches the name lock.
- The system navbars show `username` when present, falling back to `name` for accounts without one.
- `TraderNavbar.jsx` replaced its username/"Trader" text block with a clickable avatar circle (uploaded photo, system avatar, or initials — same `getAvatarFromFileName`/`AvatarBadge` resolution as the other navbars) linking to `/profile`, following the same pattern already used for the profile picture elsewhere.
- Saving profile details raises the shared app-wide toast (`useToast()`) on both success and failure, in addition to the existing inline message near the Save button.
- Selecting a system avatar creates an active `avatar:<key>` row and archives whatever was active before (including a real uploaded photo); an invalid avatar key is rejected before any row is touched; the uploads gallery (`GET /profiles`) never includes avatar rows.
- Update timezone from the profile and chart footer; reject invalid timezone identifiers.
- Local-password and social-only deactivation.
- Wrong password or missing `DEACTIVATE`.
- Token revocation and second-browser blocking.
- Admin reactivation and preserved records.
- Admin cannot deactivate self.

Related: [Authentication](authentication-and-oauth.md), [Price alerts](price-alerts-and-notifications.md).

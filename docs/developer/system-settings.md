# System Settings

## Purpose

Administrators configure application presentation such as name, logo, login details, and theme-related settings stored in `adm_settings`.

| Route/file | Responsibility |
|---|---|
| `GET /appname`, `/applogo`, `/login-details` | Publicly needed presentation values |
| `POST /settings/postSave`, `/postDelete` | Authenticated admin changes |
| `SettingsController.php` | Read/write settings and files |
| `AdmSettings.php` | Settings records |
| `Pages/AdmVram/Settings.jsx` | Admin settings UI |
| `Components/SystemSettings/*.jsx` | Frontend value loaders |

`app.jsx` loads the application name before creating the Inertia app, while `AppInitializer.jsx` loads the logo for navigation progress presentation.

**`Settings.jsx` was restyled to a single page header (icon, "App Settings" title, description, one "Save Settings" button) above two side-by-side cards** ("Application Settings", "Login Settings") — previously each card had its own duplicate Save/Cancel footer even though both buttons posted the exact same combined `forms` state to `/settings/postSave` in one request; the single top-level button removes that duplication without any backend change. Existing favicon/logo/login-background-image files render as a small download/remove row (`ExistingFileRow`, local to this page); an empty slot renders `InputFile.jsx` as a dashed dropzone-style upload control instead of a native file input. `Components/Forms/Card.jsx` and `Input.jsx` are shared with `PrivilegesForm.jsx`, `EditMenus.jsx`, and `Menus.jsx` (`Card.jsx` also gained an optional `description` subtitle, backward-compatible since those callers don't pass one) — `Menus.jsx`'s green/red-tinted "Menu Order (Active/Inactive)" cards still work via `Card`'s existing `themeHead` override. `InputFile.jsx` is only used by this page, so its dropzone rebuild was a free restyle with no other call sites to check.

`Components/SystemSettings/AppNameWordmark.jsx` renders the fetched app name as a two-tone wordmark (first half in the surrounding text color, second half in a fixed teal accent) everywhere the name appears as a header brand label — see [Dashboard and layouts](dashboard-and-layouts.md) for the full list of call sites, including the five `Auth/*` pages that previously hardcoded `"BacktradeLab"` instead of calling `getAppName()`.

## Maintenance

- Keep public getter responses limited to non-secret presentation data.
- Validate uploaded logo/favicon type and size, and delete/replace files safely.
- Cache settings only with a clear invalidation path after admin updates.
- Provide a stable default when a setting is absent.
- Environment-backed legal/payment/provider configuration does not belong in this database UI unless a secure secret-management design is added.

## Verification

- Defaults on a fresh database.
- Name/logo/login changes after reload.
- Invalid file rejection.
- Restricted settings write/delete.
- Dark/light layout remains readable.

Related: [Public pages](public-and-legal-pages.md), [Dashboard](dashboard-and-layouts.md).

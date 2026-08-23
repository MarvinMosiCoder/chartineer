# Roles, Privileges, and Menus

## Purpose

The legacy administration layer stores privileges, modules, menus, and their mappings in the database. It controls admin navigation and can register module controller routes dynamically.

`adm_privileges.is_admin` distinguishes administrative roles from the protected `Users` trader role. `is_superadmin` grants a full bypass; restricted administrators require an explicit `adm_privileges_roles` action for the current module. The `admin`, `superadmin`, and `admin.permission:{module},{action}` middleware enforce these rules from current database state.

## Files and data

| File/table | Responsibility |
|---|---|
| `PrivilegesController.php` / `adm_privileges` | Create and edit privileges |
| `ModulsController.php` / `adm_modules` | Module metadata and legacy scaffolding |
| `MenusController.php` / `adm_menuses` | Menu tree, status, sidebar response |
| `adm_privileges_roles` | Privilege-to-role/module mappings |
| `adm_menus_privileges` | Menu visibility per privilege |
| `adm_admin_menuses` | Admin menu hierarchy |
| `CommonHelpers.php` | Dynamic route/controller discovery |
| `AdminSidebar.jsx` | Render authorized admin navigation |

## Flow

1. Admin CRUD pages write privilege/module/menu records.
2. Login session setup stores the user's privilege and authorized menu information.
3. `/sidebar` returns menu data for the authenticated session.
4. `routes/web.php` reads active modules and registers legacy controller routes.

Because dynamic routes depend on database state, use:

```bash
php artisan route:list
```

after migrations/seeders and before changing a generated module.

## `adm_admin_menuses` — the unprivileged "ADMIN MENU" sidebar section

This is a *separate* system from the privilege-scoped `adm_menuses`/`adm_menus_privileges` pair described above, easy to conflate because both feed `AdminSidebar.jsx`. `adm_admin_menuses` rows are **not** filtered by privilege at all — `LoginController::completeLogin()` loads every `is_active=1` row (`parent_id=0` as top-level, its `children` relation for nested ones) into `Session::put('admin_menus', ...)` unconditionally, so any admin/superadmin session sees the exact same "ADMIN MENU" list regardless of their specific role permissions. Real authorization still lives on the route middleware (`superadmin`, `admin.permission:...`), never on whether a menu row happens to be visible.

- `type: 'Route'` + `parent_id: 0` → renders as a flat `SidebarMenuCard` (`slug` becomes `href = '/' + slug`).
- `type: 'URL'` + `parent_id: 0` → renders as an expandable `SidebarMenuCardMultiple` parent; its own `slug` is never navigated to, clicking it only toggles the child list open/closed. Its children are the other rows whose `parent_id` equals this row's `id`.
- **Because `parent_id` is a real foreign row `id`, not a name, any migration that adds a new dropdown must `insertGetId()` the parent first and use that returned id for the children** — the existing seeder (`database/seeders/AdminSidebarMenuses.php`) hardcodes `parent_id: 6` for "Admin Settings"'s children only because it happens to run in a fixed order against an empty table; a migration touching a live database cannot assume a specific id.
- Menu changes here only take effect for a session's sidebar on their **next login** (`admin_menus` is a session snapshot taken once at `completeLogin()`, not read fresh per request) — there is no live-refresh path today.
- Two of the originally seeded rows — "Module Activity History" (`module_activity_history`) and "System Error Logs" (`system_error_logs`) — were placeholder labels with no route ever actually implemented behind their slug (confirmed by grepping `routes/web.php` and `adm_modules` for those slugs — nothing matched). `database/migrations/2026_08_08_000006_move_payment_menus_into_admin_sidebar.php` repointed both at real pages built the same session: "System Error Logs" now points at `admin/system-errors` (stays flat/top-level), and "Module Activity History" was renamed to "Payment Activity", repointed at `admin/payment-activity`, and moved under a new "Payments" dropdown parent alongside "Transactions" (`admin/subscriptions`) and "Pricing" (`admin/subscription-plans`) — all three were previously plain links in `AdminNavbar.jsx`'s top nav, removed from there once the sidebar covered them. Before assuming a seeded admin-menu label is a working feature, check for an actual matching route the same way.
- `database/seeders/AdminSidebarMenuses.php` mirrors this migration's end-state so a fresh `migrate:fresh --seed` produces the same tree. **The child page under "Payments" is named "Transactions", not "Payments"** — the seeder's `updateOrInsert(['name' => $row['name']], $row)` matches purely by `name`, so a child sharing its parent dropdown's exact label collides with it: reusing "Payments" for both corrupted the two rows into each other on a real re-seed (confirmed the hard way, then fixed live data and both source files). Never give a child menu row the same `name` as its parent in this table.

## Maintenance rules

- Treat controller names and paths stored in the database as executable routing configuration.
- Require `check.user` for admin-only pages and verify privilege in controller actions.
- Keep parent/child menu ordering and privilege mappings consistent.
- Do not assume hiding a menu authorizes an endpoint; authorization belongs on the server.
- Never use `admin_is_admin`, `admin_is_superadmin`, or menu visibility as a backend authorization decision.
- Keep the `Users` privilege non-admin, prevent self-demotion and final-superadmin removal, and deny missing module mappings by default.
- Review generated controller/view code before committing it.

## Verification

- Superadmin and restricted-privilege menus.
- Direct URL access when a menu is hidden.
- Create/edit/deactivate privilege and menu.
- Route list with and without module seed data.
- No duplicate route names introduced by generated modules.

Related: [Admin API generator](admin-api-generator.md), [Dashboard and layouts](dashboard-and-layouts.md), [Admin reports](admin-reports.md).

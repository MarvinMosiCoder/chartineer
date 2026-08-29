# Price Alerts and Notifications

## Purpose

Users create directional market-price alerts. While the chart is open it checks current price, marks triggered alerts, creates notifications, and removes their chart lines.

| Route/file | Responsibility |
|---|---|
| `GET/POST /market-price-alerts` | List/create alerts |
| `POST /market-price-alerts/check` | Evaluate the authenticated user's active alerts against a live chart price |
| `POST /market-price-alerts/check` | Evaluate active alerts for a market price |
| `DELETE /market-price-alerts/{alert}` | Remove owned alert |
| `MarketPriceAlertController.php` | Validation, ownership, trigger processing |
| `MarketPriceAlert.php` | Alert record |
| `NotificationsController.php` / `AdmNotifications.php` | Notification UI/data |
| `POST /notifications/dismiss` | Hide one owned `adm_notifications` row from the navbar dropdown feed only (sets `dismissed_at`, never deletes) |
| `DELETE /notifications/{sourceType}/{id}` | Permanently remove one row from the history page (`sourceType` is `notification` or `announcement`) |
| `DELETE /notifications/all` | Clear the caller's whole notification history |
| `MarketChart.jsx` | Alert line/modal/open-chart checks |

## Flow

1. Chart submits exchange/category/symbol, target price, direction, and last price.
2. Server stores an active user-owned alert.
3. Open chart periodically submits current price to `/check`.
4. `above` triggers on the intended upward crossing and `below` on downward crossing.
5. Triggered alerts become inactive/triggered and a notification is produced.

## Maintenance and limits

- Route-model-bound deletion must verify `adm_user_id`.
- Deactivation disables active alerts.
- Open-browser checks are not an offline alert service. Production offline delivery requires a scheduled/queued exchange-price worker.
- Make trigger processing idempotent so repeated prices do not duplicate notifications.

## Verification

- Rise/drop direction and crossing behavior.
- Reloaded active lines.
- Delete and trigger ownership.
- Duplicate check idempotency.
- Account deactivation disables alerts.
- History deletion: `tests/Feature/NotificationDeletionTest.php` covers single-row delete, another user's id 404ing, delete-all staying scoped to the caller, an announcement being hidden per user rather than deleted (and surviving "Mark all read"), and the plain-text row / sanitized-HTML modal split. Like `BacktestTradeNotificationTest`, it runs against the real schema with `DatabaseTransactions` — the sqlite-backed alert tests skip in this environment.

Related: [Live streaming](live-market-streaming.md), [Users](users-profiles-and-deactivation.md).
# Background alert monitor

Price alerts are live-market features and cannot be created or evaluated in Replay/backtest mode. Active alerts are evaluated even when the browser is closed by:

```bash
php artisan market-alerts:monitor
```

Set `MARKET_ALERTS_ENABLED=true` and optionally `MARKET_ALERT_POLL_SECONDS=5`. Run exactly one supervised worker in production. It groups alerts by exchange/category/symbol, polls Binance, Bybit, OKX, BingX, and MEXC, backs off failed markets, locks alerts while triggering, and writes one idempotent notification per alert. Cancelling an alert changes its status to `cancelled` and preserves history.

The live chart submits a check only when its current price reaches one of the user's active alert conditions. The server performs the authoritative, locked transition and returns the newly created notification; the supervised worker remains responsible while the chart is closed. Both paths share the same idempotent trigger service.

The trader navbar polls for notification updates and also receives immediate chart trigger events. A new alert displays one themed six-second toast, updates the badge, and plays the account's alert sound when enabled. Notification IDs are stored per user to prevent the immediate event and polling fallback from displaying the same alert twice. Web Push and email delivery are not included. Alert create/cancel routes use `price-alert-write`; live checks use `price-alert-check`.

# Dismissing notifications from the bell dropdown (not deleting)

The navbar bell dropdown (`AdminNavbar.jsx`/`TraderNavbar.jsx`) has a per-row dismiss (X icon, shown on hover) — this is intentionally **not** a delete. `adm_notifications` gained a nullable `dismissed_at` column (migration `2026_08_08_000007_add_dismissed_at_to_adm_notifications_table.php`); `NotificationsController::dismiss()` sets it via `->update(['dismissed_at' => now()])`, scoped to `where('adm_user_id', CommonHelpers::myId())` (`firstOrFail()` 404s if the id isn't the caller's). The row is never removed from the database.

# Deleting from the history page (this one does delete)

`NotificationsViewAll.jsx` (`GET /notifications/view-all-notifications`) has a per-row trash button and a header "Delete all". Both open one confirmation dialog first, because — unlike the navbar dismiss above — nothing comes back afterwards. This is why the page is no longer a permanent, non-erasable history.

The two record types behind the feed are deleted differently and this asymmetry is the whole point of the design:

- **`adm_notifications` rows** belong to one user, so `NotificationsController::destroy()` hard-deletes them, scoped by `where('adm_user_id', ...)` with `firstOrFail()` (another user's id 404s rather than deleting). `destroyAll()` runs `$user->notifications()->delete()`.
- **Announcements are global rows** shared by every user — deleting the row itself would remove someone else's announcement. Deleting one only records `hidden_at` on the `announcement_user` pivot for that user (migration `2026_08_29_000001_add_hidden_at_to_announcement_user_table.php`), via `syncWithoutDetaching([$id => ['hidden_at' => now()]])`, which also creates the pivot row that means "read". `viewAllNotification()` then excludes `wherePivotNotNull('hidden_at')` ids. `markAllAsRead()` uses `syncWithoutDetaching` with no pivot attributes, so it never clears an existing `hidden_at` — a deleted announcement stays deleted after "Mark all read".

The DELETE routes are declared with `/notifications/all` **before** `/notifications/{sourceType}/{id}`, and `sourceType` is constrained to `notification|announcement`, so `all` can never be read as a source type.

# Announcement rich text in the feed

Announcement `message` bodies are admin-authored HTML from the WYSIWYG editor. The history feed used to build its row text as `$item->title.' — '.$item->message`, which printed literal `<p>`/`<br>` markup in the list. `viewAllNotification()` now sends two fields per announcement row:

- `content` — plain text for the list row, via `MarketOverviewService::sanitizeExcerpt()` (the same strip-tags/entity-decode/limit used by Market Summary).
- `content_html` — the markup for the detail modal, run through `NotificationsController::sanitizeAnnouncementHtml()`, which drops `script`/`style`/`iframe`/`object`/`embed`/`form`/`input`/`button` tags, inline `on*=` handlers, and `javascript:` URLs. That is defence in depth over admin-authored content, not general-purpose input purification — the privilege gating in [Announcements](announcements.md) is still the real control.

Notification rows send `content_html: null`, and the modal falls back to rendering `content` as plain text, so only announcements are ever passed to `dangerouslySetInnerHTML`.

`getLatestNotif()` (the dropdown's feed, polled every 5–15s) and the shared `unread_notifications` Inertia prop (`HandleInertiaRequests.php`, which seeds the badge before the first poll completes) both filter `whereNull('dismissed_at')`, so a dismissed item disappears from the dropdown and its unread count immediately. **`viewAllNotification()` (the full "Notifications" page, `Pages/AdmVram/NotificationsViewAll.jsx`) deliberately does not filter on `dismissed_at` at all** — it is the permanent, complete history, and has no dismiss/delete action of its own. This split was intentional after an initial version of this feature made dismiss a hard delete on both surfaces, which the product owner explicitly rejected: dropdown "removal" should only ever declutter the transient dropdown, never make a notification unrecoverable.

`dismissed_at` had to be added to `AdmNotifications::$fillable` — it was missing initially, which made `update(['dismissed_at' => now()])` silently no-op (Eloquent mass-assignment drops unlisted attributes without erroring); confirmed both the bug and the fix directly against the database rather than assuming the `update()` call succeeded just because it didn't throw. (Note `source_type`/`source_id`/`metadata` are also listed in `$fillable` but don't exist as actual columns on this table — a separate, pre-existing drift issue, out of scope here; don't assume everything in `$fillable` is a real column when touching this model again.)

This does not apply to announcement rows in the merged `NotificationsViewAll.jsx` list (`source_type === 'announcement'`) — those are admin-authored content shared across all users via `announcement_user`, not a per-user `adm_notifications` row, so there's no dismiss/delete affordance on them at all, on either surface.

# Feedback

## Purpose

Traders submit categorized feedback and review their history. Superadmins search, prioritize, change workflow status, and respond.

**One pipeline, two front doors.** Everything below writes to `user_feedback` and lands in the same admin inbox, but it is entered from two different places because they are two different jobs:

| | Customer Support (`/feedback`) | Product Hub (chart modal) |
|---|---|---|
| Categories | `payment`, `subscription`, `account` | `chart`, `trading`, `replay`, `usability`, `performance`, `bug`, `other` |
| Opened from | A page the user navigates to deliberately | An icon in the chart toolbar, next to Watchlists |
| Extras | Transaction picker, support-chat thread | Chart context capture, image attachments, changelog tab |

`enhancement` and `feature` are **retired**: no picker offers them, but they stay in `UserFeedbackController::CATEGORIES` and in every admin filter so historical rows keep loading and stay filterable. Never remove a value from that list — removing one doesn't hide old tickets, it makes them unfilterable and drops them from the analytics breakdown.

| Route/file | Responsibility |
|---|---|
| `GET /feedback`, `/feedback/items` | User page/history (history shows **all** their tickets, both doors) |
| `POST /feedback/items` | Create feedback — accepts JSON, or multipart when images are attached |
| `GET /feedback/attachments/{attachment}` | Streams one attachment, owner or superadmin only |
| `GET /admin/feedback*` | Admin inbox/data |
| `PUT /admin/feedback/items/{feedback}` | Admin workflow update |
| `GET /changelog-feed` | `AnnouncementsController::getChangelog()` — JSON for the Hub's Changelog tab |
| `UserFeedbackController.php` | Validation, ownership, admin enforcement, attachment storage |
| `UserFeedback.php` | User/responder/subscription-request/attachment relationships |
| `UserFeedbackAttachment.php` | One stored image |
| `Components/Feedback/ProductHubModal.jsx` | The Hub modal (Suggestion / Changelog / My Suggestions) |
| `Components/Market/MarketChart/FullscreenChartHeader.jsx` | The chart-toolbar button that opens it |
| `Pages/Feedback/Index.jsx`, `AdminIndex.jsx` | User/admin UI |
| `GET /subscription-requests/mine` | `ReplayAccessController::myRequests()` — the current user's own payment history for the picker below |

## Flow

1. `Pages/Feedback/Index.jsx` is a two-step form, not one long page: step 1 is the category grid; picking a card immediately advances to step 2 (title/details), with a "Change category" link back to step 1. This exists specifically so the page doesn't front-load every field at once — see [System error logs and payment activity](system-error-logs-and-payment-activity.md) for the related admin-side modules this ties into.
2. When the chosen category is `payment`, step 2 also shows two extra selects before the free-text fields: "Which payment is this about?" (fetched from `/subscription-requests/mine`, scoped to the authenticated user, excluding `creating`-status rows) and "What happened?" (`duplicate` / `payment_error` / `access_not_reflected` / `other`). Both are optional — a user unsure which transaction it was, or with no payment history yet, can still submit. Every other category skips these and only ever had Title + Details.
3. Controller assigns the authenticated user and initial workflow values; `subscription_request_id` is validated to belong to that same user (`Rule::exists(...)->where('adm_user_id', ...)`) and is forced to `null` server-side whenever the category isn't `payment`, so a crafted payload can't attach an unrelated category to a transaction.
4. User history queries only that user's rows, eager-loading a thin `subscriptionRequest` summary (id/plan/amount/currency/status) for display.
5. Admin index filters all rows and returns responder/user context, plus that same `subscriptionRequest` summary and `paymentReasonCode`; the admin detail pane surfaces both as a highlighted chip with a "View activity history" link straight into `/admin/payment-activity?subscription_request_id=...` (see [System error logs and payment activity](system-error-logs-and-payment-activity.md)), so an admin reviewing a refund request doesn't have to go hunting for the transaction manually.
6. Admin update stores status, priority, response, responder, and response time as implemented.
7. `adminIndex()` now returns `paginate(30)` instead of a flat `limit(250)->get()`, so the inbox no longer silently drops anything past the 250th matching ticket — `Pages/Feedback/AdminIndex.jsx` reads `feedback.data` plus `current_page`/`last_page`/`total` and shows a page-N-of-M footer under the inbox list once there's more than one page. The user-facing `index()` (a person's own submissions) intentionally stays a plain `limit(100)` — no admin needs to page through their own ticket history.

## Product Hub

`ProductHubModal.jsx` is one portaled shell (`z-[10020]`, matching `FeedbackChat.jsx`) over three views: the Suggestion form, the Changelog tab, and My Suggestions. It is mounted twice — from `FullscreenChartHeader.jsx` with the chart's own `chartTheme` and chart context, and from `Pages/Feedback/Index.jsx`'s "Have a product idea or found a bug?" card with neither. The component takes an `open` prop and returns `null` when closed *after* all its hooks have run, so a half-typed draft and any loaded list survive closing and reopening without a refetch.

**Summary field.** The reference design this was modelled on has no title input; this one does, because `AdminIndex.jsx` and the analytics report both list rows by `title`. A title derived from 1500 characters of prose makes the admin queue unreadable.

**Chart context.** A submission from the chart carries `{symbol, exchange, category, timeframe, replayMode}` in the `context` JSON column, shown to the user as a chip before they submit and to the admin as a chip above the description. `UserFeedbackController::normalizeContext()` whitelists against `CONTEXT_KEYS`, accepts both a JSON string (multipart) and an array (JSON), caps each value at 40 characters, and drops everything else — a crafted payload cannot stuff arbitrary data into that column.

**Attachments** are images only (`png`/`jpg`/`webp`, ≤4MB, ≤4 per ticket) and are stored on the **private `local` disk**, never `public`. `public/storage` is a live symlink, so anything on the `public` disk is fetchable at a guessable `/storage/<path>` URL with no authentication at all. Payment proofs accept that; a chart screenshot routinely shows account balance and open positions and must not. Files are served only through `GET /feedback/attachments/{attachment}`, behind the same owner-or-superadmin check as the rest of this controller, with `X-Content-Type-Options: nosniff`. A `deleting` hook on `UserFeedback` removes the files — the FK cascade only clears rows.

The Hub builds a real `FormData` instance and never sets `Content-Type` itself; see [Announcements](announcements.md) for the outage caused by declaring `multipart/form-data` on a plain object.

## Maintenance

- **Three places hardcode the category list independently of the controller**, and an omission in any of them fails silently rather than erroring: `FeedbackReportController::CATEGORIES` (drops the category from the analytics breakdown), `Pages/Reports/FeedbackAnalytics.jsx`'s label map (renders the raw slug), and `Pages/Feedback/AdminIndex.jsx`'s filter array (makes it unfilterable). Adding a category means editing all four.
- Attachments must stay on the `local` disk. Moving them to `public` for convenience would publish every screenshot to anyone who can guess a path.
- Do not accept `adm_user_id` or responder identity from normal users.
- Validate enum-like status/priority/category/payment-reason-code values and text lengths.
- Treat page URLs and user text as untrusted output.
- Add notifications deliberately if the response workflow later requires them.
- The admin overview summarizes lifetime, rolling-30-day, open, high-priority, and awaiting-response counts and limits its recent list to five requests.
- `subscription_request_id` ownership must always be re-validated server-side (never trust a user-supplied id belongs to them) — this is exactly the kind of field a malicious payload would try to point at someone else's transaction.

## Verification

- Create validation and throttling.
- User sees only own history.
- Non-admin cannot reach admin data/actions.
- Search/filter/update and response persistence.
- Step 1 → step 2 transition preserves the chosen category; "Change category" returns to step 1 without losing the ability to pick a different one.
- Selecting `payment` loads the user's own transactions only (not another user's); a `subscription_request_id` belonging to a different user is rejected by the `store` validation.
- Choosing a non-payment category ignores/clears any stray `subscription_request_id`/`payment_reason_code` in the payload.
- Admin inbox returns the standard paginator shape; non-superadmin requests are rejected before the query runs. Automated coverage: `tests/Feature/AdminFeedbackPaginationTest.php`.
- Product Hub coverage lives in `tests/Feature/ProductHubFeedbackTest.php`: new categories accepted, unknown `context` keys dropped, retired categories still valid, files on `local` and absent from `public`, the fifth/non-image/oversize file rejected, the download route's owner-superadmin-stranger matrix, and disk cleanup on delete.
- **These suites skip entirely without `pdo_sqlite`**, which is not enabled in the default Laragon PHP build — they silently reported green for months while never running. Run them with the extension forced on: `php -d extension=php_sqlite3.dll -d extension=php_pdo_sqlite.dll vendor/phpunit/phpunit/phpunit --filter=Feedback` (`php artisan test` spawns a subprocess that does not inherit `-d`).
- The admin inbox's priority ordering uses a portable `CASE` expression, not MySQL's `FIELD()`. `FIELD()` has no sqlite equivalent, so it made the paginated-inbox test unrunnable on the test driver; the `CASE` keeps `FIELD()`'s exact semantics including its "unrecognised value sorts first" behaviour.

Related: [Roles](roles-privileges-menus.md), [Notifications](price-alerts-and-notifications.md), [System error logs and payment activity](system-error-logs-and-payment-activity.md).
# Support conversations

Payment and subscription feedback supports an asynchronous, text-only thread through `GET` and `POST /feedback/items/{feedback}/messages`. Access is limited to the ticket owner and active superadmins. Reading marks messages from the other party as read; sending is disabled for completed and declined tickets. Other categories continue to use the single admin-response field, and historical responses remain visible as legacy team responses. Open conversations poll every ten seconds only while the browser tab is visible.

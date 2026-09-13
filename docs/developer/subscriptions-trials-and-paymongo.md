# Subscriptions, Trials, and PayMongo

## Purpose

Replay/backtesting access comes from a one-time seven-day trial or paid duration. Paid checkout is hosted by PayMongo; browser redirects never grant entitlement by themselves.

| File | Responsibility |
|---|---|
| `ReplayAccessController.php` | Access, trial, plans, user/admin pages, checkout endpoints |
| `PayMongoCheckoutService.php` | Create/reconcile/process checkout |
| `PayMongoClient.php` | Provider HTTP API and availability gates |
| `PayMongoSignatureVerifier.php` | Webhook signature/timestamp validation |
| `SubscriptionEntitlementService.php` | Validate paid resource and extend access idempotently |
| `PayMongoWebhookController.php` | Public webhook handler |
| `ProcessPayMongoWebhookEvent` (job) | Applies a paid/refunded/dispute checkout event in the background |
| `SubscriptionPlan/Request/Message.php` | Plans and transaction/history records |
| `SubscriptionModal.jsx`, `Pages/Subscriptions/*` | User/admin UI |
| `Components/Subscriptions/PaymentActionModal.jsx` | Shared refund/restore-access confirmation modal (admin) |
| `app/Services/Payments/PaymentActivityLogger.php`, `Pages/Subscriptions/ActivityLog.jsx` | Payment lifecycle audit trail — see [System error logs and payment activity](system-error-logs-and-payment-activity.md) |
| `SendSubscriptionRenewalReminders` (command) | Notifies users before paid access expires |

## Routes and flow

1. `GET /replay-access` returns trial/paid availability without starting the trial.
2. `POST /replay-trial/activate` atomically starts the one-time trial.
3. `POST /subscription-checkouts` first calls `PayMongoCheckoutService::expireStalePending()` (see below), then validates a server-owned plan and UUID submission token.
4. The service snapshots amount, currency, duration, user, mode, and provider checkout identity.
5. PayMongo hosts payment. Return route/status polling may reconcile, but only verified provider-paid data activates access.
6. `POST /webhooks/paymongo` verifies the raw body signature, deduplicates on `provider_event_id`, and for a paid checkout event dispatches `ProcessPayMongoWebhookEvent` before acknowledging — the HTTP response no longer waits for `SubscriptionEntitlementService::activate` to run.
7. Paid duration extends from the later of current expiry or activation time.

## Abandoned checkouts (no orphaned duplicates)

`SubscriptionModal.jsx` generates a fresh `submission_token` (a client-side UUID) every time it mounts — the token exists purely to make a *single* click/double-click idempotent (`PayMongoCheckoutService::create()` returns the existing row for a repeated token), not to recognize a purchase intent across page loads. This meant that a user who clicked "Continue", got redirected to PayMongo, hit the browser back button, and then selected a plan again would always mint a brand-new `SubscriptionRequest` row — the new token had never been seen before, so `create()` had no way to know it was "the same" purchase. Repeating this left an unbounded number of orphaned `pending` rows, each with a `provider_checkout_url` the user could never get back to (it's never re-shown anywhere).

`PayMongoCheckoutService::expireStalePending(AdmUser $user)` fixes this and is called at the top of `ReplayAccessController::createCheckout()`, before the existing "already has active access" guard (so if a stale row turns out to have actually been paid, that guard now catches it and blocks a genuinely duplicate purchase). For every existing `pending` PayMongo row belonging to the user:

- No `provider_checkout_id` yet (failed before a session was even created) → marked `expired` locally, no provider call needed.
- Has a `provider_checkout_id` → reconciled with PayMongo first (reusing the existing `reconcile()` → `applyCheckoutResource()` path), so a payment that actually succeeded or failed/expired at the provider in the meantime gets its real outcome applied normally (including activation, if paid) — nothing is ever blindly overwritten without checking truth at the source.
- Only if PayMongo still reports it open (`reconcile()` leaves it `pending`) is it force-marked `expired` locally, with a `checkout_expired` activity log entry noting it was abandoned in favor of a new attempt. The PayMongo-side session itself is left alone (harmless — it simply sits unused until it expires on PayMongo's own schedule); only the local record and its influence on entitlement/display change.

This was chosen over resuming the old checkout session (returning its still-live `checkout_url` again) for simplicity: no need to match "same plan re-selected" against the old row, and stale rows don't accumulate either way.

## Payment progress feedback

- `SubscriptionModal.jsx` shows a small "1. Choose plan → 2. Redirecting to checkout / Activating" step indicator once a plan action is in flight (`saving`), so the moment between clicking and the browser navigating to PayMongo (or trial activation completing) isn't a silent gap.
- `checkoutReturn()` now redirects to `subscription.index` with both `payment` (status) and `ref` (the `SubscriptionRequest` id) query parameters. `Pages/Subscriptions/UserIndex.jsx` uses `ref` to auto-poll `GET /subscription-checkouts/{id}/status` every 4 seconds (up to 15 attempts, ~1 minute) whenever it lands with `payment=pending` — the existing manual "Check status" button remains for the case a user leaves and comes back later, or the auto-poll window lapses. A `PaymentStepper` component (Payment → Processing → Complete) visualizes progress: step 3 renders a green check for `paid` or a red X for anything else once resolved.

The webhook only synchronously rejects an unusable/invalid payload, a duplicate already `processed`/`ignored`/`unhandled`, a livemode mismatch, or a failure to enqueue the job (any of these still return a non-200 so PayMongo retries). Once the job is enqueued the webhook always acknowledges `200`, even if the job itself later fails — a job failure marks the event `failed` and relies on the existing `payments:reconcile-paymongo` scheduler (every 5 minutes, polls PayMongo directly for `pending` payments) rather than PayMongo's own webhook retry to recover. This is safe because `SubscriptionEntitlementService::activate` is already idempotent (locks the row, short-circuits once `status === 'paid'`).

## Refunds, disputes, and access revocation

Money-correctness gap, closed: previously the webhook only ever processed `checkout_session.payment.paid` — a refund or chargeback happening in PayMongo produced zero effect in the app, and there was no code path anywhere (webhook, admin, or scheduled) that could shorten a user's already-granted `replay_access_ends_at`. A refunded/charged-back user kept full paid access for the entire original duration. This is now handled end to end:

- **Webhook**: `PayMongoWebhookController::SUPPORTED_EVENT_TYPES` also recognizes `payment.refunded` and `dispute.updated`, routed by `ProcessPayMongoWebhookEvent`'s `match` to `PayMongoCheckoutService::processRefundResource()` / `processDisputeResource()`. **The exact event-type strings are best-guess, not confirmed against PayMongo's live webhook catalog** (`payment.refunded` moderate confidence; `dispute.updated` low confidence — PayMongo may not expose chargebacks via webhook at all, only via its dashboard). Verify both against PayMongo's dashboard webhook-subscription UI or official API reference before relying on this in production. Any *other* webhook event type whose name matches `/refund|dispute|chargeback/i` is stored with `status = 'unhandled'` (distinct from the generic `'ignored'` bucket used for genuinely irrelevant event types) and reported via `report()`, so a wrong guess about the real event name produces a visible, queryable signal instead of silently never firing. If a real payload's resource shape doesn't match either of the two guessed shapes `extractPaymentId()` checks for (the resource itself being a `type: payment` object, or a `attributes.payment_id` field), the event fails cleanly with a legible `result_message` rather than mis-processing.
- **`SubscriptionEntitlementService::revoke()`**: the counterpart to `activate()`. It **fully clears** the user's `replay_access_ends_at` (sets it to a past instant) rather than subtracting the refunded purchase's `duration_days` from it. Reasoning: `activate()` maintains a single merged access cursor per user, not a per-purchase ledger, so if a user's purchases have a gap (one fully lapses, then a later unrelated purchase starts fresh), subtracting a duration can wrongly claw back a *different, unrefunded* purchase's legitimate remaining access — a full clear is pinned to the moment of revocation instead of arithmetic derived from a duration that may be unrelated to the current cursor. This intentionally over-revokes in the rare case another unrefunded purchase is still active; that case is logged (`Log::warning`, matched on "over-revoked") rather than silently accepted, so it surfaces for manual review. `revoke()` is idempotent (no-op if already `refunded`) and creates an `AdmNotifications` row the same way `activate()` does.
- **Admin-triggered refund**: `POST /admin/subscriptions/{subscriptionRequest}/refund` (superadmin-only, same middleware as the existing `reconcile` action) → `ReplayAccessController::adminRefund()` → `PayMongoCheckoutService::refund()`, which calls PayMongo's refund API (`PayMongoClient::refundPayment()`) and, on an accepted response (`pending` or `succeeded` — refunds may be asynchronous at the provider), calls `revoke()`. On any failure the transaction reverts to `status = 'paid'` with `provider_status_message` explaining what happened — it is never left stuck on the transient `'refunding'` lock status. **The refund request/response body shape and the accepted `reason` enum values are best-guess** (`duplicate | fraudulent | requested_by_customer | others`, mirroring Stripe's vocabulary PayMongo is known to follow) — confirm against PayMongo's live API reference or a real test-mode call before relying on this in production. Refunds are full-amount only; there is no partial-refund UI.
- **Admin UI**: `Pages/Subscriptions/AdminIndex.jsx` gained a status color badge (previously plain text — the color `tones` map, now shared via `Components/Subscriptions/statusTones.js` with `UserIndex.jsx`, includes a new `refunded` tone) and a "Refund" button, shown only on `provider === 'paymongo' && status === 'paid'` rows. Clicking it opens `Components/Subscriptions/PaymentActionModal.jsx` — a theme-aware (dark/light) React modal matching this feature area's existing modal shell (`PaymentChat.jsx`, `SubscriptionModal.jsx`: `fixed inset-0` backdrop, `rounded-2xl border shadow-2xl` card) rather than SweetAlert2 or the older, heavier `Components/Modal/Modal.jsx`. It states the exact amount and customer, requires a reason code and a free-text internal note (minimum 10 characters, validated client-side in the component itself) before the real refund request fires. The same component is reused for the "Restore access" action below (`tone="success"`, a `daysDefault` numeric field instead of the reason-code select) — one component parameterized by `icon`/`tone`/`reasonCodes`/`daysDefault`/copy props, since both actions share an identical shape (warning copy, optional select, optional number field, always a reason textarea, cancel/confirm footer). Confirming closes the modal immediately and the actual request/success/error notice follows the same pattern as before (the page-level `notice` banner), unchanged from the SweetAlert2-era behavior. `Pages/Subscriptions/UserIndex.jsx` shows the same `refunded` badge and a "Refunded {date}" line; it deliberately does not show `refund_reason` (the admin's internal note) to the customer — `ReplayAccessController::paymentPayload()` only includes `refund_reason` when `$includeUser` is true (the admin payload), never in the user's own payload.
- **Dispute webhook revokes on any dispute-shaped event, not only a confirmed loss.** This is conservative by design (silently keeping a liability alive is worse than a visible, loggable over-revoke), but it means a merchant who *wins* a dispute currently has no admin action to restore the access that was pre-emptively revoked — there is no "grant N days" admin action in this codebase. That would need to be built separately if disputes-later-won turn out to be common.
- **A refunded row automatically drops out of revenue reporting with zero code change**: `DashboardController`'s lifetime/30-day revenue sums filter `where('status', 'paid')`, so a `refunded` status is excluded for free. Worth a manual smoke-test checkpoint after any real refund (lifetime/30-day revenue should visibly decrease by the refunded amount), not something to "fix" if seen — it's intended.
- **Refund timing disclosure**: `revoke()`'s `AdmNotifications` content and the Terms of Service refund clause (`Pages/Public/TermsOfService.jsx`, section 4) both state refunds are typically credited within 2-3 business days. This applies uniformly to all three `revoke()` callers (admin refund, PayMongo refund webhook, PayMongo dispute/chargeback webhook) since there's a single content string; it's phrased generically enough to cover a chargeback reversal too, even though that path doesn't go through BacktradeLab's own refund processing. No transactional email exists for this yet — only the in-app notification.
- **Restoring over-revoked access (e.g. a double-payment refund)**: `SubscriptionEntitlementService::restoreAccess()` is the counterpart admin action for the over-revoke case described above — a user has two payments, one is refunded as a duplicate/error, `revoke()` fully clears `replay_access_ends_at` per its documented design, but the user's *other*, unrefunded payment should still keep them active. `restoreAccess()` extends `replay_access_ends_at` from the later of now or the user's current value by an admin-chosen number of days, does not touch the refunded transaction's `status`/refund fields (it only appends a timestamped, attributed note to that transaction's `admin_notes` for audit trail), and creates an `AdmNotifications` row the same way `activate()`/`revoke()` do. Exposed via `POST /admin/subscriptions/{subscriptionRequest}/restore-access` (superadmin-only, same middleware as `refund`), validated `days` (1–3650) and `reason` (min 10 chars). `Pages/Subscriptions/AdminIndex.jsx` shows a "Restore access" button only on `refunded` rows, via the same `Components/Subscriptions/PaymentActionModal.jsx` used by the refund button (days pre-filled with that transaction's own `duration_days`, editable; reason required). This is a manual, admin-judgment action, not automatic: the app never infers on its own that an over-revoke happened for a specific amount of days.

## Admin transactions table: search + pagination

`ReplayAccessController::adminIndex()` (`GET /admin/subscriptions/items`) accepts a `search` param matching `payment_reference`, `provider_checkout_id`, or the paying user's `name`/`email` (`orWhereHas('user', ...)`), in addition to the existing `provider`/`status`/`mode` filters, and returns Laravel's standard paginator shape (`data`/`current_page`/`last_page`/`total`) from `paginate(30)` — this was already paginated server-side, but `Pages/Subscriptions/AdminIndex.jsx` previously only read `.data` and discarded the pagination metadata, so anything past the first 30 rows was silently unreachable from the UI. The page now tracks `page`/`meta` state and renders a page-N-of-M footer with prev/next controls once `last_page > 1`, debounces reloads on every filter/search keystroke (250ms), and resets to page 1 whenever a filter changes.

## Renewal reminders (no auto-renewal)

Every paid plan is a one-time purchase; there is no recurring charge and therefore nothing to "cancel" — access simply lapses at `replay_access_ends_at` unless the user manually checks out again. To reduce surprise lapses, `subscriptions:send-renewal-reminders` runs daily (`app/Console/Kernel.php`, `dailyAt('09:00')`, `withoutOverlapping()`) and finds users where `replay_access_ends_at` falls within the next `SUBSCRIPTION_RENEWAL_REMINDER_DAYS` days (default 3, `config('services.subscriptions.renewal_reminder_days')`) and `renewal_reminder_sent_at` is still null. For each match it creates an `AdmNotifications` row (`type => 'subscription_reminder'`, naming the user's most recently paid plan when known, linking to `/subscription`) and sets `renewal_reminder_sent_at`, so the same expiry cycle is never re-notified. `SubscriptionEntitlementService::activate` clears `renewal_reminder_sent_at` back to null whenever it extends access, so the next expiry cycle can remind again. This is in-app notification only — no email — since the app's only real email flow today is password reset (`App\Mail\Mailer`), and `.env.example` still points `MAIL_HOST` at a local dev catcher, not a confirmed production sender.

Checkout creation is guarded by `PAYMONGO_ENABLED`, mode/key compatibility, eligible methods, and the explicit live-production gate.

For local development only, `PAYMONGO_TEST_BYPASS_CAPABILITIES=true` skips the merchant-capability lookup when `PAYMONGO_MODE=test` and the application environment is not production. Checkout still uses PayMongo's real test API, which may reject methods that the account cannot use. The bypass never applies to live mode or production and must be disabled after PayMongo enables the account capabilities.

## Data and security

- `subscription_plans`: server-controlled selectable products.
- `subscription_requests`: immutable transaction snapshot plus provider/status fields. Also carries refund fields: `provider_refund_id`, `refunded_at`, `refund_amount`, `refund_status` (PayMongo's own pending/succeeded/failed, audit only), `refund_reason` (admin-only internal note, never sent to the user payload). `status` is an unconstrained string column (no DB enum/check constraint) — `'refunded'` and the short-lived transient lock state `'refunding'` are just new values, no migration was needed for the column itself.
- `pay_mongo_webhook_events`: webhook deduplication/audit; now also stores the raw `resource` payload (JSON) so the queued job can process it without needing the original HTTP request. `status` also accepts `'unhandled'` (a refund/dispute-shaped event type with no coded processor yet — distinct from `'ignored'`, which is for genuinely irrelevant event types). Two near-simultaneous deliveries of the same `provider_event_id` can both pass `firstOrCreate()`'s initial read before either insert commits; the DB-level unique index lets only one insert through, and `PayMongoWebhookController` catches the resulting `UniqueConstraintViolationException` and re-fetches the winning row rather than letting it 500 back to PayMongo.
- `SubscriptionRequest` and `SubscriptionPlan` both declare an explicit `$fillable` allowlist (not `$guarded = []`) since they hold financial transaction state (`amount`, `status`, `livemode`, `paid_at`). Every current write site already passes explicit, server-trusted arrays — never raw request input — so this is a safety net against a future call site accidentally mass-assigning client input, not a fix for an active bypass.
- `adm_users`: trial and paid access timestamps, plus `renewal_reminder_sent_at` (cleared on each renewal so the reminder command fires again next cycle).
- Legacy proof/message download routes remain authorized for preserved historical data.

Never expose secret/webhook keys to React. Never trust amount, duration, paid status, or livemode from the browser.

**The merchant/business name shown on PayMongo's hosted checkout page, and on PayMongo's own `send_email_receipt: true` receipt email, is not controlled by anything this app sends.** `PayMongoClient::createCheckout()` sends `billing.name` (the *buyer's* name, shown as "billed to"), `line_items[].name` (the plan name, e.g. "Pro Replay Access"), and `description` — there is no `statement_descriptor` or merchant-name field in the request at all. Both surfaces are driven entirely by the PayMongo account's own Business Profile configured in the PayMongo Dashboard. If either shows the wrong name (a person's name, a placeholder, anything other than the intended brand), that has to be changed in the PayMongo Dashboard's business/account settings — there is no code path to fix it from this repo.

Customer-facing copy (`SubscriptionModal.jsx`, `Pages/Subscriptions/UserIndex.jsx`, and the admin page's header text) intentionally avoids naming PayMongo — "secure checkout" / "payment provider" / "online" in place of the vendor name. This is deliberate, not an inconsistency: keep new user-facing strings in this area generic too. The checkout CTA in `SubscriptionModal.jsx` reinforces this with a `Lock` icon and "Continue securely with {plan}" (was "Continue with {plan}"), and `UserIndex.jsx`'s header subtitle reads "...one-time secure payment transactions" — both are copy-only, no behavior change. Privacy Policy and Terms of Service still name PayMongo explicitly, since disclosing the third party that processes payment data is a legal requirement there, not just UI copy — do not remove it from those two pages. The admin transactions table/filter (`AdminIndex.jsx`) still uses the literal `paymongo` value for filtering and the `provider` column, since that's an internal operational tool matching a real backend enum, not customer-facing branding.

The admin overview reports lifetime and rolling-30-day verified PHP revenue, paid counts, pending sessions, and failed/expired sessions. Revenue includes only `status=paid`, uses `paid_at` for the rolling window, and does not mix currencies.

Each subscription plan owns a display-only `features` JSON list. Administrators can add, remove, edit, and reorder up to eight feature labels; labels are trimmed, deduplicated case-insensitively, and limited to 80 characters. These labels describe the plan in the compact selection modal and do not alter Replay entitlement or PayMongo verification. The modal keeps plan features inside each plan card and uses a viewport-bounded scrolling fallback only when the available screen is too short.

The admin pricing editor follows the shared application theme for cards, fields, borders, actions, loading text, and save feedback in both dark and light modes.

**`SubscriptionModal.jsx` hoists its teal accent into one `accent` const rather than repeating a literal at each use site.** The modal already branched `shell` and `surface` on `dark`, but its accent was a hardcoded `text-[#5eead4]` in six places — the "Replay access" eyebrow, each plan's tier-name label and icon chip, the card CTA row, and the upgrade/trial notice banners. Teal-300 reads fine on the dark shell and drops to roughly 1.3:1 on the light one, where `shell` is white and `surface` is `slate-50`, so light now uses `text-teal-700` (with `bg-teal-100`/`bg-teal-50` behind the chip and banners). The plan-features divider was `border-white/5`, invisible on light, and now branches to `border-slate-200`. Add new accented elements through `accent`, not a fresh literal. This is one instance of a wider sweep — see [Trading chart](trading-chart.md) for the same fix across the chart chrome and the two traps behind it.

## Verification

- Trial activates once under concurrent clicks.
- Weekly/monthly/yearly active and priced plans.
- Duplicate submission token returns the same transaction.
- Success, failure, abandonment, delayed/duplicate/missed webhook.
- A running queue worker is required for paid webhooks to actually apply — without one, `pay_mongo_webhook_events` rows stay `received` and only the 5-minute reconciliation command grants access.
- Signature age/body validation and provider amount/currency/mode match.
- Test capability bypass is opt-in, avoids the capability request, and cannot activate in live mode or production.
- Admin reconciliation and scheduler command.
- Renewal reminder fires once per expiry cycle inside the configured window, not before it and not again after renewal resets `renewal_reminder_sent_at`.
- Refund/dispute webhooks: a `payment.refunded`/`dispute.updated` event is recognized and queued (not `ignored`); an unrecognized-but-refund/dispute-shaped event type lands as `status = 'unhandled'`, not `'ignored'`; a genuinely irrelevant event type still lands as `'ignored'`; a duplicate delivery of any of these is not reprocessed.
- A `UniqueConstraintViolationException` from a raced duplicate `provider_event_id` insert is caught and resolved to the existing row instead of surfacing a 500 to PayMongo.
- Admin refund: only appears on `paid` PayMongo rows; the confirmation dialog blocks submission under a 10-character reason; a successful refund calls `revoke()` (access cleared, notification created, admin dashboard revenue drops accordingly); a provider failure reverts the row to `status = 'paid'` with `provider_status_message` set and leaves access untouched — never stuck on `'refunding'`; a non-`paid` row is rejected before any PayMongo API call.
- `revoke()` is idempotent, and its "fully clear rather than subtract" behavior holds even when the refunded purchase's own window had already lapsed before a later, unrelated, still-active purchase was made.
- Non-superadmin requests to the refund route are rejected before reaching the service.
- Restore access: extends from now when access already lapsed, and from the existing future `replay_access_ends_at` (not from now) when access is still active; never mutates the referenced transaction's `status`/refund fields; a short (<10 char) reason or non-superadmin request is rejected before the service runs.
- `expireStalePending()`: a still-open pending checkout is force-marked `expired` locally with a logged activity entry; a checkout the provider now reports as paid is activated (not expired) and access extended; a row with no `provider_checkout_id` is expired without any provider HTTP call.
- Admin transactions search: matches by user email; returns the standard paginator shape (`data`/`current_page`/`last_page`/`total`); non-superadmin rejected before the query runs.
- Automated coverage lives in `tests/Unit/SubscriptionEntitlementServiceRevokeTest.php`, `tests/Unit/SubscriptionEntitlementServiceRestoreAccessTest.php`, `tests/Unit/PayMongoCheckoutServiceRefundTest.php`, `tests/Unit/PayMongoCheckoutServiceExpireStalePendingTest.php`, `tests/Feature/PayMongoWebhookEventTypesTest.php`, `tests/Feature/AdminSubscriptionRefundRouteTest.php`, `tests/Feature/AdminSubscriptionRestoreAccessRouteTest.php`, and `tests/Feature/AdminSubscriptionsSearchTest.php`. These build an isolated in-memory SQLite schema (same pattern as `AdminOperationsDashboardTest.php`) and require the `pdo_sqlite` PHP extension — they self-skip with a clear message where it isn't installed, matching this repo's existing convention for DB-isolated tests, rather than mutating the real configured database.

Related: [Replay](replay-and-progress.md), [Deployment](deployment-and-production.md), [System error logs and payment activity](system-error-logs-and-payment-activity.md).
# User-facing payment history defaults to completed only

`Pages/Subscriptions/UserIndex.jsx`'s "Payment history" section defaults to showing only `paid` and `refunded` rows — the transactions where money actually moved. `pending`/`failed`/`expired`/`creating` attempts (including ones newly marked `expired` by `expireStalePending()` above) are hidden behind a "Show N incomplete attempts" toggle rather than deleted or hidden permanently; nothing about the underlying data changes, only what's visible by default. This exists because once abandoned checkouts are cleaned up automatically instead of accumulating forever, a user who tried a few times before succeeding would otherwise see every attempt clutter their history — the admin's `Pages/Subscriptions/AdminIndex.jsx` is unchanged and still shows every row by default (with its existing status filter), since admins need full visibility for support/troubleshooting.

# Active-access plan display

`/replay-access` returns `activeAccess` with `kind`, paid `plan` when applicable, and `endsAt`. An active trial or paid entitlement makes the plans modal read-only and the active trial/plan is highlighted. Checkout creation enforces the same rule with HTTP 409 until access expires. PayMongo verification, reconciliation, and webhook entitlement rules are unchanged.

# Weekly plan / free trial CTA

Trial activation success/failure is surfaced through the app-wide toast (`Context/ToastContext.jsx`'s `useToast()`/`handleToast(message, 'success' | 'error')`), not the modal's own inline status box — both usages of `SubscriptionModal.jsx` close the modal immediately on activation, so a message set only in local state would never be seen. The inline red status box in the modal remains for errors that keep the modal open (checkout start failure, plan/availability load failure). Paid checkout completion already has its own durable confirmation: PayMongo always returns to `/subscription?payment=paid|failed|cancelled`, and `Pages/Subscriptions/UserIndex.jsx` renders a persistent banner from that query param — no toast needed there since the page itself is the confirmation.

The paid `weekly` plan and the free trial are both 7 days, which reads as confusing side by side in `SubscriptionModal.jsx`: the free-trial banner and the paid plan grid are independent UI, so a user could pay for `weekly` while an unused free trial of the same length sits above it. To avoid that, the modal computes `weeklyTrialEligible = selected?.code === 'weekly' && trialAvailable && !readOnly`. While true, the bottom CTA reads "Activate free trial" and calls `activateTrial()` instead of `startCheckout()` (and the adjacent "Secure checkout" copy swaps to trial copy); once the trial has been used or expired (`trialAvailable` false) or paid/trial access is already active (`readOnly`), selecting `weekly` behaves like any other plan card — "Continue with Weekly" via the normal paid checkout flow. The standalone trial banner (shown whenever `trialAvailable || activeAccess?.kind === 'trial'`, independent of which plan card is selected) is unchanged and still offers a one-click "Activate free week" regardless of plan selection.

# Subscription tiers

Plans used to differ only in `duration_days` and `price`; every one of them granted the same single `replay_access_ends_at` entitlement, and the `features` JSON was display-only copy that could say anything. Plans now carry a tier.

| Plan | Duration | Tier | Level |
|---|---|---|---|
| Free trial | 7 d | Elite preview | 3 |
| Weekly | 7 d | Starter | 1 |
| Monthly | 30 d | Pro | 2 |
| Yearly | 365 d | Elite | 3 |

`config/subscription_tiers.php` is the single source of truth: it maps each capability name to the minimum tier that unlocks it, holds per-tier creation quotas, and names the tiers. Both enforcement (`EnsureReplayAccess`, the controllers' quota checks) and display (the plans modal's feature list, via `ReplayAccessController::plans()`) read from it, so the advertised capabilities cannot drift from the enforced ones. Retuning which tier owns a capability is a one-line edit there — no migration, no route change, no frontend rebuild.

`subscription_plans.tier_level` is server-controlled and never accepted from a customer-facing request. `adm_users.replay_access_tier` records what the user's current paid window grants; `replay_access_ends_at` still decides *whether* access is live, and the tier decides *how much*. A live window with a null tier reads as Starter, so any row predating the column degrades rather than losing access.

`SubscriptionTierService` resolves all of this. Superadmins resolve to the maximum tier **inside the service**, not at each call site, so a controller doing payload-level gating cannot forget the bypass `EnsureReplayAccess` has always had. `requiredTier()` returns null for an unknown capability name and every caller treats that as unreachable — a typo in a route's middleware argument locks the route rather than silently opening it.

## The trial grants Elite

The paid Weekly plan and the free trial are both seven days, which the modal already worked around by swapping its CTA when Weekly is selected. If the trial granted Starter, paying for Weekly would buy nothing the user just had free. Granting Elite makes Weekly legible as the cheapest way back in after the preview lapses, and makes Elite's value concrete rather than a bullet list.

While a trial and a paid window are both live, the **higher tier wins** — so converting mid-trial never reads as a downgrade for the overlap.

## Purchase guard: one condition, two cases

`createCheckout()` permits a checkout when either holds:

- the user has **no live paid window** (`replay_access_ends_at` null or past), regardless of whether a trial is running; or
- the requested plan's `tier_level` is **strictly greater** than the user's current paid tier.

Phrasing the guard against the *paid* window rather than against access generally is what keeps the two cases from colliding. Previously an active trial 409'd every purchase, so a user convinced on trial day two could not pay until day seven and had to return on their own initiative — a conversion leak the Elite preview only sharpens. But once a paid window exists, including one queued behind a still-running trial, the strictly-higher rule governs every subsequent purchase, so a converted trial user cannot stack a lower tier over a higher one and leave `replay_access_tier` holding the wrong value.

## Activation windows

`activate()`'s start boundary is the latest of now, `replay_access_ends_at`, and `replay_trial_ends_at` — it previously considered only the first two. A plan bought on trial day two therefore **queues behind the trial** instead of overlapping it: the trial is never shortened, and the paid window still runs its full duration from the moment the trial ends. An upgrade over a live paid window works the same way, so remaining paid days carry over. There is no proration, no credit, and no PayMongo refund call.

The tier written is `max(current live paid tier, purchased tier)`. The checkout guard normally guarantees the purchased tier is the higher one; `max()` covers the paths that bypass that guard — admin reconciliation and the five-minute PayMongo poller — where an older, lower-tier payment landing late could otherwise demote a user.

**Tier is snapshotted onto `subscription_requests.tier_level` at checkout**, alongside the amount/currency/duration this table already snapshots. Without it, activation would resolve the tier by plan code at webhook time, so a plan retuned or deactivated between checkout and payment would grant something other than what the customer bought. Rows predating the column fall back to a plan lookup, then to Starter.

`restoreAccess()` restores the tier from that snapshot too, never from admin input — an admin chooses how many days to restore, never which tier. `revoke()` deliberately leaves `replay_access_tier` alone, for the same reason expiry does: the timestamp governs, and keeping the tier keeps the audit trail readable.

## Downgrade and expiry

Nothing is ever deleted. Playbooks, risk settings, imported batches, and exports stay stored and readable; the report renders locked placeholders rather than empty charts. Quotas are checked only at creation, so a user who drops a tier keeps every existing row and is simply refused new ones.

The one exception is **mentor share links, which stop resolving below Elite** — they are public URLs actively serving traffic to third parties, so leaving them live would give the Elite hook away for free. The row and its token are left intact and the link works again on resubscribe; this is a live tier check in `MentorReviewController::show()`, not a `revoked_at` write.

## Verification

- Each plan grants its tier; the trial grants Elite; a live trial outranks a lower live paid window.
- A user with no live paid window can buy any plan; with one, only a strictly higher tier (same and lower both 409).
- Buying during a trial leaves `replay_trial_ends_at` untouched and starts the paid window at the trial's end, not at purchase time.
- An upgrade carries remaining paid days; a late lower-tier activation never demotes a higher live tier.
- A plan retuned after checkout does not change what that transaction grants.
- `restoreAccess()` restores the referenced transaction's tier, not the column's stale value.
- Automated coverage: `tests/Unit/SubscriptionTierServiceTest.php`, `tests/Unit/EnsureReplayAccessTierTest.php` (both database-free), and `tests/Unit/SubscriptionEntitlementServiceTierTest.php` (isolated SQLite, self-skips without `pdo_sqlite`).

## Admin pricing editor

`Pages/Subscriptions/AdminPlans.jsx` sets each plan's price, duration, description, featured/active flags, and now its **tier**. Tier is a bounded select validated with `Rule::in(array_keys(config('subscription_tiers.names')))` rather than an open integer — a tier with no entry in that config would grant nothing and silently break every gate keyed to plans at that level.

The card mirrors the customer's plan card: the same check rows, the same "Everything below, plus" framing, and the per-tier quota table. An admin picking a tier number otherwise has no way to know what it grants, which is the same information gap that let the three plans drift into describing themselves identically. **Capabilities are read-only here** — they come from `config/subscription_tiers.php` and are shown so the admin can see the consequence of the tier they picked, not edit it. Changing which tier owns a capability is a config edit, deliberately not an admin-UI action, since it changes what already-paid customers are entitled to.

The `features` JSON editor remains, relabelled "Extra copy" and rendered *beneath* the derived capabilities in both surfaces. It is supplementary marketing text and grants nothing on its own — the page says so inline, so a future admin does not mistake it for an entitlement control again.

`updatePlans()`'s response goes through the same `planPayload()` helper as `plans()`. It previously returned raw models, so saving left the admin editor without `capabilities`/`tier_name` until a full page reload — changing a plan's tier appeared to do nothing.

## Gated-error presentation (`AccessNotice`)

A 402 from `EnsureReplayAccess` or a 422 `tier_quota_reached` used to render as a bare red bar containing only the server's sentence — "Your replay access has expired." — with no icon and no way to act on it. `Components/Subscriptions/AccessNotice.jsx` is now the single error surface for every gated feature.

`accessError.js`'s `toAccessError(err, fallback)` normalizes a failed request: it returns a **plain string** for ordinary failures, preserving the shape each caller's `error` state already held, and an **object** carrying `code`/`requiredTier`/`requiredTierName`/`trialAvailable` for gated ones. `AccessNotice` renders the familiar red bar (now with an `AlertTriangle`) for the first and a locked state for the second — heading, what the plan unlocks, the server's own reason kept underneath so "expired" stays distinguishable from "never subscribed", and a CTA to `/subscription`.

The CTA adapts: `Start free trial` when `trialAvailable`, otherwise `Get {tier}`. This is why the 402 body carries `requiredTier`/`requiredTierName` at all — without them the notice could only say "subscribe", not which plan.

Wired into `TradeReport.jsx`, `TradeCalendar.jsx`, `StrategyPlaybooks.jsx` (both the load error and the create error, where a `tier_quota_reached` 422 lands), `ShareLinkManager.jsx`, `TrainingChallengeCatalog.jsx`, and `RiskGuardrailSettings.jsx`. Any new gated surface should use it rather than printing `err.response.data.message` into a red div.

**`RiskGuardrailSettings.jsx`'s loader previously swallowed the error entirely** (`.catch(() => setMessage('Unable to load risk guardrails.'))`), so a tier refusal read as a generic load failure. It now normalizes the real error and routes a gated one to `AccessNotice`.

## `prop_challenge` (Elite)

The prop-firm evaluation rehearsal is gated at tier 3. **Do not conflate it with `challenges`**, which is *training* challenges at tier 1 — two different features whose capability names differ by one word. See [Prop-firm challenges](prop-firm-challenges.md).

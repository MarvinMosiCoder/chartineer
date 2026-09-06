# Tiered subscription entitlements

## Purpose

Give Weekly, Monthly, and Yearly genuinely different capabilities instead of three durations of one identical entitlement, and close the paywall gap that currently leaks most premium features to unpaid accounts.

Today every plan grants the same thing. `subscription_plans` carries no capability column at all — only `duration_days` and `price` differ — and the plan `features` JSON is display-only marketing copy that, by design, "does not alter Replay entitlement or PayMongo verification." Entitlement is a single boolean-in-time: `adm_users.replay_access_ends_at`, checked by `EnsureReplayAccess` as trial-not-expired OR paid-not-expired. `SubscriptionEntitlementService::activate()` extends that one timestamp by `duration_days` and never records which plan bought it.

## Current state, confirmed by inspection

Only the replay checkpoint write and the simulated trading engine are gated by `replay.access`:

- `PUT /market-replay-progress`
- `/market-backtest/account`, `/reset`, `/sessions*`, `/positions*`, `/cross/evaluate`

Everything else in the premium surface is reachable by **any logged-in active user with no subscription and no trial**. The controllers behind these routes contain no internal entitlement check of any kind:

- `/market-backtest/playbooks` (index/store/update/destroy)
- `/market-backtest/risk-settings` (show/update)
- `/market-backtest/report`, `/report/insights`, `/order-history`
- `/market-backtest/report/export` and its download
- `/market-backtest/trades/{position}/journal`
- `/imported-trades/*` (real broker CSV import)
- `/market-backtest/share-links` (public mentor review links)
- `/training-challenges/*`

This is the actual defect behind the reported symptom. Tiering is the correct moment to fix it.

## Confirmed product rules

- Tier is a single integer ladder. Every gate is `user_tier >= required_tier`.
- `0` no access · `1` Starter · `2` Pro · `3` Elite.
- Weekly grants Starter, Monthly grants Pro, Yearly grants Elite.
- The free seven-day trial grants **Elite (3)**, as a preview of the ceiling.
- Full re-tiering on deploy. No grandfathering, no dated cutover, no dual-state branch.
- Superadmin bypass in `EnsureReplayAccess` is unchanged.
- Checkout is permitted when the user has no live paid window, or when the requested plan is a **strictly higher** tier than their current paid one. Everything else returns 409.
- A running trial does not block checkout, since it is not a paid window. Any plan may be bought during a trial.
- The trial always runs to its natural end. A paid window bought during one begins when the trial expires, so no paid day is lost to overlap.
- On upgrade, remaining paid days carry over. No proration, no credit, no PayMongo refund call.
- Downgrade and expiry never delete user data.

### The application is pre-launch

There are no live users and no production payment history. This is why full re-tiering is chosen over grandfathering: there is nobody to take a feature away from, so the dual-state branch that grandfathering requires would be permanent complexity bought for zero benefit.

It also means the migrations carry no real-data risk, and behavior that would normally need a careful cutover — closing the paywall gap, changing what the trial grants — can simply be correct from the start.

### Why the trial grants Elite

The paid Weekly plan and the free trial are both seven days, which `SubscriptionModal.jsx` already works around by swapping its CTA to "Activate free trial" when Weekly is selected. If the trial granted Starter, paying for Weekly would buy nothing the user just had for free. Granting Elite makes Weekly legible as the cheapest way back in after the preview lapses, and makes Elite's value concrete rather than a bullet list.

## Tier allocation

| Plan | Duration | Tier | Level |
|---|---|---|---|
| Free trial | 7 d | Elite preview | 3 |
| Weekly | 7 d | Starter | 1 |
| Monthly | 30 d | Pro | 2 |
| Yearly | 365 d | Elite | 3 |

**Free (no subscription).** Charts, all exchanges/categories/timeframes, indicators, drawings, watchlists, saved symbols, market info, price alerts within quota. No backtest surface.

**Starter (1).** Replay and saved replay progress · simulated trading: market and limit orders, SL/TP, **isolated margin only** · trade journal · basic report (PnL, calendar, win rate, order history) · training challenges.

**Pro (2), adding.** Strategy playbooks and pre-trade checklist · risk guardrails (replay-day loss cap, loss-streak lockout) · advanced analytics (equity curve, drawdown, streaks, grouped performance) · coaching insights · queued report export.

**Elite (3), adding.** Cross Margin (portfolio margin mode and the live liquidation monitor) · Monte Carlo simulation · imported trades (real broker CSV, real-versus-simulated comparison) · mentor review share links · unlimited quotas.

Gates were placed to follow real infrastructure cost wherever possible: queued exports consume queue workers and storage, Cross Margin runs the `cross-margin:monitor` polling command, price alerts run a scheduled monitor per alert, and deep replay history costs up to twenty pooled exchange requests per load. Nothing in the ladder is withheld arbitrarily.

## Data model

### `subscription_plans.tier_level`

`unsignedTinyInteger`, default `1`. Backfilled by the same migration: `weekly` → 1, `monthly` → 2, `yearly` → 3. Added to `SubscriptionPlan::$fillable` and cast to `integer`.

The admin pricing editor may edit it, validated to `1..3` — consistent with superadmins already controlling price and duration. It is never accepted from a customer-facing request.

### `adm_users.replay_access_tier`

`unsignedTinyInteger`, nullable. Written by `SubscriptionEntitlementService::activate()` from the purchased plan's `tier_level`, and by trial activation as `config('subscription_tiers.trial_level')`. Added to `AdmUser::$fillable` and cast to `integer`.

A null value with a live `replay_access_ends_at` is treated as tier `1`, so any row predating the migration degrades to Starter rather than to no access.

### Why a single column is safe here

`ReplayAccessController::createCheckout()` already returns 409 when `activeAccessPayload()` is non-null, so purchases can never overlap. Without overlap there is no tier conflict to resolve, and a per-purchase entitlement ledger is unnecessary. The upgrade path below is the only case that writes a tier over a live one, and it always writes a strictly higher value.

### `config/subscription_tiers.php`

Single source of truth for the capability map and quotas:

```php
return [
    'trial_level' => 3,
    'names' => [1 => 'Starter', 2 => 'Pro', 3 => 'Elite'],
    'capabilities' => [
        'replay'           => 1,
        'backtest'         => 1,
        'journal'          => 1,
        'challenges'       => 1,
        'playbooks'        => 2,
        'risk_guardrails'  => 2,
        'analytics'        => 2,
        'insights'         => 2,
        'export'           => 2,
        'deep_history'     => 2,
        'cross_margin'     => 3,
        'monte_carlo'      => 3,
        'imported_trades'  => 3,
        'mentor_share'     => 3,
    ],
    'limits' => [
        1 => ['alerts' => 5,   'playbooks' => 0,    'share_links' => 0],
        2 => ['alerts' => 25,  'playbooks' => 10,   'share_links' => 0],
        3 => ['alerts' => 100, 'playbooks' => null, 'share_links' => null],
    ],
];
```

`null` means unlimited. Retuning which tier owns a capability is a one-line config edit — no migration, no route change, no redeploy of the frontend.

`subscription_plans.features` stays as the admin's free-text blurb, but `SubscriptionModal.jsx` renders the **derived** capability list from this config beneath it. Enforcement and the displayed feature list then come from one place, which is the specific drift that produced the current situation.

## Enforcement

### Middleware

`EnsureReplayAccess` gains an optional capability argument and keeps its current behavior when called with none, so every existing `replay.access` route is untouched:

```php
public function handle(Request $request, Closure $next, ?string $capability = null)
```

Resolution order: 401 if unauthenticated · pass if superadmin · resolve the user's effective tier (trial and paid both considered, higher wins while both are live) · 402 if the tier is 0 · 402 if `tier < config("subscription_tiers.capabilities.$capability")`.

The 402 body keeps its existing `message`/`code`/`trialAvailable` shape and adds `requiredTier` and `requiredTierName`, so the frontend can open the plans modal preselected on the right plan rather than at the top of the list.

Routes to gate:

| Route | Capability |
|---|---|
| `/market-backtest/playbooks` (all four) | `playbooks` |
| `/market-backtest/risk-settings` (show, update) | `risk_guardrails` |
| `/market-backtest/report/export`, `/report/export/{export}/download` | `export` |
| `/imported-trades/*` (all five) | `imported_trades` |
| `/market-backtest/share-links` (index, store, destroy) | `mentor_share` |
| `/market-backtest/cross/evaluate` | `cross_margin` |
| `/market-backtest/report`, `/report/insights`, `/order-history`, `/trades/{position}/journal`, `/training-challenges/*` | plain `replay.access` (tier ≥ 1) |

### Payload-level gating for analytics and Monte Carlo

Advanced analytics and Monte Carlo are **not separate routes**. They are computed inside `MarketBacktestController::report()` and returned as keys of the report payload. They therefore cannot be gated by middleware and must be gated in the controller: below the required tier, the controller omits the computation entirely — it must not compute and then strip, since Monte Carlo runs 500 iterations and the cost is the thing being sold.

`report()` returns `analytics` and `monteCarlo` as `null` below tier 2 and 3 respectively, alongside a `lockedCapabilities` array naming what was withheld, so the report page can render a locked panel with an upgrade prompt instead of an empty chart.

`MentorReviewController` also computes Monte Carlo for the public viewer. It is left as is: the link's owner is necessarily Elite to have created it, and the viewer is an invited third party, not a customer evading a gate.

### Cross Margin

`/market-backtest/cross/evaluate` moves from plain `replay.access` to `replay.access:cross_margin`. Order placement must also reject `margin_mode = 'cross'` below tier 3 inside `MarketBacktestController::openPosition()`, since the margin mode is a field on the order rather than a separate endpoint. The order ticket hides the Cross toggle below tier 3, but the server check is the authority.

### Quotas

Enforced at the point of creation, comparing the user's current count against `config('subscription_tiers.limits')` for their tier: playbooks in `MarketBacktestPlaybookController::store()`, share links in `MarketBacktestShareLinkController::store()`, price alerts in `MarketPriceAlertController::store()`. Over-quota returns 422 with the limit and the tier that would raise it. A user already over quota after a downgrade keeps every existing row and is simply refused new ones.

### Deep replay history

`GET /api/klines` is public and currently validates `max_candles` at `max:20000`, so the twenty-thousand-candle depth cannot honestly be sold as a paid capability — anyone can request it unauthenticated.

Change: when `max_candles > 5000`, require an authenticated user with tier ≥ 2. Anonymous and Starter callers are capped at 5,000 rather than rejected, so the public contract still returns usable data instead of an error. This also reduces exchange-API cost from anonymous callers, which is worth doing independently of tiering.

## Purchase guard

`createCheckout()`'s 409 guard becomes one condition covering both the upgrade and trial-conversion cases. A checkout is permitted when either holds:

- the user has **no paid window** — that is, `replay_access_ends_at` is null or past — regardless of whether a trial is running; or
- the requested plan's `tier_level` is **strictly greater** than the user's current paid tier.

Anything else returns 409 with the existing message.

Stating it against the *paid* window rather than against access generally is what keeps the two cases from colliding. A trial alone no longer blocks a purchase, which is the leak being fixed. But once a paid window exists — including one queued behind a still-running trial — the strictly-higher rule governs every subsequent purchase, so a converted trial user cannot stack a lower tier on top of a higher one and leave `replay_access_tier` holding the wrong value.

## Upgrade path

On activation of an upgrade, `activate()` sets:

```text
replay_access_tier    = purchased plan tier_level
replay_access_ends_at = current replay_access_ends_at + purchased duration_days
```

Remaining days carry over at the new tier. No proration, no credit, no refund of the superseded plan. `SubscriptionModal.jsx` states this in one line at the point of upgrade: remaining days are added to the new plan.

### Converting from a trial

A strictly-higher rule alone could never govern trial users: the trial is tier 3, so every paid plan is same-or-lower and all checkout would be refused. Under today's behavior it already is — an active trial 409s every purchase, so a user convinced on day two cannot pay until day seven and has to return on their own initiative. That is a conversion leak, and the Elite preview sharpens it by design: the preview exists to create wanting, and there must be a way to act on it. The paid-window phrasing of the guard above is what resolves this.

**The trial is not cancelled, shortened, or refunded into the purchase.** Instead `activate()`'s start boundary widens to the latest of now, `replay_access_ends_at`, and `replay_trial_ends_at`:

```text
startsAt = max(now, replay_access_ends_at, replay_trial_ends_at)
endsAt   = startsAt + duration_days
```

A user who buys Weekly on trial day two keeps Elite through day seven, then holds Starter for a full seven days from that point. No paid day is consumed by trial overlap, and no free day is confiscated. Effective tier resolution already handles the interim correctly — trial and paid are both live, and the higher wins — so the user simply stays at Elite until the trial lapses and then settles onto what they bought.

This widening is strictly more correct than the current two-column arithmetic, which considers only `replay_access_ends_at` and would have silently overlapped a paid window onto a running trial.

## Downgrade and expiry

Nothing is ever deleted. Data created at a higher tier remains stored and readable; the user loses the ability to create more or to run the premium computation.

- Playbooks, risk settings, imported trade batches, and exports stay visible and readable. Creation is refused.
- The report renders with `analytics` and `monteCarlo` locked rather than absent.
- **Mentor share links deactivate on drop below tier 3.** They are public URLs actively serving traffic to third parties, so leaving them live would give the Elite hook away for free. Rows are retained with their tokens intact and reactivate if the user returns to Elite; `MentorReviewController::show()` resolves the owner's current tier and returns the existing not-found/revoked response below 3.

Expiry needs no scheduled job: `replay_access_ends_at` already governs, and the effective tier resolves to 0 once it passes. `replay_access_tier` is left as its historical value rather than nulled, so a returning user's previous tier is visible for support and for messaging.

### The two admin-triggered paths

`SubscriptionEntitlementService::revoke()` (admin refund, refund webhook, dispute webhook) already clears `replay_access_ends_at` to a past instant. It does **not** touch `replay_access_tier`, for the same reason expiry does not: the timestamp is what governs, and retaining the tier keeps the audit trail readable.

`SubscriptionEntitlementService::restoreAccess()` (the admin counterpart for an over-revoke) must also restore a tier, or a restored user lands at whatever stale value the column holds. It sets `replay_access_tier` to the `tier_level` of the referenced transaction's plan, resolved through the transaction rather than from admin input, so the admin cannot grant a tier the user never purchased. If that plan no longer exists, it falls back to the user's existing tier and logs the fallback.

## Frontend

- `GET /replay-access` adds `tier`, `tierName`, and the resolved `capabilities` map to its payload, from the same config. The frontend never computes tier from plan codes.
- A small `useEntitlements()` hook exposes `can(capability)` and `tierAtLeast(n)`. Locked controls render disabled with an anchored tooltip naming the tier that unlocks them, following the existing `AnchoredTooltip.jsx` pattern rather than a native `title`.
- `SubscriptionModal.jsx` renders the derived capability list per plan, marks the user's current tier, and disables same-or-lower plans while access is active.
- The report page renders locked panels for withheld analytics rather than empty charts.
- Any confirmation prompt introduced here uses `Hooks/useConfirm.jsx`, not `window.confirm()`.

## Testing

Unit:

- Tier resolution: paid only, trial only, both live (higher wins), both expired, null tier with live access degrading to 1.
- `activate()` writes the plan's tier; upgrade adds remaining days and raises the tier; a non-upgrade activation sets the tier normally.
- Config capability lookup for an unknown capability name fails closed, not open.

Feature:

- Each gated route at tier 0, 1, 2, and 3, asserting 402 versus 200 per the table above.
- Superadmin bypass reaches every gated route at tier 0.
- `report()` withholds `analytics` below tier 2 and `monteCarlo` below tier 3, and populates `lockedCapabilities`.
- `openPosition()` rejects `margin_mode = 'cross'` below tier 3.
- Quota refusal at 422 for playbooks, share links, and alerts; an over-quota user after downgrade keeps existing rows.
- Upgrade: higher tier permitted with days carried; same and lower tier both 409 when no trial is running.
- Trial conversion: any plan is purchasable during an active trial; the paid window starts at `replay_trial_ends_at`, not at purchase time; the trial is not shortened; the effective tier stays 3 until the trial lapses and then settles on the purchased tier.
- The two guard clauses do not collide: a user who converts during a trial and then attempts a second, lower-tier purchase while that trial still runs is refused 409, and `replay_access_tier` is left holding the higher purchased value.
- `/api/klines` with `max_candles > 5000` — anonymous capped at 5000, tier 1 capped, tier 2 served in full.
- Mentor link returns the revoked response once the owner drops below tier 3, and resolves again on return to Elite.

Follows the existing isolated in-memory SQLite pattern used by the current subscription tests, which self-skip without `pdo_sqlite`.

## Documentation

Per the handbook rule that a feature guide is updated in the same change as the behavior:

- `docs/developer/subscriptions-trials-and-paymongo.md` — the tier model, the trial granting Elite, the upgrade path, and the corrected statement that `features` is no longer the only feature surface.
- `docs/developer/backtesting-and-orders.md` — Cross Margin as Elite; the order-level `margin_mode` check.
- `docs/developer/trade-reports-and-journals.md` — payload-level analytics and Monte Carlo gating.
- `docs/developer/market-data-and-symbols.md` — the `max_candles` authentication rule.
- `docs/developer/imported-trades.md`, `mentor-review-sharing.md`, `price-alerts-and-notifications.md` — their new gates and quotas.
- `docs/developer/file-reference.md` — `config/subscription_tiers.php`.

## Implementation order

Pre-launch, nothing needs to ship incrementally to production, so this is a build order rather than a release plan. It is still worth keeping the stages separate — each is independently testable, and stage 1 is the one that carries the actual security fix.

1. **Tier plumbing.** Both migrations, `config/subscription_tiers.php`, the `EnsureReplayAccess` capability argument, the route gates, the payload-level analytics gating, and the Cross `margin_mode` check. This is what closes the paywall gap and makes the tiers real.
2. **Purchase paths.** The relaxed 409 for both upgrades and trial conversion, `activate()`'s widened start boundary and carry-over arithmetic, `restoreAccess()`'s tier restoration, and the modal copy explaining both.
3. **Quotas and surface.** Per-tier quotas, the `/api/klines` authentication rule, mentor-link deactivation, `useEntitlements()`, locked-panel rendering, and the derived capability list in the plans modal.

Stage 1 precedes stage 2, which has no tier to compare against without it. Stage 3 depends only on stage 1.

## Out of scope

- Proration, credits, or partial refunds on upgrade.
- A per-purchase entitlement ledger. Revisit only if overlapping purchases become possible.
- Grandfathering or a dated enforcement cutover.
- Transactional email on tier change — the app has no confirmed production sender, so tier changes use the existing `AdmNotifications` in-app pattern.
- Downgrade requests. Access simply lapses; the user picks a new plan afterward.
- Any new feature built specifically to fill a tier. The ladder is allocated entirely from what already exists.

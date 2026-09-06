# Prop-Firm Challenges

## Purpose

Rehearse a proprietary-firm evaluation — profit target, daily loss cap, drawdown floor, minimum trading days, consistency rule — against historical data in Replay, and get the verdict a real firm would give before paying a real firm's fee.

Replay is what makes it work: a thirty-day evaluation compresses into an evening, so "minimum trading days" is a playable constraint rather than a month of waiting, and a failed attempt restarts on the identical window immediately.

Full design: `docs/superpowers/specs/2026-09-06-prop-firm-challenge-mode-design.md`.

| File | Responsibility |
|---|---|
| `PropChallengeService.php` | Rule arithmetic, metrics, verdict (`evaluate`/`evaluateTrades`/`apply`) |
| `PropChallengeLifecycleService.php` | Account swapping: start, leave, abandon, restart |
| `PropChallengeController.php` | Routes |
| `MarketBacktestChallenge.php` | The challenge record and its verdict |
| `config/prop_challenges.php` | Rule templates and account sizes |

## A challenge is an isolated account

`market_backtest_accounts` already allowed many rows per user with a single `is_active`, and every backtest path resolves the current account through `MarketBacktestController::getOrCreateAccount()` (`where adm_user_id … where is_active`). Starting a challenge therefore deactivates the practice account and activates a fresh one seeded at the challenge's balance — **positions, sessions, the report, Cross Margin, the journal and exports all keep working with no change**, because each already asks for "the active account" rather than holding an id of its own.

This is the reason the feature is affordable. Scoping every backtest query by an optional `challenge_id` would have touched every one of those surfaces.

**The invariant is that a user always has exactly one active account.** Deactivation and activation happen inside one transaction with the rows locked. Breaking it is worse than it sounds: leaving a user with *no* active account makes `getOrCreateAccount()` mint a second "Demo Account" on their next request, silently hiding their real practice history behind an empty one.

The practice account is defined by exclusion — the earliest account of theirs that no challenge has ever claimed — rather than by a stored pointer, because that is what a practice account actually is, and a stored id would go stale if an account were removed.

**A finished challenge's account is deactivated, never deleted**, and the swap back does not happen automatically on pass or fail: the trader stays on the challenge account so they can read the verdict against the positions that produced it. Swapping underneath them at the moment of failure would replace the evidence with an unrelated balance.

## Rules

Percentages are of the challenge's own `starting_balance`, and **every figure is balance-based — realized PnL on closed trades only, never equity including open positions.** Equity-based rules would need re-evaluating on every replay candle rather than on trade events, and the closed-trade convention is the one `MarketBacktestRiskGuardrailService` already established for daily loss. This is a real difference from firms that evaluate on equity and must be stated in the UI, not buried here.

Fail conditions are checked in a fixed order so a simultaneous breach reports the most specific cause: **daily loss → total drawdown → calendar days**.

Passing requires the profit target, the minimum trading days, and the consistency ratio all at once, and is only evaluated when no fail condition holds.

Two details that are easy to get wrong and are pinned by tests:

- **A trailing floor follows `peakBalance`, but its allowance stays a percentage of `starting_balance`.** A 6% trailing rule on a 50,000 account allows 3,000 whether the balance is 50,000 or 53,000. Sizing the allowance off the peak would widen it as the trader profits — the opposite of the rule's purpose.
- **`daysElapsed` counts distinct replay-UTC dates inclusive, not 24-hour periods.** A challenge started at 23:50 has used one of its days ten minutes later, exactly as a real evaluation counts a calendar day. `tradingDays` counts only dates on which a trade closed, so it is always ≤ `daysElapsed`.

**Consistency is a pass gate, never a mid-run failure.** A single outsized day is diluted by profit earned later, so failing a run on it while the window is open would report a verdict the same run could still disprove. `test_consistency_never_produces_a_failure` asserts exactly this.

## Enforcement

`PropChallengeService::apply()` evaluates and persists a terminal verdict under a row lock. It is reached from:

- `openPosition()` — via `assertChallengeAllowsEntry()`, which refuses when the challenge has ended and when its rules are breached.
- `closePosition()` — a manual close that breaches a rule.
- `processPositionCandle()` — **indirectly**: an automatic stop-loss, take-profit or liquidation delegates to `closePosition()`, so it needs no hook of its own. Do not add a second one; it would evaluate the same close twice.
- `evaluateCrossPortfolio()` — a Cross liquidation closing several positions at once. `apply()`'s lock and non-active short-circuit keep that to a single verdict.

**Gating only `openPosition()` would miss most real failures.** A challenge is normally killed by a stop-out, not by an entry attempt: the losing trade is already open when it breaches. The verdict's `failed_at_time` is the **closing trade's** replay timestamp (`executed_at_time`, which `processPositionCandle` requires and forwards), not the moment evaluation ran.

**A challenge's rules and the trader's own risk guardrails are two separate engines and either may refuse an entry.** They have different scopes and lifetimes — the guardrail service evaluates the user's own per-day discipline settings for the life of the account; this one evaluates a window's cumulative rules and produces a permanent verdict. The refusal names which engine refused, so a personal limit set tighter than the challenge's is never silently overridden.

## Templates

`config/prop_challenges.php` holds `two_step_eval`, `one_step_express` and `custom`. Values sent with a create request override the template's, so "start from a template then tweak it" needs no second endpoint; a rule left null is not evaluated at all.

**No template may carry a real firm's name.** The rule shapes are not proprietary and traders recognise them on sight, but shipping a branded preset inside a paid product invites a trademark dispute for no product benefit. Reject UI copy naming a specific firm for the same reason.

## Routes

All gated `replay.access:prop_challenge` (tier 3, Elite). Note the separate `challenges` capability is *training* challenges at tier 1 — different feature, and the names must not be conflated.

| Route | Purpose |
|---|---|
| `GET /prop-challenges/templates` | Template and account-size options |
| `GET /prop-challenges` | List plus the active challenge and its live evaluation |
| `POST /prop-challenges` | Start (one active challenge per user) |
| `GET /prop-challenges/{challenge}` | One challenge with its evaluation |
| `POST /prop-challenges/{challenge}/abandon` | End a running challenge and return to practice |
| `POST /prop-challenges/{challenge}/leave` | Return to practice from a finished one, keeping the verdict |
| `POST /prop-challenges/{challenge}/restart` | Same rules and window on a new account |

Route-model binding authenticates the route, not the record; every action re-checks `adm_user_id` against the caller and 404s otherwise.

## Verification

- Each rule one unit under its threshold, exactly at it, and past it.
- A trailing floor that has moved above the static line still fails a balance between the two.
- A fail triggered by an automatic stop-loss dates `failed_at_time` to the closing candle.
- A Cross liquidation closing several positions produces one verdict, not one per position.
- Start, restart and abandon each leave exactly one active account, and abandoning returns the trader to the same practice account they started from.
- A second `POST /prop-challenges` while one is active is rejected.
- A non-Elite user gets 402 on every route.
- Automated: `tests/Unit/PropChallengeServiceTest.php` (18 tests, database-free via `evaluateTrades()`).

Related: [Backtesting and orders](backtesting-and-orders.md), [Replay and progress](replay-and-progress.md), [Subscriptions](subscriptions-trials-and-paymongo.md).

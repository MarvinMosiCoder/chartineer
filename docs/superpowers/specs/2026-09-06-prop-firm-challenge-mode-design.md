# Prop-firm challenge mode

## Purpose

Let a trader rehearse a proprietary-firm evaluation — profit target, daily loss cap, maximum drawdown, minimum trading days, consistency rule — against historical data in Replay, and get the same verdict a real firm would give, before paying a real firm's fee.

The market this serves is specific: retail traders buy evaluations from prop firms for roughly $150–$1,000 per attempt, and most attempts fail on a **rule** rather than on losing money outright — a tilt day that breaches the daily cap, a trailing drawdown clipped while up on the month, a consistency rule violated by one outsized win. Rehearsing that costs nothing here and the failure is instructive rather than expensive.

Replay is what makes it viable at all: a thirty-day evaluation compresses into an evening, so "minimum trading days" becomes a playable constraint instead of a month of waiting, and a failed attempt can be restarted on the identical window immediately.

## Confirmed product rules

- A challenge runs in **Replay only**. Live-mode challenges are out of scope.
- A challenge owns an **isolated account** seeded at its own starting balance.
- Breaching a fail rule **hard-fails** the challenge: the verdict is recorded at the exact replay timestamp, further entries are blocked, and the trader can restart the same window immediately.
- Rule evaluation is **balance-based** (closed trades), never equity-based.
- Templates are **generic** (`Two-Step Evaluation`, `One-Step Express`, `Custom`) and never carry a real firm's name.
- The capability is `prop_challenge` at tier 3 (Elite).
- A trader's own risk guardrails stay active during a challenge; either engine can block an entry.

## Why an isolated account, and why that is cheap

`market_backtest_accounts` already permits many rows per user with a single `is_active`, and every controller path resolves the current account through `MarketBacktestController::getOrCreateAccount()`, which selects `where('adm_user_id', …)->where('is_active', true)->first()`.

Starting a challenge therefore deactivates the practice account and activates a fresh one seeded at the challenge's starting balance. **Positions, sessions, the report, Cross Margin, the journal and exports all keep working with no change**, because each of them already asks for "the active account" rather than holding an account id of their own. Ending or abandoning a challenge reactivates the practice account.

This is the whole reason the feature is affordable. The alternative — scoping every query by an optional `challenge_id` — would touch every backtest surface in the app.

**Exactly one account may be active per user at any moment.** Activation and deactivation happen together inside one transaction with both rows locked, so a concurrent request cannot observe two active accounts or none.

**A finished challenge's account is deactivated, never deleted.** The verdict is only meaningful alongside the trades that produced it, so the account and its positions stay queryable for the challenge's result view. This is the same "never delete on downgrade" principle the tier work established.

**Restart creates a new challenge and a new account**, copying the rules, market and `started_at_time` of the one being restarted. It never reuses the failed challenge's account — the verdict and its evidence must stay intact, and a second attempt starting from a failed balance would be a different evaluation entirely.

## Data model

One new table, `market_backtest_challenges`:

| Column | Purpose |
|---|---|
| `adm_user_id` | owner; every query scopes to it |
| `market_backtest_account_id` | the isolated account this challenge trades on |
| `template_key` | `two_step_eval` / `one_step_express` / `custom` |
| `name` | trader-facing label |
| `starting_balance`, `quote_currency` | the evaluation's account size |
| `profit_target_percent` | pass condition; nullable |
| `max_daily_loss_percent` | fail condition; nullable |
| `max_total_drawdown_percent` | fail condition; nullable |
| `drawdown_type` | `static` or `trailing` |
| `min_trading_days` | pass gate; nullable |
| `max_calendar_days` | fail condition; `null`/0 = unlimited |
| `consistency_percent` | pass gate; nullable |
| `exchange`, `market_category`, `symbol`, `timeframe` | the replay window's market |
| `started_at_time`, `current_at_time` | replay timestamps, not wall clock |
| `status` | `active` / `passed` / `failed` / `abandoned` |
| `failed_rule`, `failed_at_time`, `failed_reason` | the verdict's evidence |
| `completed_at_time` | replay timestamp of pass or fail |

Every rule column is nullable, and **a null rule is not evaluated**. That is what makes `custom` work without a separate schema.

**No daily-aggregate table.** Per-day PnL, peak balance and trading-day counts are all derived from `market_backtest_positions` (`closed_at_time`, `realized_pnl`) scoped to the challenge's account — which is exactly how `MarketBacktestRiskGuardrailService` already computes its daily figures. Introducing a rollup table would add a second source of truth that has to be kept in step with position edits and liquidations.

## Rule arithmetic

All percentages are of **`starting_balance`**, matching the convention real evaluations use, and all figures come from closed trades only.

```text
netProfit        = account.cash_balance - challenge.starting_balance
dayPnl(d)        = sum(realized_pnl) for trades closed on replay-UTC-date d
dailyLoss(d)     = max(0, -dayPnl(d))
tradingDays      = count(distinct d where at least one trade closed on d)
peakBalance      = running max of balance over the window, floored at starting_balance
bestDayProfit    = max(0, max(dayPnl(d)))
```

Fail conditions, evaluated in this order so a simultaneous breach reports the most specific cause:

```text
1. daily_loss       dailyLoss(today) >= starting_balance * max_daily_loss_percent/100
2. total_drawdown   static:   balance <  starting_balance - starting_balance * pct/100
                    trailing: balance <  peakBalance      - starting_balance * pct/100
3. max_calendar_days  daysElapsed > max_calendar_days
```

`daysElapsed` counts **distinct replay-UTC dates from `started_at_time` to `current_at_time` inclusive**, not 24-hour periods — a challenge started at 23:50 has used one of its days ten minutes later, exactly as a real evaluation counts a calendar day. `tradingDays` counts only those dates on which a trade actually closed, so it is always ≤ `daysElapsed`.

Pass requires **all** of the following, and is only evaluated when no fail condition holds:

```text
netProfit    >= starting_balance * profit_target_percent/100
tradingDays  >= min_trading_days
bestDayProfit <= netProfit * consistency_percent/100     (when netProfit > 0)
```

**Consistency is a pass gate, never a mid-run failure.** A single outsized day can be diluted by profit earned later, so failing a trader on it while the window is still open would report a verdict that the same run could still disprove. It is checked only at the moment the profit target is met.

**Trailing drawdown's floor moves with `peakBalance` but its size is a percentage of `starting_balance`**, not of the peak — a $50,000 account with a 6% trailing rule has a $3,000 trailing allowance whether the balance is $50,000 or $53,000. Sizing it off the peak would silently widen the allowance as the trader profits, which is the opposite of what the rule is for.

### Balance-based, deliberately

Some firms evaluate daily loss and trailing drawdown against **equity**, including unrealized PnL on open positions. This spec evaluates **balance** — realized, closed trades only — for two reasons: equity-based rules require re-evaluating on every replay candle rather than on trade events, and `MarketBacktestRiskGuardrailService` already established the closed-trade convention for daily loss in this codebase. Shipping one honest rule beats shipping an equity rule that is only approximately right.

This is a real difference from some real evaluations and must be stated in the UI, not buried here. Equity-based rules are a separate, later feature, not a tweak to this one.

## Evaluation service

`App\Services\PropChallengeService::evaluate(MarketBacktestChallenge $challenge, ?int $replayTime): array`

Returns metrics (`netProfit`, `progressPercent`, `dailyLoss`, `dailyLossHeadroom`, `balance`, `peakBalance`, `drawdownHeadroom`, `tradingDays`, `bestDayProfit`, `consistencyRatio`, `daysElapsed`), a `breaches` list, and a `verdict` of `active` / `passed` / `failed` with `failedRule`, `failedAtTime` and `failedReason`.

**It is a new service, not an extension of `MarketBacktestRiskGuardrailService`.** That service answers "did this account break the *user's own* daily discipline settings", is evaluated per calendar day, and lives as long as the account. This one answers "did this challenge window break *the challenge's* cumulative rules", is scoped to a window with a start and an end, and produces a permanent verdict. Merging them would give one class two lifetimes and two owners.

Both stay active during a challenge and **either can block an entry**; the refusal names which engine refused. A trader who sets a personal daily limit tighter than the challenge's should keep it — silently disabling their own discipline settings because a challenge is running would be a surprising and unwelcome override.

## Enforcement points

`PropChallengeService::apply()` persists a fail verdict inside the same transaction that produced it, and is called from **four** places:

- `openPosition()` — refuses a new entry while `status !== 'active'`, and refuses when evaluation reports `blocked`.
- `closePosition()` — a manual close that breaches a rule.
- `processPositionCandle()` — an automatic stop-loss, take-profit or liquidation close.
- `evaluateCrossPortfolio()` / `CrossLiquidationService` — a Cross liquidation closing several positions at once.

**Gating only `openPosition()` would miss most real failures.** A challenge is normally killed by a stop-out, not by an entry attempt: the losing trade that breaches the daily cap is already open when it breaches. The verdict's `failed_at_time` is the **closing trade's** replay timestamp, not the time evaluation happened, so a fail triggered by an auto-SL is recorded at the candle that hit the stop.

## Replay integration

`started_at_time` is captured from the replay position when the challenge starts, and `current_at_time` advances with the replay cursor, so "days elapsed" and "trading days" are measured in replay time. A challenge is meaningless outside its own market, so starting one pins `exchange`/`market_category`/`symbol`/`timeframe`; switching market while a challenge is active is refused with an explanation rather than silently scoped away.

Going Back to Live does not end a challenge — it pauses it. The challenge resumes when Replay resumes on the same market.

## Templates

Shipped as configuration, not rows, in `config/prop_challenges.php`:

- **Two-Step Evaluation** — 8% target, 5% daily loss, 10% static drawdown, 4 minimum trading days
- **One-Step Express** — 10% target, 5% daily loss, 6% trailing drawdown, 5 minimum trading days
- **Custom** — every rule editable, any rule may be left off

**No template carries a real firm's name.** The rule shapes are not proprietary and traders recognise them on sight, but shipping "FTMO Challenge" inside a paid product invites a trademark dispute for no product benefit. Any UI copy naming a specific firm should be rejected in review for the same reason.

## Tiering

The capability is **`prop_challenge`** at tier 3 in `config/subscription_tiers.php`. Note the existing `challenges` capability is training challenges at tier 1 — these are different features and must not share a name.

Routes are gated `replay.access:prop_challenge`. Because the challenge's rules are enforced server-side in the trading path, a tier check is also needed where a challenge is *created*, not only where it is read.

## UI

- **Challenges panel** — list, start (template picker + account size), verdict card, and a one-click **Restart** that recreates the same rules on the same window. Instant retry is what makes failing feel cheap enough to learn from.
- **Workspace HUD** — a compact strip during an active challenge: progress to target, daily-loss headroom, drawdown headroom, days traded. Headroom, not usage: a trader needs to know how much room is left, not how much is gone.
- **Failure state** — the verdict names the rule, the replay day and the number, using the existing `AccessNotice`/panel visual language rather than a new one.

## Testing

- Each rule: breach exactly at the threshold, one unit under (no breach), one unit over.
- Fail precedence when two rules break on the same trade.
- Min-trading-days blocking an otherwise-passing run, and passing once the day count is met.
- Consistency arithmetic, including that it never fails a run mid-window.
- Trailing drawdown's floor tracking `peakBalance` while its size stays a percentage of `starting_balance`.
- A fail triggered by an automatic stop-loss records `failed_at_time` as the closing candle's replay timestamp.
- A Cross liquidation closing several positions at once produces exactly one verdict.
- Account activation: starting and ending a challenge leaves exactly one active account, under concurrent requests.
- Tier: a non-Elite user cannot create or resume a challenge.

Follows the repo's isolated in-memory SQLite pattern, self-skipping without `pdo_sqlite`.

## Documentation

- New `docs/developer/prop-firm-challenges.md`, linked from the handbook feature map.
- `docs/developer/backtesting-and-orders.md` — the four enforcement points and their interaction with risk guardrails.
- `docs/developer/replay-and-progress.md` — challenges pause rather than end on Back to Live.
- `docs/developer/subscriptions-trials-and-paymongo.md` — `prop_challenge` at tier 3.
- `docs/developer/file-reference.md` — the new service, model, migration and config.

## Out of scope

- Live-mode (wall-clock) challenges.
- Equity-based daily loss or trailing drawdown.
- Multi-symbol challenges — v1 pins one market per challenge.
- Payouts, scaling plans, or anything modelling a funded account after a pass.
- Leaderboards or sharing challenge results.
- Real firm names, logos or branded presets.

## Implementation order

1. **Model and rules.** Migration, model, `config/prop_challenges.php`, `PropChallengeService::evaluate()` with its full unit-test suite. No UI, no routes — the arithmetic is the risky part and it is testable in isolation.
2. **Lifecycle and enforcement.** Account activation/deactivation transaction, create/start/abandon/restart routes gated on `prop_challenge`, and the four enforcement call sites.
3. **Surface.** Challenges panel, workspace HUD, verdict card.

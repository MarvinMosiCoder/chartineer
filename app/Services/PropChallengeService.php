<?php

namespace App\Services;

use App\Models\MarketBacktestChallenge;
use App\Models\MarketBacktestPosition;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Evaluates a prop-firm challenge against its own account's closed trades.
 *
 * Deliberately NOT an extension of MarketBacktestRiskGuardrailService. That
 * service answers "did this account break the *user's own* daily discipline
 * settings" — evaluated per calendar day, living as long as the account. This
 * one answers "did this challenge window break *the challenge's* cumulative
 * rules" — scoped to a window with a start and an end, producing a permanent
 * verdict. Both stay active during a challenge and either may block an entry.
 *
 * Every figure is balance-based: realized PnL on closed trades only, never
 * equity including open positions. Equity-based rules would require
 * re-evaluating on every replay candle rather than on trade events, and the
 * closed-trade convention is the one this codebase already established for
 * daily loss. The difference from firms that evaluate on equity is real and
 * must be stated in the UI, not hidden here.
 */
class PropChallengeService
{
    public const RULE_DAILY_LOSS = 'max_daily_loss';
    public const RULE_TOTAL_DRAWDOWN = 'max_total_drawdown';
    public const RULE_CALENDAR_DAYS = 'max_calendar_days';

    /**
     * Metrics, breaches and a verdict for the challenge as of $replayTime.
     *
     * Pure: it reads and computes, never writes. `apply()` is what persists a
     * verdict, so callers can evaluate speculatively (to render a HUD, or to
     * decide whether to accept an entry) without side effects.
     */
    public function evaluate(MarketBacktestChallenge $challenge, ?int $replayTime = null): array
    {
        $now = $replayTime ?: ($challenge->current_at_time ?: $challenge->started_at_time);

        return $this->evaluateTrades($challenge, $this->closedTrades($challenge, $now), $now);
    }

    /**
     * The rule arithmetic, with the trade set supplied rather than queried.
     *
     * Split out so the rules — the part most likely to be subtly wrong — can be
     * tested exhaustively without a database, and so a caller that already holds
     * the closed trades does not re-query for them.
     *
     * `$trades` must be ordered by `closed_at_time` then `id`: the peak-balance
     * walk is order-dependent, and an unordered set silently produces a
     * different trailing-drawdown floor.
     *
     * @param Collection<int, object> $trades rows with closed_at_time and realized_pnl
     */
    public function evaluateTrades(MarketBacktestChallenge $challenge, Collection $trades, int $now): array
    {
        $starting = (float) $challenge->starting_balance;
        $netProfit = round($trades->sum(fn ($row) => (float) $row->realized_pnl), 8);
        $balance = round($starting + $netProfit, 8);

        $byDay = $this->pnlByDay($trades);
        $today = $this->replayDate($now);
        $todayPnl = round((float) ($byDay[$today] ?? 0), 8);
        $dailyLoss = max(0.0, -$todayPnl);

        $peakBalance = $this->peakBalance($trades, $starting);
        $tradingDays = count($byDay);
        $daysElapsed = $this->daysElapsed($challenge, $now);
        $bestDayProfit = $byDay === [] ? 0.0 : max(0.0, max($byDay));

        $metrics = [
            'balance' => $balance,
            'netProfit' => $netProfit,
            'peakBalance' => $peakBalance,
            'todayPnl' => $todayPnl,
            'dailyLoss' => $dailyLoss,
            'tradingDays' => $tradingDays,
            'daysElapsed' => $daysElapsed,
            'bestDayProfit' => $bestDayProfit,
            'consistencyRatio' => $netProfit > 0 ? round($bestDayProfit / $netProfit * 100, 4) : null,
            'replayDate' => $today,
        ];

        $metrics += [
            'progressPercent' => $challenge->profit_target_percent === null ? null
                : round($netProfit / $this->amountOf($challenge, $challenge->profit_target_percent) * 100, 4),
            'dailyLossHeadroom' => $challenge->max_daily_loss_percent === null ? null
                : round(max(0, $this->amountOf($challenge, $challenge->max_daily_loss_percent) - $dailyLoss), 8),
            'drawdownHeadroom' => $challenge->max_total_drawdown_percent === null ? null
                : round(max(0, $balance - $this->drawdownFloor($challenge, $peakBalance)), 8),
        ];

        $breach = $this->firstBreach($challenge, $metrics, $trades);
        $passed = $breach === null && $this->meetsPassConditions($challenge, $metrics);

        return [
            'metrics' => $metrics,
            'breach' => $breach,
            'verdict' => $breach !== null
                ? MarketBacktestChallenge::STATUS_FAILED
                : ($passed ? MarketBacktestChallenge::STATUS_PASSED : MarketBacktestChallenge::STATUS_ACTIVE),
            'blocked' => $breach !== null,
        ];
    }

    /**
     * Evaluates and persists a terminal verdict.
     *
     * `$eventTime` is the replay timestamp of the trade that caused the change —
     * the closing candle for an auto stop-loss, not the moment evaluation ran.
     * A challenge is normally killed by a stop-out rather than an entry attempt,
     * so recording the evaluation's own clock would misdate most real failures.
     */
    public function apply(MarketBacktestChallenge $challenge, ?int $eventTime = null): array
    {
        $now = $eventTime ?: ($challenge->current_at_time ?: $challenge->started_at_time);

        if (!$challenge->isActive()) {
            return $this->evaluate($challenge, $now);
        }

        return DB::transaction(function () use ($challenge, $now) {
            $locked = MarketBacktestChallenge::whereKey($challenge->id)->lockForUpdate()->firstOrFail();

            // A Cross liquidation closes several positions in one transaction and
            // can call this per position; the lock plus this guard keep that to a
            // single verdict.
            if (!$locked->isActive()) {
                return $this->evaluate($locked, $now);
            }

            $result = $this->evaluate($locked, $now);
            $updates = ['current_at_time' => max((int) $locked->current_at_time, $now)];

            if ($result['verdict'] === MarketBacktestChallenge::STATUS_FAILED) {
                $updates += [
                    'status' => MarketBacktestChallenge::STATUS_FAILED,
                    'failed_rule' => $result['breach']['rule'],
                    'failed_at_time' => $now,
                    'failed_reason' => $result['breach']['message'],
                    'completed_at_time' => $now,
                ];
            } elseif ($result['verdict'] === MarketBacktestChallenge::STATUS_PASSED) {
                $updates += [
                    'status' => MarketBacktestChallenge::STATUS_PASSED,
                    'completed_at_time' => $now,
                ];
            }

            $locked->forceFill($updates)->save();
            $challenge->forceFill($updates);

            return $result;
        });
    }

    /**
     * The first fail condition met, in a fixed order so a simultaneous breach
     * reports the most specific cause rather than whichever query ran first.
     */
    private function firstBreach(MarketBacktestChallenge $challenge, array $metrics, Collection $trades): ?array
    {
        if ($challenge->max_daily_loss_percent !== null) {
            $limit = $this->amountOf($challenge, $challenge->max_daily_loss_percent);
            if ($metrics['dailyLoss'] >= $limit && $limit > 0) {
                return $this->breach(self::RULE_DAILY_LOSS, 'Daily loss limit',
                    "Daily loss reached {$this->money($metrics['dailyLoss'])} of {$this->money($limit)} allowed on {$metrics['replayDate']}.");
            }
        }

        if ($challenge->max_total_drawdown_percent !== null) {
            $floor = $this->drawdownFloor($challenge, $metrics['peakBalance']);
            if ($metrics['balance'] < $floor) {
                $type = $challenge->drawdown_type === 'trailing' ? 'Trailing' : 'Maximum';
                return $this->breach(self::RULE_TOTAL_DRAWDOWN, "{$type} drawdown",
                    "Balance {$this->money($metrics['balance'])} fell below the {$this->money($floor)} floor.");
            }
        }

        if ($challenge->max_calendar_days) {
            if ($metrics['daysElapsed'] > $challenge->max_calendar_days) {
                return $this->breach(self::RULE_CALENDAR_DAYS, 'Time limit',
                    "The {$challenge->max_calendar_days}-day window closed on day {$metrics['daysElapsed']}.");
            }
        }

        return null;
    }

    /**
     * Pass requires every configured condition at once.
     *
     * Consistency is checked only here, never as a fail condition: a single
     * outsized day can be diluted by profit earned later, so failing a run on it
     * mid-window would report a verdict the same run could still disprove.
     */
    private function meetsPassConditions(MarketBacktestChallenge $challenge, array $metrics): bool
    {
        if ($challenge->profit_target_percent === null) {
            return false; // Nothing to reach; the challenge simply runs.
        }

        if ($metrics['netProfit'] < $this->amountOf($challenge, $challenge->profit_target_percent)) {
            return false;
        }

        if ($challenge->min_trading_days !== null && $metrics['tradingDays'] < $challenge->min_trading_days) {
            return false;
        }

        if ($challenge->consistency_percent !== null && $metrics['netProfit'] > 0) {
            $cap = $metrics['netProfit'] * ((float) $challenge->consistency_percent / 100);
            if ($metrics['bestDayProfit'] > $cap) {
                return false;
            }
        }

        return true;
    }

    /**
     * The drawdown floor.
     *
     * Trailing floors follow `peakBalance`, but the allowance is a percentage of
     * the *starting* balance, not of the peak — a 6% trailing rule on a 50,000
     * account allows 3,000 whether the balance is 50,000 or 53,000. Sizing it
     * off the peak would widen the allowance as the trader profits, which is the
     * opposite of the rule's purpose.
     */
    private function drawdownFloor(MarketBacktestChallenge $challenge, float $peakBalance): float
    {
        $allowance = $this->amountOf($challenge, $challenge->max_total_drawdown_percent);
        $anchor = $challenge->drawdown_type === 'trailing' ? $peakBalance : (float) $challenge->starting_balance;

        return round($anchor - $allowance, 8);
    }

    /** Running maximum of balance across the closed-trade sequence, never below the start. */
    private function peakBalance(Collection $trades, float $starting): float
    {
        $balance = $starting;
        $peak = $starting;

        foreach ($trades as $trade) {
            $balance += (float) $trade->realized_pnl;
            $peak = max($peak, $balance);
        }

        return round($peak, 8);
    }

    /** @return array<string, float> realized PnL keyed by replay-UTC date */
    private function pnlByDay(Collection $trades): array
    {
        $byDay = [];

        foreach ($trades as $trade) {
            $date = $this->replayDate((int) $trade->closed_at_time);
            $byDay[$date] = round(($byDay[$date] ?? 0) + (float) $trade->realized_pnl, 8);
        }

        return $byDay;
    }

    /**
     * Distinct replay-UTC dates from the start through now, inclusive — not
     * 24-hour periods. A challenge started at 23:50 has used one of its days ten
     * minutes later, exactly as a real evaluation counts a calendar day.
     */
    private function daysElapsed(MarketBacktestChallenge $challenge, int $now): int
    {
        $start = CarbonImmutable::createFromTimestampUTC((int) $challenge->started_at_time)->startOfDay();
        $end = CarbonImmutable::createFromTimestampUTC(max($now, (int) $challenge->started_at_time))->startOfDay();

        return (int) $start->diffInDays($end) + 1;
    }

    private function closedTrades(MarketBacktestChallenge $challenge, int $now): Collection
    {
        return MarketBacktestPosition::query()
            ->where('market_backtest_account_id', $challenge->market_backtest_account_id)
            ->where('status', 'closed')
            ->whereNotNull('closed_at_time')
            ->whereBetween('closed_at_time', [(int) $challenge->started_at_time, $now])
            ->orderBy('closed_at_time')
            ->orderBy('id')
            ->get(['id', 'closed_at_time', 'realized_pnl']);
    }

    private function amountOf(MarketBacktestChallenge $challenge, $percent): float
    {
        return round((float) $challenge->starting_balance * ((float) $percent / 100), 8);
    }

    private function replayDate(int $timestamp): string
    {
        return CarbonImmutable::createFromTimestampUTC($timestamp)->toDateString();
    }

    private function money(float $value): string
    {
        return number_format($value, 2);
    }

    private function breach(string $rule, string $label, string $message): array
    {
        return ['rule' => $rule, 'label' => $label, 'message' => $message];
    }
}

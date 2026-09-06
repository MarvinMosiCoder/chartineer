<?php

namespace App\Services;

use App\Models\AdmUser;
use App\Models\MarketBacktestAccount;
use App\Models\MarketBacktestChallenge;
use Illuminate\Support\Facades\DB;

/**
 * Starting, leaving and restarting challenges — the account swapping.
 *
 * Kept apart from PropChallengeService, which owns the rule arithmetic and the
 * verdict. These are different jobs with different risks: the rules are pure
 * maths, this is a concurrency-sensitive write path whose one invariant is that
 * a user always has **exactly one active account**.
 *
 * A challenge trades on its own account. Because every backtest path resolves
 * the current account through `getOrCreateAccount()` — `where adm_user_id …
 * where is_active` — activating a challenge account transparently redirects
 * positions, sessions, reports, Cross and the journal at it, with no change to
 * any of them.
 */
class PropChallengeLifecycleService
{
    public function activeChallengeFor(?AdmUser $user): ?MarketBacktestChallenge
    {
        if (!$user) {
            return null;
        }

        return MarketBacktestChallenge::query()
            ->where('adm_user_id', $user->id)
            ->where('status', MarketBacktestChallenge::STATUS_ACTIVE)
            ->latest('id')
            ->first();
    }

    /**
     * Opens a challenge on a fresh account seeded at its starting balance.
     *
     * One active challenge per user: a second would have to either share the
     * first's account (mixing two verdicts' trades) or fight it for the single
     * active slot.
     */
    public function start(AdmUser $user, array $data): MarketBacktestChallenge
    {
        return DB::transaction(function () use ($user, $data) {
            $existing = MarketBacktestChallenge::query()
                ->where('adm_user_id', $user->id)
                ->where('status', MarketBacktestChallenge::STATUS_ACTIVE)
                ->lockForUpdate()
                ->first();

            if ($existing) {
                abort(response()->json([
                    'success' => false,
                    'message' => 'Finish or abandon your current challenge before starting another.',
                    'challenge_id' => $existing->id,
                ], 422));
            }

            $this->deactivateAllAccounts($user->id);

            return $this->openChallenge($user->id, $data);
        });
    }

    /**
     * Leaves a challenge and returns the trader to their practice account.
     *
     * Not called automatically when a challenge passes or fails: the account
     * stays active so the trader can read their verdict against the positions
     * that produced it. Swapping underneath them at the moment of failure would
     * replace the evidence with an unrelated balance.
     */
    public function leave(MarketBacktestChallenge $challenge): MarketBacktestChallenge
    {
        return DB::transaction(function () use ($challenge) {
            $this->deactivateAllAccounts($challenge->adm_user_id);
            $this->practiceAccountFor($challenge->adm_user_id)->forceFill(['is_active' => true])->save();

            return $challenge->fresh();
        });
    }

    public function abandon(MarketBacktestChallenge $challenge): MarketBacktestChallenge
    {
        return DB::transaction(function () use ($challenge) {
            if ($challenge->isActive()) {
                $challenge->forceFill([
                    'status' => MarketBacktestChallenge::STATUS_ABANDONED,
                    'completed_at_time' => $challenge->current_at_time,
                ])->save();
            }

            return $this->leave($challenge);
        });
    }

    /**
     * Runs the same rules over the same window again, on a new account.
     *
     * Never reuses the original's account: the verdict is only meaningful
     * alongside the trades that produced it, and a second attempt starting from
     * a failed balance would be a different evaluation entirely.
     */
    public function restart(MarketBacktestChallenge $challenge): MarketBacktestChallenge
    {
        return DB::transaction(function () use ($challenge) {
            if ($challenge->isActive()) {
                $challenge->forceFill([
                    'status' => MarketBacktestChallenge::STATUS_ABANDONED,
                    'completed_at_time' => $challenge->current_at_time,
                ])->save();
            }

            $this->deactivateAllAccounts($challenge->adm_user_id);

            return $this->openChallenge($challenge->adm_user_id, [
                'template_key' => $challenge->template_key,
                'name' => $challenge->name,
                'starting_balance' => (float) $challenge->starting_balance,
                'quote_currency' => $challenge->quote_currency,
                'profit_target_percent' => $challenge->profit_target_percent,
                'max_daily_loss_percent' => $challenge->max_daily_loss_percent,
                'max_total_drawdown_percent' => $challenge->max_total_drawdown_percent,
                'drawdown_type' => $challenge->drawdown_type,
                'min_trading_days' => $challenge->min_trading_days,
                'max_calendar_days' => $challenge->max_calendar_days,
                'consistency_percent' => $challenge->consistency_percent,
                'exchange' => $challenge->exchange,
                'market_category' => $challenge->market_category,
                'symbol' => $challenge->symbol,
                'timeframe' => $challenge->timeframe,
                'started_at_time' => $challenge->started_at_time,
            ]);
        });
    }

    private function openChallenge(int $userId, array $data): MarketBacktestChallenge
    {
        $balance = round((float) $data['starting_balance'], 8);

        $account = MarketBacktestAccount::query()->create([
            'adm_user_id' => $userId,
            'name' => ($data['name'] ?? 'Challenge').' account',
            'quote_currency' => $data['quote_currency'] ?? 'USDT',
            'starting_balance' => $balance,
            'cash_balance' => $balance,
            'realized_pnl' => 0,
            'fees_paid' => 0,
            'is_active' => true,
        ]);

        $startedAt = (int) $data['started_at_time'];

        return MarketBacktestChallenge::query()->create([
            'adm_user_id' => $userId,
            'market_backtest_account_id' => $account->id,
            'template_key' => $data['template_key'] ?? 'custom',
            'name' => $data['name'] ?? 'Challenge',
            'starting_balance' => $balance,
            'quote_currency' => $data['quote_currency'] ?? 'USDT',
            'profit_target_percent' => $data['profit_target_percent'] ?? null,
            'max_daily_loss_percent' => $data['max_daily_loss_percent'] ?? null,
            'max_total_drawdown_percent' => $data['max_total_drawdown_percent'] ?? null,
            'drawdown_type' => $data['drawdown_type'] ?? 'static',
            'min_trading_days' => $data['min_trading_days'] ?? null,
            'max_calendar_days' => $data['max_calendar_days'] ?? null,
            'consistency_percent' => $data['consistency_percent'] ?? null,
            'exchange' => strtolower($data['exchange']),
            'market_category' => strtolower($data['market_category']),
            'symbol' => strtoupper($data['symbol']),
            'timeframe' => $data['timeframe'],
            'started_at_time' => $startedAt,
            'current_at_time' => $startedAt,
            'status' => MarketBacktestChallenge::STATUS_ACTIVE,
        ]);
    }

    private function deactivateAllAccounts(int $userId): void
    {
        MarketBacktestAccount::query()
            ->where('adm_user_id', $userId)
            ->where('is_active', true)
            ->lockForUpdate()
            ->get()
            ->each(fn (MarketBacktestAccount $account) => $account->forceFill(['is_active' => false])->save());
    }

    /**
     * The trader's ordinary practice account: the earliest account of theirs
     * that no challenge has ever claimed.
     *
     * Defined by exclusion rather than by a stored id because that is what a
     * practice account actually is here, and because a stored pointer would go
     * stale the moment an account was removed. Creating one when none exists
     * matters: leaving a user with no active account would make
     * `getOrCreateAccount()` mint a second practice account on their next
     * request, silently hiding their real history behind an empty one.
     */
    private function practiceAccountFor(int $userId): MarketBacktestAccount
    {
        $challengeAccountIds = MarketBacktestChallenge::query()
            ->where('adm_user_id', $userId)
            ->pluck('market_backtest_account_id');

        $account = MarketBacktestAccount::query()
            ->where('adm_user_id', $userId)
            ->whereNotIn('id', $challengeAccountIds)
            ->orderBy('id')
            ->lockForUpdate()
            ->first();

        return $account ?: MarketBacktestAccount::query()->create([
            'adm_user_id' => $userId,
            'name' => 'Demo Account',
            'quote_currency' => 'USDT',
            'starting_balance' => 10000,
            'cash_balance' => 10000,
            'realized_pnl' => 0,
            'fees_paid' => 0,
            'is_active' => false,
        ]);
    }
}

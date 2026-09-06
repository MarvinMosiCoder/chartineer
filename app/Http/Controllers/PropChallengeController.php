<?php

namespace App\Http\Controllers;

use App\Models\MarketBacktestChallenge;
use App\Services\PropChallengeLifecycleService;
use App\Services\PropChallengeService;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Prop-firm challenges: start, read, abandon, restart.
 *
 * Every route is gated `replay.access:prop_challenge` (Elite). Trading inside a
 * challenge is enforced separately in MarketBacktestController, because that is
 * where positions are opened and closed.
 */
class PropChallengeController extends Controller
{
    public function __construct(
        private readonly PropChallengeService $challenges,
        private readonly PropChallengeLifecycleService $lifecycle,
    ) {
    }

    public function templates(): \Illuminate\Http\JsonResponse
    {
        return response()->json([
            'success' => true,
            'templates' => collect(config('prop_challenges.templates', []))
                ->map(fn ($template, $key) => ['key' => $key] + $template)
                ->values(),
            'accountSizes' => config('prop_challenges.account_sizes', []),
            'defaultAccountSize' => config('prop_challenges.default_account_size'),
        ]);
    }

    public function index(Request $request): \Illuminate\Http\JsonResponse
    {
        $challenges = MarketBacktestChallenge::query()
            ->where('adm_user_id', $request->user()->id)
            ->latest('id')
            ->limit(50)
            ->get();

        $active = $this->lifecycle->activeChallengeFor($request->user());

        return response()->json([
            'success' => true,
            'active' => $active ? $this->payload($active, $request) : null,
            'challenges' => $challenges->map(fn (MarketBacktestChallenge $challenge) => $this->summary($challenge)),
        ]);
    }

    public function show(Request $request, MarketBacktestChallenge $challenge): \Illuminate\Http\JsonResponse
    {
        $this->authorizeOwnership($request, $challenge);

        return response()->json(['success' => true, 'challenge' => $this->payload($challenge, $request)]);
    }

    public function store(Request $request): \Illuminate\Http\JsonResponse
    {
        $validated = $request->validate([
            'template_key' => ['required', Rule::in(array_keys(config('prop_challenges.templates', [])))],
            'name' => ['nullable', 'string', 'max:80'],
            'starting_balance' => ['required', 'numeric', 'min:100', 'max:10000000'],
            'quote_currency' => ['nullable', 'string', 'max:12'],

            // A null rule is not evaluated, which is how `custom` expresses a
            // subset without a separate schema.
            'profit_target_percent' => ['nullable', 'numeric', 'gt:0', 'max:1000'],
            'max_daily_loss_percent' => ['nullable', 'numeric', 'gt:0', 'max:100'],
            'max_total_drawdown_percent' => ['nullable', 'numeric', 'gt:0', 'max:100'],
            'drawdown_type' => ['nullable', Rule::in(['static', 'trailing'])],
            'min_trading_days' => ['nullable', 'integer', 'min:1', 'max:365'],
            'max_calendar_days' => ['nullable', 'integer', 'min:1', 'max:365'],
            'consistency_percent' => ['nullable', 'numeric', 'gt:0', 'max:100'],

            'exchange' => ['required', 'string', 'max:30'],
            'market_category' => ['required', 'string', 'max:30'],
            'symbol' => ['required', 'string', 'max:40'],
            'timeframe' => ['required', 'string', 'max:10'],
            'started_at_time' => ['required', 'integer', 'min:1'],
        ]);

        // Template values are the defaults; anything explicitly sent overrides
        // them, which is what makes "start from a template then tweak it" work
        // without a second endpoint.
        $template = config("prop_challenges.templates.{$validated['template_key']}", []);
        foreach (['profit_target_percent', 'max_daily_loss_percent', 'max_total_drawdown_percent',
                  'drawdown_type', 'min_trading_days', 'max_calendar_days', 'consistency_percent'] as $rule) {
            if (!array_key_exists($rule, $validated) || $validated[$rule] === null) {
                $validated[$rule] = $template[$rule] ?? null;
            }
        }
        $validated['name'] = $validated['name'] ?: ($template['name'] ?? 'Challenge');

        $challenge = $this->lifecycle->start($request->user(), $validated);

        return response()->json(['success' => true, 'challenge' => $this->payload($challenge, $request)], 201);
    }

    public function abandon(Request $request, MarketBacktestChallenge $challenge): \Illuminate\Http\JsonResponse
    {
        $this->authorizeOwnership($request, $challenge);
        $this->lifecycle->abandon($challenge);

        return response()->json(['success' => true, 'challenge' => $this->summary($challenge->fresh())]);
    }

    /** Leaves a finished challenge without abandoning it — the verdict is kept. */
    public function leave(Request $request, MarketBacktestChallenge $challenge): \Illuminate\Http\JsonResponse
    {
        $this->authorizeOwnership($request, $challenge);

        if ($challenge->isActive()) {
            return response()->json([
                'success' => false,
                'message' => 'This challenge is still running. Abandon it instead if you want to stop.',
            ], 422);
        }

        $this->lifecycle->leave($challenge);

        return response()->json(['success' => true]);
    }

    public function restart(Request $request, MarketBacktestChallenge $challenge): \Illuminate\Http\JsonResponse
    {
        $this->authorizeOwnership($request, $challenge);
        $fresh = $this->lifecycle->restart($challenge);

        return response()->json(['success' => true, 'challenge' => $this->payload($fresh, $request)], 201);
    }

    private function payload(MarketBacktestChallenge $challenge, Request $request): array
    {
        $replayTime = $request->integer('replay_time') ?: null;

        return $this->summary($challenge) + ['evaluation' => $this->challenges->evaluate($challenge, $replayTime)];
    }

    private function summary(MarketBacktestChallenge $challenge): array
    {
        return [
            'id' => $challenge->id,
            'templateKey' => $challenge->template_key,
            'name' => $challenge->name,
            'startingBalance' => (float) $challenge->starting_balance,
            'quoteCurrency' => $challenge->quote_currency,
            'rules' => [
                'profitTargetPercent' => $challenge->profit_target_percent === null ? null : (float) $challenge->profit_target_percent,
                'maxDailyLossPercent' => $challenge->max_daily_loss_percent === null ? null : (float) $challenge->max_daily_loss_percent,
                'maxTotalDrawdownPercent' => $challenge->max_total_drawdown_percent === null ? null : (float) $challenge->max_total_drawdown_percent,
                'drawdownType' => $challenge->drawdown_type,
                'minTradingDays' => $challenge->min_trading_days,
                'maxCalendarDays' => $challenge->max_calendar_days,
                'consistencyPercent' => $challenge->consistency_percent === null ? null : (float) $challenge->consistency_percent,
            ],
            'market' => [
                'exchange' => $challenge->exchange,
                'category' => $challenge->market_category,
                'symbol' => $challenge->symbol,
                'timeframe' => $challenge->timeframe,
            ],
            'startedAtTime' => $challenge->started_at_time,
            'currentAtTime' => $challenge->current_at_time,
            'status' => $challenge->status,
            'failedRule' => $challenge->failed_rule,
            'failedAtTime' => $challenge->failed_at_time,
            'failedReason' => $challenge->failed_reason,
            'completedAtTime' => $challenge->completed_at_time,
        ];
    }

    /**
     * Route-model binding authenticates the route, never the record — a bound
     * id still has to be checked against the caller.
     */
    private function authorizeOwnership(Request $request, MarketBacktestChallenge $challenge): void
    {
        abort_if($challenge->adm_user_id !== $request->user()->id, 404);
    }
}

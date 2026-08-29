<?php

namespace App\Http\Controllers;

use App\Jobs\GenerateBacktestReportExport;
use App\Models\MarketBacktestAccount;
use App\Models\MarketBacktestExport;
use App\Models\MarketBacktestPosition;
use App\Models\MarketBacktestPlaybook;
use App\Models\MarketBacktestSession;
use App\Models\MarketBacktestRiskSetting;
use App\Models\MarketBacktestSnapshot;
use App\Models\MarketBacktestTrade;
use App\Services\BacktestTradeNotificationService;
use App\Services\CrossLiquidationService;
use App\Services\CrossMarginService;
use App\Services\CrossMarkService;
use App\Services\MarketBacktestInsightService;
use App\Services\MarketBacktestReportService;
use App\Services\MarketBacktestRiskGuardrailService;
use App\Services\MarketBacktestAdvancedAnalyticsService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\Rule;

class MarketBacktestController extends Controller
{
    private const DEFAULT_BALANCE = 10000;
    private const FEE_RATE = CrossMarginService::FEE_RATE;

    public function __construct(
        private MarketBacktestReportService $reportService,
        private MarketBacktestInsightService $insightService,
        private MarketBacktestRiskGuardrailService $riskGuardrailService,
        private MarketBacktestAdvancedAnalyticsService $advancedAnalyticsService,
        private CrossMarginService $crossMarginService,
        private CrossMarkService $crossMarkService,
        private CrossLiquidationService $crossLiquidationService,
        private BacktestTradeNotificationService $tradeNotifications
    ) {
    }

    public function show(Request $request)
    {
        $validated = $request->validate([
            'symbol' => ['nullable', 'string', 'max:32', 'regex:/^[A-Za-z0-9]+$/'],
            'exchange' => ['nullable', 'string', 'max:32'],
            'category' => ['nullable', 'string', 'max:32'],
            'timeframe' => ['nullable', 'string', 'max:16'],
            'mode' => ['nullable', Rule::in(['live', 'replay'])],
            'candle_time' => ['nullable', 'integer', 'min:0'],
            'price' => ['nullable', 'numeric', 'gt:0'],
        ]);

        $account = $this->getOrCreateAccount($request);
        $symbol = isset($validated['symbol']) ? strtoupper($validated['symbol']) : null;
        $price = isset($validated['price']) ? (float) $validated['price'] : null;
        $session = $this->getActiveSession($request, $account);

        if ($symbol && $price) {
            $this->crossMarkService->record(
                $account,
                $session,
                $validated['exchange'] ?? $session?->exchange ?? 'bybit',
                $validated['category'] ?? $session?->market_category ?? 'linear',
                $symbol,
                $validated['mode'] ?? 'live',
                $price,
                (int) ($validated['candle_time'] ?? time())
            );
        }

        return response()->json([
            'success' => true,
            'account' => $this->buildPayload($account, $symbol, $price, $session),
        ]);
    }

    public function startSession(Request $request)
    {
        $validated = $request->validate([
            'name' => ['nullable', 'string', 'max:120'],
            'symbol' => ['required', 'string', 'max:32', 'regex:/^[A-Za-z0-9]+$/'],
            'exchange' => ['nullable', 'string', 'max:32'],
            'category' => ['nullable', 'string', 'max:32'],
            'margin_mode' => ['nullable', Rule::in(['isolated', 'cross'])],
            'timeframe' => ['nullable', 'string', 'max:16'],
            'started_at_time' => ['nullable', 'integer', 'min:0'],
        ]);

        $account = DB::transaction(function () use ($request, $validated) {
            $account = $this->getOrCreateAccount($request, true);

            $this->endActiveSessions($request, $account, $validated['started_at_time'] ?? null);
            $this->createSession($request, $account, $validated);

            return $account->fresh();
        });

        return response()->json([
            'success' => true,
            'account' => $this->buildPayload($account, strtoupper($validated['symbol']), null, $this->getActiveSession($request, $account)),
        ]);
    }

    public function endSession(Request $request, MarketBacktestSession $session)
    {
        $validated = $request->validate([
            'ended_at_time' => ['nullable', 'integer', 'min:0'],
        ]);

        $account = DB::transaction(function () use ($request, $session, $validated) {
            $account = $this->getOrCreateAccount($request, true);

            $session = MarketBacktestSession::query()
                ->where('id', $session->id)
                ->where('adm_user_id', $request->user()->id)
                ->where('market_backtest_account_id', $account->id)
                ->lockForUpdate()
                ->firstOrFail();

            if ($session->status === 'active') {
                $session->update([
                    'status' => 'ended',
                    'ended_at_time' => $validated['ended_at_time'] ?? time(),
                ]);
            }

            return $account->fresh();
        });

        return response()->json([
            'success' => true,
            'account' => $this->buildPayload($account, null, null, $this->getActiveSession($request, $account)),
        ]);
    }

    public function reset(Request $request)
    {
        $validated = $request->validate([
            'starting_balance' => ['nullable', 'numeric', 'min:1', 'max:1000000000'],
        ]);

        $account = DB::transaction(function () use ($request, $validated) {
            $account = $this->getOrCreateAccount($request, true);
            $startingBalance = (float) ($validated['starting_balance'] ?? self::DEFAULT_BALANCE);

            $account->positions()->delete();
            $account->trades()->delete();
            $account->update([
                'starting_balance' => $startingBalance,
                'cash_balance' => $startingBalance,
                'realized_pnl' => 0,
                'fees_paid' => 0,
            ]);

            return $account->fresh();
        });

        return response()->json([
            'success' => true,
            'account' => $this->buildPayload($account),
        ]);
    }

    public function orderHistory(Request $request)
    {
        $validated = $request->validate([
            'session_id' => ['nullable', 'integer', 'min:1'],
            'limit' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        $account = $this->getOrCreateAccount($request);
        $session = isset($validated['session_id'])
            ? MarketBacktestSession::query()
                ->where('id', $validated['session_id'])
                ->where('market_backtest_account_id', $account->id)
                ->first()
            : $this->getActiveSession($request, $account);
        $limit = $validated['limit'] ?? 50;

        $trades = $account->trades()
            ->with('position:id,order_type,leverage,stop_loss,take_profit,category,margin_mode')
            ->when($session, fn ($query) => $query->where('market_backtest_session_id', $session->id))
            ->orderByDesc('created_at')
            ->limit($limit)
            ->get();

        $cancelledPositions = $account->positions()
            ->where('status', 'cancelled')
            ->when($session, fn ($query) => $query->where('market_backtest_session_id', $session->id))
            ->orderByDesc('updated_at')
            ->limit($limit)
            ->get();

        $tradeRows = $trades->map(function (MarketBacktestTrade $trade) {
            $position = $trade->position;
            $orderType = $position?->order_type ?? 'market';

            return [
                'id' => 'trade:' . $trade->id,
                'symbol' => $trade->symbol,
                'category' => $position?->category,
                'side' => $trade->side,
                'action' => $trade->action,
                'orderType' => $orderType,
                'avgPrice' => (float) $trade->price,
                'targetPrice' => $orderType === 'market' ? null : (float) $trade->price,
                'quantity' => (float) $trade->quantity,
                'filledQuantity' => (float) $trade->quantity,
                'notional' => (float) $trade->notional,
                'pnl' => $trade->pnl !== null ? (float) $trade->pnl : null,
                'fee' => (float) $trade->fee,
                'reduceOnly' => false,
                'leverage' => $position ? $this->getPositionLeverage($position) : null,
                'marginMode' => $position?->margin_mode ?? 'isolated',
                'hasStopLoss' => $position?->stop_loss !== null,
                'hasTakeProfit' => $position?->take_profit !== null,
                'status' => 'complete',
                'time' => $trade->executed_at_time,
                'sortKey' => optional($trade->created_at)->timestamp ?? 0,
            ];
        });

        $cancelledRows = $cancelledPositions->map(function (MarketBacktestPosition $position) {
            return [
                'id' => 'cancelled:' . $position->id,
                'symbol' => $position->symbol,
                'category' => $position->category,
                'side' => $position->side,
                'action' => 'open',
                'orderType' => $position->order_type ?? 'limit',
                'avgPrice' => null,
                'targetPrice' => (float) $position->entry_price,
                'quantity' => (float) $position->quantity,
                'filledQuantity' => 0,
                'notional' => null,
                'pnl' => null,
                'fee' => 0,
                'reduceOnly' => false,
                'leverage' => $this->getPositionLeverage($position),
                'marginMode' => $position->margin_mode ?? 'isolated',
                'hasStopLoss' => $position->stop_loss !== null,
                'hasTakeProfit' => $position->take_profit !== null,
                'status' => 'cancelled',
                'time' => $position->opened_at_time,
                'sortKey' => optional($position->updated_at)->timestamp ?? 0,
            ];
        });

        $orders = $tradeRows->concat($cancelledRows)
            ->sortByDesc('sortKey')
            ->values()
            ->take($limit)
            ->map(fn ($row) => collect($row)->except('sortKey')->all());

        return response()->json([
            'success' => true,
            'orders' => $orders,
        ]);
    }

    public function report(Request $request)
    {
        $validated = $request->validate([
            'symbol' => ['nullable', 'string', 'max:32', 'regex:/^[A-Za-z0-9]+$/'],
            'session_id' => ['nullable', 'integer', 'min:1'],
            'limit' => ['nullable', 'integer', 'min:1', 'max:1000'],
        ]);

        $account = $this->getOrCreateAccount($request);
        $symbol = isset($validated['symbol']) ? strtoupper($validated['symbol']) : null;
        $sessionId = $validated['session_id'] ?? null;
        $limit = (int) ($validated['limit'] ?? 500);

        $positions = $this->reportService->getReportPositions($account, $symbol, $sessionId, $limit);

        $totalTrades = $positions->count();
        $wins = $positions->filter(fn (MarketBacktestPosition $position) => (float) $position->realized_pnl > 0);
        $losses = $positions->filter(fn (MarketBacktestPosition $position) => (float) $position->realized_pnl < 0);
        $breakeven = $positions->filter(fn (MarketBacktestPosition $position) => (float) $position->realized_pnl === 0.0);
        $netPnl = round($positions->sum(fn (MarketBacktestPosition $position) => (float) $position->realized_pnl), 8);
        $grossProfit = round($wins->sum(fn (MarketBacktestPosition $position) => (float) $position->realized_pnl), 8);
        $grossLoss = round($losses->sum(fn (MarketBacktestPosition $position) => (float) $position->realized_pnl), 8);
        $lossNetPnl = $grossLoss;
        $fees = round($positions->sum(fn (MarketBacktestPosition $position) => (float) ($position->original_entry_fee ?? $position->entry_fee) + (float) $position->exit_fee), 8);
        $playbookPerformance = $positions
            ->filter(fn (MarketBacktestPosition $position) => !empty($position->playbook_snapshot['name']))
            ->groupBy(fn (MarketBacktestPosition $position) => $position->playbook_snapshot['name'])
            ->map(function ($group, $name) {
                $netPnl = round($group->sum(fn ($position) => (float) $position->realized_pnl), 8);
                $wins = $group->filter(fn ($position) => (float) $position->realized_pnl > 0)->count();

                return [
                    'name' => $name,
                    'trades' => $group->count(),
                    'wins' => $wins,
                    'winRate' => round(($wins / $group->count()) * 100, 2),
                    'netPnl' => $netPnl,
                    'averagePnl' => round($netPnl / $group->count(), 8),
                ];
            })
            ->sortByDesc('trades')
            ->values();

        return response()->json([
            'success' => true,
            'account' => [
                'id' => $account->id,
                'name' => $account->name,
                'quoteCurrency' => $account->quote_currency,
            ],
            'summary' => [
                'totalTrades' => $totalTrades,
                'wins' => $wins->count(),
                'losses' => $losses->count(),
                'breakeven' => $breakeven->count(),
                'winRate' => $totalTrades ? round(($wins->count() / $totalTrades) * 100, 2) : 0,
                'netPnl' => $netPnl,
                'grossProfit' => $grossProfit,
                'grossLoss' => $grossLoss,
                'lossNetPnl' => $lossNetPnl,
                'fees' => $fees,
                'averageWin' => $wins->count() ? round($grossProfit / $wins->count(), 8) : 0,
                'averageLoss' => $losses->count() ? round($grossLoss / $losses->count(), 8) : 0,
                'largestWin' => $wins->count() ? round($wins->max(fn (MarketBacktestPosition $position) => (float) $position->realized_pnl), 8) : 0,
                'largestLoss' => $losses->count() ? round($losses->min(fn (MarketBacktestPosition $position) => (float) $position->realized_pnl), 8) : 0,
            ],
            'insights' => $this->insightService->build($positions),
            'playbookPerformance' => $playbookPerformance,
            'advanced' => $this->advancedAnalyticsService->build($positions, (float) $account->starting_balance),
            'monteCarlo' => $this->advancedAnalyticsService->monteCarlo($positions, (float) $account->starting_balance),
            'trades' => $positions->map(fn (MarketBacktestPosition $position) => $this->reportService->serializeReportPosition($position))->values(),
        ]);
    }

    public function reportInsightsSummary(Request $request)
    {
        $account = $this->getOrCreateAccount($request);
        $positions = $this->reportService->getReportPositions($account, null, null, 300);

        return response()->json([
            'success' => true,
            'insights' => $this->insightService->build($positions),
        ]);
    }

    public function requestReportExport(Request $request)
    {
        $validated = $request->validate([
            'format' => ['nullable', Rule::in(['csv', 'json'])],
            'symbol' => ['nullable', 'string', 'max:32', 'regex:/^[A-Za-z0-9]+$/'],
            'session_id' => ['nullable', 'integer', 'min:1'],
            'limit' => ['nullable', 'integer', 'min:1', 'max:5000'],
        ]);

        $account = $this->getOrCreateAccount($request);

        $export = MarketBacktestExport::create([
            'adm_user_id' => $request->user()->id,
            'market_backtest_account_id' => $account->id,
            'format' => $validated['format'] ?? 'csv',
            'symbol' => isset($validated['symbol']) ? strtoupper($validated['symbol']) : null,
            'session_id' => $validated['session_id'] ?? null,
            'row_limit' => (int) ($validated['limit'] ?? 5000),
            'status' => 'pending',
        ]);

        GenerateBacktestReportExport::dispatch($export->id);

        return response()->json([
            'success' => true,
            'export_id' => $export->id,
        ]);
    }

    public function downloadReportExport(Request $request, MarketBacktestExport $export)
    {
        abort_if($export->adm_user_id !== $request->user()->id, 403);
        abort_if($export->status !== 'ready' || !$export->file_path, 404);

        return Storage::disk('public')->download($export->file_path, $export->filename);
    }

    public function updateTradeJournal(Request $request, MarketBacktestPosition $position)
    {
        $validated = $request->validate([
            'setup_tag' => ['nullable', 'string', 'max:80'],
            'tags' => ['nullable', 'array', 'max:12'],
            'tags.*' => ['string', 'max:40'],
            'entry_reason' => ['nullable', 'string', 'max:2000'],
            'exit_reason' => ['nullable', 'string', 'max:2000'],
            'mistake' => ['nullable', 'string', 'max:2000'],
            'emotion' => ['nullable', 'string', 'max:80'],
            'journal_notes' => ['nullable', 'string', 'max:5000'],
        ]);

        $account = $this->getOrCreateAccount($request);

        $position = MarketBacktestPosition::query()
            ->where('id', $position->id)
            ->where('market_backtest_account_id', $account->id)
            ->where('status', 'closed')
            ->firstOrFail();

        $tags = collect($validated['tags'] ?? [])
            ->map(fn ($tag) => trim((string) $tag))
            ->filter()
            ->unique(fn ($tag) => strtolower($tag))
            ->take(12)
            ->values()
            ->all();

        $position->update([
            'setup_tag' => $this->nullableTrim($validated['setup_tag'] ?? null),
            'tags' => $tags,
            'entry_reason' => $this->nullableTrim($validated['entry_reason'] ?? null),
            'exit_reason' => $this->nullableTrim($validated['exit_reason'] ?? null),
            'mistake' => $this->nullableTrim($validated['mistake'] ?? null),
            'emotion' => $this->nullableTrim($validated['emotion'] ?? null),
            'journal_notes' => $this->nullableTrim($validated['journal_notes'] ?? null),
        ]);

        return response()->json([
            'success' => true,
            'trade' => $this->reportService->serializeReportPosition($position->fresh()),
        ]);
    }

    public function completeJournalTour(Request $request)
    {
        if (!$request->user()->journal_tour_completed_at) {
            $request->user()->forceFill(['journal_tour_completed_at' => now()])->save();
        }

        return response()->json(['success' => true]);
    }

    public function uploadPositionSnapshot(Request $request, MarketBacktestPosition $position)
    {
        $validated = $request->validate([
            'type' => ['required', Rule::in(['entry', 'exit'])],
            'snapshot' => ['required', 'file', 'image', 'mimes:png,jpg,jpeg', 'max:4096'],
            'captured_at_time' => ['nullable', 'integer', 'min:0'],
        ]);

        $account = $this->getOrCreateAccount($request);

        $position = MarketBacktestPosition::query()
            ->where('id', $position->id)
            ->where('market_backtest_account_id', $account->id)
            ->firstOrFail();

        $path = $request->file('snapshot')->store('market-backtest-snapshots', 'public');
        $url = $this->buildPublicStorageUrl($path);

        $snapshot = MarketBacktestSnapshot::query()->create([
            'market_backtest_account_id' => $account->id,
            'market_backtest_session_id' => $position->market_backtest_session_id,
            'market_backtest_position_id' => $position->id,
            'type' => $validated['type'],
            'path' => $path,
            'url' => $url,
            'captured_at_time' => $validated['captured_at_time'] ?? null,
        ]);

        return response()->json([
            'success' => true,
            'snapshot' => [
                'id' => $snapshot->id,
                'type' => $snapshot->type,
                'url' => $this->buildPublicStorageUrl($snapshot->path),
                'capturedAtTime' => $snapshot->captured_at_time,
            ],
        ]);
    }

    public function openPosition(Request $request)
    {
        $validated = $request->validate([
            'symbol' => ['required', 'string', 'max:32', 'regex:/^[A-Za-z0-9]+$/'],
            'side' => ['required', Rule::in(['long', 'short'])],
            'order_type' => ['nullable', Rule::in(['market', 'conditional', 'limit', 'trigger'])],
            'session_id' => ['nullable', 'integer', 'min:1'],
            'exchange' => ['nullable', 'string', 'max:32'],
            'category' => ['nullable', 'string', 'max:32'],
            'margin_mode' => ['nullable', Rule::in(['isolated', 'cross'])],
            'timeframe' => ['nullable', 'string', 'max:16'],
            'notional' => ['required', 'numeric', 'min:1', 'max:1000000000'],
            'leverage' => ['nullable', 'numeric', 'min:1', 'max:125'],
            'price' => ['required', 'numeric', 'gt:0'],
            'executed_at_time' => ['nullable', 'integer', 'min:0'],
            'stop_loss' => ['nullable', 'numeric', 'gt:0'],
            'take_profit' => ['nullable', 'numeric', 'gt:0'],
            'stop_loss_pnl_percent' => ['nullable', 'numeric', 'gt:0', 'max:95'],
            'take_profit_pnl_percent' => ['nullable', 'numeric', 'gt:0', 'max:100000'],
            'playbook_id' => ['nullable', 'integer', 'min:1'],
            'checklist_answers' => ['nullable', 'array', 'max:20'],
            'checklist_answers.*' => ['boolean'],
            'trailing_stop_percent' => ['nullable', 'numeric', 'min:0.1', 'max:50'],
            'break_even_trigger_percent' => ['nullable', 'numeric', 'min:0.1', 'max:1000'],
            'partial_take_profit_percent' => ['nullable', 'numeric', 'min:1', 'max:99'],
        ]);

        $result = DB::transaction(function () use ($request, $validated) {
            $account = $this->getOrCreateAccount($request, true);
            $riskSettings = MarketBacktestRiskSetting::query()
                ->where('adm_user_id', $request->user()->id)
                ->lockForUpdate()
                ->first();
            $riskEvaluation = $riskSettings
                ? $this->riskGuardrailService->evaluate($account, $riskSettings, $validated['executed_at_time'] ?? null)
                : null;

            if ($riskEvaluation && $riskEvaluation['blocked']) {
                abort(response()->json([
                    'success' => false,
                    'message' => $riskEvaluation['breaches'][0]['message'].' New entries are blocked by your enforced risk guardrails.',
                    'riskGuardrails' => $riskEvaluation,
                ], 422));
            }
            $session = $this->resolveSessionForTrade($request, $account, $validated);
            $category = $validated['category'] ?? 'linear';
            $isSpot = $category === 'spot';
            $marginMode = $isSpot ? 'isolated' : ($validated['margin_mode'] ?? 'isolated');
            $exchange = strtolower($validated['exchange'] ?? $session?->exchange ?? 'bybit');

            if ($isSpot && $validated['side'] === 'short') {
                abort(response()->json([
                    'success' => false,
                    'message' => "Spot positions can't be shorted.",
                ], 422));
            }

            if ($isSpot && isset($validated['leverage']) && (float) $validated['leverage'] > 1) {
                abort(response()->json([
                    'success' => false,
                    'message' => 'Spot positions do not support leverage.',
                ], 422));
            }

            if ($isSpot && ($validated['margin_mode'] ?? 'isolated') === 'cross') {
                abort(response()->json([
                    'success' => false,
                    'message' => 'Spot positions do not support Cross Margin.',
                ], 422));
            }

            $requestedMargin = round((float) $validated['notional'], 8);
            $leverage = $isSpot ? 1.0 : round((float) ($validated['leverage'] ?? 1), 2);
            $price = (float) $validated['price'];
            $stopLoss = isset($validated['stop_loss']) ? (float) $validated['stop_loss'] : null;
            $takeProfit = isset($validated['take_profit']) ? (float) $validated['take_profit'] : null;

            if ($stopLoss === null && isset($validated['stop_loss_pnl_percent'])) {
                $stopLoss = $this->priceFromPnlPercent($validated['side'], $price, $leverage, (float) $validated['stop_loss_pnl_percent'], true);
            }

            if ($takeProfit === null && isset($validated['take_profit_pnl_percent'])) {
                $takeProfit = $this->priceFromPnlPercent($validated['side'], $price, $leverage, (float) $validated['take_profit_pnl_percent'], false);
            }

            $orderType = $validated['order_type'] ?? 'market';
            $isPendingOrder = in_array($orderType, ['conditional', 'limit', 'trigger'], true);
            $playbook = null;
            $checklistAnswers = [];

            if (isset($validated['playbook_id'])) {
                $playbook = MarketBacktestPlaybook::query()
                    ->where('id', $validated['playbook_id'])
                    ->where('adm_user_id', $request->user()->id)
                    ->where('is_active', true)
                    ->firstOrFail();
                $checklist = array_values($playbook->checklist ?? []);
                $checklistAnswers = array_values($validated['checklist_answers'] ?? []);

                if (count($checklistAnswers) !== count($checklist) || collect($checklistAnswers)->contains(false)) {
                    abort(response()->json([
                        'success' => false,
                        'message' => 'Complete every playbook checklist item before placing the trade.',
                    ], 422));
                }
            }

            if ($validated['side'] === 'long') {
                if ($stopLoss !== null && $stopLoss >= $price) {
                    abort(response()->json([
                        'success' => false,
                        'message' => 'Long stop loss must be below entry price.',
                    ], 422));
                }

                if ($takeProfit !== null && $takeProfit <= $price) {
                    abort(response()->json([
                        'success' => false,
                        'message' => 'Long take profit must be above entry price.',
                    ], 422));
                }
            }

            if ($validated['side'] === 'short') {
                if ($stopLoss !== null && $stopLoss <= $price) {
                    abort(response()->json([
                        'success' => false,
                        'message' => 'Short stop loss must be above entry price.',
                    ], 422));
                }

                if ($takeProfit !== null && $takeProfit >= $price) {
                    abort(response()->json([
                        'success' => false,
                        'message' => 'Short take profit must be below entry price.',
                    ], 422));
                }
            }

            // Cross sizing is never trimmed/rejected against the account's raw cash_balance —
            // a Cross entry can be legitimately backed by unrealized profit sitting in other
            // open Cross positions (pooled equity), which cash_balance alone doesn't reflect.
            // cash_balance is still the actual ledger this entry's margin+fee gets deducted
            // from below (and can go negative, exactly like a real cross account borrowing
            // against portfolio equity), but affordability is decided by the shared
            // cross_available_margin check further down, not this isolated-style cap.
            $sizing = $marginMode === 'cross'
                ? $this->resolveCrossEntrySizing($requestedMargin, $leverage, $price)
                : $this->resolveEntrySizing($requestedMargin, $leverage, $price, (float) $account->cash_balance);

            if (!$sizing) {
                $entryFee = round($requestedMargin * $leverage * self::FEE_RATE, 8);
                $requiredCash = round($requestedMargin + $entryFee, 8);

                abort(response()->json([
                    'success' => false,
                    'message' => "Insufficient paper balance. Cash: {$account->cash_balance}, margin: {$requestedMargin}, entry fee: {$entryFee}, required: {$requiredCash}.",
                ], 422));
            }

            if ($marginMode === 'cross') {
                $this->crossMarkService->record(
                    $account,
                    $session,
                    $exchange,
                    $category,
                    $validated['symbol'],
                    isset($validated['executed_at_time']) ? 'replay' : 'live',
                    $price,
                    (int) ($validated['executed_at_time'] ?? time())
                );
                $cross = $this->buildCrossMetrics(
                    $account,
                    isset($validated['executed_at_time']) ? 'replay' : 'live',
                    $session
                );
                if (!$cross['complete']) {
                    abort(response()->json([
                        'success' => false,
                        'message' => 'Cross Margin is unavailable until every open Cross market has a current simulated mark.',
                        'missingMarkets' => $cross['missingMarkets'],
                    ], 422));
                }
                if ($sizing['requiredCash'] > $cross['availableMargin']) {
                    abort(response()->json([
                        'success' => false,
                        'message' => 'Insufficient shared Cross available margin.',
                    ], 422));
                }
            }

            $positionData = [
                'market_backtest_account_id' => $account->id,
                'market_backtest_session_id' => $session?->id,
                'market_backtest_playbook_id' => $playbook?->id,
                'symbol' => strtoupper($validated['symbol']),
                'category' => $category,
                'side' => $validated['side'],
                'order_type' => $orderType,
                'quantity' => $sizing['quantity'],
                'original_quantity' => $sizing['quantity'],
                'entry_price' => $price,
                'margin' => $sizing['margin'],
                'original_margin' => $sizing['margin'],
                'leverage' => $leverage,
                'entry_fee' => $sizing['entryFee'],
                'original_entry_fee' => $sizing['entryFee'],
                'opened_at_time' => $validated['executed_at_time'] ?? null,
                'stop_loss' => $stopLoss,
                'take_profit' => $takeProfit,
                'liquidation_price' => ($isSpot || $marginMode === 'cross') ? null : $this->liquidationPrice($validated['side'], $price, $leverage),
                'trailing_stop_percent' => $validated['trailing_stop_percent'] ?? null,
                'break_even_trigger_percent' => $validated['break_even_trigger_percent'] ?? null,
                'partial_take_profit_percent' => $validated['partial_take_profit_percent'] ?? null,
                'favorable_price' => $price,
                'adverse_price' => $price,
                'status' => $isPendingOrder ? 'pending' : 'open',
                'setup_tag' => $playbook?->name,
                'playbook_snapshot' => $playbook ? [
                    'id' => $playbook->id,
                    'name' => $playbook->name,
                    'description' => $playbook->description,
                    'entryRules' => $playbook->entry_rules,
                    'confirmationRules' => $playbook->confirmation_rules,
                    'invalidationRules' => $playbook->invalidation_rules,
                    'stopRules' => $playbook->stop_rules,
                    'targetRules' => $playbook->target_rules,
                    'checklist' => array_values($playbook->checklist ?? []),
                ] : null,
                'checklist_answers' => $playbook ? $checklistAnswers : null,
            ];
            if (Schema::hasColumn('market_backtest_positions', 'exchange')) {
                $positionData['exchange'] = $exchange;
            }
            if (Schema::hasColumn('market_backtest_positions', 'margin_mode')) {
                $positionData['margin_mode'] = $marginMode;
            } elseif ($marginMode === 'cross') {
                abort(response()->json([
                    'success' => false,
                    'message' => 'Cross Margin requires the latest database migration.',
                ], 503));
            }
            $position = MarketBacktestPosition::query()->create($positionData);

            if ($isPendingOrder) {
                return ['account' => $account->fresh(), 'riskGuardrails' => $riskEvaluation];
            }

            $openTrade = MarketBacktestTrade::query()->create([
                'market_backtest_account_id' => $account->id,
                'market_backtest_session_id' => $session?->id,
                'market_backtest_position_id' => $position->id,
                'symbol' => $position->symbol,
                'side' => $position->side,
                'action' => 'open',
                'quantity' => $sizing['quantity'],
                'price' => $price,
                'notional' => $sizing['positionNotional'],
                'fee' => $sizing['entryFee'],
                'executed_at_time' => $validated['executed_at_time'] ?? null,
            ]);

            $this->tradeNotifications->recordFill($account, $position, $openTrade);

            $account->update([
                'cash_balance' => round((float) $account->cash_balance - $sizing['requiredCash'], 8),
                'fees_paid' => round((float) $account->fees_paid + $sizing['entryFee'], 8),
            ]);

            return ['account' => $account->fresh(), 'riskGuardrails' => $riskEvaluation];
        });

        $account = $result['account'];

        return response()->json([
            'success' => true,
            'account' => $this->buildPayload(
                $account,
                strtoupper($validated['symbol']),
                (float) $validated['price'],
                $this->getActiveSession($request, $account)
            ),
            'riskGuardrails' => $result['riskGuardrails'],
        ]);
    }

    public function updatePositionRisk(Request $request, MarketBacktestPosition $position)
    {
        $validated = $request->validate([
            'entry_price' => ['nullable', 'numeric', 'gt:0'],
            'stop_loss' => ['nullable', 'numeric', 'gt:0'],
            'take_profit' => ['nullable', 'numeric', 'gt:0'],
            'price' => ['nullable', 'numeric', 'gt:0'],
        ]);

        $account = DB::transaction(function () use ($request, $position, $validated) {
            $account = $this->getOrCreateAccount($request, true);

            $position = MarketBacktestPosition::query()
                ->where('id', $position->id)
                ->where('market_backtest_account_id', $account->id)
                ->whereIn('status', ['pending', 'open'])
                ->lockForUpdate()
                ->firstOrFail();

            $entryPrice = isset($validated['entry_price'])
                ? (float) $validated['entry_price']
                : (float) $position->entry_price;
            $stopLoss = array_key_exists('stop_loss', $validated)
                ? (float) $validated['stop_loss']
                : ($position->stop_loss !== null ? (float) $position->stop_loss : null);
            $takeProfit = array_key_exists('take_profit', $validated)
                ? (float) $validated['take_profit']
                : ($position->take_profit !== null ? (float) $position->take_profit : null);

            if ($position->side === 'long') {
                if ($stopLoss !== null && $stopLoss >= $entryPrice) {
                    abort(response()->json([
                        'success' => false,
                        'message' => 'Long stop loss must be below entry price.',
                    ], 422));
                }

                if ($takeProfit !== null && $takeProfit <= $entryPrice) {
                    abort(response()->json([
                        'success' => false,
                        'message' => 'Long take profit must be above entry price.',
                    ], 422));
                }
            }

            if ($position->side === 'short') {
                if ($stopLoss !== null && $stopLoss <= $entryPrice) {
                    abort(response()->json([
                        'success' => false,
                        'message' => 'Short stop loss must be above entry price.',
                    ], 422));
                }

                if ($takeProfit !== null && $takeProfit >= $entryPrice) {
                    abort(response()->json([
                        'success' => false,
                        'message' => 'Short take profit must be below entry price.',
                    ], 422));
                }
            }

            $updates = [
                'stop_loss' => $stopLoss,
                'take_profit' => $takeProfit,
            ];

            if (isset($validated['entry_price'])) {
                $updates['entry_price'] = $entryPrice;
            }

            if ($position->status === 'open' && isset($validated['entry_price'])) {
                $quantity = (float) $position->quantity;
                $leverage = $this->getPositionLeverage($position);
                $newNotional = round($quantity * $entryPrice, 8);
                $newMargin = round($newNotional / $leverage, 8);
                $newEntryFee = round($newNotional * self::FEE_RATE, 8);
                $oldCommitment = round((float) $position->margin + (float) $position->entry_fee, 8);
                $newCommitment = round($newMargin + $newEntryFee, 8);
                $commitmentIncrease = round($newCommitment - $oldCommitment, 8);
                $newCashBalance = round((float) $account->cash_balance - $commitmentIncrease, 8);

                if ($newCashBalance < 0) {
                    abort(response()->json([
                        'success' => false,
                        'message' => 'Insufficient paper balance to move the open entry to this price.',
                    ], 422));
                }

                $openingTrade = MarketBacktestTrade::query()
                    ->where('market_backtest_position_id', $position->id)
                    ->where('market_backtest_account_id', $account->id)
                    ->where('action', 'open')
                    ->lockForUpdate()
                    ->first();

                if (!$openingTrade) {
                    abort(response()->json([
                        'success' => false,
                        'message' => 'The opening trade record is unavailable for repricing.',
                    ], 409));
                }

                $feeDifference = round($newEntryFee - (float) $position->entry_fee, 8);
                $updates['margin'] = $newMargin;
                $updates['entry_fee'] = $newEntryFee;

                $openingTrade->update([
                    'price' => $entryPrice,
                    'quantity' => $quantity,
                    'notional' => $newNotional,
                    'fee' => $newEntryFee,
                ]);

                $account->update([
                    'cash_balance' => $newCashBalance,
                    'fees_paid' => round(max(0, (float) $account->fees_paid + $feeDifference), 8),
                ]);
            }

            $position->update($updates);

            return $account->fresh();
        });

        return response()->json([
            'success' => true,
            'account' => $this->buildPayload(
                $account,
                $position->symbol,
                isset($validated['price']) ? (float) $validated['price'] : null,
                $this->getActiveSession($request, $account)
            ),
        ]);
    }

    public function triggerPosition(Request $request, MarketBacktestPosition $position)
    {
        $validated = $request->validate([
            'price' => ['required', 'numeric', 'gt:0'],
            'executed_at_time' => ['nullable', 'integer', 'min:0'],
        ]);

        $account = DB::transaction(function () use ($request, $position, $validated) {
            $account = $this->getOrCreateAccount($request, true);

            $position = MarketBacktestPosition::query()
                ->where('id', $position->id)
                ->where('market_backtest_account_id', $account->id)
                ->lockForUpdate()
                ->firstOrFail();

            if ($position->status !== 'pending') {
                return $account->fresh();
            }

            $entryPrice = (float) $position->entry_price;
            $leverage = $this->getPositionLeverage($position);
            $isCross = Schema::hasColumn('market_backtest_positions', 'margin_mode') && $position->margin_mode === 'cross';
            $sizing = $isCross
                ? $this->resolveCrossEntrySizing((float) $position->margin, $leverage, $entryPrice)
                : $this->resolveEntrySizing((float) $position->margin, $leverage, $entryPrice, (float) $account->cash_balance);

            if (!$sizing) {
                abort(response()->json([
                    'success' => false,
                    'message' => 'Insufficient paper balance to trigger this pending entry.',
                ], 422));
            }

            if ($isCross) {
                $session = $this->getActiveSession($request, $account);
                $mode = isset($validated['executed_at_time']) ? 'replay' : 'live';
                $this->crossMarkService->record(
                    $account,
                    $session,
                    $position->exchange ?? 'bybit',
                    $position->category,
                    $position->symbol,
                    $mode,
                    (float) $validated['price'],
                    (int) ($validated['executed_at_time'] ?? time())
                );
                $cross = $this->buildCrossMetrics($account, $mode, $session, $position->id);
                if (!$cross['complete']) {
                    abort(response()->json([
                        'success' => false,
                        'message' => 'Cross Margin is unavailable until every open Cross market has a current simulated mark.',
                        'missingMarkets' => $cross['missingMarkets'],
                    ], 422));
                }
                if ($sizing['requiredCash'] > $cross['availableMargin']) {
                    abort(response()->json([
                        'success' => false,
                        'message' => 'Insufficient shared Cross available margin to trigger this pending entry.',
                    ], 422));
                }
            }

            $position->update([
                'quantity' => $sizing['quantity'],
                'margin' => $sizing['margin'],
                'entry_fee' => $sizing['entryFee'],
                'opened_at_time' => $validated['executed_at_time'] ?? null,
                'status' => 'open',
            ]);

            $triggerTrade = MarketBacktestTrade::query()->create([
                'market_backtest_account_id' => $account->id,
                'market_backtest_session_id' => $position->market_backtest_session_id,
                'market_backtest_position_id' => $position->id,
                'symbol' => $position->symbol,
                'side' => $position->side,
                'action' => 'open',
                'quantity' => $sizing['quantity'],
                'price' => $entryPrice,
                'notional' => $sizing['positionNotional'],
                'fee' => $sizing['entryFee'],
                'executed_at_time' => $validated['executed_at_time'] ?? null,
            ]);

            // A pending order reaching its trigger price — the fill that
            // openPosition() deliberately did not record when the order was
            // merely placed.
            $this->tradeNotifications->recordFill($account, $position, $triggerTrade);

            $account->update([
                'cash_balance' => round((float) $account->cash_balance - $sizing['requiredCash'], 8),
                'fees_paid' => round((float) $account->fees_paid + $sizing['entryFee'], 8),
            ]);

            return $account->fresh();
        });

        return response()->json([
            'success' => true,
            'account' => $this->buildPayload($account, $position->symbol, (float) $validated['price'], $this->getActiveSession($request, $account)),
        ]);
    }

    public function cancelPosition(Request $request, MarketBacktestPosition $position)
    {
        $account = DB::transaction(function () use ($request, $position) {
            $account = $this->getOrCreateAccount($request, true);

            $position = MarketBacktestPosition::query()
                ->where('id', $position->id)
                ->where('market_backtest_account_id', $account->id)
                ->lockForUpdate()
                ->firstOrFail();

            if ($position->status === 'pending') {
                $position->update(['status' => 'cancelled']);
            }

            return $account->fresh();
        });

        return response()->json([
            'success' => true,
            'account' => $this->buildPayload($account, null, null, $this->getActiveSession($request, $account)),
        ]);
    }

    public function closePosition(Request $request, MarketBacktestPosition $position)
    {
        $validated = $request->validate([
            'price' => ['required', 'numeric', 'gt:0'],
            'executed_at_time' => ['nullable', 'integer', 'min:0'],
            'close_reason' => ['nullable', Rule::in(['manual', 'stop_loss', 'take_profit', 'liquidation', 'partial_take_profit'])],
            'quantity_percent' => ['nullable', 'numeric', 'min:1', 'max:100'],
        ]);

        $result = DB::transaction(function () use ($request, $position, $validated) {
            $account = $this->getOrCreateAccount($request, true);

            $position = MarketBacktestPosition::query()
                ->where('id', $position->id)
                ->where('market_backtest_account_id', $account->id)
                ->lockForUpdate()
                ->firstOrFail();

            if ($position->status !== 'open') {
                return ['account' => $account->fresh(), 'closedTrade' => null];
            }

            $exitPrice = (float) $validated['price'];
            $quantity = (float) $position->quantity;
            $quantityPercent = (float) ($validated['quantity_percent'] ?? 100);
            $closeQuantity = round($quantity * ($quantityPercent / 100), 10);
            $isPartial = $closeQuantity < $quantity;
            $fraction = $closeQuantity / $quantity;
            $exitNotional = round($closeQuantity * $exitPrice, 8);
            $exitFee = round($exitNotional * self::FEE_RATE, 8);
            $grossPnl = $position->side === 'long'
                ? round(($exitPrice - (float) $position->entry_price) * $closeQuantity, 8)
                : round(((float) $position->entry_price - $exitPrice) * $closeQuantity, 8);
            $entryFeePortion = round((float) $position->entry_fee * $fraction, 8);
            $netPnl = round($grossPnl - $entryFeePortion - $exitFee, 8);
            $marginPortion = round((float) $position->margin * $fraction, 8);

            $position->update([
                'quantity' => $isPartial ? round($quantity - $closeQuantity, 10) : $quantity,
                'margin' => $isPartial ? round((float) $position->margin - $marginPortion, 8) : $position->margin,
                'entry_fee' => $isPartial ? round((float) $position->entry_fee - $entryFeePortion, 8) : $position->entry_fee,
                'exit_price' => $exitPrice,
                'exit_fee' => round((float) $position->exit_fee + $exitFee, 8),
                'realized_pnl' => round((float) $position->realized_pnl + $netPnl, 8),
                'closed_at_time' => $isPartial ? null : ($validated['executed_at_time'] ?? null),
                'status' => $isPartial ? 'open' : 'closed',
                'close_reason' => $isPartial ? null : ($validated['close_reason'] ?? 'manual'),
                'partial_take_profit_executed' => $isPartial ? true : $position->partial_take_profit_executed,
                'take_profit' => $isPartial ? null : $position->take_profit,
            ]);

            $closeTrade = MarketBacktestTrade::query()->create([
                'market_backtest_account_id' => $account->id,
                'market_backtest_session_id' => $position->market_backtest_session_id,
                'market_backtest_position_id' => $position->id,
                'symbol' => $position->symbol,
                'side' => $position->side,
                'action' => 'close',
                'quantity' => $closeQuantity,
                'price' => $exitPrice,
                'notional' => $exitNotional,
                'fee' => $exitFee,
                'pnl' => $netPnl,
                'executed_at_time' => $validated['executed_at_time'] ?? null,
            ]);

            // Every close path reaches here — manual, the client-detected SL/TP
            // branch, and processPositionCandle()'s server-side managed
            // triggers (liquidation, trailing stop, break-even, partial TP) —
            // so this single call covers all of them.
            $this->tradeNotifications->recordClose(
                $account,
                $position,
                $closeTrade,
                $validated['close_reason'] ?? 'manual',
                $isPartial
            );

            $account->update([
                'cash_balance' => round((float) $account->cash_balance + $marginPortion + $grossPnl - $exitFee, 8),
                'realized_pnl' => round((float) $account->realized_pnl + $netPnl, 8),
                'fees_paid' => round((float) $account->fees_paid + $exitFee, 8),
            ]);

            return [
                'account' => $account->fresh(),
                'closedTrade' => [
                    'positionId' => $position->id,
                    'symbol' => $position->symbol,
                    'side' => $position->side,
                    'category' => $position->category,
                    'reason' => $validated['close_reason'] ?? 'manual',
                    'isPartial' => $isPartial,
                    'quantity' => $closeQuantity,
                    'price' => $exitPrice,
                    'netPnl' => $netPnl,
                ],
            ];
        });

        $account = $result['account'];

        return response()->json([
            'success' => true,
            'account' => $this->buildPayload($account, $position->symbol, (float) $validated['price'], $this->getActiveSession($request, $account)),
            'closedTrade' => $result['closedTrade'],
        ]);
    }

    public function evaluateCrossPortfolio(Request $request)
    {
        $validated = $request->validate([
            'mode' => ['nullable', Rule::in(['live', 'replay'])],
            'session_id' => ['nullable', 'integer', 'min:1'],
        ]);

        $account = $this->getOrCreateAccount($request);
        $mode = $validated['mode'] ?? 'live';
        $session = $mode === 'replay' ? $this->resolveSessionForEvaluation($request, $account, $validated) : null;

        $result = $this->crossLiquidationService->evaluate($account->id, $mode, $session?->id, self::FEE_RATE);

        $account = $account->fresh();

        return response()->json([
            'success' => true,
            'account' => $this->buildPayload($account, null, null, $this->getActiveSession($request, $account)),
            'liquidation' => $result['liquidated'] ? [
                'reason' => $result['reason'],
                'closedTrades' => $result['closedTrades'],
                'notificationId' => $result['notificationId'],
                'notificationContent' => $result['notificationContent'],
            ] : null,
        ]);
    }

    public function processPositionCandle(Request $request, MarketBacktestPosition $position)
    {
        $validated = $request->validate([
            'high' => ['required', 'numeric', 'gt:0'],
            'low' => ['required', 'numeric', 'gt:0'],
            'price' => ['required', 'numeric', 'gt:0'],
            'executed_at_time' => ['required', 'integer', 'min:0'],
        ]);

        $account = $this->getOrCreateAccount($request);
        $position = MarketBacktestPosition::query()->where('id', $position->id)
            ->where('market_backtest_account_id', $account->id)->where('status', 'open')->firstOrFail();
        $high = (float) $validated['high'];
        $low = (float) $validated['low'];
        $favorable = $position->side === 'long'
            ? max((float) ($position->favorable_price ?: $position->entry_price), $high)
            : min((float) ($position->favorable_price ?: $position->entry_price), $low);
        $updates = ['favorable_price' => $favorable];

        $adverse = $position->side === 'long'
            ? min((float) ($position->adverse_price ?: $position->entry_price), $low)
            : max((float) ($position->adverse_price ?: $position->entry_price), $high);
        $updates['adverse_price'] = $adverse;

        if ($position->trailing_stop_percent !== null) {
            $distance = (float) $position->trailing_stop_percent / 100;
            $trailingStop = $position->side === 'long' ? $favorable * (1 - $distance) : $favorable * (1 + $distance);
            $currentStop = $position->stop_loss !== null ? (float) $position->stop_loss : null;
            $updates['stop_loss'] = $currentStop === null ? $trailingStop : ($position->side === 'long' ? max($currentStop, $trailingStop) : min($currentStop, $trailingStop));
        }

        if ($position->break_even_trigger_percent !== null) {
            $trigger = (float) $position->break_even_trigger_percent / 100;
            $reached = $position->side === 'long' ? $high >= (float) $position->entry_price * (1 + $trigger) : $low <= (float) $position->entry_price * (1 - $trigger);
            if ($reached) $updates['stop_loss'] = (float) $position->entry_price;
        }
        $position->update($updates);
        $position->refresh();

        $exitPrice = null; $reason = null; $quantityPercent = 100;
        if ($position->liquidation_price !== null && (($position->side === 'long' && $low <= (float) $position->liquidation_price) || ($position->side === 'short' && $high >= (float) $position->liquidation_price))) {
            $exitPrice = (float) $position->liquidation_price; $reason = 'liquidation';
        } elseif ($position->stop_loss !== null && (($position->side === 'long' && $low <= (float) $position->stop_loss) || ($position->side === 'short' && $high >= (float) $position->stop_loss))) {
            $exitPrice = (float) $position->stop_loss; $reason = 'stop_loss';
        } elseif ($position->take_profit !== null && (($position->side === 'long' && $high >= (float) $position->take_profit) || ($position->side === 'short' && $low <= (float) $position->take_profit))) {
            $exitPrice = (float) $position->take_profit;
            if ($position->partial_take_profit_percent !== null && !$position->partial_take_profit_executed) {
                $reason = 'partial_take_profit'; $quantityPercent = (float) $position->partial_take_profit_percent;
            } else $reason = 'take_profit';
        }

        if ($exitPrice === null) return response()->json(['success' => true, 'triggered' => false, 'account' => $this->buildPayload($account, $position->symbol, (float) $validated['price'], $this->getActiveSession($request, $account))]);
        $request->merge(['price' => $exitPrice, 'close_reason' => $reason, 'quantity_percent' => $quantityPercent]);
        return $this->closePosition($request, $position);
    }

    private function getActiveSession(Request $request, MarketBacktestAccount $account): ?MarketBacktestSession
    {
        return MarketBacktestSession::query()
            ->where('adm_user_id', $request->user()->id)
            ->where('market_backtest_account_id', $account->id)
            ->where('status', 'active')
            ->latest()
            ->first();
    }

    private function resolveSessionForEvaluation(Request $request, MarketBacktestAccount $account, array $validated): ?MarketBacktestSession
    {
        if (!empty($validated['session_id'])) {
            return MarketBacktestSession::query()
                ->where('id', $validated['session_id'])
                ->where('adm_user_id', $request->user()->id)
                ->where('market_backtest_account_id', $account->id)
                ->where('status', 'active')
                ->first();
        }

        return $this->getActiveSession($request, $account);
    }

    private function getOrCreateActiveSession(Request $request, MarketBacktestAccount $account, array $data): MarketBacktestSession
    {
        $session = $this->getActiveSession($request, $account);

        if ($session) {
            return $session;
        }

        return $this->createSession($request, $account, $data);
    }

    private function resolveSessionForTrade(Request $request, MarketBacktestAccount $account, array $data): ?MarketBacktestSession
    {
        if (!empty($data['session_id'])) {
            return MarketBacktestSession::query()
                ->where('id', $data['session_id'])
                ->where('adm_user_id', $request->user()->id)
                ->where('market_backtest_account_id', $account->id)
                ->where('status', 'active')
                ->first();
        }

        return $this->getOrCreateActiveSession($request, $account, $data);
    }

    private function createSession(Request $request, MarketBacktestAccount $account, array $data): MarketBacktestSession
    {
        $symbol = strtoupper($data['symbol']);
        $timeframe = $data['timeframe'] ?? '15m';
        $name = trim((string) ($data['name'] ?? ''));

        return MarketBacktestSession::query()->create([
            'market_backtest_account_id' => $account->id,
            'adm_user_id' => $request->user()->id,
            'name' => $name !== '' ? $name : "{$symbol} {$timeframe} Session",
            'symbol' => $symbol,
            'exchange' => $data['exchange'] ?? 'bybit',
            'market_category' => $data['category'] ?? 'spot',
            'timeframe' => $timeframe,
            'starting_balance' => (float) $account->starting_balance,
            'started_at_time' => $data['started_at_time'] ?? null,
            'status' => 'active',
        ]);
    }

    private function endActiveSessions(Request $request, MarketBacktestAccount $account, ?int $endedAtTime = null): void
    {
        MarketBacktestSession::query()
            ->where('adm_user_id', $request->user()->id)
            ->where('market_backtest_account_id', $account->id)
            ->where('status', 'active')
            ->update([
                'status' => 'ended',
                'ended_at_time' => $endedAtTime ?? time(),
            ]);
    }

    private function nullableTrim(?string $value): ?string
    {
        $trimmed = trim((string) $value);

        return $trimmed === '' ? null : $trimmed;
    }

    private function getSnapshotUrl(?MarketBacktestSnapshot $snapshot): ?string
    {
        if (!$snapshot) {
            return null;
        }

        if ($snapshot->path) {
            return $this->buildPublicStorageUrl($snapshot->path);
        }

        return $snapshot->url;
    }

    private function buildPublicStorageUrl(string $path): string
    {
        return url('storage/' . ltrim($path, '/'));
    }

    private function getOrCreateAccount(Request $request, bool $lock = false): MarketBacktestAccount
    {
        $query = MarketBacktestAccount::query()
            ->where('adm_user_id', $request->user()->id)
            ->where('is_active', true);

        if ($lock) {
            $query->lockForUpdate();
        }

        $account = $query->first();

        if ($account) {
            return $account;
        }

        return MarketBacktestAccount::query()->create([
            'adm_user_id' => $request->user()->id,
            'name' => 'Demo Account',
            'quote_currency' => 'USDT',
            'starting_balance' => self::DEFAULT_BALANCE,
            'cash_balance' => self::DEFAULT_BALANCE,
            'realized_pnl' => 0,
            'fees_paid' => 0,
            'is_active' => true,
        ]);
    }

    private function getPositionLeverage(MarketBacktestPosition $position): float
    {
        $leverage = (float) ($position->leverage ?? 1);

        return $leverage > 0 ? $leverage : 1;
    }

    private function getPositionNotional(MarketBacktestPosition $position): float
    {
        return round((float) $position->margin * $this->getPositionLeverage($position), 8);
    }

    private function buildCrossMetrics(
        MarketBacktestAccount $account,
        string $mode,
        ?MarketBacktestSession $session = null,
        ?int $excludePositionId = null
    ): array {
        $marks = $this->crossMarkService->mapForAccount(
            $account,
            $mode,
            $session,
            $mode === 'live' ? now()->subMinutes(2) : null
        );

        return $this->crossMarginService->calculate(
            (float) $account->cash_balance,
            $account->positions()->where('status', 'open')->when(
                $excludePositionId,
                fn ($query) => $query->where('id', '!=', $excludePositionId)
            )->get(),
            $account->positions()->where('status', 'pending')->when(
                $excludePositionId,
                fn ($query) => $query->where('id', '!=', $excludePositionId)
            )->get(),
            $marks,
            self::FEE_RATE
        );
    }

    private function liquidationPrice(string $side, float $entryPrice, float $leverage): float
    {
        $maintenanceMarginRate = 0.005;
        $distance = 1 / max($leverage, 1);
        $price = $side === 'long'
            ? $entryPrice * max($maintenanceMarginRate, 1 - $distance + $maintenanceMarginRate)
            : $entryPrice * (1 + $distance - $maintenanceMarginRate);

        return round(max($price, 0.00000001), 8);
    }

    /**
     * Converts a target % PnL of margin (leveraged) into the trigger price that
     * produces it, so SL/TP can be entered as "-20% PnL" instead of a raw price.
     */
    private function priceFromPnlPercent(string $side, float $entryPrice, float $leverage, float $pnlPercent, bool $isLoss): float
    {
        $leverage = max($leverage, 1);
        $fraction = abs($pnlPercent) / (100 * $leverage);
        $signedFraction = $isLoss ? -$fraction : $fraction;

        $price = $side === 'long'
            ? $entryPrice * (1 + $signedFraction)
            : $entryPrice * (1 - $signedFraction);

        return round(max($price, 0.00000001), 8);
    }

    private function resolveEntrySizing(float $requestedMargin, float $leverage, float $price, float $cashBalance): ?array
    {
        $margin = round($requestedMargin, 8);
        $leverage = round(max($leverage, 1), 2);

        if ($margin <= 0 || $price <= 0 || $cashBalance <= 0) {
            return null;
        }

        $positionNotional = round($margin * $leverage, 8);
        $entryFee = round($positionNotional * self::FEE_RATE, 8);
        $requiredCash = round($margin + $entryFee, 8);

        if ($cashBalance < $requiredCash) {
            if ($margin > $cashBalance) {
                return null;
            }

            $margin = round($cashBalance / (1 + ($leverage * self::FEE_RATE)), 8);
            $positionNotional = round($margin * $leverage, 8);
            $entryFee = round($positionNotional * self::FEE_RATE, 8);
            $requiredCash = round($margin + $entryFee, 8);
        }

        if ($margin < 1 || $cashBalance < $requiredCash) {
            return null;
        }

        return [
            'margin' => $margin,
            'positionNotional' => $positionNotional,
            'entryFee' => $entryFee,
            'requiredCash' => $requiredCash,
            'quantity' => round($positionNotional / $price, 10),
        ];
    }

    /**
     * Cross's counterpart to resolveEntrySizing() — deliberately has no cashBalance
     * parameter and never trims/rejects based on it. A Cross entry's affordability is
     * decided by the pooled cross_available_margin check the caller runs separately
     * (which already accounts for unrealized profit in other open Cross positions);
     * gating on raw cash_balance here would reject entries the portfolio can actually
     * cover.
     */
    private function resolveCrossEntrySizing(float $requestedMargin, float $leverage, float $price): ?array
    {
        $margin = round($requestedMargin, 8);
        $leverage = round(max($leverage, 1), 2);

        if ($margin <= 0 || $price <= 0) {
            return null;
        }

        $positionNotional = round($margin * $leverage, 8);
        $entryFee = round($positionNotional * self::FEE_RATE, 8);

        return [
            'margin' => $margin,
            'positionNotional' => $positionNotional,
            'entryFee' => $entryFee,
            'requiredCash' => round($margin + $entryFee, 8),
            'quantity' => round($positionNotional / $price, 10),
        ];
    }

    private function buildPayload(
        MarketBacktestAccount $account,
        ?string $symbol = null,
        ?float $price = null,
        ?MarketBacktestSession $session = null
    ): array
    {
        $openPositions = $account->positions()
            ->where('status', 'open')
            ->when($session, fn ($query) => $query->where('market_backtest_session_id', $session->id))
            ->orderByDesc('created_at')
            ->get();
        $pendingPositions = $account->positions()
            ->where('status', 'pending')
            ->when($session, fn ($query) => $query->where('market_backtest_session_id', $session->id))
            ->orderByDesc('created_at')
            ->get();
        $trades = $account->trades()
            ->when($session, fn ($query) => $query->where('market_backtest_session_id', $session->id))
            ->orderByDesc('created_at')
            ->limit(30)
            ->get();

        $crossOpenPositions = $account->positions()->where('status', 'open')->get();
        $crossPendingPositions = $account->positions()->where('status', 'pending')->get();
        $crossMarks = $this->crossMarkService->mapForAccount($account, 'live', null, now()->subMinutes(2));
        if ($session) {
            $crossMarks = array_merge($crossMarks, $this->crossMarkService->mapForAccount($account, 'replay', $session));
        }
        if ($symbol && $price) {
            // Matching by symbol alone is only safe when exactly one Cross market uses that
            // symbol string for this account — buildPayload() isn't told which exchange the
            // incoming price belongs to, and overlaying it onto every same-named position would
            // write one exchange's price onto another exchange's distinct market (e.g. both an
            // okx:linear:BTCUSDT and a bybit:linear:BTCUSDT Cross position). When that ambiguity
            // exists, skip the overlay and rely on each market's own already-persisted mark.
            $symbolMatches = $crossOpenPositions->concat($crossPendingPositions)
                ->filter(fn (MarketBacktestPosition $position) => $position->symbol === $symbol);
            $distinctMarkets = $symbolMatches->map(fn (MarketBacktestPosition $position) => $this->crossMarginService->marketKey($position))->unique();
            if ($distinctMarkets->count() === 1) {
                $crossMarks[$distinctMarkets->first()] = $price;
            }
        }
        $crossMetrics = $this->crossMarginService->calculate(
            (float) $account->cash_balance,
            $crossOpenPositions,
            $crossPendingPositions,
            $crossMarks,
            self::FEE_RATE
        );

        $unrealizedPnl = $openPositions->sum(function (MarketBacktestPosition $position) use ($symbol, $price) {
            if (!$price || !$symbol || $position->symbol !== $symbol) {
                return 0;
            }

            $quantity = (float) $position->quantity;
            return $position->side === 'long'
                ? (($price - (float) $position->entry_price) * $quantity)
                : (((float) $position->entry_price - $price) * $quantity);
        });
        $lockedMargin = $openPositions->sum(fn (MarketBacktestPosition $position) => (float) $position->margin);
        $equity = (float) $account->cash_balance + $lockedMargin + $unrealizedPnl;

        return [
            'id' => $account->id,
            'name' => $account->name,
            'quoteCurrency' => $account->quote_currency,
            'startingBalance' => (float) $account->starting_balance,
            'cashBalance' => (float) $account->cash_balance,
            'lockedMargin' => round($lockedMargin, 8),
            'equity' => round($equity, 8),
            'unrealizedPnl' => round($unrealizedPnl, 8),
            'realizedPnl' => (float) $account->realized_pnl,
            'feesPaid' => (float) $account->fees_paid,
            'feeRate' => self::FEE_RATE,
            'cross' => $crossMetrics,
            'activeSession' => $session ? [
                'id' => $session->id,
                'name' => $session->name,
                'symbol' => $session->symbol,
                'exchange' => $session->exchange,
                'marketCategory' => $session->market_category,
                'timeframe' => $session->timeframe,
                'startingBalance' => (float) $session->starting_balance,
                'startedAtTime' => $session->started_at_time,
                'endedAtTime' => $session->ended_at_time,
                'status' => $session->status,
            ] : null,
            'openPositions' => $openPositions->map(fn (MarketBacktestPosition $position) => [
                'id' => $position->id,
                'sessionId' => $position->market_backtest_session_id,
                'symbol' => $position->symbol,
                'exchange' => $position->exchange ?? 'bybit',
                'category' => $position->category,
                'marginMode' => $position->margin_mode ?? 'isolated',
                'side' => $position->side,
                'status' => $position->status,
                'quantity' => (float) $position->quantity,
                'entryPrice' => (float) $position->entry_price,
                'margin' => (float) $position->margin,
                'leverage' => $this->getPositionLeverage($position),
                'notional' => $this->getPositionNotional($position),
                'entryFee' => (float) $position->entry_fee,
                'openedAtTime' => $position->opened_at_time,
                'stopLoss' => $position->stop_loss !== null ? (float) $position->stop_loss : null,
                'takeProfit' => $position->take_profit !== null ? (float) $position->take_profit : null,
                'liquidationPrice' => $position->liquidation_price !== null ? (float) $position->liquidation_price : null,
                'trailingStopPercent' => $position->trailing_stop_percent !== null ? (float) $position->trailing_stop_percent : null,
                'breakEvenTriggerPercent' => $position->break_even_trigger_percent !== null ? (float) $position->break_even_trigger_percent : null,
                'partialTakeProfitPercent' => $position->partial_take_profit_percent !== null ? (float) $position->partial_take_profit_percent : null,
                'partialTakeProfitExecuted' => (bool) $position->partial_take_profit_executed,
                'playbookName' => $position->playbook_snapshot['name'] ?? null,
                'checklistComplete' => $position->playbook_snapshot
                    ? count($position->checklist_answers ?? []) === count($position->playbook_snapshot['checklist'] ?? [])
                        && !in_array(false, $position->checklist_answers ?? [], true)
                    : null,
                'unrealizedPnl' => $price && $symbol === $position->symbol
                    ? round($position->side === 'long'
                        ? ($price - (float) $position->entry_price) * (float) $position->quantity
                        : ((float) $position->entry_price - $price) * (float) $position->quantity, 8)
                    : null,
            ])->values(),
            'pendingPositions' => $pendingPositions->map(fn (MarketBacktestPosition $position) => [
                'id' => $position->id,
                'sessionId' => $position->market_backtest_session_id,
                'symbol' => $position->symbol,
                'exchange' => $position->exchange ?? 'bybit',
                'category' => $position->category,
                'marginMode' => $position->margin_mode ?? 'isolated',
                'side' => $position->side,
                'status' => $position->status,
                'quantity' => (float) $position->quantity,
                'entryPrice' => (float) $position->entry_price,
                'margin' => (float) $position->margin,
                'leverage' => $this->getPositionLeverage($position),
                'notional' => $this->getPositionNotional($position),
                'entryFee' => (float) $position->entry_fee,
                'openedAtTime' => $position->opened_at_time,
                'stopLoss' => $position->stop_loss !== null ? (float) $position->stop_loss : null,
                'takeProfit' => $position->take_profit !== null ? (float) $position->take_profit : null,
                'liquidationPrice' => $position->liquidation_price !== null ? (float) $position->liquidation_price : null,
                'trailingStopPercent' => $position->trailing_stop_percent !== null ? (float) $position->trailing_stop_percent : null,
                'breakEvenTriggerPercent' => $position->break_even_trigger_percent !== null ? (float) $position->break_even_trigger_percent : null,
                'partialTakeProfitPercent' => $position->partial_take_profit_percent !== null ? (float) $position->partial_take_profit_percent : null,
                'playbookName' => $position->playbook_snapshot['name'] ?? null,
                'checklistComplete' => $position->playbook_snapshot
                    ? count($position->checklist_answers ?? []) === count($position->playbook_snapshot['checklist'] ?? [])
                        && !in_array(false, $position->checklist_answers ?? [], true)
                    : null,
            ])->values(),
            'trades' => $trades->map(fn (MarketBacktestTrade $trade) => [
                'id' => $trade->id,
                'sessionId' => $trade->market_backtest_session_id,
                'positionId' => $trade->market_backtest_position_id,
                'symbol' => $trade->symbol,
                'side' => $trade->side,
                'action' => $trade->action,
                'quantity' => (float) $trade->quantity,
                'price' => (float) $trade->price,
                'notional' => (float) $trade->notional,
                'fee' => (float) $trade->fee,
                'pnl' => $trade->pnl !== null ? (float) $trade->pnl : null,
                'executedAtTime' => $trade->executed_at_time,
            ])->values(),
        ];
    }
}

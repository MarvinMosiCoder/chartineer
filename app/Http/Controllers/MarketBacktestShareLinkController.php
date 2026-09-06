<?php

namespace App\Http\Controllers;

use App\Models\MarketBacktestAccount;
use App\Models\MarketBacktestPosition;
use App\Models\MarketBacktestSession;
use App\Models\MarketBacktestShareLink;
use App\Services\SubscriptionTierService;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Authenticated management side of "Shareable mentor review links". Everything here
 * requires a logged-in trader and only ever operates on that trader's own rows.
 *
 * The public, unauthenticated viewing side lives in MentorReviewController — never merge
 * these two controllers, the auth boundary between them is the whole point.
 */
class MarketBacktestShareLinkController extends Controller
{
    /**
     * Columns that are safe to expose to the authenticated management UI. token_hash is
     * deliberately never in this list (see also MarketBacktestShareLink::$hidden).
     */
    private const SAFE_COLUMNS = [
        'id',
        'label',
        'scope_type',
        'session_id',
        'range_start_time',
        'range_end_time',
        'trade_ids',
        'include_journal',
        'include_snapshots',
        'include_analytics',
        'expires_at',
        'revoked_at',
        'view_count',
        'last_viewed_at',
        'created_at',
        'updated_at',
    ];

    public function __construct(private readonly SubscriptionTierService $tiers)
    {
    }

    public function index(Request $request)
    {
        $account = $this->getOrCreateAccount($request);

        $shareLinks = MarketBacktestShareLink::query()
            ->select(self::SAFE_COLUMNS)
            ->where('adm_user_id', $request->user()->id)
            ->where('market_backtest_account_id', $account->id)
            ->orderByDesc('created_at')
            ->get();

        return response()->json([
            'success' => true,
            'shareLinks' => $shareLinks->map(fn (MarketBacktestShareLink $shareLink) => $this->serialize($shareLink)),
        ]);
    }

    public function store(Request $request)
    {
        // Live links only — a revoked or expired one serves no traffic and so
        // does not occupy a slot.
        $this->tiers->assertWithinQuota($request->user(), 'share_links',
            MarketBacktestShareLink::query()
                ->where('adm_user_id', $request->user()->id)
                ->whereNull('revoked_at')
                ->where(fn ($query) => $query->whereNull('expires_at')->orWhere('expires_at', '>', now()))
                ->count());

        $validated = $request->validate([
            'label' => ['nullable', 'string', 'max:120'],
            'scope_type' => ['required', Rule::in(['session', 'date_range', 'trade_ids'])],
            'expires_at' => ['nullable', 'date', 'after:now'],
            'include_journal' => ['boolean'],
            'include_snapshots' => ['boolean'],
            'include_analytics' => ['boolean'],
            'session_id' => ['required_if:scope_type,session', 'integer', 'min:1'],
            'range_start_time' => ['required_if:scope_type,date_range', 'integer', 'min:0'],
            'range_end_time' => ['required_if:scope_type,date_range', 'integer', 'min:0'],
            'trade_ids' => ['required_if:scope_type,trade_ids', 'array', 'min:1'],
            'trade_ids.*' => ['integer', 'min:1'],
        ]);

        $account = $this->getOrCreateAccount($request);
        $scopeType = $validated['scope_type'];

        $sessionId = null;
        $rangeStartTime = null;
        $rangeEndTime = null;
        $tradeIds = null;

        if ($scopeType === 'session') {
            $sessionOwned = MarketBacktestSession::where('id', $validated['session_id'])
                ->where('adm_user_id', $request->user()->id)
                ->where('market_backtest_account_id', $account->id)
                ->exists();

            if (!$sessionOwned) {
                throw ValidationException::withMessages([
                    'session_id' => 'That session was not found on your account.',
                ]);
            }

            $sessionId = (int) $validated['session_id'];
        } elseif ($scopeType === 'date_range') {
            $rangeStartTime = (int) $validated['range_start_time'];
            $rangeEndTime = (int) $validated['range_end_time'];

            if ($rangeEndTime <= $rangeStartTime) {
                throw ValidationException::withMessages([
                    'range_end_time' => 'The range end must be after the range start.',
                ]);
            }
        } else { // trade_ids
            $requestedIds = collect($validated['trade_ids'])->map(fn ($id) => (int) $id)->unique()->values();

            $ownedCount = MarketBacktestPosition::query()
                ->where('market_backtest_account_id', $account->id)
                ->where('status', 'closed')
                ->whereIn('id', $requestedIds)
                ->count();

            if ($ownedCount !== $requestedIds->count()) {
                throw ValidationException::withMessages([
                    'trade_ids' => 'One or more selected trades do not belong to you or are not closed.',
                ]);
            }

            $tradeIds = $requestedIds->all();
        }

        $plainToken = Str::random(48);

        $shareLink = MarketBacktestShareLink::create([
            'adm_user_id' => $request->user()->id,
            'market_backtest_account_id' => $account->id,
            'token_hash' => hash('sha256', $plainToken),
            'label' => $validated['label'] ?? null,
            'scope_type' => $scopeType,
            'session_id' => $sessionId,
            'range_start_time' => $rangeStartTime,
            'range_end_time' => $rangeEndTime,
            'trade_ids' => $tradeIds,
            'include_journal' => $request->boolean('include_journal', true),
            'include_snapshots' => $request->boolean('include_snapshots', true),
            'include_analytics' => $request->boolean('include_analytics', true),
            'expires_at' => $validated['expires_at'] ?? null,
        ]);

        return response()->json([
            'success' => true,
            'shareLink' => $this->serialize($shareLink),
            'url' => url('/mentor-review/'.$plainToken),
        ], 201);
    }

    public function completeTour(Request $request)
    {
        if (!$request->user()->mentor_tour_completed_at) {
            $request->user()->forceFill(['mentor_tour_completed_at' => now()])->save();
        }

        return response()->json(['success' => true]);
    }

    public function destroy(Request $request, MarketBacktestShareLink $shareLink)
    {
        abort_unless($shareLink->adm_user_id === $request->user()->id, 404);

        if ($shareLink->revoked_at === null) {
            $shareLink->update(['revoked_at' => now()]);
        }

        return response()->json([
            'success' => true,
            'shareLink' => $this->serialize($shareLink->fresh(self::SAFE_COLUMNS)),
        ]);
    }

    private function serialize(MarketBacktestShareLink $shareLink): array
    {
        return [
            'id' => $shareLink->id,
            'label' => $shareLink->label,
            'scopeType' => $shareLink->scope_type,
            'sessionId' => $shareLink->session_id,
            'rangeStartTime' => $shareLink->range_start_time,
            'rangeEndTime' => $shareLink->range_end_time,
            'tradeIds' => $shareLink->trade_ids,
            'includeJournal' => (bool) $shareLink->include_journal,
            'includeSnapshots' => (bool) $shareLink->include_snapshots,
            'includeAnalytics' => (bool) $shareLink->include_analytics,
            'expiresAt' => optional($shareLink->expires_at)->toIso8601String(),
            'revokedAt' => optional($shareLink->revoked_at)->toIso8601String(),
            'viewCount' => (int) $shareLink->view_count,
            'lastViewedAt' => optional($shareLink->last_viewed_at)->toIso8601String(),
            'createdAt' => optional($shareLink->created_at)->toIso8601String(),
        ];
    }

    /**
     * Same "the authenticated trader's single active demo account" resolution pattern as
     * MarketBacktestController::getOrCreateAccount() (app/Http/Controllers/MarketBacktestController.php).
     * Duplicated here as a small private helper rather than sharing a trait/service, since this
     * controller only ever needs the read/create-if-missing shape, not the locking variant.
     */
    private function getOrCreateAccount(Request $request): MarketBacktestAccount
    {
        $account = MarketBacktestAccount::query()
            ->where('adm_user_id', $request->user()->id)
            ->where('is_active', true)
            ->first();

        if ($account) {
            return $account;
        }

        return MarketBacktestAccount::create([
            'adm_user_id' => $request->user()->id,
            'name' => 'Demo Account',
            'is_active' => true,
        ]);
    }
}

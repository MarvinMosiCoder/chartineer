<?php

namespace App\Http\Controllers;

use App\Models\AdmUser;
use App\Models\MarketBacktestPosition;
use App\Models\MarketBacktestShareLink;
use App\Services\MarketBacktestAdvancedAnalyticsService;
use App\Services\MarketBacktestReportService;
use App\Services\SubscriptionTierService;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * PUBLIC, unauthenticated side of "Shareable mentor review links". No auth middleware, no
 * session, no CSRF-protected mutation beyond the view-count bump below — this is the page an
 * external mentor opens from a link they were sent.
 *
 * Security posture (see docs/developer/mentor-review-sharing.md for the full writeup):
 *  - The URL token is looked up only by its sha256 hash; the plaintext token is never stored.
 *  - Revoked/expired links return 410, unknown tokens return 404 (see the doc for why these
 *    are kept distinct instead of collapsing both to 404).
 *  - Every position query is hard-floored to this share link's own account + status=closed,
 *    on top of whatever the scope_type filter adds — belt-and-suspenders against a
 *    misconfigured scope ever leaking another account's trades.
 *  - Per-trade journal/snapshot fields are redacted here, server-side, before the Inertia
 *    props are ever built — Public/MentorReview.jsx receives only what it's allowed to render
 *    and must not need to re-derive redaction on the client.
 */
class MentorReviewController extends Controller
{
    private const JOURNAL_FIELDS = [
        'entryReason',
        'exitReason',
        'mistake',
        'emotion',
        'journalNotes',
        'tags',
        'setupTag',
    ];

    private const SNAPSHOT_FIELDS = [
        'entrySnapshotUrl',
        'exitSnapshotUrl',
    ];

    public function __construct(
        private readonly MarketBacktestReportService $reportService,
        private readonly MarketBacktestAdvancedAnalyticsService $advancedAnalyticsService,
        private readonly SubscriptionTierService $tiers,
    ) {
    }

    public function show(Request $request, string $token): Response
    {
        $shareLink = MarketBacktestShareLink::where('token_hash', hash('sha256', $token))->first();

        abort_if(!$shareLink, 404);

        if ($shareLink->revoked_at !== null || ($shareLink->expires_at !== null && now()->gte($shareLink->expires_at))) {
            abort(410, 'This share link has expired or been revoked.');
        }

        // Sharing is a paid capability and these are public URLs serving traffic
        // to third parties, so a link stops resolving once its owner drops below
        // the tier that grants it. The row and its token are left intact — the
        // link works again if the owner resubscribes — which is why this is a
        // live tier check rather than a revoked_at write.
        if (!$this->tiers->allows(AdmUser::find($shareLink->adm_user_id), 'mentor_share')) {
            abort(410, 'This share link is not currently available.');
        }

        $positions = $this->resolveScopedPositions($shareLink);

        // Only bump the view counter after positions loaded successfully, so a crash
        // mid-request never falsely counts a view.
        $shareLink->update([
            'view_count' => $shareLink->view_count + 1,
            'last_viewed_at' => now(),
        ]);

        $trades = $positions
            ->map(fn (MarketBacktestPosition $position) => $this->redact($this->reportService->serializeReportPosition($position), $shareLink))
            ->values();

        $analytics = null;

        if ($shareLink->include_analytics) {
            // Starting balance is deliberately 0 here — never the real account balance. This
            // still produces a valid relative equity curve / drawdown / Monte Carlo spread,
            // it just isn't anchored to a real dollar figure. Public/MentorReview.jsx must
            // label these numbers as cumulative/relative PnL, never as "account balance".
            $analytics = [
                'advanced' => $this->advancedAnalyticsService->build($positions, 0.0),
                'monteCarlo' => $this->advancedAnalyticsService->monteCarlo($positions, 0.0),
            ];
        }

        return Inertia::render('Public/MentorReview', [
            'shareLink' => [
                'label' => $shareLink->label,
                'createdAt' => optional($shareLink->created_at)->toIso8601String(),
                'expiresAt' => optional($shareLink->expires_at)->toIso8601String(),
            ],
            'trades' => $trades,
            'analytics' => $analytics,
        ]);
    }

    private function resolveScopedPositions(MarketBacktestShareLink $shareLink)
    {
        $query = MarketBacktestPosition::query()
            ->with('snapshots')
            // Hard floor: no scope misconfiguration can ever reach outside this account's
            // own closed trades.
            ->where('market_backtest_account_id', $shareLink->market_backtest_account_id)
            ->where('status', 'closed');

        if ($shareLink->scope_type === 'session') {
            $query->where('market_backtest_session_id', $shareLink->session_id);
        } elseif ($shareLink->scope_type === 'date_range') {
            $query->whereBetween('closed_at_time', [$shareLink->range_start_time, $shareLink->range_end_time]);
        } elseif ($shareLink->scope_type === 'trade_ids') {
            $query->whereIn('id', $shareLink->trade_ids ?? []);
        }

        return $query->orderByDesc('closed_at_time')->get();
    }

    private function redact(array $trade, MarketBacktestShareLink $shareLink): array
    {
        if (!$shareLink->include_journal) {
            foreach (self::JOURNAL_FIELDS as $field) {
                $trade[$field] = is_array($trade[$field] ?? null) ? [] : null;
            }
        }

        if (!$shareLink->include_snapshots) {
            foreach (self::SNAPSHOT_FIELDS as $field) {
                $trade[$field] = null;
            }
        }

        return $trade;
    }
}

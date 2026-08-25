<?php

namespace App\Http\Controllers\Dashboard;

use App\Helpers\CommonHelpers;
use App\Http\Controllers\Controller;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;
use App\Models\AdmUser;
use App\Models\SubscriptionRequest;
use App\Models\UserFeedback;
use Illuminate\Http\Request;
use App\Services\AdminAccessService;

class DashboardController extends Controller
{
    public function __construct(private readonly AdminAccessService $adminAccess)
    {
    }

    public function index(Request $request): Response
    {
        $sidebarMenus = CommonHelpers::sidebarMenu();
        $isSuperAdmin = $this->adminAccess->isSuperadmin($request->user());

        if (!$isSuperAdmin) {
            return Inertia::render('Dashboard/Dashboard', [
                'menus' => $sidebarMenus,
                'workspaceMode' => true,
            ]);
        }

        $totalUsers = AdmUser::query()->count();
        $activeUsers = AdmUser::query()->where(function ($query) {
            $query->whereRaw('UPPER(status) = ?', ['ACTIVE'])->orWhere('status', 1);
        })->count();

        $since = now()->subDays(30);
        $paid = SubscriptionRequest::query()->where('status', 'paid');
        $paidPhp = (clone $paid)->where('currency', 'PHP');
        $feedbackOpenStatuses = ['submitted', 'reviewing', 'planned', 'in_progress'];

        // Live access status per user, mirrored from ReplayAccessController's
        // active/expired computation (replay_access_ends_at vs now) rather than a
        // stored status column — renewing a user's access (adminRestoreAccess)
        // pushes them back into "active" here automatically on next load, and an
        // access period lapsing moves them into "expired" the same way.
        $now = now();
        $subscribedUsers = AdmUser::query()->whereNotNull('replay_access_ends_at');
        $activeSubscribers = (clone $subscribedUsers)->where('replay_access_ends_at', '>=', $now)->count();
        $expiredSubscribers = (clone $subscribedUsers)->where('replay_access_ends_at', '<', $now)->count();
        $notYetSubscribed = AdmUser::query()->whereNull('replay_access_ends_at')->count();

        return Inertia::render('Dashboard/Dashboard', [
            'menus' => $sidebarMenus,
            'workspaceMode' => false,
            'userMetrics' => [
                'total' => $totalUsers,
                'active' => $activeUsers,
                'inactive' => max($totalUsers - $activeUsers, 0),
                'newThisMonth' => AdmUser::query()->where('created_at', '>=', now()->startOfMonth())->count(),
            ],
            'subscriptionMetrics' => [
                'paidLifetime' => (clone $paid)->count(),
                'revenueLifetimePhp' => (float) (clone $paidPhp)->sum('amount'),
                'paidLast30Days' => (clone $paid)->where('paid_at', '>=', $since)->count(),
                'revenueLast30DaysPhp' => (float) (clone $paidPhp)->where('paid_at', '>=', $since)->sum('amount'),
                'pending' => SubscriptionRequest::query()->whereIn('status', ['creating', 'pending'])->count(),
                'failedOrExpired' => SubscriptionRequest::query()->whereIn('status', ['failed', 'expired'])->count(),
            ],
            'subscriptionStatusMetrics' => [
                'active' => $activeSubscribers,
                'expired' => $expiredSubscribers,
                'notSubscribed' => $notYetSubscribed,
            ],
            'feedbackMetrics' => [
                'total' => UserFeedback::query()->count(),
                'newLast30Days' => UserFeedback::query()->where('created_at', '>=', $since)->count(),
                'open' => UserFeedback::query()->whereIn('status', $feedbackOpenStatuses)->count(),
                'highPriority' => UserFeedback::query()->whereIn('priority', ['urgent', 'high'])->whereIn('status', $feedbackOpenStatuses)->count(),
                'awaitingResponse' => UserFeedback::query()->whereIn('status', $feedbackOpenStatuses)
                    ->where(fn ($query) => $query->whereNull('admin_response')->orWhere('admin_response', ''))->count(),
            ],
            'recentSubscriptions' => SubscriptionRequest::query()
                ->with('user:id,name,email')->latest()->limit(5)->get()
                ->map(fn (SubscriptionRequest $payment) => [
                    'id' => $payment->id,
                    'user' => $payment->user?->only(['id', 'name', 'email']),
                    'plan' => $payment->plan,
                    'amount' => $payment->amount,
                    'currency' => $payment->currency,
                    'status' => $payment->status,
                    'createdAt' => optional($payment->created_at)->toIso8601String(),
                    'paidAt' => optional($payment->paid_at)->toIso8601String(),
                ]),
            'recentFeedback' => UserFeedback::query()
                ->with('user:id,name,email')->latest()->limit(5)->get()
                ->map(fn (UserFeedback $feedback) => [
                    'id' => $feedback->id,
                    'user' => $feedback->user?->only(['id', 'name', 'email']),
                    'title' => $feedback->title,
                    'category' => $feedback->category,
                    'status' => $feedback->status,
                    'priority' => $feedback->priority,
                    'createdAt' => optional($feedback->created_at)->toIso8601String(),
                ]),
        ]);
    }

    public function workspace(Request $request): Response
    {
        abort_unless($this->adminAccess->isSuperadmin($request->user()), 403);

        return $this->renderTradingWorkspace();
    }

    public function tradingWorkspace(): Response
    {
        return $this->renderTradingWorkspace();
    }

    private function renderTradingWorkspace(): Response
    {
        return Inertia::render('Dashboard/Dashboard', [
            'menus' => CommonHelpers::sidebarMenu(),
            'workspaceMode' => true,
        ]);
    }

    public function getIndex(Request $request): Response
    {
        return $this->index($request);
    }
}

<?php

use App\Helpers\CommonHelpers;
use App\Http\Controllers\Admin\AdminApiController;
use App\Http\Controllers\Admin\AdminUsersController;
use App\Http\Controllers\Admin\AdmRequestController;
use App\Http\Controllers\Admin\AnnouncementsController;
use App\Http\Controllers\Admin\MenusController;
use App\Http\Controllers\Admin\ModulsController;
use App\Http\Controllers\Admin\NotificationsController;
use App\Http\Controllers\Admin\PrivilegesController;
use App\Http\Controllers\Admin\SettingsController;
use App\Http\Controllers\Auth\LoginController;
use App\Http\Controllers\Auth\ResetPasswordController;
use App\Http\Controllers\Dashboard\DashboardController;
use App\Http\Controllers\ImportedTradeController;
use App\Http\Controllers\MarketBacktestController;
use App\Http\Controllers\MarketBacktestPlaybookController;
use App\Http\Controllers\MarketBacktestRiskSettingController;
use App\Http\Controllers\MarketBacktestShareLinkController;
use App\Http\Controllers\MarketDrawingController;
use App\Http\Controllers\MarketDataController;
use App\Http\Controllers\MarketOverviewController;
use App\Http\Controllers\MarketReplayProgressController;
use App\Http\Controllers\MarketToolSettingController;
use App\Http\Controllers\MarketWatchlistController;
use App\Http\Controllers\MarketPriceAlertController;
use App\Http\Controllers\MentorReviewController;
use App\Http\Controllers\PaymentActivityLogController;
use App\Http\Controllers\ReplayAccessController;
use App\Http\Controllers\SystemErrorLogController;
use App\Http\Controllers\TrainingChallengeController;
use App\Http\Controllers\UserFeedbackController;
use App\Http\Controllers\PayMongoWebhookController;
use App\Http\Controllers\Users\ChangePasswordController;
use App\Http\Controllers\Users\ForceChangePasswordController;
use App\Http\Controllers\Users\ProfilePageController;
use App\Services\AdminAccessService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

/*
|--------------------------------------------------------------------------
| Web Routes
|--------------------------------------------------------------------------
|
| Here is where you can register web routes for your application. These
| routes are loaded by the RouteServiceProvider and all of them will
| be assigned to the "web" middleware group. Make something great!
|
*/

Route::get('/', function (AdminAccessService $access) {
    if (auth()->check()) {
        return redirect()->intended($access->isAdmin(auth()->user()) ? 'dashboard' : 'market');
    }

    return Inertia::render('Public/Home');
})->name('home');
Route::get('/privacy-policy', fn () => Inertia::render('Public/PrivacyPolicy', [
    'legal' => config('legal'),
]))->name('privacy-policy');
Route::get('/terms-of-service', fn () => Inertia::render('Public/TermsOfService', [
    'legal' => config('legal'),
]))->name('terms-of-service');
Route::get('/mentor-review/{token}', [MentorReviewController::class, 'show'])
    ->where('token', '[A-Za-z0-9]{48}')
    ->middleware('throttle:mentor-review-public')
    ->name('mentor-review.show');
Route::get('login', [LoginController::class, 'index'])->name('login');
Route::get('/admin/login', [LoginController::class, 'adminIndex'])->name('admin.login');
Route::post('/admin/login', [LoginController::class, 'adminAuthenticate'])
    ->middleware('throttle:login')->name('admin.login.authenticate');
Route::post('login/check-email', [LoginController::class, 'checkEmail'])
    ->middleware('throttle:login-email-check')
    ->name('login.check-email');
Route::get('/reset_password', [ResetPasswordController::class, 'getIndex'])->name('reset_password');
Route::post('/send_resetpass_email', [ResetPasswordController::class, 'sendResetPasswordInstructions'])
    ->middleware('throttle:password-reset-request');
Route::get('/reset_password_email/{email}', [ResetPasswordController::class, 'getResetIndex'])->name('reset_password_email');
Route::post('/send_resetpass_email/reset', [ResetPasswordController::class, 'resetPassword'])
    ->middleware('throttle:password-reset-confirm');
Route::post('login-save', [LoginController::class, 'authenticate'])
    ->middleware('throttle:login')
    ->name('login-save');
Route::get('/auth/{provider}/redirect', [LoginController::class, 'redirectToProvider'])
    ->whereIn('provider', ['google', 'facebook'])
    ->middleware('throttle:social-login')
    ->name('social.redirect');
Route::get('/auth/{provider}/callback', [LoginController::class, 'handleProviderCallback'])
    ->whereIn('provider', ['google', 'facebook'])
    ->middleware('throttle:social-callback')
    ->name('social.callback');
Route::get('/social-registration/confirm', [LoginController::class, 'showSocialRegistration'])->name('social.registration.confirm');
Route::post('/social-registration/confirm', [LoginController::class, 'completeSocialRegistration'])
    ->middleware('throttle:social-login')->name('social.registration.complete');
Route::delete('/social-registration/confirm', [LoginController::class, 'cancelSocialRegistration'])->name('social.registration.cancel');
Route::get('/appname', [SettingsController::class, 'getAppname'])->name('app-name');
Route::get('/applogo', [SettingsController::class, 'getApplogo'])->name('app-logo');
Route::get('/login-details', [SettingsController::class, 'getLoginDetails'])->name('app-login-details');

Route::group(['middleware' => ['auth', 'account.active', 'web']], function () {
    Route::post('/check-password', [ForceChangePasswordController::class, 'checkPassword'])->name('check-current-password');
    Route::get('change-password', [ForceChangePasswordController::class, 'showChangeForcePasswordForm'])->name('show-change-force-password');
    Route::post('/save-change-password', [ForceChangePasswordController::class, 'postUpdatePassword'])->name('update_password');
    Route::post('/check-waive', [ForceChangePasswordController::class, 'checkWaive'])->name('check-waive-count');
    Route::post('/waive-change-password', [ForceChangePasswordController::class, 'waiveChangePassword'])->name('waive-change-password');

    //ANNOUNCEMENT
    Route::get('unread-announcement', [AnnouncementsController::class, 'getUnreadAnnouncements'])->name('show-announcement');
    Route::post('read-announcement', [AnnouncementsController::class, 'markAnnouncementAsRead'])->name('read-announcement');
    Route::get('updates', [AnnouncementsController::class, 'getAllAnnouncements'])->name('updates');
    Route::get('announcements', [AnnouncementsController::class, 'getIndex'])->middleware('admin.permission:announcements,view')->name('announcements');
    Route::get('announcements/add-announcement', [AnnouncementsController::class, 'addAnnouncementForm'])->middleware('admin.permission:announcements,create')->name('add-announcement');
    Route::post('announcements/SaveAnnouncement', [AnnouncementsController::class, 'saveAnnouncement'])->middleware('admin.permission:announcements,create')->name('announcement/SaveAnnouncement');
    Route::get('announcements/edit-announcement/{id}', [AnnouncementsController::class, 'editAnnouncement'])->middleware('admin.permission:announcements,edit')->name('edit-announcement');
    Route::post('announcements/saveEditAnnouncement', [AnnouncementsController::class, 'saveEditAnnouncement'])->middleware('admin.permission:announcements,edit')->name('saveEditAnnouncement');
    Route::post('announcements/delete-announcement/{id}', [AnnouncementsController::class, 'deleteAnnouncement'])->middleware('admin.permission:announcements,delete')->name('delete-announcement');
});

Route::post('/webhooks/paymongo', PayMongoWebhookController::class)->middleware('throttle:api')->name('webhooks.paymongo');

Route::middleware(['auth', 'account.active'])->group(function () {
    Route::get('dashboard', [DashboardController::class, 'index'])->middleware('superadmin')->name('dashboard');
    Route::get('workspace', [DashboardController::class, 'tradingWorkspace'])->name('workspace');
    Route::get('/admin/workspace', [DashboardController::class, 'workspace'])->middleware('superadmin')->name('admin.workspace');
    Route::get('market', function () {
        return Inertia::render('Market/Market');
    })->name('market');
    Route::get('/market-overview', MarketOverviewController::class)->name('market-overview.show');
    Route::get('trade-report', function () {
        return Inertia::render('Market/TradeReportPage');
    })->name('trade-report');
    Route::get('mentor-review', function () {
        return Inertia::render('Market/MentorReviewManagePage');
    })->name('mentor-review.index');
    Route::get('training-challenges', function () {
        return Inertia::render('Market/TrainingChallengesPage');
    })->name('training-challenges');
    Route::get('/help', fn () => Inertia::render('Help/Index'))->name('help');
    Route::get('/market-drawings', [MarketDrawingController::class, 'show'])->name('market-drawings.show');
    Route::get('/market-symbols', [MarketDataController::class, 'symbols'])->name('market-symbols.index');
    Route::get('/market-metadata', [MarketDataController::class, 'metadata'])->middleware('throttle:60,1')->name('market-metadata.show');
    Route::post('/market-metadata/batch', [MarketDataController::class, 'metadataBatch'])->middleware('throttle:20,1')->name('market-metadata.batch');
    Route::post('/market-symbols', [MarketDataController::class, 'storeSymbol'])->middleware('throttle:market-write')->name('market-symbols.store');
    Route::put('/market-symbols/favorite', [MarketDataController::class, 'toggleFavoriteSymbol'])->middleware('throttle:market-write')->name('market-symbols.favorite');
    // Must stay registered before the {marketSymbol} wildcard DELETE below —
    // otherwise Laravel's implicit route-model binding would try to resolve
    // "favorites" as a MarketSymbol id and 404 before reaching this route.
    Route::delete('/market-symbols/favorites', [MarketDataController::class, 'clearAllFavorites'])->middleware('throttle:market-write')->name('market-symbols.favorites.clear');
    Route::delete('/market-symbols/{marketSymbol}', [MarketDataController::class, 'destroySymbol'])->middleware('throttle:market-write')->name('market-symbols.destroy');
    Route::delete('/market-symbols', [MarketDataController::class, 'destroyAllSymbols'])->middleware('throttle:market-write')->name('market-symbols.destroy-all');
    Route::put('/market-drawings', [MarketDrawingController::class, 'update'])->name('market-drawings.update');
    Route::get('/market-tool-settings', [MarketToolSettingController::class, 'show'])->name('market-tool-settings.show');
    Route::put('/market-tool-settings', [MarketToolSettingController::class, 'update'])->name('market-tool-settings.update');
    Route::get('/market-watchlists', [MarketWatchlistController::class, 'show'])->name('market-watchlists.show');
    Route::put('/market-watchlists', [MarketWatchlistController::class, 'update'])->name('market-watchlists.update');
    Route::get('/market-price-alerts', [MarketPriceAlertController::class, 'index']);
    Route::post('/market-price-alerts', [MarketPriceAlertController::class, 'store'])->middleware('throttle:price-alert-write');
    Route::post('/market-price-alerts/check', [MarketPriceAlertController::class, 'check'])->middleware('throttle:price-alert-check');
    Route::delete('/market-price-alerts/{marketPriceAlert}', [MarketPriceAlertController::class, 'destroy'])->middleware('throttle:price-alert-write');
    Route::get('/replay-access', [ReplayAccessController::class, 'status']);
    Route::get('/subscription-requests/mine', [ReplayAccessController::class, 'myRequests']);
    Route::post('/replay-trial/activate', [ReplayAccessController::class, 'activateTrial'])->middleware('throttle:market-write');
    Route::get('/subscription-plans', [ReplayAccessController::class, 'plans']);
    Route::put('/admin/subscription-plans', [ReplayAccessController::class, 'updatePlans'])->middleware(['superadmin', 'throttle:market-write']);
    Route::get('/admin/subscription-plans', [ReplayAccessController::class, 'adminPlansPage'])->middleware('superadmin')->name('admin.subscription-plans');
    Route::get('/subscription', [ReplayAccessController::class, 'userPage'])->name('subscription.index');
    Route::post('/subscription-checkouts', [ReplayAccessController::class, 'createCheckout'])->middleware('throttle:market-write')->name('subscription.checkout.create');
    Route::get('/subscription-checkout/return/{token}', [ReplayAccessController::class, 'checkoutReturn'])->name('subscription.checkout.return');
    Route::get('/subscription-checkouts/{subscriptionRequest}/status', [ReplayAccessController::class, 'checkoutStatus'])->name('subscription.checkout.status');
    Route::get('/subscription-requests/{subscriptionRequest}/messages', [ReplayAccessController::class, 'messages']);
    Route::get('/subscription-requests/{subscriptionRequest}/proof', [ReplayAccessController::class, 'proof'])->name('subscription.proof');
    Route::get('/subscription-messages/{subscriptionMessage}/attachment', [ReplayAccessController::class, 'messageAttachment'])->name('subscription.message-attachment');
    Route::post('/chart-tour/complete', [ReplayAccessController::class, 'completeTour'])->middleware('throttle:market-write');
    Route::post('/journal-tour/complete', [MarketBacktestController::class, 'completeJournalTour'])->middleware('throttle:market-write');
    Route::post('/mentor-tour/complete', [MarketBacktestShareLinkController::class, 'completeTour'])->middleware('throttle:market-write');
    Route::post('/training-tour/complete', [TrainingChallengeController::class, 'completeTour'])->middleware('throttle:market-write');
    Route::get('/admin/subscriptions', [ReplayAccessController::class, 'adminPage'])->middleware('superadmin');
    Route::get('/admin/subscriptions/items', [ReplayAccessController::class, 'adminIndex'])->middleware('superadmin');
    Route::post('/admin/subscriptions/{subscriptionRequest}/reconcile', [ReplayAccessController::class, 'adminReconcile'])->middleware(['superadmin', 'throttle:market-write']);
    Route::post('/admin/subscriptions/{subscriptionRequest}/refund', [ReplayAccessController::class, 'adminRefund'])->middleware(['superadmin', 'throttle:market-write']);
    Route::post('/admin/subscriptions/{subscriptionRequest}/restore-access', [ReplayAccessController::class, 'adminRestoreAccess'])->middleware(['superadmin', 'throttle:market-write']);
    Route::get('/admin/payment-activity', [PaymentActivityLogController::class, 'adminPage'])->middleware('superadmin')->name('admin.payment-activity.index');
    Route::get('/admin/payment-activity/items', [PaymentActivityLogController::class, 'adminIndex'])->middleware('superadmin')->name('admin.payment-activity.items');
    Route::get('/admin/system-errors', [SystemErrorLogController::class, 'adminPage'])->middleware('superadmin')->name('admin.system-errors.index');
    Route::get('/admin/system-errors/items', [SystemErrorLogController::class, 'adminIndex'])->middleware('superadmin')->name('admin.system-errors.items');
    Route::post('/admin/system-errors/{systemErrorLog}/resolve', [SystemErrorLogController::class, 'resolve'])->middleware(['superadmin', 'throttle:market-write'])->name('admin.system-errors.resolve');
    Route::get('/feedback', [UserFeedbackController::class, 'userPage'])->name('feedback.index');
    Route::get('/feedback/items', [UserFeedbackController::class, 'index'])->name('feedback.items');
    Route::post('/feedback/items', [UserFeedbackController::class, 'store'])->middleware('throttle:feedback-write')->name('feedback.store');
    Route::get('/feedback/items/{feedback}/messages', [UserFeedbackController::class, 'messages'])->name('feedback.messages');
    Route::post('/feedback/items/{feedback}/messages', [UserFeedbackController::class, 'storeMessage'])->middleware('throttle:feedback-write')->name('feedback.messages.store');
    Route::get('/admin/feedback', [UserFeedbackController::class, 'adminPage'])->middleware('superadmin')->name('admin.feedback.index');
    Route::get('/admin/feedback/items', [UserFeedbackController::class, 'adminIndex'])->middleware('superadmin')->name('admin.feedback.items');
    Route::put('/admin/feedback/items/{feedback}', [UserFeedbackController::class, 'update'])->middleware(['superadmin', 'throttle:feedback-write'])->name('admin.feedback.update');
    Route::get('/market-replay-progress', [MarketReplayProgressController::class, 'show'])->name('market-replay-progress.show');
    Route::put('/market-replay-progress', [MarketReplayProgressController::class, 'update'])->middleware('replay.access')->name('market-replay-progress.update');
    Route::get('/market-backtest/account', [MarketBacktestController::class, 'show'])->middleware(['replay.access', 'throttle:backtest-read'])->name('market-backtest.show');
    Route::get('/market-backtest/playbooks', [MarketBacktestPlaybookController::class, 'index'])->middleware('throttle:backtest-read')->name('market-backtest.playbooks.index');
    Route::post('/market-backtest/playbooks', [MarketBacktestPlaybookController::class, 'store'])->middleware('throttle:backtest-write')->name('market-backtest.playbooks.store');
    Route::put('/market-backtest/playbooks/{playbook}', [MarketBacktestPlaybookController::class, 'update'])->middleware('throttle:backtest-write')->name('market-backtest.playbooks.update');
    Route::delete('/market-backtest/playbooks/{playbook}', [MarketBacktestPlaybookController::class, 'destroy'])->middleware('throttle:backtest-write')->name('market-backtest.playbooks.destroy');
    Route::get('/market-backtest/risk-settings', [MarketBacktestRiskSettingController::class, 'show'])->middleware('throttle:backtest-read')->name('market-backtest.risk-settings.show');
    Route::put('/market-backtest/risk-settings', [MarketBacktestRiskSettingController::class, 'update'])->middleware('throttle:backtest-write')->name('market-backtest.risk-settings.update');
    Route::get('/market-backtest/report', [MarketBacktestController::class, 'report'])->middleware('throttle:backtest-read')->name('market-backtest.report');
    Route::get('/market-backtest/report/insights', [MarketBacktestController::class, 'reportInsightsSummary'])->middleware('throttle:backtest-read')->name('market-backtest.report.insights');
    Route::get('/market-backtest/order-history', [MarketBacktestController::class, 'orderHistory'])->middleware('throttle:backtest-read')->name('market-backtest.order-history');
    Route::post('/market-backtest/report/export', [MarketBacktestController::class, 'requestReportExport'])->middleware('throttle:backtest-heavy')->name('market-backtest.report.export');
    Route::get('/market-backtest/report/export/{export}/download', [MarketBacktestController::class, 'downloadReportExport'])->middleware('throttle:backtest-read')->name('market-backtest.report.export.download');
    Route::post('/market-backtest/reset', [MarketBacktestController::class, 'reset'])->middleware(['replay.access', 'throttle:backtest-heavy'])->name('market-backtest.reset');
    Route::post('/market-backtest/sessions', [MarketBacktestController::class, 'startSession'])->middleware(['replay.access', 'throttle:backtest-write'])->name('market-backtest.sessions.start');
    Route::post('/market-backtest/sessions/{session}/end', [MarketBacktestController::class, 'endSession'])->middleware(['replay.access', 'throttle:backtest-write'])->name('market-backtest.sessions.end');
    Route::post('/market-backtest/positions', [MarketBacktestController::class, 'openPosition'])->middleware(['replay.access', 'throttle:backtest-write'])->name('market-backtest.positions.open');
    Route::put('/market-backtest/positions/{position}/risk', [MarketBacktestController::class, 'updatePositionRisk'])->middleware(['replay.access', 'throttle:backtest-write'])->name('market-backtest.positions.risk');
    Route::post('/market-backtest/positions/{position}/trigger', [MarketBacktestController::class, 'triggerPosition'])->middleware(['replay.access', 'throttle:backtest-write'])->name('market-backtest.positions.trigger');
    Route::post('/market-backtest/positions/{position}/cancel', [MarketBacktestController::class, 'cancelPosition'])->middleware(['replay.access', 'throttle:backtest-write'])->name('market-backtest.positions.cancel');
    Route::post('/market-backtest/positions/{position}/close', [MarketBacktestController::class, 'closePosition'])->middleware(['replay.access', 'throttle:backtest-write'])->name('market-backtest.positions.close');
    Route::post('/market-backtest/positions/{position}/process-candle', [MarketBacktestController::class, 'processPositionCandle'])->middleware(['replay.access', 'throttle:backtest-write'])->name('market-backtest.positions.process-candle');
    Route::post('/market-backtest/positions/{position}/snapshot', [MarketBacktestController::class, 'uploadPositionSnapshot'])->middleware(['replay.access', 'throttle:backtest-heavy'])->name('market-backtest.positions.snapshot');
    Route::put('/market-backtest/trades/{position}/journal', [MarketBacktestController::class, 'updateTradeJournal'])->middleware('throttle:backtest-write')->name('market-backtest.trades.journal');

    // Imported (real) trades — a separate dataset from simulated backtest trades.
    Route::post('/imported-trades/batches/preview', [ImportedTradeController::class, 'preview'])->middleware('throttle:backtest-heavy')->name('imported-trades.preview');
    Route::post('/imported-trades/batches/{batch}/commit', [ImportedTradeController::class, 'commit'])->middleware('throttle:backtest-heavy')->name('imported-trades.commit');
    Route::get('/imported-trades/batches', [ImportedTradeController::class, 'batches'])->middleware('throttle:backtest-read')->name('imported-trades.batches');
    Route::delete('/imported-trades/batches/{batch}', [ImportedTradeController::class, 'destroyBatch'])->middleware('throttle:backtest-write')->name('imported-trades.batches.destroy');
    Route::get('/imported-trades/items', [ImportedTradeController::class, 'items'])->middleware('throttle:backtest-read')->name('imported-trades.items');

    // Shareable mentor review links (management side; public viewer route is registered above the auth group).
    Route::get('/market-backtest/share-links', [MarketBacktestShareLinkController::class, 'index'])->middleware('throttle:backtest-read')->name('market-backtest.share-links.index');
    Route::post('/market-backtest/share-links', [MarketBacktestShareLinkController::class, 'store'])->middleware('throttle:backtest-write')->name('market-backtest.share-links.store');
    Route::delete('/market-backtest/share-links/{shareLink}', [MarketBacktestShareLinkController::class, 'destroy'])->middleware('throttle:backtest-write')->name('market-backtest.share-links.destroy');

    // Structured training challenges.
    Route::get('/training-challenges/catalog', [TrainingChallengeController::class, 'index'])->middleware('throttle:backtest-read')->name('training-challenges.catalog');
    Route::post('/training-challenges/{challenge}/attempts', [TrainingChallengeController::class, 'startAttempt'])->middleware('throttle:backtest-write')->name('training-challenges.attempts.start');
    Route::get('/training-challenges/attempts', [TrainingChallengeController::class, 'listMyAttempts'])->middleware('throttle:backtest-read')->name('training-challenges.attempts.index');
    Route::get('/training-challenges/attempts/{attempt}', [TrainingChallengeController::class, 'showAttempt'])->middleware('throttle:backtest-read')->name('training-challenges.attempts.show');
    Route::post('/training-challenges/attempts/{attempt}/abandon', [TrainingChallengeController::class, 'abandonAttempt'])->middleware('throttle:backtest-write')->name('training-challenges.attempts.abandon');

    Route::post('/logout', [LoginController::class, 'logout']);
    Route::get('/sidebar', [MenusController::class, 'sidebarMenu'])->name('sidebar');
    //USERS
    Route::post('create-user', [AdminUsersController::class, 'postAddSave'])->middleware('admin.permission:users,create')->name('create-user');
    Route::post('/postAddSave', [AdminUsersController::class, 'postAddSave'])->middleware('admin.permission:users,create')->name('postAddSave');
    Route::post('/postEditSave', [AdminUsersController::class, 'postEditSave'])->middleware('admin.permission:users,edit')->name('postEditSave');
    Route::post('/deactivate-users', [AdminUsersController::class, 'setStatus'])->middleware('admin.permission:users,delete')->name('postDeactivateUsers');
    //PROFILE PAGE
    Route::get('/profile', [ProfilePageController::class, 'getIndex'])->name('profile_page');
    Route::post('/save-edit-image', [ProfilePageController::class, 'saveEditImage'])->name('save-edit-image');
    Route::get('/profiles', [ProfilePageController::class, 'getProfiles'])->name('get-profiles');
    Route::post('/update-profile', [ProfilePageController::class, 'updateProfile'])->name('update-profile');
    Route::post('/profile/avatar', [ProfilePageController::class, 'selectAvatar'])->name('profile.avatar.select');
    Route::put('/profile/details', [ProfilePageController::class, 'updateDetails'])->name('profile.details.update');
    Route::patch('/profile/timezone', [ProfilePageController::class, 'updateTimezone'])->name('profile.timezone.update');
    Route::post('/profile/deactivate', [ProfilePageController::class, 'deactivate'])->middleware('throttle:market-write')->name('profile.deactivate');
    Route::post('/update-theme', [ProfilePageController::class, 'updateTheme'])->name('update-theme');
    //CHANGE PASSWORD
    Route::get('/change_password', [ChangePasswordController::class, 'getIndex'])->name('change_password');
    Route::post('/postChangePassword', [AdminUsersController::class, 'postUpdatePassword'])->name('postChangePassword');
    //PRIVILEGES
    Route::get('privileges/create-privileges', [PrivilegesController::class, 'createPrivilegesView'])->middleware('admin.permission:privileges,create')->name('create-privileges');
    Route::get('privileges/edit-privileges/{id}', [PrivilegesController::class, 'getEdit'])->middleware('admin.permission:privileges,edit')->name('edit-privileges');
    Route::post('/privilege/postAddSave', [PrivilegesController::class, 'postAddSave'])->middleware('admin.permission:privileges,create')->name('postAddSave');
    Route::post('/privilege/postEditSave', [PrivilegesController::class, 'postEditSave'])->middleware('admin.permission:privileges,edit')->name('postEditSave');

    //MODULES
    Route::get('create-modules', [ModulsController::class, 'getAddModuls'])->middleware('admin.permission:module_generator,create')->name('create-modules');
    Route::post('/module_generator/postAddSave', [ModulsController::class, 'postAddSave'])->middleware('admin.permission:module_generator,create')->name('postAddSave');
    Route::get('/tables', [ModulsController::class, 'getTableNames'])->middleware('admin.permission:module_generator,read');

    //MENUS
    Route::prefix('menu_management')->group(function () {
        Route::post('/create_menu', [MenusController::class, 'createMenu'])->middleware('admin.permission:menu_management,create');
        Route::post('/update_menu', [MenusController::class, 'updateMenu'])->middleware('admin.permission:menu_management,edit');
        Route::post('/auto_update_menu', [MenusController::class, 'autoUpdateMenu'])->middleware('admin.permission:menu_management,edit');
        Route::get('/edit/{menu}', [MenusController::class, 'editMenu'])->middleware('admin.permission:menu_management,read');
        Route::post('/set-status-menus', [MenusController::class, 'postStatusSave'])->middleware('admin.permission:menu_management,delete')->name('deleteMenus');
    });

    // API GENERATOR
    Route::prefix('api_generator')->group(function () {
        //API Requests
        Route::post('/generate_key', [AdminApiController::class, 'createKey'])->middleware('admin.permission:api_generator,create');
        //API Key Generation
        Route::post('/deactivate_key/{id}', [AdminApiController::class, 'deactivateKey'])->middleware('admin.permission:api_generator,edit');
        Route::post('/activate_key/{id}', [AdminApiController::class, 'activateKey'])->middleware('admin.permission:api_generator,edit');
        Route::post('/delete_key/{id}', [AdminApiController::class, 'deleteKey'])->middleware('admin.permission:api_generator,delete');
        //API Create Generation
        Route::get('/create_api_view', [AdminApiController::class, 'createApiView'])->middleware('admin.permission:api_generator,create');
        Route::post('/create_api', [AdminApiController::class, 'createApi'])->middleware('admin.permission:api_generator,create');
        //API Edit
        Route::get('/edit/{id}', [AdminApiController::class, 'editApi'])->middleware('admin.permission:api_generator,edit');
        Route::post('/update_api', [AdminApiController::class, 'updateApi'])->middleware('admin.permission:api_generator,edit');
        //VIEW API
        Route::get('/view/{id}', [AdminApiController::class, 'viewApi'])->middleware('admin.permission:api_generator,read');
        //BULK ACTIONS
        Route::post('/bulk_action', [AdminApiController::class, 'bulkActions'])->middleware('admin.permission:api_generator,delete');
    });

    //Settings
    Route::post('/settings/postSave', [SettingsController::class, 'postSave'])->middleware('admin.permission:settings,edit')->name('settings-post-save');
    Route::post('/settings/postDelete', [SettingsController::class, 'postDelete'])->middleware('admin.permission:settings,delete')->name('settings-post-delete');

    //NOTIFICATION
    // Keep the trader notification feed separate from the generated admin
    // notifications page, which owns GET /notifications.
    Route::get('/notifications/feed', [NotificationsController::class, 'getLatestNotif'])->name('latest-notif');
    Route::post('/notifications/read', [NotificationsController::class, 'markAsRead'])->name('notification-read');
    Route::post('/notifications/read-all', [NotificationsController::class, 'markAllAsRead'])->name('notification-read-all');
    Route::post('/notifications/dismiss', [NotificationsController::class, 'dismiss'])->name('notification-dismiss');
    Route::patch('/notification-preferences', [NotificationsController::class, 'updatePreferences'])->name('notification-preferences');
    Route::get('/notifications/view-notification/{id}', [NotificationsController::class, 'viewNotification'])->name('view-notification');
    Route::get('/notifications/view-all-notifications', [NotificationsController::class, 'viewAllNotification'])->name('view-all-notifications');
    //FILTER
    Route::get('/filter/privileges', [AdmRequestController::class, 'privilegesFilter'])->middleware('admin.permission:users,read')->name('privileges-filter');
    Route::get('/filter/users', [AdmRequestController::class, 'usersFilter'])->middleware('admin.permission:users,read')->name('users-filter');
    Route::post('/filter/filter-data', [AdmRequestController::class, 'usersFilterData'])->middleware('admin.permission:users,read')->name('filter-data');
    //EXPORT
    Route::post('/request/export', [AdmRequestController::class, 'export'])->middleware('superadmin')->name('export');
});

Route::group([
    'middleware' => ['auth', 'account.active', 'admin', 'check.user'],
    'prefix' => config('adm_url.ADMIN_PATH'),
    'namespace' => 'App\Http\Controllers',
], function () {

    // Todo: change table
    $modules = [];
    try {
        $modules = DB::table('adm_modules')
            ->whereIn('controller', CommonHelpers::getOthersControllerFiles())
            ->whereNotIn('path', ['dashboard'])
            ->get();
    } catch (\Exception $e) {
        Log::error('Load adm moduls is failed. Caused = '.$e->getMessage());
    }

    foreach ($modules as $v) {
        if (@$v->path && @$v->controller) {
            try {
                Route::middleware('admin.permission:'.$v->path.',view')->group(function () use ($v) {
                    CommonHelpers::routeOtherController($v->path, $v->controller, 'app\Http\Controllers');
                });
            } catch (\Exception $e) {
                Log::error('Path = '.$v->path."\nController = ".$v->controller."\nError = ".$e->getMessage());
            }
        }
    }
});

//ADMIN ROUTE
Route::group([
    'middleware' => ['auth', 'account.active', 'admin', 'check.user'],
    'prefix' => config('ad_url.ADMIN_PATH'),
    'namespace' => 'App\Http\Controllers\Admin',
], function () {

    // Todo: change table
    if (request()->is(config('ad_url.ADMIN_PATH'))) {
        $menus = DB::table('adm_menuses')->where('is_dashboard', 1)->first();
        if ($menus) {
            Route::get('/', 'Dashboard\DashboardContentGetIndex');
        } else {
            CommonHelpers::routeController('/', 'AdminController', 'App\Http\Controllers\Admin');
        }
    }

    // Todo: change table
    $modules = [];
    try {
        $modules = DB::table('adm_modules')->whereIn('controller', CommonHelpers::getMainControllerFiles())->get();
    } catch (\Exception $e) {
        Log::error('Load ad moduls is failed. Caused = '.$e->getMessage());
    }

    foreach ($modules as $v) {
        if (@$v->path && @$v->controller) {
            try {
                Route::middleware('admin.permission:'.$v->path.',view')->group(function () use ($v) {
                    CommonHelpers::routeController($v->path, $v->controller, 'app\Http\Controllers\Admin');
                });
            } catch (\Exception $e) {
                Log::error('Path = '.$v->path."\nController = ".$v->controller."\nError = ".$e->getMessage());
            }
        }
    }
});

<?php

namespace App\Http\Controllers\Admin; 
use App\Helpers\CommonHelpers;
use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use App\Models\AdmModels\AdmNotifications;
use App\Services\BacktestTradeNotificationService;
use App\Services\MarketOverviewService;
use Inertia\Inertia;
use Illuminate\Support\Facades\Auth;
use App\Models\Announcement;
use App\Models\MarketPriceAlert;
class NotificationsController extends Controller{

    private $sortBy;
    private $sortDir;
    private $perPage;
    private $table_name;
    private $primary_key;
    public function __construct() {
        $this->table_name  =  'adm_notifications';
        $this->primary_key = 'id';
        $this->sortBy = request()->get('sortBy', 'adm_notifications.id');
        $this->sortDir = request()->get('sortDir', 'asc');
        $this->perPage = request()->get('perPage', 10);
    }

    public function getIndex(){
        if (!CommonHelpers::isView()) {
            CommonHelpers::redirect(CommonHelpers::adminPath(), 'Denied Access');
        }
        $data = [];
        $data['page_title'] = 'Notifications';
        $query = AdmNotifications::getAllNotifications();

        $query->when(request('search'), function ($query, $search) {
            $query->where('adm_logs.content', 'LIKE', "%$search%");
        });

        $data['notifications'] = $query->orderBy($this->sortBy, $this->sortDir)->paginate($this->perPage)->withQueryString();
        $data['queryParams'] = request()->query();

        return Inertia::render('AdmVram/Notifications',$data);
    }

    public function markAsRead(Request $request)
    {
        if ($request->input('source_type') === 'announcement') {
            $announcement = Announcement::where('status', 'ACTIVE')->findOrFail($request->integer('notification_id'));
            $request->user()->announcements()->syncWithoutDetaching([$announcement->id]);
            return response()->json(['message' => 'Read successfully!', 'status' => 'success']);
        }
        $notification = AdmNotifications::where('id', $request['notification_id'])
            ->where('adm_user_id', CommonHelpers::myId())
            ->firstOrFail();
        
        $notification->update(['is_read' => true]);
        return json_encode(['message'=>'Read successfully!', 'status'=>'success']);
    }

    /**
     * Hides a notification from the navbar dropdown feed only — it is never deleted.
     * The full "view all notifications" page ignores this flag and still lists the
     * row; removing it for good is `destroy()`/`destroyAll()`, which the history
     * page asks the user to confirm first.
     */
    public function dismiss(Request $request)
    {
        $notification = AdmNotifications::where('id', $request->integer('notification_id'))
            ->where('adm_user_id', CommonHelpers::myId())
            ->firstOrFail();
        $notification->update(['dismissed_at' => now()]);
        return response()->json(['status' => 'success', 'message' => 'Notification dismissed.']);
    }

    public function getLatestNotif()
    {
        $user = Auth::user();
        $tradeTypes = BacktestTradeNotificationService::TRADE_SOURCE_TYPES;

        // Fetched per category rather than as one list: backtest trade
        // notifications can be written far faster than system messages, so a
        // single "latest 20" would let one Replay session push every account
        // message out of the panel entirely.
        // NOT IN never matches a NULL source_type (SQL evaluates NULL NOT IN
        // (...) as NULL, not true), and every notification written before this
        // feature existed has a NULL source_type — so the null case must be
        // spelled out or the entire legacy feed disappears.
        $isSystem = fn ($query) => $query->whereNotIn('source_type', $tradeTypes)->orWhereNull('source_type');

        $systemNotifications = $user->notifications()->whereNull('dismissed_at')
            ->where($isSystem)
            ->orderBy('created_at', 'DESC')->limit(20)->get();
        $tradeNotifications = $user->notifications()->whereNull('dismissed_at')
            ->whereIn('source_type', $tradeTypes)
            ->orderBy('created_at', 'DESC')->limit(20)->get();

        $withCategory = fn ($items, string $category) => $items->map(function ($item) use ($category) {
            $item->category = $category;

            return $item;
        });

        $unreadSystem = $user->notifications()->whereNull('dismissed_at')->where('is_read', 0)
            ->where($isSystem)->count();
        $unreadTrades = $user->notifications()->whereNull('dismissed_at')->where('is_read', 0)
            ->whereIn('source_type', $tradeTypes)->count();
        $unreadAnnouncements = Announcement::where('status', 'ACTIVE')->whereDoesntHave('admUsers', fn ($query) => $query->where('adm_user_id', $user->id))->count();

        return response()->json([
            // `notifications` stays the combined list so any consumer that has
            // not adopted the tabs keeps working unchanged.
            'notifications' => $withCategory($systemNotifications, 'system')
                ->concat($withCategory($tradeNotifications, 'trade'))
                ->sortByDesc('created_at')->values(),
            'unread_notifications' => $unreadSystem + $unreadTrades + $unreadAnnouncements,
            'unread_system' => $unreadSystem + $unreadAnnouncements,
            'unread_trades' => $unreadTrades,
            'alert_sound_enabled' => (bool) $user->alert_sound_enabled,
        ]);
    }

    public function viewNotification($id){
        $data = [];
        $data['page_title'] = 'View Notification';
        $data['notification'] = AdmNotifications::where('id', $id)->where('adm_user_id', Auth::id())->firstOrFail();
        return Inertia::render('AdmVram/NotificationView', $data);
    }

    public function viewAllNotification(Request $request, MarketOverviewService $overview){
        $data = [];
        $data['page_title'] = 'View All Notification';
        $user = $request->user();
        $readAnnouncementIds = $user->announcements()->pluck('announcements.id');
        // Announcements the user deleted from their own history: the row stays
        // published for everyone else, so the exclusion is per user.
        $hiddenAnnouncementIds = $user->announcements()->wherePivotNotNull('hidden_at')->pluck('announcements.id');
        // `source_type` stays the literal 'notification'/'announcement'
        // discriminator the read/dismiss endpoints expect — `category` is a
        // separate axis (which tab the row belongs to) and must not be folded
        // into it.
        $tradeTypes = BacktestTradeNotificationService::TRADE_SOURCE_TYPES;
        $notifications = AdmNotifications::where('adm_user_id', $user->id)->latest()->get()->map(fn ($item) => [
            'key' => 'notification:'.$item->id, 'id' => $item->id, 'source_type' => 'notification',
            'category' => in_array($item->source_type, $tradeTypes, true) ? 'trade' : 'system',
            'type' => $item->type, 'content' => $item->content, 'content_html' => null, 'title' => null,
            'is_read' => (bool) $item->is_read,
            'created_at' => $item->created_at, 'metadata' => $item->metadata, 'url' => $item->url,
        ]);
        // Announcement bodies are rich text from the admin WYSIWYG editor. The
        // feed row gets a plain-text excerpt — sending the raw markup made the
        // list print literal `<p>` tags — and the detail modal gets the same
        // markup with executable content stripped.
        $announcements = Announcement::where('status', 'ACTIVE')
            ->whereNotIn('id', $hiddenAnnouncementIds)->latest()->get()->map(fn ($item) => [
                'key' => 'announcement:'.$item->id, 'id' => $item->id, 'source_type' => 'announcement',
                'category' => 'system',
                'type' => 'announcement', 'title' => $item->title ?: 'System update',
                'content' => trim(($item->title ? $item->title.' — ' : '').$overview->sanitizeExcerpt($item->message)),
                'content_html' => self::sanitizeAnnouncementHtml($item->message),
                'is_read' => $readAnnouncementIds->contains($item->id), 'created_at' => $item->created_at, 'metadata' => null,
            ]);
        $data['notifications'] = $notifications->concat($announcements)->sortByDesc('created_at')->values();
        $data['activeAlerts'] = MarketPriceAlert::where('adm_user_id', $user->id)->where('status', 'active')->latest()->get();
        $data['alertSoundEnabled'] = (bool) $user->alert_sound_enabled;
        return Inertia::render('AdmVram/NotificationsViewAll', $data);
    }

    /**
     * Strips executable markup from an admin-authored announcement body so it can
     * be rendered as HTML in the notification detail modal. Announcements are
     * written by admins through the WYSIWYG editor, so the goal is defence in
     * depth against a stored payload, not full-blown user-input purification.
     */
    public static function sanitizeAnnouncementHtml(?string $message): string
    {
        $html = preg_replace('/<(script|style|iframe|object|embed|form)\b[^>]*>.*?<\/\1\s*>/is', '', (string) $message);
        $html = preg_replace('/<\/?(script|style|iframe|object|embed|form|input|button)\b[^>]*>/is', '', (string) $html);
        // Inline handlers (onclick=…) and javascript: URLs survive tag filtering.
        $html = preg_replace('/\son[a-z]+\s*=\s*(?:"[^"]*"|\'[^\']*\'|[^\s>]+)/i', '', (string) $html);
        $html = preg_replace('/\s(href|src)\s*=\s*(["\'])\s*javascript:[^"\']*\2/i', ' $1="#"', (string) $html);

        return trim((string) $html);
    }

    /**
     * Permanently removes one row from the user's notification history page.
     *
     * `adm_notifications` rows belong to the user and are deleted outright — this
     * is not the navbar's `dismiss()`, which only sets `dismissed_at`.
     * Announcements are global, so deleting one records a per-user `hidden_at`
     * on the `announcement_user` pivot instead (which also marks it read).
     */
    public function destroy(Request $request, string $sourceType, int $id)
    {
        $user = $request->user();

        if ($sourceType === 'announcement') {
            $announcement = Announcement::findOrFail($id);
            $user->announcements()->syncWithoutDetaching([$announcement->id => ['hidden_at' => now()]]);

            return response()->json(['status' => 'success', 'message' => 'Notification deleted.']);
        }

        AdmNotifications::where('id', $id)
            ->where('adm_user_id', $user->id)
            ->firstOrFail()
            ->delete();

        return response()->json(['status' => 'success', 'message' => 'Notification deleted.']);
    }

    /**
     * Clears the whole history for the caller: every owned notification row is
     * deleted and every currently published announcement is hidden for them.
     */
    public function destroyAll(Request $request)
    {
        $user = $request->user();
        $deleted = $user->notifications()->delete();

        $hidden = Announcement::where('status', 'ACTIVE')->pluck('id')
            ->mapWithKeys(fn ($id) => [$id => ['hidden_at' => now()]])->all();

        if ($hidden !== []) {
            $user->announcements()->syncWithoutDetaching($hidden);
        }

        return response()->json([
            'status' => 'success',
            'message' => 'All notifications deleted.',
            'deleted' => $deleted,
        ]);
    }

    public function markAllAsRead(Request $request)
    {
        $request->user()->notifications()->where('is_read', false)->update(['is_read' => true]);
        $ids = Announcement::where('status', 'ACTIVE')->pluck('id');
        $request->user()->announcements()->syncWithoutDetaching($ids);
        return response()->json(['success' => true]);
    }

    public function updatePreferences(Request $request)
    {
        $data = $request->validate(['alert_sound_enabled' => ['required', 'boolean']]);
        $request->user()->forceFill($data)->save();
        return response()->json(['success' => true, ...$data]);
    }

}

?>

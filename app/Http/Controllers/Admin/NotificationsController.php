<?php

namespace App\Http\Controllers\Admin; 
use App\Helpers\CommonHelpers;
use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use App\Models\AdmModels\AdmNotifications;
use App\Services\BacktestTradeNotificationService;
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
     * The full "view all notifications" page always shows every notification regardless
     * of this flag, since that page is the user's permanent notification history.
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

    public function viewAllNotification(Request $request){
        $data = [];
        $data['page_title'] = 'View All Notification';
        $user = $request->user();
        $readAnnouncementIds = $user->announcements()->pluck('announcements.id');
        // `source_type` stays the literal 'notification'/'announcement'
        // discriminator the read/dismiss endpoints expect — `category` is a
        // separate axis (which tab the row belongs to) and must not be folded
        // into it.
        $tradeTypes = BacktestTradeNotificationService::TRADE_SOURCE_TYPES;
        $notifications = AdmNotifications::where('adm_user_id', $user->id)->latest()->get()->map(fn ($item) => [
            'key' => 'notification:'.$item->id, 'id' => $item->id, 'source_type' => 'notification',
            'category' => in_array($item->source_type, $tradeTypes, true) ? 'trade' : 'system',
            'type' => $item->type, 'content' => $item->content, 'is_read' => (bool) $item->is_read,
            'created_at' => $item->created_at, 'metadata' => $item->metadata, 'url' => $item->url,
        ]);
        $announcements = Announcement::where('status', 'ACTIVE')->latest()->get()->map(fn ($item) => [
            'key' => 'announcement:'.$item->id, 'id' => $item->id, 'source_type' => 'announcement',
            'category' => 'system',
            'type' => 'announcement', 'content' => $item->title.' — '.$item->message,
            'is_read' => $readAnnouncementIds->contains($item->id), 'created_at' => $item->created_at, 'metadata' => null,
        ]);
        $data['notifications'] = $notifications->concat($announcements)->sortByDesc('created_at')->values();
        $data['activeAlerts'] = MarketPriceAlert::where('adm_user_id', $user->id)->where('status', 'active')->latest()->get();
        $data['alertSoundEnabled'] = (bool) $user->alert_sound_enabled;
        return Inertia::render('AdmVram/NotificationsViewAll', $data);
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

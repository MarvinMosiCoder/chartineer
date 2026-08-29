<?php

namespace App\Http\Controllers\Admin; 
use App\Helpers\CommonHelpers;
use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use App\Models\AdmModels\AdmLogs;
use Inertia\Inertia;
use App\Models\Announcement;
use App\Models\AdmUser;
use Illuminate\Support\Facades\Session;
use Illuminate\Support\Str;
class AnnouncementsController extends Controller{

    private $sortBy;
    private $sortDir;
    private $perPage;
    private $table_name;
    private $primary_key;
    public function __construct() {
        $this->middleware('admin.permission:announcements,view')->only('getIndex');
        $this->middleware('admin.permission:announcements,create')->only(['addAnnouncementForm', 'saveAnnouncement']);
        $this->middleware('admin.permission:announcements,edit')->only(['editAnnouncement', 'saveEditAnnouncement']);
        $this->middleware('admin.permission:announcements,delete')->only('deleteAnnouncement');
        $this->table_name  =  'announcements';
        $this->primary_key = 'id';
        $this->sortBy = request()->get('sortBy', 'announcements.created_at');
        $this->sortDir = request()->get('sortDir', 'desc');
        $this->perPage = request()->get('perPage', 10);
    }

    public function getIndex(){

        $query = Announcement::query();

        $query->when(request('search'), function ($query, $search) {
            $query->where('announcements.title', 'LIKE', "%$search%");
        });

        $annoucements = $query->orderBy($this->sortBy, $this->sortDir)->paginate($this->perPage)->withQueryString();

        if (!CommonHelpers::isView()) {
            CommonHelpers::redirect(CommonHelpers::adminPath(), 'Denied Access');
        }

        $annoucements->getCollection()->transform(function (Announcement $item) {
            $plain = trim(preg_replace('/\s+/u', ' ', html_entity_decode(strip_tags((string) $item->message), ENT_QUOTES | ENT_HTML5, 'UTF-8')));
            $item->excerpt = Str::limit($plain, 160);
            return $item;
        });

        return Inertia::render('AdmVram/AnnouncementPage', [
            'announcements' => $annoucements,
            'queryParams' => request()->query()
        ]);
    }

    public function getUnreadAnnouncements(){
        $user = AdmUser::where("id", CommonHelpers::myId())->first();
        $unreadAnnouncements = Announcement::whereDoesntHave('admUsers', function($query) use ($user) {
            $query->where('adm_user_id', $user->id);
        })->where('status','ACTIVE')->orderBy('created_at','desc')->get();

        return response()->json(['unreadAnnouncements' => $unreadAnnouncements]);
    }

    public function getAllAnnouncements(Request $request){
        $user = AdmUser::where('id', CommonHelpers::myId())->first();
        $readIds = $user->announcements()->pluck('announcements.id')->map(fn ($id) => (int) $id)->all();

        $announcements = Announcement::where('status', 'ACTIVE')
            ->orderBy('created_at', 'desc')
            ->paginate(10)
            ->withQueryString();

        $announcements->getCollection()->transform(fn (Announcement $announcement) => [
            'id' => $announcement->id,
            'title' => $announcement->title ?: 'System update',
            'message' => $announcement->message,
            'created_at' => optional($announcement->created_at)->toIso8601String(),
            'is_read' => in_array((int) $announcement->id, $readIds, true),
        ]);

        return Inertia::render('Announcements/Index', [
            'announcements' => $announcements,
        ]);
    }

    /**
     * JSON feed for the Product Hub modal's Changelog tab. getAllAnnouncements()
     * covers the same ground but renders an Inertia page, so it cannot be reused
     * from inside a modal. Read state is marked through the existing
     * POST /read-announcement, same as AnnouncementGate and Market Summary.
     */
    public function getChangelog(Request $request){
        $readIds = $request->user()->announcements()->pluck('announcements.id')->map(fn ($id) => (int) $id)->all();

        $announcements = Announcement::where('status', 'ACTIVE')
            ->orderBy('created_at', 'desc')
            ->limit(15)
            ->get()
            ->map(fn (Announcement $announcement) => [
                'id' => $announcement->id,
                'title' => $announcement->title ?: 'System update',
                'message' => $announcement->message,
                'created_at' => optional($announcement->created_at)->toIso8601String(),
                'is_read' => in_array((int) $announcement->id, $readIds, true),
            ]);

        return response()->json(['announcements' => $announcements]);
    }

    public function markAnnouncementAsRead(Request $request){
        $announcementId = $request->validate([
            'announcement_id' => ['required', 'integer', 'exists:announcements,id'],
        ])['announcement_id'];
        $user = $request->user();
        $user->announcements()->syncWithoutDetaching([$announcementId]);

        $unreadAnnouncements = Announcement::whereDoesntHave('admUsers', function($query) use ($user) {
            $query->where('adm_user_id', $user->id);
        })->where('status','ACTIVE')->get();
        if($unreadAnnouncements->isEmpty()){
            Session::put('unread-announcement',false);
        }
        return response()->json(['status' => 'success', 'message' => 'Announcement marked as read.']);
    }

    public function addAnnouncementForm(){
        if (!CommonHelpers::isView()) {
            CommonHelpers::redirect(CommonHelpers::adminPath(), 'Denied Access');
        }
        $data = [];
        $data['page_title'] = "Add Announcement";
        $data['action'] = 'Add';
        return Inertia::render('AdmVram/AnnouncementForm',$data);
    }

    public function saveAnnouncement(Request $request){
        if (!CommonHelpers::isCreate()) {
            CommonHelpers::redirect(CommonHelpers::adminPath(), 'Denied Access');
        }
        Announcement::create([
            'title'   => $request['title'],
            'message' => $request['message'],
            'status'  => 'ACTIVE',
            'created_by' => CommonHelpers::myId(),
            'created_at' =>  date('Y-m-d H:i:s')
        ]);
        return json_encode(['message'=>'Created successfully!', 'status'=>'success']);
    }

    public function editAnnouncement($id){
        if (!CommonHelpers::isView()) {
            CommonHelpers::redirect(CommonHelpers::adminPath(), 'Denied Access');
        }
        $data = [];
        $data['page_title'] = "Edit Announcement";
        $data['action'] = 'Edit';
        $data['announcement'] = Announcement::find($id);
        return Inertia::render('AdmVram/AnnouncementForm',$data);
    }

    public function saveEditAnnouncement(Request $request){
        if (!CommonHelpers::isUpdate()) {
            CommonHelpers::redirect(CommonHelpers::adminPath(), 'Denied Access');
        }
        Announcement::where('id',$request['a_id'])
        ->update([
            'title'   => $request['title'],
            'message' => $request['message'],
            'status'  => $request['status'],
            'updated_by' => CommonHelpers::myId(),
            'updated_at' =>  date('Y-m-d H:i:s')
        ]);
        return json_encode(['message'=>'Updated successfully!', 'status'=>'success']);
    }

    public function deleteAnnouncement($id){
        if (!CommonHelpers::isDelete()) {
            CommonHelpers::redirect(CommonHelpers::adminPath(), 'Denied Access');
        }
        Announcement::where('id', $id)->delete();
        return json_encode(['message'=>'Deleted successfully!', 'status'=>'success']);
    }
}

?>

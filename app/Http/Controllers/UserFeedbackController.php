<?php

namespace App\Http\Controllers;

use App\Models\UserFeedback;
use App\Models\UserFeedbackAttachment;
use App\Models\UserFeedbackMessage;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use App\Services\AdminAccessService;

class UserFeedbackController extends Controller
{
    public function __construct(private readonly AdminAccessService $adminAccess)
    {
    }

    // `enhancement` and `feature` are retired — no picker offers them any more, but
    // they stay valid here so historical rows keep loading and stay filterable in the
    // admin inbox and the analytics report. Never drop a value from this list.
    private const CATEGORIES = ['payment', 'subscription', 'account', 'chart', 'trading', 'replay', 'enhancement', 'feature', 'bug', 'usability', 'performance', 'other'];
    // The two front doors onto this one pipeline. These three belong to
    // Pages/Feedback/Index.jsx (transaction picker + support chat); everything else is
    // product feedback owned by the Product Hub modal opened from the chart header —
    // defined by exclusion so retired categories stay on the product side. See
    // docs/developer/feedback.md.
    private const SUPPORT_CATEGORIES = ['payment', 'subscription', 'account'];
    // Whitelisted keys for the chart state a Product Hub submission carries.
    private const CONTEXT_KEYS = ['symbol', 'exchange', 'category', 'timeframe', 'replayMode'];
    private const MAX_ATTACHMENTS = 4;
    private const PAYMENT_REASON_CODES = ['duplicate', 'payment_error', 'access_not_reflected', 'other'];
    private const STATUSES = ['submitted', 'reviewing', 'planned', 'in_progress', 'completed', 'declined'];
    private const PRIORITIES = ['low', 'normal', 'high', 'urgent'];
    private const CHAT_CATEGORIES = ['payment', 'subscription'];
    private const CLOSED_STATUSES = ['completed', 'declined'];

    public function userPage()
    {
        return Inertia::render('Feedback/Index');
    }

    public function adminPage(Request $request)
    {
        $this->ensureSuperAdmin($request);

        return Inertia::render('Feedback/AdminIndex');
    }

    public function index(Request $request)
    {
        $items = UserFeedback::query()
            ->where('adm_user_id', $request->user()->id)
            ->with(['subscriptionRequest:id,plan,amount,currency,status', 'attachments'])
            ->withCount(['messages', 'messages as unread_messages_count' => fn ($query) => $query
                ->where('adm_user_id', '!=', $request->user()->id)->whereNull('read_at')])
            ->latest()
            ->limit(100)
            ->get()
            ->map(fn (UserFeedback $feedback) => $this->serialize($feedback));

        return response()->json(['success' => true, 'feedback' => $items]);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'category' => ['required', Rule::in(self::CATEGORIES)],
            'title' => ['required', 'string', 'min:4', 'max:160'],
            'description' => ['required', 'string', 'min:10', 'max:5000'],
            'page_url' => ['nullable', 'string', 'max:500'],
            'subscription_request_id' => [
                'nullable', 'integer',
                Rule::exists('subscription_requests', 'id')->where('adm_user_id', $request->user()->id),
            ],
            'payment_reason_code' => ['nullable', Rule::in(self::PAYMENT_REASON_CODES)],
            // The Product Hub sends multipart only when files are attached; every
            // other submission is plain JSON and simply omits both of these.
            'context' => ['nullable'],
            'attachments' => ['nullable', 'array', 'max:'.self::MAX_ATTACHMENTS],
            'attachments.*' => ['file', 'image', 'mimes:png,jpg,jpeg,webp', 'max:4096'],
        ]);

        if ($validated['category'] !== 'payment') {
            $validated['subscription_request_id'] = null;
            $validated['payment_reason_code'] = null;
        }

        unset($validated['attachments']);
        $validated['context'] = $this->normalizeContext($validated['context'] ?? null);

        $feedback = UserFeedback::query()->create([
            ...$validated,
            'adm_user_id' => $request->user()->id,
            'status' => 'submitted',
            'priority' => 'normal',
        ]);

        $this->storeAttachments($request, $feedback);

        $fresh = $feedback->fresh(['user', 'subscriptionRequest:id,plan,amount,currency,status', 'attachments']);
        $fresh->loadCount([
            'messages',
            'messages as unread_messages_count' => fn ($query) => $query
                ->where('adm_user_id', '!=', $request->user()->id)->whereNull('read_at'),
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Your support request was submitted.',
            'feedback' => $this->serialize($fresh),
        ], 201);
    }

    public function adminIndex(Request $request)
    {
        $this->ensureSuperAdmin($request);
        $validated = $request->validate([
            'status' => ['nullable', Rule::in(self::STATUSES)],
            'category' => ['nullable', Rule::in(self::CATEGORIES)],
            'priority' => ['nullable', Rule::in(self::PRIORITIES)],
            'search' => ['nullable', 'string', 'max:120'],
        ]);

        $items = UserFeedback::query()
            ->with(['user:id,name,email', 'subscriptionRequest:id,plan,amount,currency,status', 'attachments'])
            ->withCount(['messages', 'messages as unread_messages_count' => fn ($query) => $query
                ->where('adm_user_id', '!=', $request->user()->id)->whereNull('read_at')])
            ->when($validated['status'] ?? null, fn ($query, $value) => $query->where('status', $value))
            ->when($validated['category'] ?? null, fn ($query, $value) => $query->where('category', $value))
            ->when($validated['priority'] ?? null, fn ($query, $value) => $query->where('priority', $value))
            ->when($validated['search'] ?? null, function ($query, $value) {
                $query->where(function ($nested) use ($value) {
                    $nested->where('title', 'like', "%{$value}%")
                        ->orWhere('description', 'like', "%{$value}%")
                        ->orWhereHas('user', fn ($userQuery) => $userQuery->where('name', 'like', "%{$value}%")->orWhere('email', 'like', "%{$value}%"));
                });
            })
            // A portable CASE rather than MySQL's FIELD(), which no other driver has.
            // ELSE 0 keeps FIELD()'s exact semantics (an unrecognised priority sorts
            // first), so the ordering on MySQL is unchanged.
            ->orderByRaw("CASE priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 WHEN 'low' THEN 4 ELSE 0 END")
            ->latest()
            ->paginate(30)
            ->through(fn (UserFeedback $feedback) => $this->serialize($feedback, true));

        return response()->json(['success' => true, 'feedback' => $items]);
    }

    public function update(Request $request, UserFeedback $feedback)
    {
        $this->ensureSuperAdmin($request);
        $validated = $request->validate([
            'status' => ['required', Rule::in(self::STATUSES)],
            'priority' => ['required', Rule::in(self::PRIORITIES)],
            'admin_response' => ['nullable', 'string', 'max:5000'],
        ]);

        $feedback->update([
            ...$validated,
            'responded_by' => $request->user()->id,
            'responded_at' => now(),
        ]);

        $fresh = $feedback->fresh(['user', 'subscriptionRequest:id,plan,amount,currency,status', 'attachments']);
        $fresh->loadCount([
            'messages',
            'messages as unread_messages_count' => fn ($query) => $query
                ->where('adm_user_id', '!=', $request->user()->id)->whereNull('read_at'),
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Feedback updated.',
            'feedback' => $this->serialize($fresh, true),
        ]);
    }

    public function messages(Request $request, UserFeedback $feedback)
    {
        $this->authorizeFeedback($request, $feedback);
        abort_unless(in_array($feedback->category, self::CHAT_CATEGORIES, true), 404);

        $feedback->messages()->where('adm_user_id', '!=', $request->user()->id)
            ->whereNull('read_at')->update(['read_at' => now()]);

        return response()->json([
            'messages' => $feedback->messages()->with('user:id,name')->oldest()->get()
                ->map(fn (UserFeedbackMessage $message) => $this->serializeMessage($message, $request)),
            'closed' => in_array($feedback->status, self::CLOSED_STATUSES, true),
        ]);
    }

    public function storeMessage(Request $request, UserFeedback $feedback)
    {
        $this->authorizeFeedback($request, $feedback);
        abort_unless(in_array($feedback->category, self::CHAT_CATEGORIES, true), 404);
        if (in_array($feedback->status, self::CLOSED_STATUSES, true)) {
            return response()->json(['message' => 'This support request is closed. An administrator must reopen it before messaging continues.'], 409);
        }

        $validated = $request->validate(['message' => ['required', 'string', 'max:2000']]);
        $body = trim($validated['message']);
        if ($body === '') return response()->json(['message' => 'Enter a message.'], 422);

        $message = $feedback->messages()->create([
            'adm_user_id' => $request->user()->id,
            'message' => $body,
        ])->load('user:id,name');

        return response()->json(['message' => $this->serializeMessage($message, $request)], 201);
    }

    public function attachment(Request $request, UserFeedbackAttachment $attachment)
    {
        $feedback = $attachment->feedback;
        abort_unless($feedback !== null, 404);
        $this->authorizeFeedback($request, $feedback);
        abort_unless(Storage::disk('local')->exists($attachment->path), 404);

        // Served from the private `local` disk through this authorized route only —
        // the `public` disk is symlinked to public/storage and would make every
        // screenshot fetchable by URL with no auth at all. nosniff because the body
        // is user-supplied bytes rendered inline.
        return Storage::disk('local')->response($attachment->path, $attachment->name, [
            'Content-Type' => $attachment->mime,
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }

    private function storeAttachments(Request $request, UserFeedback $feedback): void
    {
        foreach (array_slice($request->file('attachments') ?? [], 0, self::MAX_ATTACHMENTS) as $file) {
            $feedback->attachments()->create([
                'path' => $file->store("feedback-attachments/{$feedback->adm_user_id}", 'local'),
                'name' => mb_substr($file->getClientOriginalName() ?: 'attachment', 0, 255),
                // Guessed from the file's own bytes, not the client-supplied header.
                'mime' => $file->getMimeType() ?: 'application/octet-stream',
                'size' => (int) $file->getSize(),
            ]);
        }
    }

    /**
     * Whitelist the chart state a Product Hub submission carries. Arrives as a JSON
     * string over multipart and as an array over JSON, so both shapes are accepted;
     * anything outside CONTEXT_KEYS is dropped rather than stored.
     */
    private function normalizeContext(mixed $raw): ?array
    {
        if (is_string($raw)) {
            $raw = json_decode($raw, true);
        }
        if (!is_array($raw)) {
            return null;
        }

        $context = [];
        foreach (self::CONTEXT_KEYS as $key) {
            $value = $raw[$key] ?? null;
            if ($value === null || $value === '' || is_array($value)) {
                continue;
            }
            $context[$key] = $key === 'replayMode'
                ? filter_var($value, FILTER_VALIDATE_BOOLEAN)
                : mb_substr((string) $value, 0, 40);
        }

        return $context ?: null;
    }

    private function ensureSuperAdmin(Request $request): void
    {
        abort_unless($this->adminAccess->isSuperadmin($request->user()), 403);
    }

    private function authorizeFeedback(Request $request, UserFeedback $feedback): void
    {
        $isAdmin = $this->adminAccess->isSuperadmin($request->user());
        abort_unless($isAdmin || (int) $feedback->adm_user_id === (int) $request->user()->id, 404);
    }

    private function serialize(UserFeedback $feedback, bool $includeUser = false): array
    {
        return [
            'id' => $feedback->id,
            'category' => $feedback->category,
            'paymentReasonCode' => $feedback->payment_reason_code,
            'title' => $feedback->title,
            'description' => $feedback->description,
            'pageUrl' => $feedback->page_url,
            'context' => $feedback->context ?: null,
            // relationLoaded, not a lazy read: every caller eager-loads this, and a
            // serializer that silently fires a query per row is how N+1 gets in.
            'attachments' => $feedback->relationLoaded('attachments')
                ? $feedback->attachments->map(fn (UserFeedbackAttachment $attachment) => [
                    'id' => $attachment->id,
                    'name' => $attachment->name,
                    'mime' => $attachment->mime,
                    'size' => (int) $attachment->size,
                    'url' => route('feedback.attachments.show', $attachment->id),
                ])->all()
                : [],
            // Defined as "not a support category" rather than "in PRODUCT_CATEGORIES"
            // so retired `enhancement`/`feature` tickets still show up under the
            // Product Hub's My Suggestions instead of falling into neither bucket.
            'isProduct' => !in_array($feedback->category, self::SUPPORT_CATEGORIES, true),
            'status' => $feedback->status,
            'priority' => $feedback->priority,
            'adminResponse' => $feedback->admin_response,
            'respondedAt' => optional($feedback->responded_at)->toIso8601String(),
            'createdAt' => optional($feedback->created_at)->toIso8601String(),
            'updatedAt' => optional($feedback->updated_at)->toIso8601String(),
            'chatEnabled' => in_array($feedback->category, self::CHAT_CATEGORIES, true),
            'messagesCount' => (int) ($feedback->messages_count ?? 0),
            'unreadMessagesCount' => (int) ($feedback->unread_messages_count ?? 0),
            'subscriptionRequest' => $feedback->subscriptionRequest ? [
                'id' => $feedback->subscriptionRequest->id,
                'plan' => $feedback->subscriptionRequest->plan,
                'amount' => $feedback->subscriptionRequest->amount,
                'currency' => $feedback->subscriptionRequest->currency,
                'status' => $feedback->subscriptionRequest->status,
            ] : null,
            'user' => $includeUser && $feedback->user ? [
                'id' => $feedback->user->id,
                'name' => $feedback->user->name,
                'email' => $feedback->user->email,
            ] : null,
        ];
    }

    private function serializeMessage(UserFeedbackMessage $message, Request $request): array
    {
        return [
            'id' => $message->id,
            'message' => $message->message,
            'mine' => (int) $message->adm_user_id === (int) $request->user()->id,
            'user' => $message->user?->only(['id', 'name']),
            'readAt' => optional($message->read_at)->toIso8601String(),
            'createdAt' => optional($message->created_at)->toIso8601String(),
        ];
    }
}

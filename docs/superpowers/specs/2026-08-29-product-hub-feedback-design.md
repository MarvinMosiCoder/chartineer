# Product Hub — in-chart product feedback

## Purpose

Every kind of feedback currently enters through one door: `Pages/Feedback/Index.jsx`, a two-step form at `/feedback` whose step-1 grid mixes "Charged twice for the same purchase" with "Make the interface easier". Those are different jobs. A payment dispute is a support ticket the user opens deliberately, from a settings-shaped page, and then waits on. A chart suggestion is a reaction — the trader is looking at the thing that's wrong, and the moment they navigate away to a support page to describe it, most of them don't.

This splits the two. Product feedback moves into a modal opened from an icon in the chart toolbar, next to Watchlists, so it is filed from the surface it is about and carries that surface's state with it. `/feedback` keeps the three account-facing categories and its support-chat thread, and the admin inbox keeps receiving all of it as one queue.

Reference for the modal's shape: the Bitunix "Product Hub" (Suggestion / Changelog tabs, single-choice type chips, a counted textarea, an attachment tray, `My Suggestions` and `Submit` in the footer).

## Confirmed product decisions

- **Category split.** Product Hub owns `chart`, `trading`, `replay`, `usability` (labelled "User Experience"), `performance`, `bug`, `other`. `/feedback` keeps `payment`, `subscription`, `account` — the three that have a transaction picker and a support-chat thread. One table, one admin inbox, two front doors.
- **`enhancement` and `feature` are retired, not deleted.** Both stay in the server-side whitelist and in every admin filter so historical rows remain visible and filterable; neither is offered in any picker again. Dropping them from the whitelist would break `FeedbackReportController`'s breakdown for existing data.
- **Replay & Backtest gets its own chip.** It is the feature with the most distinct surface area and the one whose bug reports are least useful when filed as generic "Trading".
- **A Summary field, despite the reference having none.** The admin inbox (`AdminIndex.jsx`) and the analytics report both list rows by `title`. Deriving one from 1500 characters of prose makes the queue unreadable. One extra required line buys a triageable inbox.
- **Attachments are images only, max 4, on the private disk.** See "Attachments" below — the disk choice is a security decision, not a convention one.
- **The Changelog tab reuses Announcements.** No new content model, no new admin page; admins already publish there and the per-user read state already exists.
- **Not carried over from the reference:** its `Bots`, `Bitunix Card`, and `Asset Security` chips (nothing here maps to them), and its `Product Changelog` type chip (the Changelog tab covers that).
- Out of scope: voting/upvoting on suggestions, a public roadmap, notifying users when their suggestion ships, and extending the support-chat thread to product categories. Product tickets keep the existing single `admin_response` field.

## Entry points

Two, both mounting the same component:

1. **`FullscreenChartHeader.jsx`**, between the Watchlists dropdown and Enter Position. This header renders in both windowed and fullscreen chart modes (`MarketChart.jsx:7511`), so one insertion covers both.
2. **`/feedback`**, as a card below the (now three-card) category grid: *"Have a product idea or found a bug? → Open the Product Hub"*. Product categories leaving this page must not strand a user who isn't on the chart.

The chart entry passes chart context; the `/feedback` entry passes none.

## UI changes

### The header button

```
[BTCUSDT ▾] [15m] [▶] [⚙] [i]   [☰ Watchlists] [✎ Product Hub] [$ Enter Position] [⛶]
                                                 └── new
```

`MessageSquarePlus` (lucide), `size={15}`, label `hidden … lg:inline` — the same 36px bordered shape, active/dark/light class triple, and responsive label rule as the Watchlists and Enter Position buttons flanking it.

**Tooltip wired manually via `useAnchoredTooltip('bottom')`, not `IconTooltipButton`.** That wrapper copies its full `className` onto both the wrapping `<span>` and the inner `<button>`, so any visible border or background renders as a nested double box. `FullscreenChartHeader.jsx:26` already carries a comment saying exactly this about its other three buttons; this button has the same visible border and is the same case.

### `Components/Feedback/ProductHubModal.jsx` (new)

Portaled overlay at `z-[10020]`, matching `FeedbackChat.jsx` — above the chart's floating panels (`z-[10021]` popovers close on the outside-click handlers before this opens) and above the fullscreen navbar's `z-[80]`.

```
┌─────────────────────────────────────────────┐
│            Product Hub                  [✕] │
├─────────────────────────────────────────────┤
│  Suggestion  │  Changelog                   │
├─────────────────────────────────────────────┤
│  * Type   ( Single choice )                 │
│  [ Chart ] [ Trading ] [ Replay & Backtest ]│
│  [ User Experience ] [ Performance ]        │
│  [ Bug ] [ Other ]                          │
│                                             │
│  BTCUSDT · BYBIT linear · 15m       ← chip  │
│                                             │
│  * Summary                                  │
│  [___________________________________]      │
│                                             │
│  * We're committed to improving             │
│  ┌─────────────────────────────────────┐    │
│  │ Share your idea or report an issue… │    │
│  │                            0/1500   │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  Upload Attachment  ( 0/4 )                 │
│  ┌───┐ ┌───┐                                │
│  │ + │ │ ▣ │✕                               │
│  └───┘ └───┘                                │
├─────────────────────────────────────────────┤
│  ☰ My Suggestions          [    Submit    ] │
└─────────────────────────────────────────────┘
```

Three views behind one shell: **Suggestion** (above), **Changelog**, and **My Suggestions** (reached from the footer, with a back arrow — a third view, not a fourth tab, matching the reference).

Field rules: type required, single-select, teal `#2dd4bf` active fill (this app's accent, not the reference's green). Summary required, `max 160`. Details required, `min 10`, capped at 1500 in this modal with a live counter in the textarea's bottom-right corner. The server rule stays `max:5000` — the support page's longer form shares the endpoint, and 1500 is a Hub-side authoring cap, not a validation boundary. Submit disabled until type, summary, and details are all valid.

On success the modal closes, `useToast`'s `handleToast(…, 'success')` fires, and the new item is prepended to the My Suggestions list without a refetch.

**Theming.** The component takes an optional `chartTheme` prop. From the chart it inherits that theme so the modal matches the chart's own panel/border colors; from `/feedback` it falls back to `useTheme()`'s `bg-skin-black` check, the pattern every other page-level component here uses.

### My Suggestions view

The current user's product-category tickets, newest first: status pill (reusing `Index.jsx`'s `statusStyles` map), category, date, description excerpt, attachment thumbnails, and the admin response when present. Sourced from the existing `GET /feedback/items` response filtered to product categories — no new endpoint. Support tickets are deliberately absent; a footer link goes to `/feedback` for those.

### Changelog tab

Latest 15 active announcements: title, date, an unread dot, click-to-expand full `message` HTML, and a "View all updates" link to `/updates`. Expanding an unread row calls the existing `POST /read-announcement`, so read state stays consistent with `AnnouncementGate` and the Market Summary card.

Announcement `message` is admin-authored rich HTML rendered via `dangerouslySetInnerHTML` — the same trust model `AnnouncementGate.jsx` and `Pages/Announcements/Index.jsx` already use. This adds a fourth surface under that model and no new trust assumption.

### `Pages/Feedback/Index.jsx`

`categories` drops to the three support entries. The step-1 grid gains the Product Hub card described under Entry points, which mounts `ProductHubModal` with no chart context. Nothing else on the page changes — the payment transaction picker, the two-step flow, the history panel, and `FeedbackChat` are all untouched.

## Chart context

A submission from the chart carries `{ symbol, exchange, category, timeframe, replayMode }`, stored in a new nullable `context` JSON column on `user_feedback` and rendered read-only as a chip inside the modal so the user can see what they're attaching.

`AdminIndex.jsx`'s detail pane renders it as a chip row above the description: `BTCUSDT · BYBIT linear · 15m · replay`. This is the difference between a triageable chart bug and "the chart broke."

The existing `page_url` field keeps doing its job unchanged; `context` is additive.

## Data model

```
user_feedback
  + context  json  nullable          -- {symbol, exchange, category, timeframe, replayMode}

user_feedback_attachments            -- new
  id
  user_feedback_id  FK -> user_feedback  cascadeOnDelete
  path              string 500        -- private disk, never exposed to the client
  name              string 255        -- original filename, for display and download
  mime              string 100
  size              unsignedInteger
  timestamps
  index (user_feedback_id)
```

Two migrations, both additive; no existing column changes type or nullability.

## Attachments

**Stored on the `local` disk, not `public`.** `public/storage` is a live symlink to `storage/app/public`, so every file on the `public` disk is fetchable at a guessable `/storage/<path>` URL with no authentication. Payment proofs accept that tradeoff; feedback screenshots must not — a chart screenshot routinely contains account balance, open positions, and the app's own logged-in chrome. `ImportedTradeController` already uses the `local` disk for user uploads for this reason and is the precedent to follow.

- Path: `feedback-attachments/{userId}/…` via `$file->store(…, 'local')`
- Validation: `attachments` array, `max:4`; each `image`, `mimes:png,jpg,jpeg,webp`, `max:4096` (KB)
- `GET /feedback/attachments/{attachment}` streams the file, authorized to the ticket owner or an active superadmin — the same owner-or-superadmin check `authorizeFeedback()` already implements, and the same shape as `ReplayAccessController.php:312`'s attachment download
- The serializer returns `{ id, name, url, mime, size }` where `url` is that route. Raw storage paths never cross the wire.
- A `deleting` hook on `UserFeedback` removes the files. The FK cascade only clears rows; without the hook, deleting a ticket orphans its uploads on disk forever.

`POST /feedback/items` must accept both `multipart/form-data` (the Hub, when files are attached) and `application/json` (the support page, and the Hub with no files). The Hub builds a real `FormData` instance only when there is at least one file and never sets `Content-Type` by hand — `docs/developer/announcements.md` documents a past outage in this codebase caused by declaring `multipart/form-data` on a plain object, which axios still JSON-stringifies, producing a boundary-less body PHP silently parses as empty.

## Backend changes

| File | Change |
|---|---|
| `UserFeedbackController.php` | `CATEGORIES` += `chart`, `trading`, `replay`; add `PRODUCT_CATEGORIES` / `SUPPORT_CATEGORIES` consts; `store()` validates and persists `context` + `attachments[]`; new `attachment()` download method; `serialize()` returns `context` and `attachments` |
| `FeedbackReportController.php` | `CATEGORIES` += the same three |
| `Admin/AnnouncementsController.php` | new `getChangelog()` returning the latest 15 active announcements as JSON with `is_read` — `getAllAnnouncements()` is an Inertia page render and cannot be reused |
| `UserFeedback.php` | `attachments()` hasMany; `context` cast to `array`; `deleting` hook for file cleanup |
| `UserFeedbackAttachment.php` | new model |
| `routes/web.php` | `GET /feedback/attachments/{attachment}`, `GET /changelog-feed` |

`store()`'s existing rule — force `subscription_request_id` and `payment_reason_code` to `null` for any category that isn't `payment` — already covers every new category with no change.

## Ripple changes

Three places hardcode the nine-category list independently of the controller. Miss any one and Hub submissions vanish from that surface with no error:

- `FeedbackReportController::CATEGORIES` — analytics breakdown silently drops unlisted categories
- `Pages/Reports/FeedbackAnalytics.jsx:9` — label map; an unlisted category renders as a raw slug
- `Pages/Feedback/AdminIndex.jsx:10` — the admin filter dropdown

Consolidating these into one shared source is tempting and out of scope; the spec's job here is to name all three so none is missed.

## Error handling

- Validation failures render inline per-field from the 422 body, matching `Index.jsx`'s existing `error.response?.data?.message` handling.
- An oversize or wrong-type file is rejected client-side before upload with an inline message, and again server-side — the client check is convenience, not the boundary.
- A failed submit preserves the form. The user does not retype 1500 characters because the network blipped.
- `POST /feedback/items` stays behind `throttle:feedback-write`; the attachment download route does not need it.
- Changelog fetch failure shows an inline retry, not an empty tab that reads as "no updates".

## Testing

New `tests/Feature/ProductHubFeedbackTest.php`:

- a `chart` category submission is accepted and persists `context`
- a fifth attachment, a non-image, and an oversize file are each rejected
- uploaded files land on the `local` disk and are absent from `public`
- the download route returns the file for the owner and for a superadmin, and `404` for any other user — `404` rather than `403`, matching `authorizeFeedback()`'s existing choice not to confirm a ticket exists to someone who can't see it
- deleting a ticket removes its files from disk
- retired `enhancement` still validates (historical rows keep working)

`UserFeedbackPaymentContextTest` and `AdminFeedbackPaginationTest` must stay green unchanged — if either needs editing, the split has broken something it shouldn't have.

## Documentation

Updated in the same change, not after:

- `docs/developer/feedback.md` — the two-door split, the new categories, attachments, chart context
- `docs/developer/trading-chart.md` — the new header button and its manual-tooltip wiring
- `docs/developer/announcements.md` — the `getChangelog()` JSON endpoint and the fourth rich-HTML surface

Related: [Feedback](../../developer/feedback.md), [Announcements](../../developer/announcements.md), [Tooltip modernization](2026-08-23-tooltip-modernization-design.md), [Admin feedback analytics](2026-08-23-admin-feedback-analytics-report-design.md).

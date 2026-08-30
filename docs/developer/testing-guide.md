# Testing Guide

## Automated checks

```bash
php artisan test
npm run build
php artisan route:list
```

The pure frontend helpers have their own suites under `tests/js`, run on Node's built-in test runner (no bundler, no component harness). Each is its own npm script, so add one alongside the file when you add a suite:

```bash
npm run test:chart-utils        # tests/js/marketChartUtils.test.js
npm run test:market-sessions    # tests/js/marketSessions.test.js
npm run test:order-risk-lines   # tests/js/orderRiskLines.test.js
```

Current automated coverage includes PayMongo client/signature/route behavior and subscription entitlement service behavior under `tests/Unit` and `tests/Feature`. Add tests beside the changed domain; do not rely only on manual chart testing.

## Test layers

- Unit: service calculations, signature parsing, normalization, pure helpers.
- Feature: routes, middleware, validation, authorization, ownership, database transitions.
- Frontend/manual: chart lifecycle, responsive layout, pointer interactions, WebSockets, themes.
- Integration/sandbox: exchange APIs, OAuth providers, mail, storage, PayMongo.

## Required cross-cutting scenarios

- Anonymous, active user, inactive user, restricted admin, superadmin.
- Trader/admin login separation, stale or spoofed role sessions, immediate permission revocation, and direct admin mutation attempts.
- Two users attempting to access each other's route-model-bound records.
- Duplicate clicks, concurrent tabs, delayed/out-of-order requests.
- Empty data, invalid input, timeout, upstream failure, throttling.
- Dark/light theme and desktop/mobile layout.
- Spotlight tours (`WorkspaceTour.jsx`): step through every step at a wide, a mid, and a phone viewport — the tooltip must stay fully on screen and must not cover the element it highlights whenever there is room elsewhere.
- Cleanup after navigation/unmount.

## Documentation validation

After documentation changes:

1. Check every Markdown link resolves.
2. Check every backticked repository path exists.
3. Compare excerpts to current source.
4. Compare documented endpoints with `php artisan route:list`.
5. Ensure every static route in `routes/web.php` and `routes/api.php` belongs to a guide or is identified as shared/legacy.

## Acceptance for a new feature

- Happy path works.
- Validation and authorization fail safely.
- Ownership is tested.
- Migrations roll forward cleanly.
- Build/tests pass.
- Relevant feature guide and [file reference](file-reference.md) are updated.
# Trading and alert regression checks

- Confirm ready-tool selections persist across login/device reload and every new drawing can be selected, resized, moved, duplicated, saved, and restored.
- Confirm template name collisions require overwrite approval and range labels calculate correctly.
- Open the symbol picker and verify its Spot/Futures tabs switch category without increasing the persistent chart-header height.
- Confirm right-axis prices omit trailing `.00` and thousands separators while retaining meaningful fractional precision.
- Right-click the chart and verify Clear Tools is disabled with no drawings, confirms before clearing drawings, and remains undoable.
- Switch markets while a live update arrives and confirm the skeleton remains until the full history response.
- Stub `/api/klines` to fail (502 `No candle data returned`) and confirm the chart retries three times behind the skeleton, then — with no cached candles — shows a muted "No chart data loaded" + Try again on an empty chart rather than red error text; with cached candles on screen, confirm the chart stays visible and only the "Showing saved candles" chip appears. Fail only the first request and confirm the chart recovers with no message at all.
- Disconnect each exchange WebSocket and confirm one coalesced 10-second REST fallback refresh serves concurrent charts, hidden tabs stop polling, and visibility resumes immediately.
- Mock exchange 429/418 responses and verify `Retry-After`, shared cooldown, stale success, bounded pagination, one compatible fallback, and recovery without a request storm.
- Verify BingX Spot uses its Spot socket, MEXC Spot protobuf candles decode, and unsupported MEXC timeframes are absent and rejected server-side.
- Leave RSI/MACD open through live updates and fullscreen transitions and confirm pane heights remain stable.
- Run `php artisan market-alerts:monitor --once --force` with test alerts and mocked exchange responses; verify trigger idempotency, cancellation, notification ownership, and failed-market backoff.
- With a live chart open, cross rise and drop targets and verify the authenticated check creates one notification, removes the alert line, and shows one six-second toast even after the navbar poll runs.
- Change only the timeframe and confirm the current chart stays visible beneath a light text-free, blur-free blocking shield while header controls remain available; then change the symbol and confirm the full loading skeleton still appears.
- Create drawings and buy/sell executions on 5m, switch through 1h and back, and confirm drawings, markers, Price Range handles, and long/short right-axis guides remain available.
- Reprice an open simulated entry and verify quantity is fixed while margin, fee, cash, opening trade, and PnL inputs update atomically; verify invalid risk and insufficient cash roll back.
- On a position with no stop or target, confirm `TP`/`SL` pills render on its entry-line badge (only the missing one, when just one is missing); clicking either creates a real, immediately draggable level a short distance from the entry on the correct side, and the pill then disappears. Dragging either across the entry clamps just short of it instead of returning a 422. With the entry line near the top or bottom of the pane, the buttons stay on-screen and the level is still accepted.
- In fullscreen, open Enter Position and verify the visible chart remains interactive, the right price scale is unobstructed on desktop, and the responsive sheet remains non-modal.
- Verify the bottom Market Feed details, live timezone clock, valid profile-timezone persistence, and invalid-timezone rejection.
- Return from Replay to Live and confirm the last Replay price guide remains visible immediately without changing timeframe, live candles resume, and saved horizontal-line drawings remain intact.
- Confirm Back to Live scrolls after the full live series is rendered, so the latest-price line and displayed candles align without changing timeframe.
- Select a Replay candle above or below the pointer center and confirm the guide uses the candle close; verify ready-tool boxes align with Replay and each chevron sits directly beside its tool with zero gap and gray hover feedback.
- Test known/unknown Google and Facebook identities, consent/cancel/expiry, two-step email errors, active subscription read-only behavior, and custom demo reset amounts.
- Confirm the login Continue action rejects invalid and unknown email addresses, handles lookup throttling, and advances known users to the password-only step.
- Open Market Summary with empty and populated watchlists; verify featured BTC/ETH/SOL highlights always render, saved and featured markets use one deduplicated metadata request, and provider failures do not hide the rest of the page.
- Verify only the latest four active announcements appear as sanitized excerpts, expanding an unread update marks it read once, the rotating tip and quick actions work, and the empty-watchlist Workspace CTA is visible.
- Check the compact Market Summary overview at desktop/mobile widths in dark and light themes, including skeleton and partial-error states.

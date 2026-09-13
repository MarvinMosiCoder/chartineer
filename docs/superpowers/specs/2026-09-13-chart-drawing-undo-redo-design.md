# Chart drawing undo/redo

## Problem

Chart drawings had a partial undo system that looked complete and was not.

Ctrl/Cmd + Z was bound and backed by a 25-step snapshot stack, but only four
actions ever recorded a snapshot: single delete (key), single delete (toolbar),
marquee bulk delete, and Clear all. **Moving, resizing, nudging, creating and
duplicating a drawing recorded nothing.** Drag and resize committed straight
through `saveDrawings(drawingsRef.current)` on mouseup, so Ctrl+Z after dragging
a trendline either did nothing or silently reverted an older *delete* instead —
the worst version, because the key appears to work.

There was also no visible control anywhere. Undo was keyboard-only, so on touch
it did not exist at all, on a chart that otherwise has a full drawing rail.

A second latent bug: `pushDrawingUndoSnapshot` opened with
`if (!drawingsRef.current.length) return;`, making an empty chart impossible to
record. Even once create became undoable, the first drawing could not be undone
back to nothing.

## Scope

**In:** every mutation of the `drawings` collection — create, duplicate, move,
resize, nudge, and the deletes already covered. Redo. Visible buttons.

**Out:** style, colour, width and text edits. The settings panel previews live,
so covering them needs a commit-vs-preview split or every slider tick becomes an
undo step. Deferred deliberately, not overlooked.

## Design

### A pure history module

`resources/js/Components/Market/MarketChart/drawingHistory.js` owns a plain
`{ undo: [], redo: [] }` and exports `createDrawingHistory`, `pushSnapshot`,
`undo`, `redo`, `canUndo`, `canRedo`, `clearScope`. No React.

The logic previously lived as two closures inside `MarketChart.jsx` (~8,400
lines) where no test could reach it. Extracting it is what makes the rules
testable; `MarketChart.jsx` keeps only the ref and the call sites.

A snapshot is the whole `drawings` array rather than a diff. At a 25-step cap
the memory is irrelevant, every operation stays a straight array swap, and a
gesture touching several drawings at once (marquee delete, Clear all) restores
as one step for free. A command/diff model was rejected as a rewrite buying
memory we are not short of.

### Redo invalidation lives in `pushSnapshot`

Any new edit makes every redo entry a state that can no longer be reached.
Clearing the redo stack is therefore done inside `pushSnapshot` — the one
function every mutation already calls — rather than at each call site, so a
call site added later cannot forget it.

### Gesture-scoped capture for drag and resize

Mousemove writes `drawingsRef.current` directly, so by mouseup the pre-gesture
state is gone. Mousedown stashes it in `pendingDrawingSnapshotRef`; mouseup
commits it **only if the drawings actually changed**. Mousedown also fires for a
plain click that selects a drawing, and recording that would leave an undo step
that visibly does nothing.

### Nudge coalescing

Arrow-key repeat fires roughly every 30ms, so one snapshot per repeat would
flush all 25 steps in under a second. Consecutive nudges of the *same* drawing
within `NUDGE_UNDO_COALESCE_MS` (600ms) ride on the step already recorded — the
same rule a text editor uses for a run of typing. `pushDrawingUndoSnapshot` and
every history step reset the marker, so any other action ends the run.

### The buttons force the history to be mirrored

The history must stay a **ref**: the mouse handlers read and write it mid-gesture
and would capture a stale copy from state. But a ref never re-renders, so a
button cannot read its own `disabled` off it. `canUndoDrawings`/`canRedoDrawings`
mirror it into state via a single `syncDrawingHistoryAvailability()`, and are
display-only. Any new writer of the history ref must call that sync.

They mirror `canUndo(history, scope)` — "is there a snapshot for *this* market" —
not "the stack is non-empty", because undo itself is scope-matched.

### Placement

`Undo2`/`Redo2` rail buttons above Clear in `ReplayPanel.jsx`, present in both
the workspace and fullscreen rails, plus a two-up pair in the expanded Tools
flyout's action block. That rail is where every other drawing-wide action
already lives (Lock, Show/Hide, Clear) and its container is already
`overflow-y-auto`, so two more buttons extend the scroll rather than clipping.

A header copy was rejected: it separates undo from the drawings it acts on, and
this codebase has already removed one duplicated trigger (the second Enter
Position button) for the same reason.

Keys: Ctrl/Cmd + Z undo; Ctrl/Cmd + Shift + Z and Ctrl + Y redo. Each handler
returns whether it had anything to do, so on an empty stack the key falls
through to the browser rather than being swallowed.

## Note on scope filtering

`getDrawingScope()` returns `exchange:marketCategory:symbol`, which is exactly
what the history-clearing effect keys on — so every stored entry already matches
the live scope and the filtering can never fail to match. It is kept as
defensive, and because it is what lets the buttons answer per-market. It is not
load-bearing isolation and should not be read as such.

## Tests

`tests/js/drawingHistory.test.js` (`npm run test:drawing-history`): ordering,
empty-chart snapshots, redo round-trip, redo invalidation after a new edit,
scope isolation, `clearScope` leaving other markets intact, the 25-step cap on
both stacks, and that no exported function mutates its input.

Gesture and keybinding behaviour is manual — see the Verification list in
[Chart drawings and settings](../../developer/chart-drawings-and-settings.md).

## Files

- new `resources/js/Components/Market/MarketChart/drawingHistory.js`
- new `tests/js/drawingHistory.test.js`, script in `package.json`
- `resources/js/Components/Market/MarketChart.jsx` — history wiring, snapshots at
  five new sites, redo keybindings, four new props
- `resources/js/Components/Market/MarketChart/ReplayPanel.jsx` — rail buttons and
  flyout pair
- `docs/developer/chart-drawings-and-settings.md`, `docs/developer/testing-guide.md`

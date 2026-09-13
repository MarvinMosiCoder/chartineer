/**
 * Undo/redo history for chart drawings.
 *
 * Pure functions over a plain `{ undo: [], redo: [] }` object, kept out of
 * `MarketChart.jsx` so the stack rules are testable on their own — the file is
 * ~8,400 lines and the history used to live there as two closures no test could
 * reach (`tests/js/drawingHistory.test.js`, `npm run test:drawing-history`).
 *
 * A snapshot is the whole `drawings` array, not a diff. At a 25-step cap that
 * costs little and keeps every operation a straight array swap, which is what
 * makes restoring correct for gestures that touch several drawings at once
 * (marquee delete, clear all).
 *
 * `scope` is the market a snapshot belongs to (`exchange:category:symbol`).
 * `MarketChart.jsx` also clears the whole history when any of those three
 * change, so in practice every stored entry already matches the live scope —
 * the filtering here is defensive, and it is what lets `canUndo`/`canRedo`
 * answer "for *this* market" rather than "the stack is non-empty".
 */

export const MAX_DRAWING_UNDO_STEPS = 25;

export function createDrawingHistory() {
  return { undo: [], redo: [] };
}

function lastIndexForScope(entries, scope) {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    if (entries[index].scope === scope) return index;
  }

  return -1;
}

function take(entries, scope) {
  const index = lastIndexForScope(entries, scope);
  if (index === -1) return null;

  const next = entries.slice();
  const [snapshot] = next.splice(index, 1);

  return { entries: next, snapshot };
}

/**
 * Record a pre-change snapshot. Always call this *before* mutating drawings.
 *
 * Clearing the redo stack lives here rather than at each call site on purpose:
 * a new edit makes every redo entry a state that can no longer be reached, and
 * a call site that forgot to clear would let the user redo into it.
 */
export function pushSnapshot(history, snapshot) {
  return {
    undo: [...history.undo, snapshot].slice(-MAX_DRAWING_UNDO_STEPS),
    redo: [],
  };
}

/**
 * Step back. `current` is the live state, which becomes the redo entry.
 * Returns `null` when this scope has nothing to undo, so callers can leave the
 * browser's own Ctrl+Z alone instead of swallowing the key.
 */
export function undo(history, scope, current) {
  const taken = take(history.undo, scope);
  if (!taken) return null;

  return {
    history: {
      undo: taken.entries,
      redo: [...history.redo, current].slice(-MAX_DRAWING_UNDO_STEPS),
    },
    snapshot: taken.snapshot,
  };
}

/** Step forward again. The mirror of `undo` — the live state returns to `undo`. */
export function redo(history, scope, current) {
  const taken = take(history.redo, scope);
  if (!taken) return null;

  return {
    history: {
      undo: [...history.undo, current].slice(-MAX_DRAWING_UNDO_STEPS),
      redo: taken.entries,
    },
    snapshot: taken.snapshot,
  };
}

export function canUndo(history, scope) {
  return lastIndexForScope(history.undo, scope) !== -1;
}

export function canRedo(history, scope) {
  return lastIndexForScope(history.redo, scope) !== -1;
}

export function clearScope(history, scope) {
  return {
    undo: history.undo.filter((entry) => entry.scope !== scope),
    redo: history.redo.filter((entry) => entry.scope !== scope),
  };
}

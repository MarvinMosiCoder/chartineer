import test from 'node:test';
import assert from 'node:assert/strict';

import {
  canRedo,
  canUndo,
  clearScope,
  createDrawingHistory,
  MAX_DRAWING_UNDO_STEPS,
  pushSnapshot,
  redo,
  undo,
} from '../../resources/js/Components/Market/MarketChart/drawingHistory.js';

const SCOPE = 'binance:spot:BTCUSDT';
const OTHER_SCOPE = 'binance:spot:ETHUSDT';

const state = (...ids) => ({
  scope: SCOPE,
  drawings: ids.map((id) => ({ id })),
  selectedDrawingId: ids.at(-1) ?? null,
});

const ids = (snapshot) => snapshot.drawings.map((drawing) => drawing.id);

test('undo returns the snapshot taken before the change, newest first', () => {
  let history = createDrawingHistory();
  history = pushSnapshot(history, state());
  history = pushSnapshot(history, state('a'));

  const first = undo(history, SCOPE, state('a', 'b'));
  assert.deepEqual(ids(first.snapshot), ['a']);

  const second = undo(first.history, SCOPE, first.snapshot);
  assert.deepEqual(ids(second.snapshot), []);
});

test('an empty chart is a recordable state, so the first drawing undoes back to nothing', () => {
  // The guard this replaces (`if (!drawings.length) return`) made an empty
  // snapshot impossible to store, so creating on a blank chart was unundoable.
  let history = createDrawingHistory();
  history = pushSnapshot(history, state());

  assert.equal(canUndo(history, SCOPE), true);
  assert.deepEqual(ids(undo(history, SCOPE, state('a')).snapshot), []);
});

test('redo replays what undo reverted, and round-trips', () => {
  let history = pushSnapshot(createDrawingHistory(), state('a'));
  const live = state('a', 'b');

  const undone = undo(history, SCOPE, live);
  assert.deepEqual(ids(undone.snapshot), ['a']);
  assert.equal(canRedo(undone.history, SCOPE), true);

  const redone = redo(undone.history, SCOPE, undone.snapshot);
  assert.deepEqual(ids(redone.snapshot), ['a', 'b']);
  assert.equal(canRedo(redone.history, SCOPE), false);
  assert.equal(canUndo(redone.history, SCOPE), true);
});

test('a new edit invalidates redo', () => {
  // The reachability rule: once the user edits after undoing, every redo entry
  // describes a state that can no longer be returned to.
  const undone = undo(pushSnapshot(createDrawingHistory(), state('a')), SCOPE, state('a', 'b'));
  assert.equal(canRedo(undone.history, SCOPE), true);

  const afterEdit = pushSnapshot(undone.history, state('a'));
  assert.equal(canRedo(afterEdit, SCOPE), false);
  assert.equal(redo(afterEdit, SCOPE, state('a', 'c')), null);
});

test('undo and redo are scoped to one market and never reach across', () => {
  let history = pushSnapshot(createDrawingHistory(), state('a'));
  history = pushSnapshot(history, { ...state('x'), scope: OTHER_SCOPE });

  // The other market's snapshot is newer, but must not answer for this one.
  assert.deepEqual(ids(undo(history, SCOPE, state('a', 'b')).snapshot), ['a']);
  assert.equal(canUndo(history, 'binance:spot:SOLUSDT'), false);
  assert.equal(undo(history, 'binance:spot:SOLUSDT', state()), null);
});

test('clearScope drops one market and leaves the others intact', () => {
  let history = pushSnapshot(createDrawingHistory(), state('a'));
  history = pushSnapshot(history, { ...state('x'), scope: OTHER_SCOPE });
  history = undo(history, OTHER_SCOPE, { ...state('x', 'y'), scope: OTHER_SCOPE }).history;
  assert.equal(canRedo(history, OTHER_SCOPE), true);

  const cleared = clearScope(history, OTHER_SCOPE);
  assert.equal(canUndo(cleared, OTHER_SCOPE), false);
  assert.equal(canRedo(cleared, OTHER_SCOPE), false);
  assert.equal(canUndo(cleared, SCOPE), true);
});

test('both stacks are capped, dropping the oldest entry', () => {
  let history = createDrawingHistory();
  for (let step = 0; step < MAX_DRAWING_UNDO_STEPS + 10; step += 1) {
    history = pushSnapshot(history, state(`d${step}`));
  }

  assert.equal(history.undo.length, MAX_DRAWING_UNDO_STEPS);
  assert.deepEqual(ids(history.undo[0]), ['d10']);

  let live = state('live');
  for (let step = 0; step < MAX_DRAWING_UNDO_STEPS; step += 1) {
    const result = undo(history, SCOPE, live);
    history = result.history;
    live = result.snapshot;
  }

  assert.equal(history.redo.length, MAX_DRAWING_UNDO_STEPS);
  assert.equal(canUndo(history, SCOPE), false);
  assert.equal(undo(history, SCOPE, live), null);
});

test('nothing mutates the history object it was given', () => {
  const history = pushSnapshot(createDrawingHistory(), state('a'));
  const before = JSON.stringify(history);

  pushSnapshot(history, state('a', 'b'));
  undo(history, SCOPE, state('a', 'b'));
  clearScope(history, SCOPE);

  assert.equal(JSON.stringify(history), before);
});

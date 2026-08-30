import test from 'node:test';
import assert from 'node:assert/strict';

import {
  clampRiskPrice,
  ORDER_LEVEL_BUTTON_GAP,
  ORDER_LEVEL_BUTTON_HEIGHT,
  ORDER_LEVEL_BUTTON_WIDTH,
  orderBadgeGroupRightEdge,
  orderLevelButtonRects,
  RISK_CLAMP_EPSILON,
} from '../../resources/js/Components/Market/MarketChart/utils.js';

const ENTRY = 100;
const PANE = 600;

// --- clampRiskPrice -------------------------------------------------------

test('leaves a valid level untouched', () => {
  assert.equal(clampRiskPrice('sl', 'long', ENTRY, 90), 90);
  assert.equal(clampRiskPrice('tp', 'long', ENTRY, 110), 110);
  assert.equal(clampRiskPrice('sl', 'short', ENTRY, 110), 110);
  assert.equal(clampRiskPrice('tp', 'short', ENTRY, 90), 90);
});

test('pulls a level back when it is dragged across the entry', () => {
  assert.ok(clampRiskPrice('sl', 'long', ENTRY, 130) < ENTRY);
  assert.ok(clampRiskPrice('tp', 'long', ENTRY, 70) > ENTRY);
  assert.ok(clampRiskPrice('sl', 'short', ENTRY, 70) > ENTRY);
  assert.ok(clampRiskPrice('tp', 'short', ENTRY, 130) < ENTRY);
});

// updatePositionRisk rejects `$stopLoss >= $entryPrice`, so a clamp that landed
// exactly on the entry would still 422. This is the whole reason for the
// epsilon, and the assertion that would catch its removal.
test('clamps strictly inside the entry, never onto it', () => {
  const longStop = clampRiskPrice('sl', 'long', ENTRY, ENTRY);
  const longTarget = clampRiskPrice('tp', 'long', ENTRY, ENTRY);

  assert.notEqual(longStop, ENTRY);
  assert.notEqual(longTarget, ENTRY);
  assert.ok(longStop < ENTRY);
  assert.ok(longTarget > ENTRY);
  assert.equal(longStop, ENTRY * (1 - RISK_CLAMP_EPSILON));
  assert.equal(longTarget, ENTRY * (1 + RISK_CLAMP_EPSILON));
});

test('is relative, so it holds for prices orders of magnitude apart', () => {
  for (const entry of [0.00000123, 1, 77_500]) {
    const clamped = clampRiskPrice('sl', 'long', entry, entry * 2);
    assert.ok(clamped < entry, `expected a clamp below ${entry}`);
    assert.ok(clamped > entry * 0.99, `expected the clamp to stay near ${entry}`);
  }
});

test('never clamps an entry line, which may move anywhere', () => {
  assert.equal(clampRiskPrice('entry', 'long', ENTRY, 130), 130);
  assert.equal(clampRiskPrice('entry', 'short', ENTRY, 70), 70);
});

test('passes the price through when there is no usable entry to clamp against', () => {
  // Draft lines carry no entryPrice; the ticket validates those instead.
  assert.equal(clampRiskPrice('sl', 'long', null, 130), 130);
  assert.equal(clampRiskPrice('sl', 'long', 0, 130), 130);
});

// --- add-level button geometry -------------------------------------------
//
// These replace the old ghostLineY suite: unset SL/TP levels are no longer
// free-floating ghost lines but buttons on the entry line's badge. The geometry
// is worth pinning because it is computed twice — ChartStage draws from it and
// MarketChart hit-tests from it — and a button the two disagree about looks
// clickable while doing nothing.

const WIDTH = 900;

test('reserves a lane so the buttons never overlap the price badge group', () => {
  const withNone = orderBadgeGroupRightEdge(WIDTH, false, 0);
  const withTwo = orderBadgeGroupRightEdge(WIDTH, false, 2);

  assert.equal(withNone - withTwo, 2 * (ORDER_LEVEL_BUTTON_WIDTH + ORDER_LEVEL_BUTTON_GAP));
});

test('leaves extra room for the cancel x when the line can be cancelled', () => {
  assert.ok(orderBadgeGroupRightEdge(WIDTH, true, 0) < orderBadgeGroupRightEdge(WIDTH, false, 0));
});

test('lays the buttons out left to right in the order given, without overlapping', () => {
  const rects = orderLevelButtonRects({ y: 300, canCancel: false, addLevels: ['tp', 'sl'] }, WIDTH, 600);

  assert.deepEqual(rects.map((rect) => rect.kind), ['tp', 'sl']);
  assert.equal(rects[1].x - rects[0].x, ORDER_LEVEL_BUTTON_WIDTH + ORDER_LEVEL_BUTTON_GAP);
  assert.ok(rects[0].x + rects[0].width <= rects[1].x, 'buttons overlap');
});

test('centres the buttons on the line and clamps them inside the pane', () => {
  const [middle] = orderLevelButtonRects({ y: 300, addLevels: ['sl'] }, WIDTH, 600);
  assert.equal(middle.y, 300 - ORDER_LEVEL_BUTTON_HEIGHT / 2);

  // A line at or past an edge must still produce a button the pointer can reach.
  for (const y of [-40, 0, 4, 596, 600, 900]) {
    const [rect] = orderLevelButtonRects({ y, addLevels: ['sl'] }, WIDTH, 600);
    assert.ok(rect.y >= 0, `button escaped the top at y=${y}`);
    assert.ok(rect.y + rect.height <= 600, `button escaped the bottom at y=${y}`);
  }
});

test('emits nothing when the position is missing no levels', () => {
  assert.deepEqual(orderLevelButtonRects({ y: 300, addLevels: null }, WIDTH, 600), []);
  assert.deepEqual(orderLevelButtonRects({ y: 300, addLevels: [] }, WIDTH, 600), []);
  assert.deepEqual(orderLevelButtonRects({ y: 300 }, WIDTH, 600), []);
});

test('keeps the buttons on-screen on a very narrow chart', () => {
  const rects = orderLevelButtonRects({ y: 100, canCancel: true, addLevels: ['tp', 'sl'] }, 140, 400);
  rects.forEach((rect) => assert.ok(rect.x >= 0, 'button pushed off the left edge'));
});

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  clampRiskPrice,
  GHOST_LINE_MIN_GAP_PX,
  GHOST_LINE_OFFSET_PX,
  ghostLineY,
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

// --- ghostLineY -----------------------------------------------------------

test('places a ghost on the correct side of the entry for each side and kind', () => {
  const entryY = 300;

  // Screen y grows downward: a long's target sits above its entry, so lower y.
  assert.equal(ghostLineY(entryY, 'tp', 'long', PANE), entryY - GHOST_LINE_OFFSET_PX);
  assert.equal(ghostLineY(entryY, 'sl', 'long', PANE), entryY + GHOST_LINE_OFFSET_PX);
  assert.equal(ghostLineY(entryY, 'tp', 'short', PANE), entryY + GHOST_LINE_OFFSET_PX);
  assert.equal(ghostLineY(entryY, 'sl', 'short', PANE), entryY - GHOST_LINE_OFFSET_PX);
});

test('keeps a ghost inside the pane when the entry sits near an edge', () => {
  const nearTop = ghostLineY(30, 'tp', 'long', PANE);
  const nearBottom = ghostLineY(PANE - 30, 'sl', 'long', PANE);

  assert.ok(nearTop >= 0 && nearTop <= PANE, 'ghost escaped the top of the pane');
  assert.ok(nearBottom >= 0 && nearBottom <= PANE, 'ghost escaped the bottom of the pane');
});

test('gives up rather than stacking a ghost on top of the entry line', () => {
  // An entry pinned to the very top leaves no room above it for a long's TP:
  // the clamp would drop the ghost within a few pixels of the entry, where it
  // is neither grabbable nor tellable apart from it.
  assert.equal(ghostLineY(10, 'tp', 'long', PANE), null);
  assert.equal(ghostLineY(PANE - 10, 'sl', 'long', PANE), null);
});

test('the pane-edge clamp never returns a ghost closer than the minimum gap', () => {
  for (let entryY = 0; entryY <= PANE; entryY += 5) {
    for (const kind of ['sl', 'tp']) {
      for (const side of ['long', 'short']) {
        const y = ghostLineY(entryY, kind, side, PANE);
        if (y === null) continue;
        assert.ok(
          Math.abs(y - entryY) >= GHOST_LINE_MIN_GAP_PX,
          `ghost at entryY=${entryY} ${side} ${kind} landed ${Math.abs(y - entryY)}px from the entry`
        );
      }
    }
  }
});

test('returns null for input it cannot place', () => {
  assert.equal(ghostLineY(null, 'sl', 'long', PANE), null);
  assert.equal(ghostLineY(300, 'entry', 'long', PANE), null);
  assert.equal(ghostLineY(300, 'sl', 'long', 0), null);
});

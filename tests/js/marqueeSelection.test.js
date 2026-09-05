import test from 'node:test';
import assert from 'node:assert/strict';

import {
  drawingIntersectsRect,
  getDrawingScreenBounds,
  MARQUEE_MARKER_PADDING_PX,
  normalizeMarqueeRect,
  pointInRect,
  rectsIntersect,
  segmentIntersectsRect,
} from '../../resources/js/Components/Market/MarketChart/utils.js';

// A 100x100 box sitting in the middle of an imaginary pane.
const BOX = { left: 100, top: 100, right: 200, bottom: 200 };

// --- normalizeMarqueeRect -------------------------------------------------

test('normalizes a drag regardless of direction', () => {
  const downRight = normalizeMarqueeRect({ x: 10, y: 20 }, { x: 60, y: 80 });
  const upLeft = normalizeMarqueeRect({ x: 60, y: 80 }, { x: 10, y: 20 });

  assert.deepEqual(downRight, { left: 10, top: 20, right: 60, bottom: 80 });
  assert.deepEqual(upLeft, downRight);
});

test('returns null without both corners', () => {
  assert.equal(normalizeMarqueeRect(null, { x: 1, y: 1 }), null);
  assert.equal(normalizeMarqueeRect({ x: 1, y: 1 }, null), null);
});

// --- primitives -----------------------------------------------------------

test('pointInRect includes the boundary', () => {
  assert.ok(pointInRect({ x: 150, y: 150 }, BOX));
  assert.ok(pointInRect({ x: 100, y: 100 }, BOX));
  assert.ok(pointInRect({ x: 200, y: 200 }, BOX));
  assert.ok(!pointInRect({ x: 99, y: 150 }, BOX));
});

test('rectsIntersect covers overlap, touching, containment and separation', () => {
  assert.ok(rectsIntersect(BOX, { left: 150, top: 150, right: 300, bottom: 300 }));
  assert.ok(rectsIntersect(BOX, { left: 200, top: 200, right: 300, bottom: 300 }), 'touching corner counts');
  assert.ok(rectsIntersect(BOX, { left: 0, top: 0, right: 400, bottom: 400 }), 'box fully inside marquee');
  assert.ok(!rectsIntersect(BOX, { left: 201, top: 100, right: 300, bottom: 200 }));
});

// --- segmentIntersectsRect ------------------------------------------------
// The reason the marquee tests real geometry: a long shallow diagonal's
// bounding box covers a lot of chart the line itself never passes through.

test('a segment crossing clean through is selected', () => {
  assert.ok(segmentIntersectsRect({ x: 0, y: 150 }, { x: 400, y: 150 }, BOX));
});

test('a segment with one endpoint inside is selected', () => {
  assert.ok(segmentIntersectsRect({ x: 150, y: 150 }, { x: 400, y: 400 }, BOX));
});

test('a segment entirely inside is selected', () => {
  assert.ok(segmentIntersectsRect({ x: 120, y: 120 }, { x: 180, y: 180 }, BOX));
});

test('a shallow diagonal whose bounding box overlaps but whose line misses is NOT selected', () => {
  // Runs from well left/above to well right/below, passing under the box.
  const missed = segmentIntersectsRect({ x: 0, y: 260 }, { x: 400, y: 280 }, BOX);
  assert.ok(!missed, 'bounding-box-only matching would wrongly select this');
});

test('a segment fully outside is not selected', () => {
  assert.ok(!segmentIntersectsRect({ x: 0, y: 0 }, { x: 50, y: 50 }, BOX));
});

// --- getDrawingScreenBounds -----------------------------------------------

test('bounds prefer a ray-style visible extension over the raw anchors', () => {
  const extendedLine = {
    screen: {
      p1: { x: 150, y: 150 },
      p2: { x: 160, y: 160 },
      rayStart: { x: 0, y: 0 },
      rayEnd: { x: 800, y: 800 },
    },
  };

  assert.deepEqual(getDrawingScreenBounds(extendedLine), { left: 0, right: 800, top: 0, bottom: 800 });
});

test('bounds fall back to null for an unprojected drawing', () => {
  assert.equal(getDrawingScreenBounds(null), null);
  assert.equal(getDrawingScreenBounds({}), null);
  assert.equal(getDrawingScreenBounds({ screen: {} }), null);
});

// --- drawingIntersectsRect, per screen shape ------------------------------

test('line-like: selected only when the line itself crosses the box', () => {
  const through = { type: 'line', screen: { p1: { x: 0, y: 150 }, p2: { x: 400, y: 150 } } };
  // Bounding box (0,100)-(400,500) fully contains BOX, but the line passes
  // below and to the right of it the whole way — this is the case a
  // bounding-box-only marquee would get wrong, and deleting is destructive.
  const skimmingPast = { type: 'line', screen: { p1: { x: 0, y: 500 }, p2: { x: 400, y: 100 } } };

  assert.ok(rectsIntersect(getDrawingScreenBounds(skimmingPast), BOX), 'fixture must overlap by bounding box');
  assert.ok(drawingIntersectsRect(through, BOX));
  assert.ok(!drawingIntersectsRect(skimmingPast, BOX));
});

test('line-like: a three-point tool is caught by any of its legs', () => {
  const fibExtension = {
    type: 'fib-extension',
    screen: {
      p1: { x: 0, y: 0 },
      p2: { x: 150, y: 0 },
      p3: { x: 150, y: 400 },
    },
  };

  // p1-p2 runs along y=0 and misses; the vertical p2-p3 leg is what crosses.
  assert.ok(!segmentIntersectsRect(fibExtension.screen.p1, fibExtension.screen.p2, BOX));
  assert.ok(drawingIntersectsRect(fibExtension, BOX));
});

test('line-like: an extended line counts across the whole pane', () => {
  const extendedLine = {
    type: 'extended-line',
    screen: {
      p1: { x: 300, y: 150 },
      p2: { x: 320, y: 150 },
      rayStart: { x: 0, y: 150 },
      rayEnd: { x: 800, y: 150 },
    },
  };

  assert.ok(drawingIntersectsRect(extendedLine, BOX), 'the visible extension is what the user boxes around');
});

test('box tools: region overlap, not just an edge crossing', () => {
  const rect = { type: 'rect', screen: { p1: { x: 120, y: 120 }, p2: { x: 180, y: 180 } } };
  const away = { type: 'rect', screen: { p1: { x: 300, y: 300 }, p2: { x: 380, y: 380 } } };

  assert.ok(drawingIntersectsRect(rect, BOX), 'a box wholly inside the marquee is selected');
  assert.ok(!drawingIntersectsRect(away, BOX));
});

test('position tools: the whole zone region counts', () => {
  const long = {
    type: 'long-position',
    screen: {
      p1: { x: 150, y: 150 },
      p2: { x: 260, y: 60 },
      pStop: { x: 260, y: 240 },
    },
  };

  assert.ok(drawingIntersectsRect(long, BOX));
});

test('markers: a padded anchor point, not the generous click target', () => {
  const marker = { type: 'note', screen: { p: { x: 210, y: 150 } } };
  const farMarker = { type: 'note', screen: { p: { x: 260, y: 150 } } };

  // 210 is within MARQUEE_MARKER_PADDING_PX of the box's right edge (200).
  assert.ok(MARQUEE_MARKER_PADDING_PX >= 10);
  assert.ok(drawingIntersectsRect(marker, BOX));
  assert.ok(!drawingIntersectsRect(farMarker, BOX), 'hitTestDrawing tolerates 80px here; the marquee must not');
});

test('paths: caught by a vertex inside or a segment crossing', () => {
  const vertexInside = { type: 'path', screen: { points: [{ x: 0, y: 0 }, { x: 150, y: 150 }, { x: 0, y: 300 }] } };
  const segmentCrossing = { type: 'path', screen: { points: [{ x: 0, y: 150 }, { x: 400, y: 150 }] } };
  const clear = { type: 'path', screen: { points: [{ x: 0, y: 300 }, { x: 400, y: 320 }] } };

  assert.ok(drawingIntersectsRect(vertexInside, BOX));
  assert.ok(drawingIntersectsRect(segmentCrossing, BOX));
  assert.ok(!drawingIntersectsRect(clear, BOX));
});

test('paths: a single-vertex path still resolves', () => {
  const singlePoint = { type: 'path', screen: { points: [{ x: 150, y: 150 }] } };
  const singlePointOutside = { type: 'path', screen: { points: [{ x: 10, y: 10 }] } };

  assert.ok(drawingIntersectsRect(singlePoint, BOX));
  assert.ok(!drawingIntersectsRect(singlePointOutside, BOX));
});

test('an unprojected drawing or a missing rect never matches', () => {
  assert.ok(!drawingIntersectsRect({ type: 'rect' }, BOX));
  assert.ok(!drawingIntersectsRect({ type: 'rect', screen: { p1: { x: 0, y: 0 }, p2: { x: 9, y: 9 } } }, null));
});

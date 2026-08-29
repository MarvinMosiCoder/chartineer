import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSessionSegments,
  resolveSession,
  sessionsActiveAt,
} from '../../resources/js/Components/Market/MarketChart/marketSessions.js';
import {
  estimateDrawingLogicalFromTime,
  estimateLogicalFromTime,
} from '../../resources/js/Components/Market/MarketChart/utils.js';

// The same instants the PHP MarketSessionServiceTest pins, so a change to one
// set of definitions fails on both sides rather than silently diverging.
const WINTER_MIDNIGHT = 1705276800; // 2024-01-15 00:00:00 UTC (GMT / EST)
const SUMMER_MIDNIGHT = 1721001600; // 2024-07-15 00:00:00 UTC (BST / EDT)

const winterAt = (hour, minute = 0) => WINTER_MIDNIGHT + (hour * 3600) + (minute * 60);
const summerAt = (hour, minute = 0) => SUMMER_MIDNIGHT + (hour * 3600) + (minute * 60);

test('labels winter sessions in utc', () => {
  assert.equal(resolveSession(winterAt(2)).label, 'Asian');
  assert.equal(resolveSession(winterAt(10)).label, 'London');
  assert.equal(resolveSession(winterAt(14)).label, 'London / New York');
  assert.equal(resolveSession(winterAt(18)).label, 'New York');
  assert.equal(resolveSession(winterAt(23)).label, 'Off-session');
});

test('labels summer sessions in utc', () => {
  assert.equal(resolveSession(summerAt(7, 30)).label, 'London');
  assert.equal(resolveSession(summerAt(12, 30)).label, 'London / New York');
  assert.equal(resolveSession(summerAt(16, 30)).label, 'New York');
  assert.equal(resolveSession(summerAt(21, 30)).label, 'Off-session');
});

test('boundaries follow daylight saving', () => {
  assert.equal(resolveSession(winterAt(7, 30)).label, 'Asian');
  assert.equal(resolveSession(summerAt(7, 30)).label, 'London');

  assert.equal(resolveSession(winterAt(12, 30)).label, 'London');
  assert.equal(resolveSession(summerAt(12, 30)).label, 'London / New York');
});

test('reports every open session, not just the label', () => {
  assert.deepEqual(sessionsActiveAt(summerAt(8)), ['asian', 'london']);
  assert.deepEqual(sessionsActiveAt(winterAt(14)), ['london', 'newYork']);
  assert.deepEqual(sessionsActiveAt(winterAt(23)), []);
});

test('builds one segment per session per day, clipped to the range', () => {
  const segments = buildSessionSegments(WINTER_MIDNIGHT, WINTER_MIDNIGHT + 86400, ['london']);

  assert.equal(segments.length, 1);
  assert.equal(segments[0].start, winterAt(8));
  assert.equal(segments[0].end, winterAt(17));
});

test('shifts segment boundaries across a daylight saving change', () => {
  const [winter] = buildSessionSegments(WINTER_MIDNIGHT, WINTER_MIDNIGHT + 86400, ['london']);
  const [summer] = buildSessionSegments(SUMMER_MIDNIGHT, SUMMER_MIDNIGHT + 86400, ['london']);

  assert.equal(winter.start - WINTER_MIDNIGHT, 8 * 3600);
  assert.equal(summer.start - SUMMER_MIDNIGHT, 7 * 3600);
});

test('clips a window that is already open when the range starts', () => {
  // Range opens mid-London. The segment must start at the range edge, not be
  // dropped for having opened before it.
  const from = winterAt(10);
  const [segment] = buildSessionSegments(from, winterAt(12), ['london']);

  assert.equal(segment.start, from);
  assert.equal(segment.end, winterAt(12));
});

test('emits a segment per day across a multi-day range', () => {
  const segments = buildSessionSegments(WINTER_MIDNIGHT, WINTER_MIDNIGHT + (3 * 86400), ['london']);

  assert.equal(segments.length, 3);
  assert.deepEqual(
    segments.map((segment) => segment.start - WINTER_MIDNIGHT),
    [8 * 3600, (24 + 8) * 3600, (48 + 8) * 3600]
  );
});

test('keeps tokyo segments aligned to the local day, not the utc day', () => {
  // Tokyo is UTC+9 year round, so 09:00-18:00 JST is 00:00-09:00 UTC and the
  // window happens to sit inside one UTC day. Pin it so a naive UTC-day walk
  // that splits or duplicates the window is caught.
  const segments = buildSessionSegments(WINTER_MIDNIGHT, WINTER_MIDNIGHT + 86400, ['asian']);

  assert.equal(segments.length, 1);
  assert.equal(segments[0].start, WINTER_MIDNIGHT);
  assert.equal(segments[0].end, winterAt(9));
});

test('returns nothing for an empty or inverted range', () => {
  assert.deepEqual(buildSessionSegments(winterAt(10), winterAt(10)), []);
  assert.deepEqual(buildSessionSegments(winterAt(12), winterAt(10)), []);
});

// `timeToX` (MarketChart.jsx) must project session boundaries with
// estimateLogicalFromTime, NOT estimateDrawingLogicalFromTime. The latter snaps
// a time to its containing candle at 15m and above -- correct for a saved
// drawing anchor, badly wrong for a session edge, which is a continuous instant
// with no relationship to bar starts. This was a real shipped bug: on a 4h chart
// the 07:00 London open rendered against the 04:00 bar, three hours adrift.
test('session boundaries interpolate inside a bar instead of snapping to it', () => {
  const FOUR_HOURS = 4 * 3600;
  const candles = [0, 1, 2, 3, 4, 5].map((index) => ({
    time: WINTER_MIDNIGHT + (index * FOUR_HOURS),
  }));

  // 07:00 UTC — London's summer open, and a boundary that falls three quarters
  // of the way through the 04:00 bar rather than on any bar start.
  const londonOpen = winterAt(7);

  assert.equal(estimateDrawingLogicalFromTime(candles, londonOpen, FOUR_HOURS), 1);
  assert.equal(estimateLogicalFromTime(candles, londonOpen), 1.75);
});

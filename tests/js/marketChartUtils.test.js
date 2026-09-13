import test from 'node:test';
import assert from 'node:assert/strict';

import {
  estimateCandleInterval,
  estimateDrawingLogicalFromTime,
  estimateLogicalFromTime,
  estimateTradeMarkerLogicalFromTime,
} from '../../resources/js/Components/Market/MarketChart/utils.js';

const FIFTEEN_MINUTES = 15 * 60;
const baseTime = 1_700_000_000;
const candles = [0, 1, 2].map((index) => ({
  time: baseTime + (index * FIFTEEN_MINUTES),
}));

test('projects a 15m drawing anchor beyond the newest candle', () => {
  const halfBarIntoFuture = candles[2].time + (FIFTEEN_MINUTES / 2);

  assert.equal(
    estimateDrawingLogicalFromTime(candles, halfBarIntoFuture, FIFTEEN_MINUTES),
    2.5
  );
});

test('preserves the distance of a multi-bar future projection', () => {
  const twoBarsIntoFuture = candles[2].time + (2 * FIFTEEN_MINUTES);

  assert.equal(
    estimateDrawingLogicalFromTime(candles, twoBarsIntoFuture, FIFTEEN_MINUTES),
    4
  );
});

test('keeps a projected bar position stable as live candles fill the gap', () => {
  const projectedTime = candles[2].time + (2 * FIFTEEN_MINUTES);
  const withOneIncomingCandle = [
    ...candles,
    { time: candles[2].time + FIFTEEN_MINUTES },
  ];
  const withProjectionCandle = [
    ...withOneIncomingCandle,
    { time: projectedTime },
  ];

  assert.equal(
    estimateDrawingLogicalFromTime(withOneIncomingCandle, projectedTime, FIFTEEN_MINUTES),
    4
  );
  assert.equal(
    estimateDrawingLogicalFromTime(withProjectionCandle, projectedTime, FIFTEEN_MINUTES),
    4
  );
});

test('still snaps a historical coarse-timeframe anchor to its containing candle', () => {
  const insideFirstCandle = candles[0].time + (5 * 60);

  assert.equal(
    estimateDrawingLogicalFromTime(candles, insideFirstCandle, FIFTEEN_MINUTES),
    0
  );
});

test('keeps normal future interpolation on timeframes below 15m', () => {
  const fiveMinutes = 5 * 60;
  const fiveMinuteCandles = [0, 1, 2].map((index) => ({
    time: baseTime + (index * fiveMinutes),
  }));
  const halfBarIntoFuture = fiveMinuteCandles[2].time + (fiveMinutes / 2);

  assert.equal(
    estimateDrawingLogicalFromTime(fiveMinuteCandles, halfBarIntoFuture, fiveMinutes),
    2.5
  );
});

// The lookups below back onto a binary search rather than the linear scans they
// used to use (findIndex / a for-loop), because toScreen() reaches them once per
// drawing point per pan frame. These cover the boundaries a bisection is easy to
// get subtly wrong: exact candle times, the ends of the array, and gapped
// history where a uniform interval cannot be assumed.

test('snaps every exact candle time to its own index', () => {
  const longHistory = Array.from({ length: 500 }, (unused, index) => ({
    time: baseTime + (index * FIFTEEN_MINUTES),
  }));

  [0, 1, 2, 249, 250, 498, 499].forEach((index) => {
    assert.equal(
      estimateDrawingLogicalFromTime(longHistory, longHistory[index].time, FIFTEEN_MINUTES),
      index,
      `exact candle time at index ${index}`
    );
  });
});

test('snaps a coarse anchor inside any candle to that candle, not a neighbour', () => {
  const longHistory = Array.from({ length: 500 }, (unused, index) => ({
    time: baseTime + (index * FIFTEEN_MINUTES),
  }));

  [0, 137, 498].forEach((index) => {
    const insideCandle = longHistory[index].time + (FIFTEEN_MINUTES - 1);

    assert.equal(
      estimateDrawingLogicalFromTime(longHistory, insideCandle, FIFTEEN_MINUTES),
      index,
      `anchor inside candle ${index}`
    );
  });

  // Inside the *final* candle is deliberately not a snap: the containing-candle
  // branch only applies at or before the newest candle's own time, so anything
  // past it stays a future projection (see the first test in this file).
  const insideLastCandle = longHistory[499].time + (FIFTEEN_MINUTES - 1);

  assert.ok(
    estimateDrawingLogicalFromTime(longHistory, insideLastCandle, FIFTEEN_MINUTES) > 499
  );
});

test('interpolates across an irregular gap without assuming a fixed interval', () => {
  const gappy = [
    { time: 100 },
    { time: 160 },
    { time: 220 },
    // a missing stretch, as an exchange outage leaves behind
    { time: 900 },
    { time: 960 },
  ];

  assert.equal(estimateLogicalFromTime(gappy, 220), 2);
  assert.equal(estimateLogicalFromTime(gappy, 900), 3);
  // 560 sits exactly halfway between the candles bracketing the gap
  assert.equal(estimateLogicalFromTime(gappy, 560), 2.5);
});

test('handles times before the first candle and past the last', () => {
  assert.equal(
    estimateLogicalFromTime(candles, candles[0].time - FIFTEEN_MINUTES),
    -1
  );
  assert.equal(
    estimateLogicalFromTime(candles, candles[2].time + FIFTEEN_MINUTES),
    3
  );
  // Below the first candle there is no containing bar to snap to, so a coarse
  // anchor falls through to interpolation rather than clamping to index 0.
  assert.equal(
    estimateDrawingLogicalFromTime(candles, candles[0].time - FIFTEEN_MINUTES, FIFTEEN_MINUTES),
    -1
  );
});

test('reports the median interval, and stays correct when called repeatedly', () => {
  // Intervals are [60, 60, 680] — the median ignores the outlying gap, which is
  // the point of using a median rather than an average here.
  const gappy = [{ time: 100 }, { time: 160 }, { time: 220 }, { time: 900 }];

  // The result is memoized per array identity; repeat calls must not drift.
  assert.equal(estimateCandleInterval(gappy), 60);
  assert.equal(estimateCandleInterval(gappy), 60);

  assert.equal(estimateCandleInterval(candles), FIFTEEN_MINUTES);
  assert.equal(estimateCandleInterval([]), 60);
  assert.equal(estimateCandleInterval([{ time: 100 }]), 60);
});

// A trade marker is not a drawing anchor: it belongs to the one candle that
// contains the fill, on every timeframe. estimateDrawingLogicalFromTime only
// snaps at 15m and above, which used to make the badge's alignment depend on
// the timeframe being viewed rather than on the trade.
const series = (intervalSeconds, count = 600) =>
  Array.from({ length: count }, (_, index) => ({ time: baseTime + (index * intervalSeconds) }));

test('snaps a trade marker to its containing candle on every timeframe', () => {
  // A fill recorded on the 5m chart, 100 bars in. 5m and 3m are the worst pair:
  // coprime intervals, so the fill time lands on no shared bar boundary.
  const fillTime = baseTime + (100 * 300);

  for (const intervalSeconds of [60, 180, 300, 900, 1800, 3600, 14_400, 86_400]) {
    const logical = estimateTradeMarkerLogicalFromTime(series(intervalSeconds), fillTime);

    assert.equal(logical, Math.trunc(logical), `${intervalSeconds}s landed off-bar at ${logical}`);
    assert.equal(logical, Math.floor((fillTime - baseTime) / intervalSeconds));
  }

  // The regression this replaces: the drawing helper's >= 900 gate leaves 3m
  // interpolating, two thirds of a bar right of the candle the fill is in.
  assert.equal(estimateDrawingLogicalFromTime(series(180), fillTime, 180), 500 / 3);
});

test('snaps a fill that lands mid-candle to that candle, not between bars', () => {
  const candles5m = series(300);
  const midCandle = candles5m[100].time + 137;

  assert.equal(estimateTradeMarkerLogicalFromTime(candles5m, midCandle), 100);
});

test('extrapolates a trade marker that falls outside the loaded candles', () => {
  // Older than the loaded history, or past the newest candle: stay off-screen
  // and scroll in, rather than pinning to the first or last bar.
  assert.equal(estimateTradeMarkerLogicalFromTime(candles, candles[0].time - FIFTEEN_MINUTES), -1);
  assert.equal(estimateTradeMarkerLogicalFromTime(candles, candles[2].time + FIFTEEN_MINUTES), 3);
});

test('rejects a trade marker with no usable execution time', () => {
  assert.equal(estimateTradeMarkerLogicalFromTime(candles, Number(undefined)), null);
  assert.equal(estimateTradeMarkerLogicalFromTime([], candles[0].time), null);
  // Number(null) is 0, which IS finite — every live-mode fill stores
  // executed_at_time = null, so MarketChart.jsx filters those out before
  // calling this rather than letting them resolve millions of bars in the past.
  assert.ok(estimateTradeMarkerLogicalFromTime(candles, Number(null)) < -1_000_000);
});

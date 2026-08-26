import test from 'node:test';
import assert from 'node:assert/strict';

import { estimateDrawingLogicalFromTime } from '../../resources/js/Components/Market/MarketChart/utils.js';

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

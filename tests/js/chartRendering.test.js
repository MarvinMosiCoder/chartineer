import test from 'node:test';
import assert from 'node:assert/strict';
import { createIndicatorRenderer } from '../../resources/js/Components/Market/MarketChart/indicatorRenderer.js';
import { recentChartRange } from '../../resources/js/Components/Market/MarketChart/chartViewport.js';

function candles(count) {
  return Array.from({ length: count }, (_, i) => ({ time: 1700000000 + i * 60, close: 100 + Math.sin(i / 7) * 5 + i / 100 }));
}

function series() {
  return {
    data: [], resets: 0, updates: 0,
    setData(data) { this.data = [...data]; this.resets += 1; },
    update(point) {
      const last = this.data.at(-1);
      assert(!last || point.time >= last.time, 'No update may edit an older bar');
      if (last?.time === point.time) this.data[this.data.length - 1] = point;
      else this.data.push(point);
      this.updates += 1;
    },
  };
}

function configuration() {
  return [
    { id: 'sma', type: 'sma', period: 20, series: { main: series() } },
    { id: 'ema', type: 'ema', period: 20, series: { main: series() } },
    { id: 'rsi', type: 'rsi', period: 14, series: { main: series() } },
    { id: 'macd', type: 'macd', fast: 12, slow: 26, signal: 9, upColor: 'green', downColor: 'red', series: { macd: series(), signal: series(), histogram: series() } },
  ];
}

// Independent, full-history reference using the pre-existing chart formulas.
function reference(data, config) {
  const ema = (values, period) => {
    let value = values[0];
    const weight = 2 / (period + 1);
    return values.map((next) => { value = next * weight + value * (1 - weight); return value; });
  };
  const closes = data.map((bar) => bar.close);
  const points = (values, skip = 0) => values.map((value, i) => ({ time: data[i + skip].time, value }));
  if (config.type === 'ema') return { main: points(ema(closes, config.period)) };
  if (config.type === 'sma') {
    return { main: points(closes.slice(config.period - 1).map((_, i) => closes.slice(i, i + config.period).reduce((a, b) => a + b, 0) / config.period), config.period - 1) };
  }
  if (config.type === 'rsi') {
    let gains = 0; let losses = 0;
    const values = [];
    for (let i = 1; i < closes.length; i += 1) {
      const change = closes[i] - closes[i - 1];
      if (i <= config.period) { gains += Math.max(change, 0); losses += Math.max(-change, 0); }
      else { gains = (gains * (config.period - 1) + Math.max(change, 0)) / config.period; losses = (losses * (config.period - 1) + Math.max(-change, 0)) / config.period; }
      if (i >= config.period) values.push(100 - 100 / (1 + (losses === 0 ? 100 : gains / losses)));
    }
    return { main: points(values, config.period) };
  }
  const fast = ema(closes, config.fast);
  const slow = ema(closes, config.slow);
  const macd = fast.map((value, i) => value - slow[i]);
  const signal = ema(macd, config.signal);
  return { macd: points(macd), signal: points(signal), histogram: points(macd.map((value, i) => value - signal[i])).map((point) => ({ ...point, color: point.value >= 0 ? config.upColor : config.downColor })) };
}

function matchesReference(data, configs) {
  for (const config of configs) {
    for (const [channel, expected] of Object.entries(reference(data, config))) {
      const actual = config.series[channel].data;
      assert.equal(actual.length, expected.length, `${config.id}/${channel} length`);
      expected.forEach((point, index) => {
        assert.equal(actual[index].time, point.time);
        assert(Math.abs(actual[index].value - point.value) < 1e-8, `${config.id}/${channel} at ${index}`);
        assert.equal(actual[index].color, point.color);
      });
    }
  }
}

test('20,000-bar live updates calculate one bar per indicator and never rebuild series', () => {
  const renderer = createIndicatorRenderer();
  const configs = configuration();
  let data = candles(20000);
  renderer.sync(data, configs);
  matchesReference(data, configs);
  for (let tick = 0; tick < 20; tick += 1) {
    data = [...data.slice(0, -1), { ...data.at(-1), close: 300 + tick / 7 }];
    assert.equal(renderer.sync(data, configs).calculatedBars, 4);
  }
  matchesReference(data, configs);
  for (const config of configs) for (const target of Object.values(config.series)) assert.equal(target.resets, 1);
  assert.equal(renderer.sync(data, configs).calculatedBars, 0);
});

test('coalesced updates across multiple candle boundaries preserve indicator values', () => {
  const renderer = createIndicatorRenderer();
  const configs = configuration();
  const history = candles(110);
  renderer.sync(history.slice(0, 100), configs);
  const data = [...history.slice(0, 99), { ...history[99], close: 125 }, ...history.slice(100)];
  assert.equal(renderer.sync(data, configs).calculatedBars, 44);
  matchesReference(data, configs);
});

test('cold history uses one bulk load, including when a latest-price poll arrives first', () => {
  const renderer = createIndicatorRenderer();
  const configs = configuration();
  const data = candles(100);
  renderer.sync([], configs);
  renderer.sync(data.slice(-1), configs);
  renderer.sync(data, configs);
  matchesReference(data, configs);
  for (const config of configs) for (const target of Object.values(config.series)) {
    assert.equal(target.resets, 3);
    assert.equal(target.updates, 0);
  }
});

test('replay rewind removes future points and forward playback resumes incrementally', () => {
  const renderer = createIndicatorRenderer();
  const configs = configuration();
  const data = candles(100);
  renderer.sync(data, configs);
  renderer.sync(data.slice(0, 45), configs);
  matchesReference(data.slice(0, 45), configs);
  assert.equal(renderer.sync(data.slice(0, 46), configs).calculatedBars, 4);
  matchesReference(data.slice(0, 46), configs);
  renderer.sync([], configs);
  for (const config of configs) for (const target of Object.values(config.series)) assert.equal(target.data.length, 0);
});

test('backfills and changed historical candles invalidate the affected suffix', () => {
  const renderer = createIndicatorRenderer();
  const configs = configuration();
  const original = candles(100);
  renderer.sync(original, configs);
  const corrected = [...original];
  corrected[5] = { ...corrected[5], close: 150 };
  renderer.sync(corrected, configs);
  matchesReference(corrected, configs);
  const backfilled = [{ time: original[0].time - 60, close: 80 }, ...corrected];
  renderer.sync(backfilled, configs);
  matchesReference(backfilled, configs);
});

test('warmup, period changes, disabling and re-enabling produce complete data', () => {
  const renderer = createIndicatorRenderer();
  const configs = configuration();
  const data = candles(60);
  renderer.sync(data.slice(0, 4), configs);
  assert.equal(configs[0].series.main.data.length, 0);
  assert.equal(configs[2].series.main.data.length, 0);
  renderer.sync(data, configs);
  configs[0].period = 5;
  renderer.sync(data, configs);
  matchesReference(data, configs);
  configs[1].enabled = false;
  renderer.sync(data, configs);
  assert.equal(configs[1].series.main.data.length, 0);
  const resets = configs[1].series.main.resets;
  renderer.sync(data, configs);
  assert.equal(configs[1].series.main.resets, resets);
  configs[1].enabled = true;
  renderer.sync(data, configs);
  matchesReference(data, configs);
});

test('removed EMA series are not called after disposal and replacements are populated', () => {
  const renderer = createIndicatorRenderer();
  const configs = configuration();
  const data = candles(100);
  renderer.sync(data, configs);
  const old = configs[1].series.main;
  old.setData = () => { throw new Error('Disposed series'); };
  renderer.sync(data, configs.filter((config) => config.id !== 'ema'));
  configs[1].series.main = series();
  renderer.sync(data, configs);
  matchesReference(data, configs);
});

test('initial viewport uses readable density independently of loaded history size', () => {
  for (const count of [200, 5000, 20000]) {
    const range = recentChartRange(count, 960, 8);
    assert.equal(range.to - range.from, 120);
    assert(range.from < count - 1 && range.to > count - 1);
  }
  assert.equal(recentChartRange(20000, 320, 8).to - recentChartRange(20000, 320, 8).from, 40);
  assert.equal(recentChartRange(20000, 960, 24).to - recentChartRange(20000, 960, 24).from, 40);
  assert.equal(recentChartRange(0, 960), null);
  assert(recentChartRange(1, 0).from < 0);
});

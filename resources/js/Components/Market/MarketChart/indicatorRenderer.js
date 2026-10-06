// Candle arrays are immutable. Find their shared prefix once, then recompute only
// the changed suffix. Each checkpoint is the state *after* that candle, so editing
// the forming candle always starts from the previous closed candle (no EMA drift).
function calculate(config, previous, candles, index) {
  const close = Number(candles[index].close);
  const period = config.period;
  if (config.type === 'sma') {
    const sum = (previous?.sum ?? 0) + close - (index >= period ? Number(candles[index - period].close) : 0);
    return { sum, values: { main: index + 1 >= period ? sum / period : null } };
  }
  if (config.type === 'ema') {
    const weight = 2 / (period + 1);
    const value = close * weight + (previous?.values.main ?? close) * (1 - weight);
    return { values: { main: value } };
  }
  if (config.type === 'rsi') {
    if (!index) return { gains: 0, losses: 0, values: { main: null } };
    const delta = close - Number(candles[index - 1].close);
    const gain = Math.max(delta, 0);
    const loss = Math.max(-delta, 0);
    // Preserve the existing indicator calculation while changing its render path.
    const gains = index <= period ? previous.gains + gain : (previous.gains * (period - 1) + gain) / period;
    const losses = index <= period ? previous.losses + loss : (previous.losses * (period - 1) + loss) / period;
    const strength = losses === 0 ? 100 : gains / losses;
    return { gains, losses, values: { main: index >= period ? 100 - 100 / (1 + strength) : null } };
  }
  const fastWeight = 2 / (config.fast + 1);
  const slowWeight = 2 / (config.slow + 1);
  const signalWeight = 2 / (config.signal + 1);
  const fast = previous ? close * fastWeight + previous.fast * (1 - fastWeight) : close;
  const slow = previous ? close * slowWeight + previous.slow * (1 - slowWeight) : close;
  const macd = fast - slow;
  const signal = previous ? macd * signalWeight + previous.values.signal * (1 - signalWeight) : macd;
  return { fast, slow, values: { macd, signal, histogram: macd - signal } };
}

export function createIndicatorRenderer() {
  let previousCandles = [];
  const entries = new Map();

  return {
    sync(candles, configurations) {
      let shared = 0;
      const limit = Math.min(previousCandles.length, candles.length);
      while (shared < limit && previousCandles[shared] === candles[shared]) shared += 1;
      const activeIds = new Set(configurations.map((config) => config.id));
      for (const id of entries.keys()) {
        if (activeIds.has(id)) continue;
        // Removed EMA lines have already been disposed by the chart owner.
        entries.delete(id);
      }

      let calculatedBars = 0;
      for (const config of configurations) {
        const { id, series, ...parameters } = config;
        const key = JSON.stringify(parameters);
        let entry = entries.get(id);
        const replaced = !entry || entry.key !== key || Object.keys(series).some((channel) => entry.series[channel] !== series[channel]);
        if (replaced) {
          entry = { key, series, states: [], points: Object.fromEntries(Object.keys(series).map((channel) => [channel, []])) };
          entries.set(id, entry);
        }
        if (config.enabled === false) {
          if (replaced) Object.values(series).forEach((target) => target?.setData([]));
          continue;
        }
        const start = replaced ? 0 : shared;
        // update() can patch the last point or append. A rewind/backfill needs
        // setData(), otherwise future indicator values would leak into Replay.
        const rebuild = replaced || previousCandles.length === 0
          || candles.length < previousCandles.length || start < previousCandles.length - 1
          || (start < previousCandles.length && candles[start]?.time !== previousCandles[start]?.time);
        entry.states.length = start;
        Object.values(entry.points).forEach((points) => { points.length = start; });
        for (let index = start; index < candles.length; index += 1) {
          const state = calculate(config, entry.states[index - 1], candles, index);
          entry.states.push(state);
          calculatedBars += 1;
          for (const channel of Object.keys(series)) {
            const value = state.values[channel];
            const point = value == null ? null : {
              time: candles[index].time,
              value,
              ...(channel === 'histogram' ? { color: value >= 0 ? config.upColor : config.downColor } : {}),
            };
            entry.points[channel].push(point);
            if (!rebuild && point) series[channel]?.update(point);
          }
        }
        if (rebuild) {
          for (const channel of Object.keys(series)) series[channel]?.setData(entry.points[channel].filter(Boolean));
        }
      }
      previousCandles = candles;
      return { calculatedBars };
    },
  };
}

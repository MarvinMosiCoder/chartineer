export function formatPrice(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '---';
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function normalizeApiCandles(rawCandles) {
  if (!Array.isArray(rawCandles)) return [];

  const normalized = rawCandles
    .map((c) => {
      const rawTime =
        c?.time ??
        c?.timestamp ??
        c?.openTime ??
        c?.open_time ??
        c?.t ??
        c?.[0];

      const open = c?.open ?? c?.o ?? c?.[1];
      const high = c?.high ?? c?.h ?? c?.[2];
      const low = c?.low ?? c?.l ?? c?.[3];
      const close = c?.close ?? c?.c ?? c?.[4];
      const volume = c?.volume ?? c?.v ?? c?.[5] ?? 0;

      let time = Number(rawTime);
      if (!Number.isFinite(time)) return null;

      if (time > 9999999999) {
        time = Math.floor(time / 1000);
      } else {
        time = Math.floor(time);
      }

      const candle = {
        time,
        open: Number(open),
        high: Number(high),
        low: Number(low),
        close: Number(close),
        volume: Number(volume),
      };

      if (
        !Number.isFinite(candle.time) ||
        !Number.isFinite(candle.open) ||
        !Number.isFinite(candle.high) ||
        !Number.isFinite(candle.low) ||
        !Number.isFinite(candle.close) ||
        !Number.isFinite(candle.volume)
      ) {
        return null;
      }

      return candle;
    })
    .filter(Boolean);

  // Lightweight Charts requires strictly ordered, unique timestamps. Keep the
  // newest payload for a timestamp so a live candle replaces its older value.
  return Array.from(
    normalized.reduce((candlesByTime, candle) => {
      candlesByTime.set(candle.time, candle);
      return candlesByTime;
    }, new Map()).values()
  ).sort((a, b) => a.time - b.time);
}

export function findNearestCandleIndex(candles, targetTime) {
  if (!candles.length || targetTime == null) return -1;

  const numericTargetTime =
    typeof targetTime === 'object' && targetTime !== null
      ? ('timestamp' in targetTime ? Number(targetTime.timestamp) : Number(targetTime.time))
      : Number(targetTime);

  if (!Number.isFinite(numericTargetTime)) return -1;

  let nearestIndex = 0;
  let nearestDelta = Number.POSITIVE_INFINITY;

  for (let i = 0; i < candles.length; i += 1) {
    const delta = Math.abs(candles[i].time - numericTargetTime);
    if (delta < nearestDelta) {
      nearestDelta = delta;
      nearestIndex = i;
    }
  }

  return nearestIndex;
}

export function normalizeRect(a, b) {
  return {
    left: Math.min(a.x, b.x),
    top: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  };
}

export function normalizeVisibleRect(a, b, minSize = 8) {
  const rect = normalizeRect(a, b);
  const width = Math.max(rect.width, minSize);
  const height = Math.max(rect.height, minSize);

  return {
    left: rect.left - Math.max((width - rect.width) / 2, 0),
    top: rect.top - Math.max((height - rect.height) / 2, 0),
    width,
    height,
  };
}

export function colorToRgba(color, alpha) {
  if (typeof color !== 'string') return `rgba(96, 165, 250, ${alpha})`;

  const hex = color.trim();
  if (/^#[0-9a-f]{3}$/i.test(hex)) {
    const r = parseInt(`${hex[1]}${hex[1]}`, 16);
    const g = parseInt(`${hex[2]}${hex[2]}`, 16);
    const b = parseInt(`${hex[3]}${hex[3]}`, 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  if (/^#[0-9a-f]{6}$/i.test(hex)) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  return color;
}

export function distanceToSegment(point, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;

  if (dx === 0 && dy === 0) {
    return Math.hypot(point.x - a.x, point.y - a.y);
  }

  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy)));
  const projX = a.x + t * dx;
  const projY = a.y + t * dy;

  return Math.hypot(point.x - projX, point.y - projY);
}

export function buildStorageKey(symbol, exchange = 'bybit', category = 'spot', userId = 'guest') {
  return `replay-drawings:${userId}:${exchange}:${category}:${symbol}`;
}

export function buildLegacyStorageKey(symbol, timeframe) {
  return `replay-drawings:${symbol}:${timeframe}`;
}

// The median interval is a pure function of the candle array, and the array
// identity is stable between fetches — so it only ever needs computing once per
// loaded history. It used to be recomputed on every call: allocating an
// n-element array and sorting it, measured at 0.89ms for a 20000-candle Replay
// history. Because toScreen() reaches this (via estimateLogicalFromTime) once
// per drawing point per frame, that cost was being paid dozens of times inside
// a single 16.7ms frame budget. A WeakMap keyed on the array keeps the exact
// same median semantics while making every call after the first ~free, and lets
// the entry be collected as soon as the candle array is replaced.
const candleIntervalCache = new WeakMap();

export function estimateCandleInterval(candles) {
  if (!Array.isArray(candles) || candles.length < 2) return 60;

  const cached = candleIntervalCache.get(candles);
  if (cached !== undefined) return cached;

  const intervals = [];
  for (let i = 1; i < candles.length; i += 1) {
    const interval = candles[i].time - candles[i - 1].time;
    if (Number.isFinite(interval) && interval > 0) {
      intervals.push(interval);
    }
  }

  if (!intervals.length) {
    candleIntervalCache.set(candles, 60);
    return 60;
  }

  intervals.sort((a, b) => a - b);
  const median = intervals[Math.floor(intervals.length / 2)];
  candleIntervalCache.set(candles, median);

  return median;
}

/**
 * Index of the last candle whose time is <= the target, or -1 if the target
 * predates the first candle.
 *
 * Candles are time-ordered and deduplicated at the API boundary (see
 * MarketDataController::klines()), so the scans this replaces were walking a
 * sorted array linearly. Both callers below sat in the per-frame pan/zoom path.
 */
function findCandleIndexAtOrBefore(candles, numericTime) {
  let low = 0;
  let high = candles.length - 1;
  let result = -1;

  while (low <= high) {
    const mid = (low + high) >> 1;

    if (candles[mid].time <= numericTime) {
      result = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return result;
}

export function estimateTimeFromLogical(candles, logical) {
  if (!Array.isArray(candles) || !candles.length || !Number.isFinite(logical)) return null;

  const lowerIndex = Math.floor(logical);
  const upperIndex = Math.ceil(logical);

  if (candles[lowerIndex] && candles[upperIndex]) {
    const progress = logical - lowerIndex;
    return candles[lowerIndex].time + ((candles[upperIndex].time - candles[lowerIndex].time) * progress);
  }

  const interval = estimateCandleInterval(candles);

  if (logical < 0) {
    return candles[0].time + (logical * interval);
  }

  return candles[candles.length - 1].time + ((logical - (candles.length - 1)) * interval);
}

export function estimateLogicalFromTime(candles, time) {
  const numericTime = Number(time);
  if (!Array.isArray(candles) || !candles.length || !Number.isFinite(numericTime)) return null;

  if (candles.length === 1) return 0;

  if (numericTime <= candles[0].time) {
    return (numericTime - candles[0].time) / estimateCandleInterval(candles);
  }

  const lastIndex = candles.length - 1;
  const index = findCandleIndexAtOrBefore(candles, numericTime);

  // At or past the newest candle: extrapolate into future whitespace on the
  // estimated interval, same as the loop's fall-through did.
  if (index >= lastIndex) {
    return lastIndex + ((numericTime - candles[lastIndex].time) / estimateCandleInterval(candles));
  }

  const span = candles[index + 1].time - candles[index].time;
  if (!Number.isFinite(span) || span <= 0) return index + 1;

  return index + ((numericTime - candles[index].time) / span);
}

export function estimateDrawingLogicalFromTime(candles, time, intervalSeconds = 60) {
  const numericTime = Number(time);
  if (!Array.isArray(candles) || !candles.length || !Number.isFinite(numericTime)) return null;

  // Saved drawing anchors from a lower timeframe may fall between candle
  // start times after switching to 15m or higher. Snap them to the candle
  // that contains the original timestamp so Lightweight Charts receives a
  // valid logical bar coordinate on the coarser series.
  const lastCandleTime = Number(candles[candles.length - 1]?.time);

  if (intervalSeconds >= 900 && numericTime <= lastCandleTime) {
    const containingIndex = findCandleIndexAtOrBefore(candles, numericTime);

    if (containingIndex >= 0) {
      return containingIndex;
    }
  }

  // A drawing placed after the newest live candle is a projection into future
  // whitespace, not part of the unbounded final candle. Extrapolate its logical
  // position so the anchor stays exactly where the user clicked.
  return estimateLogicalFromTime(candles, numericTime);
}

/**
 * Geometry for the "add this level" buttons that sit on a position's entry line
 * (`[LONG OPEN 7.056][TP][SL]`), replacing the free-floating SET SL / SET TP ghost
 * lines that used to hang 80px away with nothing tying them to the position.
 *
 * This lives here, shared, because the badge group is *drawn* by ChartStage's
 * BacktestOrderOverlay but *hit-tested* in MarketChart — two files that previously
 * agreed on the cancel hotspot only by both hardcoding the same magic numbers. A
 * button the renderer and the hit test disagree about is a button that looks
 * clickable and is not, so both call this.
 */
export const ORDER_LEVEL_BUTTON_WIDTH = 26;
export const ORDER_LEVEL_BUTTON_HEIGHT = 18;
export const ORDER_LEVEL_BUTTON_GAP = 4;
const ORDER_BADGE_PRICE_SCALE_GAP = 96;
const ORDER_BADGE_CANCEL_LANE = 34;

/** Right edge of the price/PnL badge group, after reserving the add-level lane. */
export function orderBadgeGroupRightEdge(overlayWidth, canCancel, addLevelCount = 0) {
  const base = Math.max(
    Number(overlayWidth) - ORDER_BADGE_PRICE_SCALE_GAP - (canCancel ? ORDER_BADGE_CANCEL_LANE : 8),
    8,
  );
  const lane = addLevelCount * (ORDER_LEVEL_BUTTON_WIDTH + ORDER_LEVEL_BUTTON_GAP);
  return Math.max(base - lane, 8);
}

export function orderLevelButtonRects(item, overlayWidth, overlayHeight) {
  const levels = Array.isArray(item?.addLevels) ? item.addLevels : [];
  if (!levels.length) return [];

  const right = orderBadgeGroupRightEdge(overlayWidth, item.canCancel, levels.length);
  // Clamped exactly like the price badge's own y, so a line near the top or bottom
  // of the pane keeps its buttons attached to the badge instead of drifting off it.
  const top = Math.min(
    Math.max(Number(item.y) - ORDER_LEVEL_BUTTON_HEIGHT / 2, 4),
    Math.max(Number(overlayHeight) - ORDER_LEVEL_BUTTON_HEIGHT - 2, 4),
  );

  return levels.map((kind, index) => ({
    kind,
    x: right + ORDER_LEVEL_BUTTON_GAP + index * (ORDER_LEVEL_BUTTON_WIDTH + ORDER_LEVEL_BUTTON_GAP),
    y: top,
    width: ORDER_LEVEL_BUTTON_WIDTH,
    height: ORDER_LEVEL_BUTTON_HEIGHT,
  }));
}

// `updatePositionRisk` rejects a level that merely equals the entry price
// (`$stopLoss >= $entryPrice`), so a clamp has to land strictly inside it.
// Relative rather than absolute because prices here span many orders of
// magnitude, from sub-cent tokens to five-figure indices.
export const RISK_CLAMP_EPSILON = 0.0001;

/**
 * Keeps a stop loss or take profit on the side of the entry price the server
 * will accept, so an invalid level is unreachable by drag rather than rejected
 * after the fact. Long stops and short targets sit below entry; long targets
 * and short stops sit above. Anything that is not an sl/tp passes through
 * untouched — an entry line is free to move anywhere.
 */
export function clampRiskPrice(kind, side, entryPrice, price) {
  const entry = Number(entryPrice);
  const value = Number(price);

  if (kind !== 'sl' && kind !== 'tp') return value;
  if (!Number.isFinite(entry) || entry <= 0 || !Number.isFinite(value)) return value;

  const mustBeBelow = side === 'short' ? kind === 'tp' : kind === 'sl';

  return mustBeBelow
    ? Math.min(value, entry * (1 - RISK_CLAMP_EPSILON))
    : Math.max(value, entry * (1 + RISK_CLAMP_EPSILON));
}

function offsetPoint(point, deltaTime, deltaPrice, deltaLogical) {
  const nextPoint = {
    ...point,
    time: point.time + deltaTime,
    price: point.price + deltaPrice,
  };

  if (Number.isFinite(point.logical) && Number.isFinite(deltaLogical)) {
    nextPoint.logical = point.logical + deltaLogical;
  }

  return nextPoint;
}

export const CYCLE_TOOL_TYPES = ['cyclic-lines', 'time-cycles', 'sine-line'];

// Each key is a multi-point pattern/wave tool; the array is both its per-vertex
// label sequence (empty string = no label badge at that vertex) and, via its
// length, the fixed point count that auto-finalizes the drawing on the last click.
export const MULTI_POINT_PATTERN_LABELS = {
  'xabcd-pattern': ['X', 'A', 'B', 'C', 'D'],
  'cypher-pattern': ['X', 'A', 'B', 'C', 'D'],
  'head-and-shoulders': ['', '', '', '', '', '', ''],
  'abcd-pattern': ['A', 'B', 'C', 'D'],
  'triangle-pattern': ['', '', '', '', ''],
  'three-drives-pattern': ['', '', '', '', '', '', ''],
  'elliott-impulse-wave': ['', '1', '2', '3', '4', '5'],
  'elliott-correction-wave': ['', 'A', 'B', 'C'],
  'elliott-triangle-wave': ['', 'A', 'B', 'C', 'D', 'E'],
  'elliott-double-combo-wave': ['', 'W', 'X', 'Y'],
  'elliott-triple-combo-wave': ['', 'W', 'X', 'Y', 'Z'],
};

export const MULTI_POINT_PATTERN_TYPES = Object.keys(MULTI_POINT_PATTERN_LABELS);

// 'path', 'brush', and 'highlighter' are the freehand (unbounded, dblclick-to-finish)
// members — Brush/Highlighter are click-per-vertex just like Path, not a true
// continuous mouse-drag trace; they differ only in default stroke width/opacity
// (see DEFAULT_STROKE_WIDTH_BY_TYPE / highlighter opacity in ChartStage.jsx). The
// pattern/wave types share the exact same points-array creation, render, hit-test,
// resize, and drag-move machinery, just capped at a fixed point count.
export const FREEHAND_TOOL_TYPES = ['path', 'brush', 'highlighter'];
export const MULTI_POINT_TOOL_TYPES = [...FREEHAND_TOOL_TYPES, ...MULTI_POINT_PATTERN_TYPES];

// Single-point icon markers that don't carry user text (unlike Signpost/Flag Mark,
// which do) — handleSaveText (MarketChart.jsx) skips its "text required" guard
// for these so a click alone places the icon.
export const ICON_ONLY_MARKER_TYPES = ['arrow-marker', 'arrow-mark-up', 'arrow-mark-down', 'arrow-mark-left', 'arrow-mark-right'];

export function isTwoPointDrawing(drawing) {
  return [
    'line',
    'horizontal-ray',
    'ray', 'arrow', 'arrow-line', 'horizontal-line', 'vertical-line', 'parallel-channel', 'extended-line',
    'fib-retracement',
    'fib-extension',
    'rect', 'circle',
    'triangle', 'arc', 'curve', 'double-curve',
    'measure',
    'forecast',
    'long-position',
    'short-position',
    'price-range', 'date-range', 'price-date-range',
    ...CYCLE_TOOL_TYPES,
  ].includes(drawing?.type);
}

export function isLineLikeDrawing(drawing) {
  return [
    'line',
    'horizontal-ray',
    'ray', 'arrow', 'arrow-line', 'horizontal-line', 'vertical-line', 'parallel-channel', 'extended-line',
    'fib-retracement',
    'fib-extension',
    'triangle', 'arc', 'curve', 'double-curve',
    'measure',
    'forecast',
    ...CYCLE_TOOL_TYPES,
  ].includes(drawing?.type);
}

export function isShapeDrawing(drawing) {
  return ['triangle', 'arc', 'curve', 'double-curve'].includes(drawing?.type);
}

export function isTextMarkerDrawing(drawing) {
  return [
    'text', 'anchored-text', 'note', 'anchored-note', 'callout', 'comment', 'price-label', 'price-note', 'signpost', 'flag-mark',
    'arrow-marker', 'arrow-mark-up', 'arrow-mark-down', 'arrow-mark-left', 'arrow-mark-right',
  ].includes(drawing?.type);
}

export function isHorizontalRayDrawing(drawing) {
  return ['horizontal-ray', 'horizontal-line'].includes(drawing?.type);
}

export function isPositionDrawing(drawing) {
  return ['long-position', 'short-position'].includes(drawing?.type);
}

// Covers 'path' and every fixed-count pattern/wave type in MULTI_POINT_PATTERN_TYPES
// (they all share the same points-array data shape) — name kept for the many
// existing call sites rather than a sweeping rename; see MULTI_POINT_TOOL_TYPES.
export function isPathDrawing(drawing) {
  return MULTI_POINT_TOOL_TYPES.includes(drawing?.type);
}

export function offsetDrawing(drawing, deltaTime, deltaPrice, deltaLogical) {
  if (isTwoPointDrawing(drawing)) {
    const nextDrawing = {
      ...drawing,
      start: offsetPoint(drawing.start, deltaTime, deltaPrice, deltaLogical),
      end: offsetPoint(drawing.end, deltaTime, deltaPrice, deltaLogical),
    };

    if (drawing.stop) {
      nextDrawing.stop = offsetPoint(drawing.stop, deltaTime, deltaPrice, deltaLogical);
    }

    if (drawing.anchor) {
      nextDrawing.anchor = offsetPoint(drawing.anchor, deltaTime, deltaPrice, deltaLogical);
    }

    return nextDrawing;
  }

  if (isTextMarkerDrawing(drawing)) {
    return {
      ...drawing,
      point: offsetPoint(drawing.point, deltaTime, deltaPrice, deltaLogical),
    };
  }

  if (isPathDrawing(drawing)) {
    return {
      ...drawing,
      points: (drawing.points ?? []).map((point) => offsetPoint(point, deltaTime, deltaPrice, deltaLogical)),
    };
  }

  return drawing;
}

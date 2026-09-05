import { MARKET_SESSIONS, SESSION_KEYS } from './marketSessions';

export const INTERVAL_MAP = {
  '1m': '1',
  '3m': '3',
  '5m': '5',
  '15m': '15',
  '30m': '30',
  '1h': '60',
  '2h': '120',
  '4h': '240',
  '6h': '360',
  '12h': '720',
  '1d': 'D',
  '1w': 'W',
  '1M': 'M',
};

export const TIMEFRAME_SECONDS = {
  '1m': 60,
  '3m': 180,
  '5m': 300,
  '15m': 900,
  '30m': 1800,
  '1h': 3600,
  '2h': 7200,
  '4h': 14400,
  '6h': 21600,
  '12h': 43200,
  '1d': 86400,
  '1w': 604800,
  '1M': 2592000,
};

export const TIMEFRAMES = [
  { value: '1m', label: '1 Minute' },
  { value: '3m', label: '3 Minutes' },
  { value: '5m', label: '5 Minutes' },
  { value: '15m', label: '15 Minutes' },
  { value: '30m', label: '30 Minutes' },
  { value: '1h', label: '1 Hour' },
  { value: '2h', label: '2 Hours' },
  { value: '4h', label: '4 Hours' },
  { value: '6h', label: '6 Hours' },
  { value: '12h', label: '12 Hours' },
  { value: '1d', label: '1 Day' },
  { value: '1w', label: '1 Week' },
  { value: '1M', label: '1 Month' },
];

const MEXC_TIMEFRAME_VALUES = new Set(['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w', '1M']);

export const supportedTimeframes = (exchange) => (
  exchange === 'mexc' ? TIMEFRAMES.filter((item) => MEXC_TIMEFRAME_VALUES.has(item.value)) : TIMEFRAMES
);

export const POPULAR_SYMBOLS = [
  'BTCUSDT',
  'ETHUSDT',
  'BNBUSDT',
  'SOLUSDT',
  'XRPUSDT',
  'ADAUSDT',
  'DOGEUSDT',
  'MATICUSDT',
  'LINKUSDT',
  'AVAXUSDT',
];

export const PLAYBACK_SPEEDS = [
  { label: '0.25x', value: 3000 },
  { label: '0.5x', value: 2000 },
  { label: '1x', value: 1000 },
  { label: '2x', value: 500 },
  { label: '4x', value: 250 },
  { label: '10x', value: 100 },
  { label: '20x', value: 50 },
];

export const DRAWING_WIDTHS = [0, 0.5, 1, 2, 3, 4, 6, 8];

// Filled geometry already shows where it is through its tint, so a full-strength
// outline on top of the fill reads as a second, heavier shape. These draw their
// edge softly instead — present, but closer to a gridline than an outline. Width
// stays the user's dial (0 turns the edge off entirely); this is only how hard the
// edge is painted.
export const FILLED_GEOMETRY_TOOL_TYPES = [
  'rect', 'circle', 'price-range', 'date-range', 'price-date-range', 'triangle',
];
export const GEOMETRY_BORDER_OPACITY = 0.5;

// Arc/curve/double-curve are unfilled — the stroke *is* the drawing, not a border
// around one — so they are excluded above and only join the list the settings
// migration walks.
export const GEOMETRY_TOOL_TYPES = [
  ...FILLED_GEOMETRY_TOOL_TYPES,
  'arc', 'curve', 'double-curve',
];

export const MIN_DRAWING_STROKE_WIDTH = 0;
// An edgeless shape is only an 8%-alpha tint while you drag it out, which is not
// enough to aim with — the in-progress preview always keeps a visible edge.
export const MIN_PREVIEW_STROKE_WIDTH = 1;

export function formatStrokeWidthLabel(width) {
  return Number(width) === 0 ? 'None' : `${width}px`;
}

// Finishing a drawing saves its own style back as that tool type's default, so the
// hairline and edgeless widths this feature briefly defaulted to are now sitting in
// saved settings, where they would win over the softened 1px edge. Clear those two
// once — any width actually chosen from the picker is left alone — and stamp the
// blob so a deliberate re-pick of either is never dropped again.
export const TOOL_SETTINGS_SCHEMA_VERSION = 3;
const LEGACY_GEOMETRY_STROKE_WIDTHS = [0, 0.5];

export function migrateToolSettings(settings) {
  const source = settings && typeof settings === 'object' && !Array.isArray(settings) ? settings : {};
  if (Number(source.schemaVersion) >= TOOL_SETTINGS_SCHEMA_VERSION) return null;

  const next = { ...source, schemaVersion: TOOL_SETTINGS_SCHEMA_VERSION };

  for (const type of GEOMETRY_TOOL_TYPES) {
    if (!LEGACY_GEOMETRY_STROKE_WIDTHS.includes(Number(next[type]?.strokeWidth))) continue;

    const { strokeWidth, ...rest } = next[type];
    next[type] = rest;
  }

  return next;
}

export const TEXT_SIZES = [10, 12, 14, 16, 18, 20, 24, 28, 32];
export const DRAWING_COLORS = [
  '#60a5fa',
  '#38bdf8',
  '#22d3ee',
  '#2dd4bf',
  '#fbbf24',
  '#facc15',
  '#34d399',
  '#22c55e',
  '#84cc16',
  '#fb7185',
  '#ef4444',
  '#dc2626',
  '#a78bfa',
  '#8b5cf6',
  '#d946ef',
  '#ec4899',
  '#f97316',
  '#ea580c',
  '#7c2d12',
  '#fca5a5',
  '#fde047',
  '#bef264',
  '#6ee7b7',
  '#67e8f9',
  '#93c5fd',
  '#c4b5fd',
  '#f0abfc',
  '#f9a8d4',
  '#78350f',
  '#064e3b',
  '#0c4a6e',
  '#312e81',
  '#94a3b8',
  '#64748b',
  '#f8fafc',
  '#000000',
];

export const CHART_HEIGHT = 720;
export const DRAWING_COLOR = '#60a5fa';
export const DRAWING_FILL = 'rgba(96, 165, 250, 0.16)';

export const DEFAULT_CANDLE_COLORS = {
  up: '#089981',
  down: '#f23645',
};
export const DEFAULT_CANDLE_SIZE = 24;
export const MIN_CANDLE_SIZE = 3;
export const MAX_CANDLE_SIZE = 24;

// Above this timeframe a single candle spans most of a session, so every bar
// would carry a boundary and the overlay reads as noise rather than context.
// The Sessions tab explains the cutoff instead of just going blank.
export const SESSION_OVERLAY_MAX_TIMEFRAME_SECONDS = TIMEFRAME_SECONDS['4h'];

// The real question is not how wide one band is, it is whether a *day* is wide
// enough for intraday structure to read at all. Below this the three sessions
// and the off-session gaps compress into a repeating stripe you cannot tell
// apart, so the whole layer steps aside rather than painting mush — a fresh 4h
// chart auto-fits roughly seven months, where every band is about a pixel.
// ~18px/day is about two months across a full-width pane.
export const SESSION_MIN_DAY_WIDTH_PX = 18;

// Safety net under the day-width gate, for a range so short that one band would
// still round down to nothing.
export const SESSION_BAND_MIN_WIDTH_PX = 2;

export const SESSION_BAND_LABEL_MIN_WIDTH_PX = 56;

export const DEFAULT_CHART_DISPLAY = {
  candles: { bodyEnabled: true, borderEnabled: true, borderUp: null, borderDown: null, wickEnabled: true, wickUp: null, wickDown: null },
  priceLines: { last: true, previousClose: false, highLow: false },
  statusLine: { symbol: true, exchange: true, ohlc: true, change: true },
  scales: { precision: 'default', autoScale: true, logScale: false },
  canvas: { background: null, gridColor: null },
  // Shading is off by default because it repaints the whole chart, but the
  // status-bar badge is on: it is one small chip next to the clock that is
  // already there, and it is how the feature gets discovered at all.
  sessions: {
    enabled: false,
    badge: true,
    display: 'bands',
    opacity: 8,
    asian: { enabled: true, color: MARKET_SESSIONS.asian.color },
    london: { enabled: true, color: MARKET_SESSIONS.london.color },
    newYork: { enabled: true, color: MARKET_SESSIONS.newYork.color },
  },
};

/**
 * Fills in every section of a saved or preset chart display.
 *
 * Settings saved before a section existed come back without it — a chart
 * settings template saved before sessions were added has no `sessions` key at
 * all — so anything reading `display.sessions.badge` would throw. Sessions also
 * nest a `{ enabled, color }` object per market, which a single shallow spread
 * would replace wholesale rather than merge.
 */
export function withChartDisplayDefaults(saved) {
  const source = saved ?? {};
  const sessions = { ...DEFAULT_CHART_DISPLAY.sessions, ...(source.sessions ?? {}) };

  for (const key of SESSION_KEYS) {
    sessions[key] = { ...DEFAULT_CHART_DISPLAY.sessions[key], ...(source.sessions?.[key] ?? {}) };
  }

  return {
    candles: { ...DEFAULT_CHART_DISPLAY.candles, ...(source.candles ?? {}) },
    priceLines: { ...DEFAULT_CHART_DISPLAY.priceLines, ...(source.priceLines ?? {}) },
    statusLine: { ...DEFAULT_CHART_DISPLAY.statusLine, ...(source.statusLine ?? {}) },
    scales: { ...DEFAULT_CHART_DISPLAY.scales, ...(source.scales ?? {}) },
    canvas: { ...DEFAULT_CHART_DISPLAY.canvas, ...(source.canvas ?? {}) },
    sessions,
  };
}

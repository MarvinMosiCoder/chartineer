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

export const DRAWING_WIDTHS = [1, 2, 3, 4, 6, 8];
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

export const DEFAULT_CHART_DISPLAY = {
  candles: { bodyEnabled: true, borderEnabled: true, borderUp: null, borderDown: null, wickEnabled: true, wickUp: null, wickDown: null },
  priceLines: { last: true, previousClose: false, highLow: false },
  statusLine: { symbol: true, exchange: true, ohlc: true, change: true },
  scales: { precision: 'default', autoScale: true, logScale: false },
  canvas: { background: null, gridColor: null },
};

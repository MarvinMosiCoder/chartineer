import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { flushSync } from 'react-dom';
import axios from 'axios';
import NProgress from 'nprogress';
import { usePage } from '@inertiajs/react';
import { Bell, HelpCircle, LoaderCircle, MoreHorizontal, RotateCcw, Settings, Trash2, Wallet, X } from 'lucide-react';
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  CrosshairMode,
  LineStyle,
  PriceScaleMode,
} from 'lightweight-charts';
import { useTheme } from '../../Context/ThemeContext';
import { useAuth } from '../../Context/AuthContext';
import { useToast } from '../../Context/ToastContext';
import { broadcastChange, subscribeToChange } from '../../utils/crossTabSync';
import { useConfirm } from '../../Hooks/useConfirm';
import ChartHeader from './MarketChart/ChartHeader';
import { DEFAULT_TIMEFRAME_FAVORITES } from './MarketChart/TimeframeSelector';
import ChartSettingsModal from './MarketChart/ChartSettingsModal';
import ChartStage from './MarketChart/ChartStage';
import ReplayPanel from './MarketChart/ReplayPanel';
import ReplayControlBar from './MarketChart/ReplayControlBar';
import PositionsPanel from './MarketChart/PositionsPanel';
import SubscriptionModal from './MarketChart/SubscriptionModal';
import IndicatorSettingsPanel, { IndicatorClickTargets, IndicatorContextMenu } from './MarketChart/IndicatorSettingsPanel';
import { createLiveCandleStream } from './MarketChart/liveCandleStream';
import FullscreenChartHeader from './MarketChart/FullscreenChartHeader';
import WorkspaceTour from './WorkspaceTour';
import { useAnchoredTooltip, AnchoredTooltipPortal } from '../Tooltip/AnchoredTooltip';
import {
  CHART_HEIGHT,
  DEFAULT_CANDLE_COLORS,
  DEFAULT_CANDLE_SIZE,
  DEFAULT_CHART_DISPLAY,
  DRAWING_COLOR,
  INTERVAL_MAP,
  MAX_CANDLE_SIZE,
  MIN_CANDLE_SIZE,
  TIMEFRAME_SECONDS,
  supportedTimeframes,
} from './MarketChart/constants';
import {
  buildStorageKey,
  CYCLE_TOOL_TYPES,
  distanceToSegment,
  estimateDrawingLogicalFromTime,
  estimateTimeFromLogical,
  findNearestCandleIndex,
  ICON_ONLY_MARKER_TYPES,
  isHorizontalRayDrawing,
  isLineLikeDrawing,
  isPathDrawing,
  isPositionDrawing,
  isTwoPointDrawing,
  MULTI_POINT_PATTERN_LABELS,
  MULTI_POINT_PATTERN_TYPES,
  MULTI_POINT_TOOL_TYPES,
  normalizeApiCandles,
  normalizeVisibleRect,
  offsetDrawing,
} from './MarketChart/utils';

const MAX_DRAWING_UNDO_STEPS = 25;
const POSITION_MONITOR_GAP_LIMIT = 500;
// Synthetic "tool type" key so chart-settings templates reuse the exact same
// named-preset storage (toolSettings.presets[type], saved via /market-tool-settings)
// as drawing tool templates, rather than a second, parallel preset system.
const CHART_SETTINGS_PRESET_TYPE = 'chartSettings';
const MARKET_DATA_POLL_SECONDS = Math.max(5, Number(import.meta.env.VITE_MARKET_DATA_POLL_SECONDS ?? 10));
const WEBSOCKET_DELAY_SECONDS = 45;

function movingAverage(candles, period) {
  return candles.map((candle, index) => {
    if (index + 1 < period) return null;
    const window = candles.slice(index + 1 - period, index + 1);
    return { time: candle.time, value: window.reduce((sum, item) => sum + Number(item.close), 0) / period };
  }).filter(Boolean);
}

function exponentialMovingAverage(candles, period) {
  if (!candles.length) return [];
  const multiplier = 2 / (period + 1); let value = Number(candles[0].close);
  return candles.map((candle) => { value = (Number(candle.close) * multiplier) + (value * (1 - multiplier)); return { time: candle.time, value }; });
}

function relativeStrengthIndex(candles, period) {
  let gains = 0; let losses = 0;
  return candles.map((candle, index) => {
    if (!index) return null;
    const delta = Number(candle.close) - Number(candles[index - 1].close);
    const gain = Math.max(delta, 0); const loss = Math.max(-delta, 0);
    if (index <= period) { gains += gain; losses += loss; if (index < period) return null; }
    else { gains = ((gains * (period - 1)) + gain) / period; losses = ((losses * (period - 1)) + loss) / period; }
    const rs = losses === 0 ? 100 : gains / losses;
    return { time: candle.time, value: 100 - (100 / (1 + rs)) };
  }).filter(Boolean);
}

function movingAverageConvergenceDivergence(candles, fastPeriod, slowPeriod, signalPeriod) {
  if (!candles.length) return { macd: [], signal: [], histogram: [] };

  const fastMultiplier = 2 / (fastPeriod + 1);
  const slowMultiplier = 2 / (slowPeriod + 1);
  const signalMultiplier = 2 / (signalPeriod + 1);
  let fastEma = Number(candles[0].close);
  let slowEma = fastEma;
  let signalEma = 0;

  const macd = [];
  const signal = [];
  const histogram = [];

  candles.forEach((candle, index) => {
    const close = Number(candle.close);
    fastEma = index === 0 ? close : (close * fastMultiplier) + (fastEma * (1 - fastMultiplier));
    slowEma = index === 0 ? close : (close * slowMultiplier) + (slowEma * (1 - slowMultiplier));
    const macdValue = fastEma - slowEma;
    signalEma = index === 0 ? macdValue : (macdValue * signalMultiplier) + (signalEma * (1 - signalMultiplier));
    const signalValue = signalEma;

    macd.push({ time: candle.time, value: macdValue });
    signal.push({ time: candle.time, value: signalValue });
    histogram.push({ time: candle.time, value: macdValue - signalValue });
  });

  return { macd, signal, histogram };
}

/**
 * Re-enables autoscale on every pane's price scale (main + any visible indicator pane).
 * A manual vertical price-scale drag disables autoscale entirely inside lightweight-charts —
 * invisibly to React state — and nothing was re-enabling it when the symbol/timeframe
 * changed underneath it, so a stale manually-set range from a completely different candle
 * set could leave the new candles rendered outside the visible price range (present in the
 * data, invisible on screen) until the user found "Reset Chart" or dragged the scale back
 * themselves. Called from the viewport-init effects below on every symbol/timeframe change,
 * not just from the manual Reset Chart action.
 */
function resetPriceScalesToAutoScale(chart) {
  chart.panes().forEach((_, paneIndex) => {
    chart.priceScale('right', paneIndex)?.applyOptions({ autoScale: true });
  });
}

const CHART_THEMES = {
  dark: {
    mode: 'dark',
    background: '#0b0d10',
    panel: '#151617',
    panelControl: '#0f1115',
    text: '#d1d4dc',
    grid: 'rgba(148, 163, 184, 0.06)',
    border: '#252a32',
    overlay: 'rgba(11, 13, 16, 0.78)',
    selectedReplayPriceMarker: '#363a45',
  },
  light: {
    mode: 'light',
    background: '#ffffff',
    panel: '#ffffff',
    panelControl: '#f8fafc',
    text: '#334155',
    grid: 'rgba(100, 116, 139, 0.08)',
    border: '#cbd5e1',
    overlay: 'rgba(255, 255, 255, 0.76)',
    selectedReplayPriceMarker: '#363a45',
  },
};

function resolveChartTheme(adminTheme) {
  return adminTheme === 'bg-skin-black' ? CHART_THEMES.dark : CHART_THEMES.light;
}

function ChartDotsLoader({ isDark }) {
  return (
    <div className="w-full max-w-3xl px-8" aria-label="Loading chart workspace" role="status">
      <div className={`h-1.5 overflow-hidden rounded-full ${isDark ? 'bg-[#2a2e39]' : 'bg-slate-200'}`}><div className="h-full w-1/3 animate-pulse rounded-full bg-[#2dd4bf]"/></div>
      <div className="mt-8 flex h-44 items-end justify-center gap-2 opacity-50">{[34,58,42,76,51,88,64,95,70,82,55,73,48,67,40].map((height,index)=><span key={index} className={index%3===0?'w-3 bg-red-500':'w-3 bg-emerald-500'} style={{height:`${height}%`}}/>)}</div>
      <div className="mt-4 text-center text-xs font-semibold text-[#787b86]">Loading chart workspace…</div>
    </div>
  );
}

function ChartSkeletonLoader({ isDark }) {
  const candles = [
    [62, 24, 16, true], [56, 31, 20, true], [48, 38, 24, false], [54, 27, 17, true],
    [43, 45, 28, true], [37, 34, 21, false], [45, 39, 25, false], [51, 30, 18, true],
    [42, 48, 31, true], [34, 42, 26, true], [29, 36, 22, false], [35, 32, 19, false],
    [28, 44, 28, true], [22, 38, 23, true], [30, 31, 18, false], [25, 40, 25, true],
    [18, 35, 21, true], [24, 29, 17, false], [20, 37, 23, true], [27, 33, 20, false],
  ];
  const surface = isDark ? '#0b0e14' : '#f8fafc';
  const grid = isDark ? 'rgba(42,46,57,.65)' : 'rgba(203,213,225,.8)';
  const muted = isDark ? 'bg-[#2a2e39]' : 'bg-slate-200';
  const chartPlaceholder = isDark ? 'bg-[#434955]' : 'bg-slate-300';

  return (
    <div className="absolute inset-0 overflow-hidden rounded-lg" aria-label="Loading chart workspace" role="status" style={{ backgroundColor: surface }}>
      <div className="absolute inset-x-0 top-0 z-10 flex h-10 items-center gap-2 border-b px-4" style={{ borderColor: grid }}>
        <span className={`h-3 w-20 animate-pulse rounded ${muted}`} />
        <span className={`h-3 w-12 animate-pulse rounded ${muted}`} />
        <span className={`h-6 w-16 animate-pulse rounded ${muted}`} />
      </div>
      <div className="absolute bottom-7 left-0 right-14 top-10" style={{ backgroundImage: `linear-gradient(to right, ${grid} 1px, transparent 1px), linear-gradient(to bottom, ${grid} 1px, transparent 1px)`, backgroundSize: '12.5% 20%' }}>
        <div className="absolute inset-x-3 bottom-[18%] top-[8%] flex animate-pulse items-stretch justify-between gap-1.5 opacity-70 sm:gap-2.5">
          {candles.map(([top, wickHeight, bodyHeight], index) => <div key={index} className="relative h-full min-w-0 flex-1">
            <span className={`absolute left-1/2 w-px -translate-x-1/2 opacity-70 ${chartPlaceholder}`} style={{ top: `${top - 5}%`, height: `${wickHeight}%` }} />
            <span className={`absolute left-[20%] right-[20%] rounded-sm opacity-70 ${chartPlaceholder}`} style={{ top: `${top}%`, height: `${bodyHeight}%` }} />
          </div>)}
        </div>
        <div className="absolute inset-x-3 bottom-0 flex h-[15%] animate-pulse items-end justify-between gap-1.5 opacity-40 sm:gap-2.5">
          {candles.map((_, index) => <span key={index} className={`min-w-0 flex-1 ${chartPlaceholder}`} style={{ height: `${25 + ((index * 17) % 70)}%` }} />)}
        </div>
      </div>
      <aside className="absolute bottom-7 right-0 top-10 w-14 border-l px-2 py-3" style={{ borderColor: grid }}>
        {[0, 1, 2, 3, 4].map((item) => <span key={item} className={`mb-10 block h-1.5 w-full animate-pulse rounded ${muted}`} />)}
      </aside>
      <footer className="absolute inset-x-0 bottom-0 flex h-7 items-center justify-around border-t px-6" style={{ borderColor: grid }}>
        {[0, 1, 2, 3, 4, 5].map((item) => <span key={item} className={`h-1.5 w-10 animate-pulse rounded ${muted}`} />)}
      </footer>
      <div className="absolute bottom-10 left-1/2 z-20 -translate-x-1/2 rounded-full border border-[#2dd4bf]/25 bg-[#2dd4bf]/10 px-3 py-1.5 text-[10px] font-semibold text-[#5eead4]">Loading chart data…</div>
    </div>
  );
}

function ChartMarketLegend({ symbol, exchange, timeframe, candle, isTimeframeLoading, chartTheme, showSymbol = true, showExchange = true, showOhlc = true, showChange = true, isActive = false, onOpenSettings }) {
  const settingsTooltip = useAnchoredTooltip('right');
  const open = Number(candle?.open);
  const high = Number(candle?.high);
  const low = Number(candle?.low);
  const close = Number(candle?.close);
  const hasCandle = [open, high, low, close].every(Number.isFinite);
  const change = hasCandle ? close - open : null;
  const changePercent = hasCandle && open !== 0 ? (change / open) * 100 : null;
  const direction = Number(change) > 0 ? 'up' : Number(change) < 0 ? 'down' : 'neutral';
  const valueColor = direction === 'up'
    ? '#089981'
    : direction === 'down'
      ? '#f23645'
      : chartTheme.text;
  const exchangeLabel = String(exchange || '').replace(/(^|[-_\s])\w/g, (letter) => letter.toUpperCase());
  const timeframeLabel = INTERVAL_MAP[timeframe] ?? timeframe;
  const signedChange = Number.isFinite(change)
    ? `${change > 0 ? '+' : ''}${formatOverlayPrice(change)}`
    : '---';
  const signedPercent = Number.isFinite(changePercent)
    ? `${changePercent > 0 ? '+' : ''}${changePercent.toFixed(2)}%`
    : '---';

  return (
    <div
      data-chart-ui="market-legend"
      className="pointer-events-none absolute left-2 top-1.5 z-30 flex min-w-0 select-none flex-wrap items-center gap-x-1 whitespace-nowrap text-[11px] font-semibold leading-5 sm:left-3 sm:top-2 sm:text-xs"
      style={{ color: chartTheme.text, maxWidth: 'calc(100% - 4.5rem)' }}
    >
      <div
        className={`pointer-events-auto -mx-1.5 -my-0.5 flex min-w-0 shrink-0 items-center gap-x-1 whitespace-nowrap rounded border px-1.5 py-0.5 transition-colors ${isActive ? (chartTheme.mode === 'dark' ? 'border-[#2dd4bf]/50 bg-black/30' : 'border-[#2dd4bf]/50 bg-white/70') : 'border-transparent'}`}
      >
        {showSymbol && <span className="font-bold">{symbol}</span>}
        {showSymbol && <span className="text-[#787b86]">·</span>}
        <span>{timeframeLabel}</span>
        {showExchange && <span className="text-[#787b86]">·</span>}
        {showExchange && <span className="text-[#787b86]">Last price {exchangeLabel}</span>}
        {isTimeframeLoading && (
          <span className="ml-1 inline-flex h-4 items-center gap-0.5" role="status" aria-label={`Loading ${timeframe} candles`}>
            {[0, 1, 2].map((dot) => (
              <span
                key={dot}
                className="h-1 w-1 animate-bounce rounded-full bg-[#787b86]"
                style={{ animationDelay: `${dot * 120}ms`, animationDuration: '720ms' }}
                aria-hidden="true"
              />
            ))}
          </span>
        )}
        <button
          ref={settingsTooltip.anchorRef}
          type="button"
          data-tour="appearance"
          onClick={onOpenSettings}
          onMouseEnter={settingsTooltip.show}
          onMouseLeave={settingsTooltip.hide}
          onFocus={settingsTooltip.show}
          onBlur={settingsTooltip.hide}
          className={`ml-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded transition-opacity hover:bg-white/10 ${isActive ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}`}
          aria-label="Chart settings"
        >
          <MoreHorizontal size={13} />
        </button>
        <AnchoredTooltipPortal pos={settingsTooltip.pos} label="Chart settings" isDark={chartTheme.mode === 'dark'} />
      </div>
      {showOhlc && <span className="ml-0.5" style={{ color: valueColor }}><span className="text-[#787b86]">O</span> {hasCandle ? formatOverlayPrice(open) : '---'}</span>}
      {showOhlc && <span style={{ color: valueColor }}><span className="text-[#787b86]">H</span> {hasCandle ? formatOverlayPrice(high) : '---'}</span>}
      {showOhlc && <span style={{ color: valueColor }}><span className="text-[#787b86]">L</span> {hasCandle ? formatOverlayPrice(low) : '---'}</span>}
      {showOhlc && <span style={{ color: valueColor }}><span className="text-[#787b86]">C</span> {hasCandle ? formatOverlayPrice(close) : '---'}</span>}
      {showChange && <span style={{ color: valueColor }}>{signedChange} ({signedPercent})</span>}
    </div>
  );
}

function cloneDrawingsForHistory(drawings) {
  if (typeof structuredClone === 'function') {
    return structuredClone(drawings);
  }

  return JSON.parse(JSON.stringify(drawings));
}

const TWO_POINT_TOOL_TYPES = [
  'line',
  'horizontal-ray',
  'ray', 'arrow', 'arrow-line', 'horizontal-line', 'vertical-line', 'parallel-channel', 'extended-line',
  'fib-retracement',
  'fib-extension',
  'rect', 'circle',
  'triangle', 'arc', 'curve', 'double-curve',
  'long-position',
  'short-position',
  'forecast',
  'measure',
  'price-range', 'date-range', 'price-date-range',
  ...CYCLE_TOOL_TYPES,
];

const BOX_TOOL_TYPES = ['rect', 'circle', 'price-range', 'date-range', 'price-date-range'];
const SHAPE_TOOL_TYPES = ['triangle', 'arc', 'curve', 'double-curve'];
const THREE_POINT_SHAPE_TYPES = ['triangle', 'curve', 'double-curve'];
const TEXT_MARKER_TYPES = [
  'text', 'anchored-text', 'note', 'anchored-note', 'callout', 'comment', 'price-label', 'price-note', 'signpost', 'flag-mark',
  'arrow-marker', 'arrow-mark-up', 'arrow-mark-down', 'arrow-mark-left', 'arrow-mark-right',
];
const PRICE_ANCHORED_MARKER_TYPES = ['price-label', 'price-note'];
// Highlighter defaults to a thick stroke (rendered semi-transparent, see ChartStage.jsx)
// so it reads as a highlighter mark rather than a thin pen line on first use.
const DEFAULT_FREEHAND_STROKE_WIDTH = { highlighter: 14 };

const PRESET_ENABLED_TOOL_TYPES = [
  'line',
  'horizontal-ray',
  'ray', 'arrow', 'arrow-line', 'horizontal-line', 'vertical-line', 'parallel-channel', 'extended-line',
  'path', 'brush', 'highlighter',
  'fib-retracement',
  'fib-extension',
  'forecast',
  'measure',
  'price-range', 'date-range', 'price-date-range',
  'rect', 'circle',
  'triangle', 'arc', 'curve', 'double-curve',
  'text', 'anchored-text', 'note', 'anchored-note', 'callout', 'comment', 'price-label', 'price-note', 'signpost', 'flag-mark',
  'arrow-marker', 'arrow-mark-up', 'arrow-mark-down', 'arrow-mark-left', 'arrow-mark-right',
  'long-position',
  'short-position',
  ...MULTI_POINT_PATTERN_TYPES,
  ...CYCLE_TOOL_TYPES,
];

const FIB_RETRACEMENT_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
const FIB_EXTENSION_LEVELS = [
  0,
  0.236,
  0.382,
  0.5,
  0.618,
  0.786,
  1,
  1.272,
  1.414,
  1.618,
  2,
  2.272,
  2.414,
  2.618,
  3.618,
  4.236,
];

const PREFETCH_TIMEFRAME_MAP = {
  '1m': ['3m', '5m'],
  '3m': ['1m', '5m', '15m'],
  '5m': ['3m', '15m', '30m'],
  '15m': ['5m', '30m', '1h'],
  '30m': ['15m', '1h', '2h'],
  '1h': ['30m', '2h', '4h'],
  '2h': ['1h', '4h', '6h'],
  '4h': ['1h', '2h', '6h', '12h'],
  '6h': ['4h', '12h', '1d'],
  '12h': ['6h', '1d'],
  '1d': ['12h', '1w'],
  '1w': ['1d', '1M'],
  '1M': ['1w'],
};

const CANDLE_CACHE_LIMIT = 18;
const PERSISTED_CANDLE_CACHE_LIMIT = 6;
const PERSISTED_CANDLE_CACHE_MAX_AGE_MS = 30 * 60 * 1000;

function persistedCandleCacheEntryKey(userId, cacheKey) {
  return `market-candle-history:${userId}:${cacheKey}`;
}

function persistedCandleCacheIndexKey(userId) {
  return `market-candle-history-index:${userId}`;
}

function readPersistedCandleCache(userId, cacheKey) {
  if (typeof window === 'undefined') return null;

  const storageKey = persistedCandleCacheEntryKey(userId, cacheKey);

  try {
    const cached = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null');
    if (
      !cached
      || !Array.isArray(cached.candles)
      || Date.now() - Number(cached.cachedAt ?? 0) > PERSISTED_CANDLE_CACHE_MAX_AGE_MS
    ) {
      sessionStorage.removeItem(storageKey);
      return null;
    }

    return cached;
  } catch {
    return null;
  }
}

function writePersistedCandleCache(userId, cacheKey, candles) {
  if (typeof window === 'undefined') return;

  const entryKey = persistedCandleCacheEntryKey(userId, cacheKey);
  const indexKey = persistedCandleCacheIndexKey(userId);

  try {
    sessionStorage.setItem(entryKey, JSON.stringify({
      candles,
      cachedAt: Date.now(),
    }));

    const currentIndex = JSON.parse(sessionStorage.getItem(indexKey) ?? '[]');
    const nextIndex = [
      entryKey,
      ...(Array.isArray(currentIndex) ? currentIndex : []).filter((item) => item !== entryKey),
    ];

    nextIndex.slice(PERSISTED_CANDLE_CACHE_LIMIT).forEach((item) => {
      sessionStorage.removeItem(item);
    });
    sessionStorage.setItem(indexKey, JSON.stringify(nextIndex.slice(0, PERSISTED_CANDLE_CACHE_LIMIT)));
  } catch {
    // A full or unavailable browser store should never prevent chart loading.
  }
}

function buildCandleCacheKey({ exchange, marketCategory, symbol, timeframe, end = 'latest' }) {
  return [
    exchange,
    marketCategory,
    symbol,
    timeframe,
    end,
  ].join(':');
}

function resolvePositionProgressPoint(drawing, stop, candles) {
  if (!Array.isArray(candles) || !candles.length) return null;

  const entryPrice = Number(drawing.start?.price);
  const targetPrice = Number(drawing.end?.price);
  const stopPrice = Number(stop?.price);
  const isLong = drawing.type === 'long-position';

  if (
    !Number.isFinite(entryPrice)
    || !Number.isFinite(targetPrice)
    || !Number.isFinite(stopPrice)
  ) {
    return null;
  }

  const entryTime = Number(drawing.start?.time);
  const entryLogical = Number(drawing.start?.logical);
  const startedCandles = candles.filter((candle) => {
    if (Number.isFinite(entryLogical) && Number.isFinite(Number(candle.logical))) {
      return Number(candle.logical) >= entryLogical;
    }

    if (Number.isFinite(entryTime)) {
      return Number(candle.time) >= entryTime;
    }

    return true;
  });

  if (!startedCandles.length) return null;

  let latestProgressPoint = null;

  for (const candle of startedCandles) {
    const high = Number(candle.high);
    const low = Number(candle.low);
    const close = Number(candle.close);

    if (!Number.isFinite(high) || !Number.isFinite(low)) continue;

    if (isLong) {
      if (low <= stopPrice) {
        return { time: candle.time, logical: candle.logical, price: stopPrice };
      }

      if (high >= targetPrice) {
        return { time: candle.time, logical: candle.logical, price: targetPrice };
      }
    } else {
      if (high >= stopPrice) {
        return { time: candle.time, logical: candle.logical, price: stopPrice };
      }

      if (low <= targetPrice) {
        return { time: candle.time, logical: candle.logical, price: targetPrice };
      }
    }

    if (Number.isFinite(close)) {
      latestProgressPoint = {
        time: candle.time,
        logical: candle.logical,
        price: close,
      };
    }
  }

  return latestProgressPoint;
}

function normalizePositionTarget(type, entry, target) {
  if (!['long-position', 'short-position'].includes(type) || !entry || !target) return target;

  const distance = Math.max(Math.abs(Number(target.price) - Number(entry.price)), Math.abs(Number(entry.price)) * 0.001, 0.00000001);
  return {
    ...target,
    price: type === 'long-position'
      ? Number(entry.price) + distance
      : Number(entry.price) - distance,
  };
}

function getRenderedFibonacciLevels(drawing, overlayWidth) {
  const levels = drawing.type === 'fib-extension' ? FIB_EXTENSION_LEVELS : FIB_RETRACEMENT_LEVELS;
  const { p1, p2, p3 } = drawing.screen;
  const anchorPoint = drawing.type === 'fib-extension' ? (p3 ?? p2) : p1;
  const points = drawing.type === 'fib-extension' && p3 ? [p1, p2, p3] : [p1, p2];
  const leftX = Math.max(0, Math.min(...points.map((point) => point.x)));
  const rightX = Math.max(...points.map((point) => point.x), overlayWidth);
  const yDelta = p2.y - p1.y;

  return levels.map((level) => ({
    x1: leftX,
    x2: rightX,
    y: anchorPoint.y + (yDelta * level),
  }));
}

function getPositiveNumber(value) {
  if (value === null || value === undefined || value === '') return null;

  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function formatOverlayPrice(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '---';

  return number.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: number >= 100 ? 2 : 6,
  });
}

const NARROW_CHART_BREAKPOINT = 480;

function formatPriceScaleValue(value, compact = false) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '';

  const absolute = Math.abs(number);
  const maximumFractionDigits = compact
    ? (absolute >= 100 ? 0 : absolute >= 1 ? 4 : 6)
    : (absolute >= 100 ? 2 : absolute >= 1 ? 6 : 8);

  return number.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits,
    useGrouping: false,
  });
}

// lightweight-charts' built-in `priceFormat: { type: 'volume' }` does not
// abbreviate large values (a 7-8 digit volume renders as literal digits),
// and the right price scale's width is shared across every pane — an
// unabbreviated volume axis can end up wider than the price axis and become
// the actual bottleneck driving how wide the whole gutter is.
function formatCompactVolume(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '';

  const sign = number < 0 ? '-' : '';
  const absolute = Math.abs(number);
  const tiers = [
    [1_000_000_000, 'B'],
    [1_000_000, 'M'],
    [1_000, 'K'],
  ];
  const tierIndex = tiers.findIndex(([threshold]) => absolute >= threshold);
  if (tierIndex === -1) return `${sign}${absolute.toFixed(0)}`;

  let [threshold, suffix] = tiers[tierIndex];
  let scaled = absolute / threshold;
  let digits = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
  let rounded = Number(scaled.toFixed(digits));

  // Rounding can cross into the next tier up (e.g. 999.6K would otherwise
  // print as "1000K" instead of "1M").
  if (rounded >= 1000 && tierIndex > 0) {
    [threshold, suffix] = tiers[tierIndex - 1];
    scaled = rounded / 1000;
    digits = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
    rounded = Number(scaled.toFixed(digits));
  }

  const text = rounded.toFixed(digits).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
  return `${sign}${text}${suffix}`;
}

function formatOverlayPnl(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;

  return Math.abs(number).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// TEMPORARY diagnostic instrumentation for the "can't plot a drawing tool past
// the last live candle" investigation. Silent unless a user opts in via the
// browser console (`window.__debugDrawing = true`), so it's a no-op for
// everyone else. Remove once the root cause is confirmed and fixed.
function logDrawDebug(label, data) {
  if (typeof window !== 'undefined' && window.__debugDrawing) {
    console.log(`[debug-draw] ${label}`, data);
  }
}

function getPositionSideLabel(position) {
  if (position?.category === 'spot') return 'Buy';
  return position?.side === 'short' ? 'Short' : 'Long';
}

function formatToastQuantity(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '0';
  return number.toLocaleString(undefined, { maximumFractionDigits: 8 });
}

function getMarginModeLabel(position) {
  return position?.marginMode === 'cross' ? 'Cross' : 'Isolated';
}

function buildFillToastMessage(position) {
  const symbol = position?.symbol ?? '';
  const sideLabel = getPositionSideLabel(position);
  const modeLabel = getMarginModeLabel(position);
  const quantity = formatToastQuantity(position?.quantity);
  const price = formatOverlayPrice(position?.entryPrice);
  const isPending = position?.status === 'pending';
  return {
    type: { type: 'success', title: isPending ? 'Order placed' : 'Order filled' },
    message: `${symbol} ${sideLabel} · ${modeLabel} · ${quantity} @ ${price}`,
  };
}

function buildCancelToastMessage(position) {
  const symbol = position?.symbol ?? '';
  const sideLabel = getPositionSideLabel(position);
  const modeLabel = getMarginModeLabel(position);
  return {
    type: { type: 'success', title: 'Order cancelled' },
    message: `${symbol} ${sideLabel} · ${modeLabel}`,
  };
}

// `position` is the pre-close snapshot looked up by the caller before the close request fires.
// closedTrade (server) doesn't carry margin/partialTakeProfitPercent, so those come from here.
function buildCloseToastMessage(closedTrade, position) {
  if (!closedTrade) return null;

  const symbol = closedTrade.symbol ?? position?.symbol ?? '';
  const modeLabel = getMarginModeLabel(position ?? closedTrade);
  const netPnl = Number(closedTrade.netPnl);
  const safeNetPnl = Number.isFinite(netPnl) ? netPnl : 0;
  const sign = safeNetPnl >= 0 ? '+' : '-';
  const pnlText = formatOverlayPnl(safeNetPnl) ?? '0.00';

  const margin = Number(position?.margin);
  const pnlPercent = Number.isFinite(margin) && margin > 0 ? (safeNetPnl / margin) * 100 : null;
  const pnlPercentText = pnlPercent != null
    ? ` (${pnlPercent >= 0 ? '+' : '-'}${Math.abs(pnlPercent).toFixed(1)}%)`
    : '';

  // None of these are application errors — they are the risk system doing its
  // job — so none use the 'error' variant, which is reserved for genuine
  // failures. A losing outcome gets 'warning' (amber) instead of the red ✗ and
  // "Error" heading that made a routine stop loss read as something broken.
  // Each also passes an explicit title so the heading names the event rather
  // than the severity.
  switch (closedTrade.reason) {
    case 'take_profit':
      return {
        type: { type: 'success', title: 'Take Profit hit' },
        message: `${symbol} closed · ${modeLabel} · ${sign}${pnlText}${pnlPercentText}`,
      };
    case 'partial_take_profit': {
      const percent = Number(position?.partialTakeProfitPercent);
      const percentText = Number.isFinite(percent) ? `${percent}% ` : '';
      return {
        type: { type: 'success', title: 'Partial Take Profit' },
        message: `${symbol} · ${percentText}closed · ${modeLabel} · ${sign}${pnlText}`,
      };
    }
    case 'stop_loss':
      return {
        type: { type: 'warning', title: 'Stop Loss hit' },
        message: `${symbol} closed · ${modeLabel} · ${sign}${pnlText}${pnlPercentText}`,
      };
    case 'liquidation':
      // Still 'warning', not 'error': severe, but it is a real trading outcome
      // rather than a malfunction. The title carries the weight.
      return {
        type: { type: 'warning', title: 'Position liquidated' },
        message: `${symbol} · ${modeLabel} · ${sign}${pnlText}`,
      };
    case 'manual':
    default:
      return {
        type: {
          type: safeNetPnl >= 0 ? 'success' : 'warning',
          title: safeNetPnl >= 0 ? 'Position closed' : 'Closed at a loss',
        },
        message: `${symbol} · ${modeLabel} · ${sign}${pnlText}`,
      };
  }
}

function formatFeedAge(seconds) {
  if (!Number.isFinite(seconds)) return 'Waiting for first update';
  if (seconds < 1) return 'Just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder ? `${minutes}m ${remainder}s ago` : `${minutes}m ago`;
}

function formatLocalFeedTime(timestamp) {
  if (!Number.isFinite(Number(timestamp))) return 'Waiting for first update';
  return new Date(Number(timestamp)).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function ChartBottomBar({
  chartTheme,
  visibleLiveStatus,
  browserOnline,
  liveFeedInfo,
  isLiveFeedDelayed,
  liveFeedAgeSeconds,
  latestCandleStartedAt,
  exchange,
  marketCategory,
  timezone,
  timezoneOptions,
  timezoneSaving,
  onTimezoneChange,
}) {
  const [clock, setClock] = useState(() => Date.now());
  const timezoneTooltip = useAnchoredTooltip('right');

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const clockLabel = useMemo(() => {
    try {
      return new Intl.DateTimeFormat(undefined, {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).format(clock);
    } catch {
      return new Date(clock).toLocaleTimeString();
    }
  }, [clock, timezone]);
  const isDark = chartTheme.mode === 'dark';

  return (
    <div
      data-chart-ui="chart-bottom-bar"
      className="relative z-40 flex h-7 shrink-0 items-center justify-between gap-2 border-t px-2 text-[10px]"
      style={{
        borderColor: chartTheme.border,
        backgroundColor: chartTheme.panel,
        color: chartTheme.text,
      }}
    >
      <div className="group relative flex min-w-0 items-center">
        <button
          type="button"
          className={`flex h-5 items-center gap-1.5 rounded px-1.5 font-semibold outline-none transition ${
            isDark ? 'hover:bg-white/10 focus:bg-white/10' : 'hover:bg-slate-100 focus:bg-slate-100'
          }`}
          aria-label={`${visibleLiveStatus.label}. Show market feed details.`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${
            visibleLiveStatus.key === 'replay' ? 'bg-violet-500'
              : visibleLiveStatus.key === 'offline' ? 'bg-red-500'
                : visibleLiveStatus.key === 'live' ? 'bg-emerald-500'
                  : visibleLiveStatus.key === 'polling' ? 'bg-sky-500'
                    : 'animate-pulse bg-amber-400'
          }`} />
          <span className="whitespace-nowrap">Market feed: {visibleLiveStatus.label}</span>
        </button>
        <div
          role="tooltip"
          className={`pointer-events-none absolute bottom-full left-0 mb-2 w-72 translate-y-1 rounded-lg border p-3 text-xs opacity-0 shadow-2xl transition group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100 ${
            isDark ? 'border-[#363a45] bg-[#1e222d] text-[#d1d4dc]' : 'border-slate-200 bg-white text-slate-800'
          }`}
        >
          <div className="mb-2 flex items-center justify-between gap-3 border-b border-current/10 pb-2">
            <span className="font-bold">Market feed</span>
            <span className={`font-semibold ${isLiveFeedDelayed ? 'text-amber-500' : browserOnline ? 'text-emerald-500' : 'text-red-500'}`}>
              {visibleLiveStatus.label}
            </span>
          </div>
          <dl className="space-y-1.5">
            <div className="flex justify-between gap-4"><dt className="text-[#787b86]">Internet</dt><dd className="text-right font-semibold">{browserOnline ? 'Online' : 'Offline'}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-[#787b86]">Feed</dt><dd className="text-right font-semibold">{liveFeedInfo.source === 'websocket' ? 'WebSocket' : liveFeedInfo.source === 'rest' ? 'REST fallback' : 'Waiting for first update'}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-[#787b86]">Market</dt><dd className="text-right font-semibold">{exchange.toUpperCase()} · {marketCategory === 'spot' ? 'Spot' : 'Futures'}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-[#787b86]">Last update</dt><dd className="max-w-[165px] text-right font-semibold">{formatLocalFeedTime(liveFeedInfo.receivedAt)}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-[#787b86]">Chart delay</dt><dd className={`text-right font-semibold ${isLiveFeedDelayed ? 'text-amber-500' : ''}`}>{formatFeedAge(liveFeedAgeSeconds)}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-[#787b86]">Candle started</dt><dd className="max-w-[165px] text-right font-semibold">{formatLocalFeedTime(latestCandleStartedAt)}</dd></div>
          </dl>
        </div>
      </div>

      <div className="flex min-w-0 items-center gap-1.5">
        <span className="hidden whitespace-nowrap tabular-nums sm:inline">{clockLabel}</span>
        <select
          ref={timezoneTooltip.anchorRef}
          value={timezone}
          onChange={(event) => onTimezoneChange(event.target.value)}
          onMouseEnter={timezoneTooltip.show}
          onMouseLeave={timezoneTooltip.hide}
          onFocus={timezoneTooltip.show}
          onBlur={timezoneTooltip.hide}
          disabled={timezoneSaving}
          className={`h-5 max-w-[148px] rounded border px-1 text-[10px] outline-none disabled:opacity-60 ${
            isDark ? 'border-[#363a45] bg-[#0f1115] text-[#d1d4dc]' : 'border-slate-300 bg-white text-slate-700'
          }`}
          aria-label="Chart timezone"
        >
          {timezoneOptions.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <AnchoredTooltipPortal pos={timezoneTooltip.pos} label="Chart timezone" isDark={isDark} />
      </div>
    </div>
  );
}

function estimatePositionNetPnl(position, exitPrice, feeRate = 0.0004) {
  const entryPrice = Number(position?.entryPrice);
  const quantity = Number(position?.quantity);
  const exit = Number(exitPrice);
  const entryFee = Number(position?.entryFee ?? 0);
  const normalizedFeeRate = Number.isFinite(Number(feeRate)) ? Number(feeRate) : 0.0004;

  if (
    !Number.isFinite(entryPrice)
    || !Number.isFinite(quantity)
    || quantity <= 0
    || !Number.isFinite(exit)
  ) {
    return null;
  }

  const grossPnl = position.side === 'short'
    ? (entryPrice - exit) * quantity
    : (exit - entryPrice) * quantity;
  const exitFee = Math.abs(exit * quantity) * normalizedFeeRate;

  return grossPnl - (Number.isFinite(entryFee) ? entryFee : 0) - exitFee;
}

function getMaxBacktestMarginForCash(cashBalance, leverage = 1, feeRate = 0.0004) {
  const cash = Number(cashBalance);
  const leverageValue = Number(leverage);
  const feeRateValue = Number(feeRate);

  if (!Number.isFinite(cash) || cash <= 0 || !Number.isFinite(leverageValue) || leverageValue <= 0) {
    return null;
  }

  return cash / (1 + (leverageValue * (Number.isFinite(feeRateValue) ? feeRateValue : 0.0004)));
}

function loadImageFromUrl(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = url;
  });
}

function canvasToBlob(canvas) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/png', 0.92);
  });
}

async function captureChartSnapshot(wrapper, backgroundColor = CHART_THEMES.dark.background) {
  if (!wrapper || typeof window === 'undefined') return null;

  const bounds = wrapper.getBoundingClientRect();
  const width = Math.max(Math.round(bounds.width), 1);
  const height = Math.max(Math.round(bounds.height), 1);
  const scale = Math.min(window.devicePixelRatio || 1, 2);
  const output = document.createElement('canvas');
  const context = output.getContext('2d');

  if (!context) return null;

  output.width = Math.round(width * scale);
  output.height = Math.round(height * scale);
  output.style.width = `${width}px`;
  output.style.height = `${height}px`;
  context.scale(scale, scale);
  context.fillStyle = backgroundColor;
  context.fillRect(0, 0, width, height);

  const canvases = Array.from(wrapper.querySelectorAll('canvas'));
  canvases.forEach((canvas) => {
    const rect = canvas.getBoundingClientRect();
    context.drawImage(canvas, rect.left - bounds.left, rect.top - bounds.top, rect.width, rect.height);
  });

  const svgs = Array.from(wrapper.querySelectorAll('svg'));
  for (const svg of svgs) {
    const rect = svg.getBoundingClientRect();
    const serialized = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([serialized], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    try {
      const image = await loadImageFromUrl(url);
      context.drawImage(image, rect.left - bounds.left, rect.top - bounds.top, rect.width, rect.height);
    } catch {
      // Snapshot should still save the chart canvas if SVG overlay serialization fails.
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  return canvasToBlob(output);
}

// Rendered once per price alert inside a .map() below, so its tooltip needs
// its own useAnchoredTooltip() instance per row (can't call the hook directly
// in the .map() callback — that would vary the hook count between renders as
// alerts are added/removed). Not built on IconTooltipButton: this button is
// absolute-positioned by the chart to sit at a specific price coordinate,
// and IconTooltipButton's wrapping <span> would become the new positioning
// context for an absolute child, moving it away from its intended spot —
// same reason the sibling "Create order"/"Set alert" overlay buttons above
// use manual wiring instead of IconTooltipButton.
function CancelAlertButton({ top, label, isDark, onClick }) {
  const { anchorRef, pos, show, hide } = useAnchoredTooltip();
  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        data-chart-ui="alert-line-cancel"
        onClick={onClick}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        className="absolute left-9 z-20 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white shadow hover:bg-red-400"
        style={{ top }}
        aria-label={label}
      >
        <X size={12}/>
      </button>
      <AnchoredTooltipPortal pos={pos} label={label} isDark={isDark} />
    </>
  );
}

export default function MarketReplayChart({
  initialSymbol = 'BTCUSDT',
  initialExchange = 'bingx',
  initialMarketCategory = 'linear',
  initialTimeframe = '15m',
  onBacktestAccountChange = null,
  tourCompleted = false,
  onTourComplete = null,
}) {
  const { theme: adminTheme } = useTheme();
  const { confirm, confirmElement } = useConfirm();
  const { handleToast } = useToast();
  const { auth: pageAuth } = usePage().props;
  const authContext = useAuth();
  const auth = authContext?.auth ?? pageAuth;
  const updateAuth = authContext?.updateAuth;
  const preferenceUserId = auth?.user?.id ?? 'guest';
  const toolSettingsStorageKey = `market-tool-settings:${preferenceUserId}`;
  const indicatorStorageKey = `market-chart-indicators:${preferenceUserId}`;
  const candleColorsStorageKey = `market-chart-candle-colors:${preferenceUserId}`;
  const candleSizeStorageKey = `market-chart-candle-size:${preferenceUserId}`;
  const chartTheme = useMemo(() => resolveChartTheme(adminTheme), [adminTheme]);
  const createOrderTooltip = useAnchoredTooltip('right');
  const setAlertTooltip = useAnchoredTooltip('right');
  const restartTourTooltip = useAnchoredTooltip('left');
  const wrapperRef = useRef(null);
  const fullscreenRef = useRef(null);
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const candleSeriesRef = useRef(null);
  const volumeSeriesRef = useRef(null);
  const smaSeriesRef = useRef(null);
  const emaSeriesRef = useRef(null);
  const rsiSeriesRef = useRef(null);
  const macdSeriesRef = useRef(null);
  const macdSignalSeriesRef = useRef(null);
  const macdHistogramSeriesRef = useRef(null);
  const alertPriceLinesRef = useRef(new Map());
  const indicatorsRef = useRef({});
  const allCandlesRef = useRef([]);
  const visibleCandlesRef = useRef([]);
  const resizeObserverRef = useRef(null);
  const applyIndicatorPaneHeightsRef = useRef(() => {});
  const replayTimerRef = useRef(null);
  const isProgrammaticRangeChangeRef = useRef(false);
  const selectedPriceLineRef = useRef(null);
  const previousClosePriceLineRef = useRef(null);
  const highPriceLineRef = useRef(null);
  const lowPriceLineRef = useRef(null);
  const selectedReplayPriceRef = useRef(null);
  const replayModeRef = useRef(false);
  const symbolRef = useRef(initialSymbol);
  const backtestAccountRef = useRef(null);
  const fetchRequestIdRef = useRef(0);
  const candleCacheRef = useRef(new Map());
  const candleFetchAbortRef = useRef(null);
  const symbolPersistIdRef = useRef(0);
  const loadSymbolsRequestIdRef = useRef(0);
  // Seeded with the initial (possibly restored) symbol rather than null: loadMarketSymbols()
  // treats a key match here as "the user meant this one, don't second-guess it" — a symbol
  // restored from a saved account preference deserves exactly that same trust as one just
  // picked from the search/watchlist, even though it isn't itself on the saved-symbols list.
  const justSwitchedSymbolKeyRef = useRef(`${initialExchange}:${initialMarketCategory}:${initialSymbol}`);
  const timeframePrefetchCancelRef = useRef(null);
  const isSpacePressedRef = useRef(false);
  const toolRef = useRef(null);
  const drawingColorRef = useRef(DRAWING_COLOR);
  const tempDrawingRef = useRef(null);
  const drawingsRef = useRef([]);
  const selectedDrawingIdRef = useRef(null);
  const dragDrawingRef = useRef(null);
  const resizeDrawingRef = useRef(null);
  const dragBacktestOrderRef = useRef(null);
  const isReplayPricePickActiveRef = useRef(false);
  const isTouchInputRef = useRef(false);
  const isNarrowChartRef = useRef(false);
  const overlayRenderFrameRef = useRef(null);
  const isViewportDraggingRef = useRef(false);
  const viewportDragFrameRef = useRef(null);
  const autoClosedPositionRef = useRef(new Set());
  const autoTriggeredPositionRef = useRef(new Set());
  const pendingManagedPositionRef = useRef(new Set());
  const lastMonitoredReplayIndexRef = useRef(null);
  const pendingVisibleLogicalRangeRef = useRef(null);
  const pendingVisibleViewRef = useRef(null);
  const pendingBackToLiveRef = useRef(false);
  const previousVisibleCandleCountRef = useRef(0);
  const viewportInitializedKeyRef = useRef(null);
  const quickOpenBacktestPositionRef = useRef(null);
  const cancelBacktestPositionRef = useRef(null);
  const triggerBacktestPositionRef = useRef(null);
  const closeBacktestPositionRef = useRef(null);
  const drawingUndoStackRef = useRef([]);
  const drawingSaveQueueRef = useRef(Promise.resolve());
  const drawingSaveVersionRef = useRef(0);
  const restoredReplayProgressKeyRef = useRef(null);
  const latestReplayProgressRef = useRef(null);
  const replayAccessRequestRef = useRef(null);
  const historyReadyKeyRef = useRef(null);
  const timeframeTransitionKeyRef = useRef(null);
  const pendingLiveCandlesRef = useRef([]);
  const alertCheckInFlightRef = useRef(false);

  const [symbol, setSymbol] = useState(initialSymbol);
  const [exchange, setExchange] = useState(initialExchange);
  const [marketCategory, setMarketCategory] = useState(initialMarketCategory);
  const [candleColors, setCandleColors] = useState(() => {
    if (typeof window === 'undefined') {
      return DEFAULT_CANDLE_COLORS;
    }

    try {
      const stored = JSON.parse(localStorage.getItem(candleColorsStorageKey) || '{}');

      return {
        up: stored.up || DEFAULT_CANDLE_COLORS.up,
        down: stored.down || DEFAULT_CANDLE_COLORS.down,
      };
    } catch {
      return DEFAULT_CANDLE_COLORS;
    }
  });
  const [candleSize, setCandleSize] = useState(() => {
    if (typeof window === 'undefined') {
      return DEFAULT_CANDLE_SIZE;
    }

    const storedValue = localStorage.getItem(candleSizeStorageKey);
    const stored = storedValue == null ? Number.NaN : Number(storedValue);

    return Number.isFinite(stored)
      ? Math.min(Math.max(stored, MIN_CANDLE_SIZE), MAX_CANDLE_SIZE)
      : DEFAULT_CANDLE_SIZE;
  });
  const [indicators, setIndicators] = useState(() => {
    try { return { volume: true, volumeVisible: true, volumeSize: 20, sma: false, smaVisible: true, smaPeriod: 20, smaColor: '#2dd4bf', smaLineWidth: 2, ema: false, emaVisible: true, emaPeriod: 20, emaColor: '#f59e0b', emaLineWidth: 2, rsi: false, rsiVisible: true, rsiPeriod: 14, rsiSize: 25, rsiColor: '#a855f7', rsiLineWidth: 2, macd: false, macdVisible: true, macdFastPeriod: 12, macdSlowPeriod: 26, macdSignalPeriod: 9, macdSize: 25, macdColor: '#2dd4bf', macdSignalColor: '#f59e0b', macdUpColor: '#26a69a', macdDownColor: '#ef5350', macdLineWidth: 2, ...JSON.parse(localStorage.getItem(indicatorStorageKey) || '{}') }; }
    catch { return { volume: true, volumeVisible: true, volumeSize: 20, sma: false, smaVisible: true, smaPeriod: 20, smaColor: '#2dd4bf', smaLineWidth: 2, ema: false, emaVisible: true, emaPeriod: 20, emaColor: '#f59e0b', emaLineWidth: 2, rsi: false, rsiVisible: true, rsiPeriod: 14, rsiSize: 25, rsiColor: '#a855f7', rsiLineWidth: 2, macd: false, macdVisible: true, macdFastPeriod: 12, macdSlowPeriod: 26, macdSignalPeriod: 9, macdSize: 25, macdColor: '#2dd4bf', macdSignalColor: '#f59e0b', macdUpColor: '#26a69a', macdDownColor: '#ef5350', macdLineWidth: 2 }; }
  });
  const [selectedIndicator, setSelectedIndicator] = useState(null);
  const [expandedIndicator, setExpandedIndicator] = useState(null);
  const [indicatorContextMenu, setIndicatorContextMenu] = useState(null);
  const [allDrawingsLocked, setAllDrawingsLocked] = useState(false);
  const allDrawingsLockedRef = useRef(false);
  const [hiddenLayers, setHiddenLayers] = useState({ drawings: false, indicators: false, positions: false });
  const [symbols, setSymbols] = useState([]);
  const [availableSymbols, setAvailableSymbols] = useState([]);
  const [symbolError, setSymbolError] = useState('');
  const [isSavingSymbol, setIsSavingSymbol] = useState(false);
  const [isLoadingAvailableSymbols, setIsLoadingAvailableSymbols] = useState(false);
  const [timeframe, setTimeframe] = useState(initialTimeframe);
  const timeframeOptions = useMemo(() => supportedTimeframes(exchange), [exchange]);

  const [allCandles, setAllCandles] = useState([]);
  const [loadedTimeframe, setLoadedTimeframe] = useState(initialTimeframe);
  const [hoveredLegendCandle, setHoveredLegendCandle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showTimeframeLoadingHint, setShowTimeframeLoadingHint] = useState(false);

  const [replayMode, setReplayMode] = useState(false);
  const [replayIndex, setReplayIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1000);
  const [followReplay, setFollowReplay] = useState(true);

  const [selectedReplayPrice, setSelectedReplayPrice] = useState(null);
  const [savedReplayProgress, setSavedReplayProgress] = useState(null);
  const [replayProgressLoadedKey, setReplayProgressLoadedKey] = useState(null);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [isReplayPricePickActive, setIsReplayPricePickActive] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isFullscreenEntryPanelOpen, setIsFullscreenEntryPanelOpen] = useState(false);
  const [priceAlerts, setPriceAlerts] = useState([]);
  const [alertModalOpen, setAlertModalOpen] = useState(false);
  const [showClearDrawingsConfirm, setShowClearDrawingsConfirm] = useState(false);
  const [alertSoundEnabled, setAlertSoundEnabled] = useState(true);
  const [alertDraft, setAlertDraft] = useState({ price: '', type: 'rise' });
  const [alertError, setAlertError] = useState('');
  const [alertNotice, setAlertNotice] = useState('');
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  const [replayAccessAllowed, setReplayAccessAllowed] = useState(null);
  const [replayAccessStatus, setReplayAccessStatus] = useState('idle');
  const [replayAccessError, setReplayAccessError] = useState('');
  const [liveConnectionStatus, setLiveConnectionStatus] = useState('connecting');
  const [liveFeedInfo, setLiveFeedInfo] = useState({ source: null, receivedAt: null });
  const [browserOnline, setBrowserOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine);
  const [feedStatusClock, setFeedStatusClock] = useState(() => Date.now());
  const [timezone, setTimezone] = useState(() => (
    auth?.user?.timezone
    || Intl.DateTimeFormat().resolvedOptions().timeZone
    || 'UTC'
  ));
  const [timezoneSaving, setTimezoneSaving] = useState(false);
  const timezoneOptions = useMemo(() => {
    let supported = [];
    try {
      supported = typeof Intl.supportedValuesOf === 'function'
        ? Intl.supportedValuesOf('timeZone')
        : [];
    } catch {}

    return Array.from(new Set([timezone, 'UTC', ...supported])).sort();
  }, [timezone]);
  const replayAccessAllowedRef = useRef(false);
  const [tourStep, setTourStep] = useState(() => new URLSearchParams(window.location.search).get('tour') === '1' || !tourCompleted ? 0 : -1);
  const tourSteps = [
    {selector:'[data-tour="market"]',title:'Choose your market',description:'Select a symbol and choose Spot or Futures.'},
    {selector:'[data-tour="timeframe"]',title:'Set the timeframe',description:'Choose the candle interval for your analysis.'},
    {selector:'[data-tour="drawings"]',title:'Draw on the chart',description:'Open the drawing rail for lines, positions, notes, and other tools.'},
    {selector:'[data-tour="replay"]',title:'Replay history',description:'Start Replay, then choose a historical candle.'},
    {selector:'[data-tour="position"]',title:'Practice execution',description:'Enter Position opens the simulated-order controls.'},
    {selector:'[data-tour="appearance"]',title:'Customize the chart',description:'Open the chart settings menu for candle colors, price lines, and more.'},
  ];
  const finishTour = () => { setTourStep(-1); onTourComplete?.(); axios.post('/chart-tour/complete').catch(() => setTourStep(0)); };

  useEffect(() => {
    if (auth?.user?.timezone) {
      setTimezone(auth.user.timezone);
    }
  }, [auth?.user?.timezone]);

  const handleTimezoneChange = useCallback(async (nextTimezone) => {
    if (!nextTimezone || nextTimezone === timezone || timezoneSaving) return;

    const previousTimezone = timezone;
    setTimezone(nextTimezone);
    setTimezoneSaving(true);

    try {
      const response = await axios.patch('/profile/timezone', {
        timezone: nextTimezone,
      });
      const savedTimezone = response.data?.timezone ?? nextTimezone;
      setTimezone(savedTimezone);
      updateAuth?.({
        ...auth,
        user: {
          ...auth?.user,
          timezone: savedTimezone,
        },
      });
    } catch {
      setTimezone(previousTimezone);
    } finally {
      setTimezoneSaving(false);
    }
  }, [auth, timezone, timezoneSaving, updateAuth]);

  const [tool, setTool] = useState(null);
  const [drawingColor, setDrawingColor] = useState(DRAWING_COLOR);
  const [drawings, setDrawings] = useState([]);
  const [drawingSaveStatus, setDrawingSaveStatus] = useState('saved');
  const [tempDrawing, setTempDrawing] = useState(null);
  const [selectedDrawingId, setSelectedDrawingId] = useState(null);
  const [hoveredPositionDrawingId, setHoveredPositionDrawingId] = useState(null);
  const [isHoveringBacktestOrderCancel, setIsHoveringBacktestOrderCancel] = useState(false);
  const [toolSettings, setToolSettings] = useState({});
  const [backtestAccount, setBacktestAccount] = useState(null);
  const [isBacktestLoading, setIsBacktestLoading] = useState(false);
  const [backtestError, setBacktestError] = useState('');
  const [backtestOrderDraft, setBacktestOrderDraft] = useState(null);
  const [orderLineDraftPatch, setOrderLineDraftPatch] = useState(null);
  const [chartOrderAction, setChartOrderAction] = useState(null);
  const [chartOrderRequest, setChartOrderRequest] = useState(null);
  const [chartContextMenu, setChartContextMenu] = useState(null);
  const chartContextMenuRef = useRef(null);
  const chartContextMenuFirstItemRef = useRef(null);
  const indicatorContextMenuRef = useRef(null);
  const indicatorContextMenuFirstItemRef = useRef(null);
  const [orderDraftClearRequest, setOrderDraftClearRequest] = useState(null);
  const [overlaySize, setOverlaySize] = useState({ width: 0, height: CHART_HEIGHT });
  const [overlayRenderVersion, setOverlayRenderVersion] = useState(0);

  const [textInput, setTextInput] = useState(null);
  const [textDraft, setTextDraft] = useState('');

  const scheduleOverlayRender = useCallback(() => {
    if (overlayRenderFrameRef.current) return;

    overlayRenderFrameRef.current = requestAnimationFrame(() => {
      overlayRenderFrameRef.current = null;
      setOverlayRenderVersion((version) => version + 1);
    });
  }, []);

  const visibleCandles = useMemo(() => {
    if (!replayMode) return allCandles;
    return allCandles.slice(0, replayIndex + 1);
  }, [allCandles, replayMode, replayIndex]);

  const visibleVolume = useMemo(() => {
    return visibleCandles.reduce((volume, c) => {
      const time = Number(c.time);
      const value = Number(c.volume);
      if (!Number.isFinite(time) || !Number.isFinite(value)) return volume;

      volume.push({
        time,
        value,
        color: `${c.close >= c.open ? candleColors.up : candleColors.down}88`,
      });
      return volume;
    }, []);
  }, [candleColors.down, candleColors.up, visibleCandles]);

  useEffect(() => {
    indicatorsRef.current = indicators;
  }, [indicators]);

  useEffect(() => {
    allDrawingsLockedRef.current = allDrawingsLocked;
  }, [allDrawingsLocked]);

  useEffect(() => {
    allCandlesRef.current = allCandles;
  }, [allCandles]);

  useEffect(() => {
    visibleCandlesRef.current = visibleCandles;
  }, [visibleCandles]);

  useEffect(() => {
    symbolRef.current = symbol;
  }, [symbol]);

  useEffect(() => {
    setHoveredLegendCandle(null);
  }, [exchange, marketCategory, symbol, timeframe]);

  useEffect(() => {
    backtestAccountRef.current = backtestAccount;
  }, [backtestAccount]);

  const currentPrice = useMemo(() => {
    if (!visibleCandles.length) return null;
    return visibleCandles[visibleCandles.length - 1].close;
  }, [visibleCandles]);
  const legendCandle = hoveredLegendCandle ?? visibleCandles.at(-1) ?? null;
  const isTimeframeLoading = timeframe !== loadedTimeframe && !error;

  // A timeframe switch during Replay re-fetches up to max_candles=20000 of
  // history (paginated, several sequential exchange requests) and can take
  // well past the couple hundred ms a normal switch needs. The shield below
  // intentionally shows nothing for that common fast case to avoid a flash —
  // but with zero feedback, a slow-but-working replay switch is visually
  // identical to a stuck one. Surface a spinner only once loading has run
  // long enough that it's no longer a fast transition.
  useEffect(() => {
    if (!isTimeframeLoading) {
      setShowTimeframeLoadingHint(false);
      return undefined;
    }
    const timerId = window.setTimeout(() => setShowTimeframeLoadingHint(true), 1500);
    return () => window.clearTimeout(timerId);
  }, [isTimeframeLoading]);

  const latestCandleStartedAt = useMemo(() => {
    const candleTime = Number(visibleCandles.at(-1)?.time);
    return Number.isFinite(candleTime) ? candleTime * 1000 : null;
  }, [visibleCandles]);
  const liveFeedAgeSeconds = liveFeedInfo.receivedAt
    ? Math.max(0, Math.floor((feedStatusClock - liveFeedInfo.receivedAt) / 1000))
    : null;
  const liveFeedDelayThreshold = liveFeedInfo.source === 'websocket'
    ? WEBSOCKET_DELAY_SECONDS
    : Math.max(20, MARKET_DATA_POLL_SECONDS * 2);
  const isLiveFeedDelayed = liveFeedAgeSeconds !== null && liveFeedAgeSeconds >= liveFeedDelayThreshold;
  const visibleLiveStatus = useMemo(() => {
    if (replayMode) return { key: 'replay', label: 'Replay' };
    if (!browserOnline) return { key: 'offline', label: 'Offline' };
    if (liveConnectionStatus === 'connecting') return { key: 'connecting', label: 'Connecting' };
    if (liveConnectionStatus === 'reconnecting') return { key: 'reconnecting', label: 'Reconnecting' };
    if (isLiveFeedDelayed) return { key: 'delayed', label: 'Delayed' };
    if (liveConnectionStatus === 'live') return { key: 'live', label: 'Live' };
    return { key: 'polling', label: 'REST Polling' };
  }, [browserOnline, isLiveFeedDelayed, liveConnectionStatus, replayMode]);
  const currentPriceCoordinate = useMemo(() => {
    const series = candleSeriesRef.current;
    if (!series || !Number.isFinite(Number(currentPrice))) return null;
    const coordinate = series.priceToCoordinate(Number(currentPrice));
    return Number.isFinite(Number(coordinate)) ? Number(coordinate) : null;
  }, [currentPrice, overlayRenderVersion, overlaySize.height]);
  const mainPaneHeight = useMemo(() => {
    const height = Number(chartRef.current?.panes?.()[0]?.getHeight?.());
    return Number.isFinite(height) && height > 0 ? Math.min(height, overlaySize.height) : overlaySize.height;
  }, [overlayRenderVersion, overlaySize.height]);
  const indicatorPaneTops = useMemo(() => {
    const panes = chartRef.current?.panes?.() ?? [];
    const tops = {};
    let paneIndex = 1;
    let top = mainPaneHeight;

    if (indicators.volume && indicators.volumeVisible !== false) {
      tops.volume = top;
      top += panes[paneIndex]?.getHeight?.() ?? 0;
      paneIndex += 1;
    }
    if (indicators.rsi && indicators.rsiVisible !== false) {
      tops.rsi = top;
      top += panes[paneIndex]?.getHeight?.() ?? 0;
      paneIndex += 1;
    }
    if (indicators.macd && indicators.macdVisible !== false) {
      tops.macd = top;
    }

    return tops;
  }, [indicators.volume, indicators.volumeVisible, indicators.macd, indicators.macdVisible, indicators.rsi, indicators.rsiVisible, mainPaneHeight, overlayRenderVersion]);

  const executionCandle = replayMode ? allCandles[replayIndex] : null;
  const executionPrice = executionCandle?.close ?? currentPrice;
  const executionTime = executionCandle?.time ?? null;
  const positionMonitorCandle = replayMode
    ? executionCandle
    : (visibleCandles.length ? visibleCandles[visibleCandles.length - 1] : null);
  const selectedDrawing = useMemo(() => {
    return drawings.find((drawing) => drawing.id === selectedDrawingId) ?? null;
  }, [drawings, selectedDrawingId]);

  useEffect(() => {
    const livePrice = Number(executionPrice);
    if (!Number.isFinite(livePrice)) return;

    setBacktestAccount((currentAccount) => {
      if (!currentAccount) return currentAccount;

      let unrealizedPnl = 0;
      const openPositions = (currentAccount.openPositions ?? []).map((position) => {
        if (position.symbol !== symbol) {
          return { ...position, unrealizedPnl: null };
        }

        const quantity = Number(position.quantity);
        const entryPrice = Number(position.entryPrice);
        const positionPnl = position.side === 'short'
          ? (entryPrice - livePrice) * quantity
          : (livePrice - entryPrice) * quantity;
        unrealizedPnl += Number.isFinite(positionPnl) ? positionPnl : 0;

        return {
          ...position,
          unrealizedPnl: Number.isFinite(positionPnl) ? positionPnl : null,
        };
      });
      const lockedMargin = openPositions.reduce(
        (total, position) => total + (Number(position.margin) || 0),
        0
      );

      return {
        ...currentAccount,
        openPositions,
        lockedMargin,
        unrealizedPnl,
        equity: (Number(currentAccount.cashBalance) || 0) + lockedMargin + unrealizedPnl,
      };
    });
  }, [executionPrice, symbol]);

  useEffect(() => {
    if (backtestAccount && typeof onBacktestAccountChange === 'function') {
      onBacktestAccountChange(backtestAccount);
    }

    if (backtestAccount && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('backtradelab-backtest-account-changed', {
        detail: backtestAccount,
      }));
    }
  }, [backtestAccount, onBacktestAccountChange]);

  useEffect(() => {
    const syncExternalAccountChange = (event) => {
      if (event.detail) setBacktestAccount(event.detail);
    };

    window.addEventListener('backtradelab-backtest-account-external-change', syncExternalAccountChange);
    return () => window.removeEventListener('backtradelab-backtest-account-external-change', syncExternalAccountChange);
  }, []);

  useEffect(() => {
    isSpacePressedRef.current = isSpacePressed;
  }, [isSpacePressed]);

  useEffect(() => {
    replayModeRef.current = replayMode;
    if (replayMode) setReplayAccessStatus('idle');
  }, [replayMode]);

  useEffect(() => {
    toolRef.current = tool;
  }, [tool]);

  useEffect(() => {
    drawingColorRef.current = drawingColor;
  }, [drawingColor]);

  useEffect(() => {
    tempDrawingRef.current = tempDrawing;
  }, [tempDrawing]);

  useEffect(() => {
    drawingsRef.current = drawings;
  }, [drawings]);

  useEffect(() => {
    selectedDrawingIdRef.current = selectedDrawingId;
  }, [selectedDrawingId]);

  useEffect(() => {
    isReplayPricePickActiveRef.current = isReplayPricePickActive;
  }, [isReplayPricePickActive]);

  useEffect(() => {
    if (isReplayPricePickActive) {
      setReplayAccessStatus('pick-candle');
    } else {
      setReplayAccessStatus((status) => status === 'pick-candle' ? 'idle' : status);
    }
  }, [isReplayPricePickActive]);

  useEffect(() => {
    setReplayAccessStatus('idle');
    setReplayAccessError('');
  }, [exchange, marketCategory, symbol, timeframe]);

  useEffect(() => {
    if (timeframeOptions.some((item) => item.value === timeframe)) return;
    setTimeframe(timeframeOptions.find((item) => item.value === '15m')?.value ?? timeframeOptions[0]?.value ?? '1m');
  }, [timeframe, timeframeOptions]);

  useEffect(() => {
    const updateOnlineStatus = () => {
      setBrowserOnline(navigator.onLine);
      setFeedStatusClock(Date.now());
    };
    const clock = window.setInterval(() => setFeedStatusClock(Date.now()), 1000);
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);

    return () => {
      window.clearInterval(clock);
      window.removeEventListener('online', updateOnlineStatus);
      window.removeEventListener('offline', updateOnlineStatus);
    };
  }, []);

  useEffect(() => {
    setLiveFeedInfo({ source: null, receivedAt: null });
    setFeedStatusClock(Date.now());
  }, [exchange, marketCategory, symbol, timeframe]);

  useEffect(() => {
    selectedReplayPriceRef.current = selectedReplayPrice;
  }, [selectedReplayPrice]);

  useEffect(() => {
    replayAccessAllowedRef.current = replayAccessAllowed === true;
  }, [replayAccessAllowed]);

  const requireReplayAccess = useCallback(({ prompt = true, showProgress = false } = {}) => {
    if (replayAccessRequestRef.current) {
      if (showProgress) {
        setReplayAccessStatus('checking-access');
        setReplayAccessError('');
      }
      return replayAccessRequestRef.current.then((allowed) => {
        if (!allowed && prompt) setShowSubscriptionModal(true);
        if (showProgress) setReplayAccessStatus(allowed ? 'pick-candle' : 'idle');
        return allowed;
      });
    }

    if (showProgress) {
      setReplayAccessStatus('checking-access');
      setReplayAccessError('');
    }

    const request = axios.get('/replay-access').then((response) => {
      const allowed = response.data?.allowed === true;
      setReplayAccessAllowed(allowed);
      replayAccessAllowedRef.current = allowed;
      if (!allowed && prompt) setShowSubscriptionModal(true);
      if (showProgress) setReplayAccessStatus(allowed ? 'pick-candle' : 'idle');
      return allowed;
    }).catch((error) => {
      setReplayAccessAllowed(false);
      replayAccessAllowedRef.current = false;
      if (error.response?.status === 402 || error.response?.status === 403) {
        if (prompt) setShowSubscriptionModal(true);
      } else if (showProgress) {
        setReplayAccessError(error.response?.data?.message ?? 'Could not check replay access. Please try again.');
      }
      if (showProgress) setReplayAccessStatus('idle');
      return false;
    }).finally(() => {
      replayAccessRequestRef.current = null;
    });

    replayAccessRequestRef.current = request;
    return request;
  }, []);

  useEffect(() => {
    requireReplayAccess({ prompt: false }).then((allowed) => {
      if (allowed) return;
      setReplayMode(false);
      setIsPlaying(false);
      setIsReplayPricePickActive(false);
      setSelectedReplayPrice(null);
    });
  }, [requireReplayAccess]);

  useEffect(() => {
    const timer = window.setInterval(async () => {
      if (!replayModeRef.current && !isReplayPricePickActiveRef.current) return;
      const allowed = await requireReplayAccess();
      if (allowed) return;
      setReplayMode(false);
      setIsPlaying(false);
      setIsReplayPricePickActive(false);
      setSelectedReplayPrice(null);
    }, 60000);
    return () => window.clearInterval(timer);
  }, [requireReplayAccess]);

  const replayProgressKey = `${exchange}:${marketCategory}:${symbol}`;
  const replayProgressStorageKey = `market-replay-progress:${auth?.user?.id ?? 'guest'}:${replayProgressKey}`;

  useEffect(() => {
    let cancelled = false;
    let localProgress = null;

    setReplayProgressLoadedKey(null);
    restoredReplayProgressKeyRef.current = null;

    try {
      localProgress = JSON.parse(localStorage.getItem(replayProgressStorageKey) ?? 'null');
    } catch {}

    axios.get('/market-replay-progress', {
      params: { symbol, exchange, category: marketCategory },
      headers: { Accept: 'application/json' },
    }).then((response) => {
      if (cancelled) return;
      const serverProgress = response.data?.progress ?? null;
      setSavedReplayProgress(localProgress ?? serverProgress);
      setReplayProgressLoadedKey(replayProgressKey);

      if (localProgress?.replay_time) {
        const serverProgressPayload = {
          ...localProgress,
          client_saved_at: Number(localProgress.saved_at ?? Date.now()),
        };
        delete serverProgressPayload.saved_at;
        axios.put('/market-replay-progress', serverProgressPayload).catch(() => {});
      }
    }).catch(() => {
      if (cancelled) return;
      setSavedReplayProgress(localProgress);
      setReplayProgressLoadedKey(replayProgressKey);
    });

    return () => {
      cancelled = true;
    };
  }, [exchange, marketCategory, replayProgressKey, replayProgressStorageKey, symbol]);

  useEffect(() => {
    if (!replayMode || replayProgressLoadedKey !== replayProgressKey) return undefined;

    const replayTime = allCandles[replayIndex]?.time;
    if (!Number.isFinite(Number(replayTime))) return undefined;

    const progress = {
      symbol,
      exchange,
      category: marketCategory,
      timeframe,
      replay_time: Number(replayTime),
      selected_price: selectedReplayPrice,
      saved_at: Date.now(),
    };

    latestReplayProgressRef.current = progress;
    try {
      localStorage.setItem(replayProgressStorageKey, JSON.stringify(progress));
    } catch {}

    const timeout = setTimeout(() => {
      const serverProgress = { ...progress, client_saved_at: progress.saved_at };
      delete serverProgress.saved_at;
      axios.put('/market-replay-progress', serverProgress).catch(() => {});
    }, 500);

    return () => clearTimeout(timeout);
  }, [allCandles, exchange, marketCategory, replayIndex, replayMode, replayProgressKey, replayProgressLoadedKey, replayProgressStorageKey, selectedReplayPrice, symbol, timeframe]);

  useEffect(() => {
    const flushReplayProgress = (keepalive = false) => {
      const progress = latestReplayProgressRef.current;
      if (!progress) return;

      const serverProgress = { ...progress, client_saved_at: progress.saved_at };
      delete serverProgress.saved_at;

      if (keepalive) {
        // Same self-healing token axios sends automatically elsewhere (see
        // handleAddSymbol) — this is a raw fetch (axios doesn't support
        // keepalive), so the XSRF-TOKEN cookie is read and decoded by hand
        // instead of reading the static <meta> tag, which goes stale for
        // the rest of the session after any session()->regenerate() (login).
        const xsrfCookie = document.cookie
          .split('; ')
          .find((row) => row.startsWith('XSRF-TOKEN='))
          ?.split('=')[1];
        fetch('/market-replay-progress', {
          method: 'PUT',
          keepalive: true,
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'X-XSRF-TOKEN': xsrfCookie ? decodeURIComponent(xsrfCookie) : '',
            'X-Requested-With': 'XMLHttpRequest',
          },
          body: JSON.stringify(serverProgress),
        }).catch(() => {});
        return;
      }

      axios.put('/market-replay-progress', serverProgress).catch(() => {});
    };

    const handlePageHide = () => flushReplayProgress(true);
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      flushReplayProgress();
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(candleColorsStorageKey, JSON.stringify(candleColors));
  }, [candleColors, candleColorsStorageKey]);

  useEffect(() => {
    localStorage.setItem(candleSizeStorageKey, String(candleSize));
  }, [candleSize, candleSizeStorageKey]);

  useEffect(() => {
    if (!isFullscreen || typeof document === 'undefined') return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    scheduleOverlayRender();

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isFullscreen, scheduleOverlayRender]);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const updateSize = () => {
      if (!wrapper.isConnected) return;
      const rect = wrapper.getBoundingClientRect();
      setOverlaySize({
        width: Math.floor(rect.width),
        height: Math.floor(rect.height || CHART_HEIGHT),
      });
      scheduleOverlayRender();
    };

    updateSize();

    const observer = new ResizeObserver(updateSize);
    observer.observe(wrapper);

    return () => observer.disconnect();
  }, [scheduleOverlayRender]);

  const loadMarketSymbols = useCallback(async () => {
    const requestId = loadSymbolsRequestIdRef.current + 1;
    loadSymbolsRequestIdRef.current = requestId;

    try {
      const response = await fetch('/market-symbols', {
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();
      const nextSymbols = Array.isArray(result.symbols) ? result.symbols : [];

      setSymbols(nextSymbols);

      // A newer call (a symbol switch that happened while this one was still
      // in flight) already resolved the current symbol/exchange — applying
      // this stale response's fallback correction below would silently snap
      // the chart back to whatever this older request's closure captured.
      if (loadSymbolsRequestIdRef.current !== requestId) return;

      if (nextSymbols.length) {
        const currentKey = `${exchange}:${marketCategory}:${symbol}`;
        const currentExists = nextSymbols.some((item) => (
          item.symbol === symbol
          && (item.exchange ?? 'bybit') === exchange
          && (item.category ?? 'spot') === marketCategory
        ));
        // The active symbol may be one the user just deliberately picked from
        // the search/watchlist (handleSymbolChange) and hasn't finished saving
        // yet — or failed to save at all. That's not the "restore landed on a
        // deleted symbol" case this fallback exists for, so don't snap it back
        // just because it isn't in the saved list (yet, or ever).
        const wasDeliberateSwitch = justSwitchedSymbolKeyRef.current === currentKey;
        const fallbackForCategory = nextSymbols.find((item) => (item.category ?? 'spot') === marketCategory);
        const fallbackSymbol = currentExists || wasDeliberateSwitch
          ? null
          : fallbackForCategory;

        if (fallbackSymbol) {
          setSymbol(fallbackSymbol.symbol);
          setExchange(fallbackSymbol.exchange ?? 'bybit');
        }
      }
      setSymbolError('');
    } catch (err) {
      if (loadSymbolsRequestIdRef.current !== requestId) return;
      setSymbolError(err.message || 'Failed to load symbols');
    }
  }, [exchange, marketCategory, symbol]);

  const hasDispatchedInitialSymbolRef = useRef(false);

  // Tells whoever's listening (Dashboard.jsx, the navbars) that the chart itself now shows a
  // different market/timeframe than before — the `origin: 'chart'` marker lets Dashboard.jsx
  // persist this without also remounting the chart via its chartKey, which it must still do
  // for a symbol switch that came from outside the chart (e.g. the nav search). Skips the
  // initial mount: that render is just echoing the initial* props back, not a real change.
  useEffect(() => {
    if (!hasDispatchedInitialSymbolRef.current) {
      hasDispatchedInitialSymbolRef.current = true;
      return;
    }

    window.dispatchEvent(new CustomEvent('backtradelab-active-symbol-change', {
      detail: { symbol, exchange, category: marketCategory, timeframe, origin: 'chart' },
    }));
  }, [symbol, exchange, marketCategory, timeframe]);

  const lastAutoBacktestAccountKeyRef = useRef(null);

  const loadBacktestAccount = useCallback(async (price = null) => {
    // symbol/exchange/marketCategory/timeframe can each settle via separate,
    // near-simultaneous state updates while saved-symbol restoration resolves
    // on mount, giving this useCallback two distinct identities within
    // milliseconds even though both land on the same final param tuple — the
    // effect below then fires this fetch twice back to back. Only dedupe the
    // parameterless auto-reload path; an explicit price refresh (after an
    // order fills) must always go through.
    const autoKey = price === null ? `${symbol}|${exchange}|${marketCategory}|${timeframe}` : null;
    if (autoKey && lastAutoBacktestAccountKeyRef.current === autoKey) return;
    if (autoKey) lastAutoBacktestAccountKeyRef.current = autoKey;

    setIsBacktestLoading(true);
    setBacktestError('');
    const accountPrice = Number(price);

    try {
      const response = await axios.get('/market-backtest/account', {
        params: {
          symbol,
          exchange,
          category: marketCategory,
          timeframe,
          ...(Number.isFinite(accountPrice) && accountPrice > 0 ? { price: accountPrice } : {}),
        },
        headers: { Accept: 'application/json' },
      });

      setBacktestAccount(response.data?.account ?? null);
    } catch (err) {
      setBacktestError(err.response?.data?.message ?? err.message ?? 'Failed to load backtest account');
    } finally {
      setIsBacktestLoading(false);
    }
  }, [exchange, marketCategory, symbol, timeframe]);

  useEffect(() => {
    loadBacktestAccount();
  }, [loadBacktestAccount]);

  useEffect(() => {
    loadMarketSymbols();
  }, [loadMarketSymbols]);

  useEffect(() => subscribeToChange('backtradelab-symbols-changed', () => loadMarketSymbols()), [loadMarketSymbols]);

  useEffect(() => {
    let cancelled = false;

    const loadAvailableSymbols = async () => {
      setIsLoadingAvailableSymbols(true);

      try {
        const response = await fetch(`/api/market-symbol-options?category=${marketCategory}`, {
          headers: { Accept: 'application/json' },
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const result = await response.json();

        if (!result.success) {
          throw new Error(result.message || 'Failed to load available symbols');
        }

        if (!cancelled) {
          const nextSymbols = Array.isArray(result.symbols) ? result.symbols : [];
          setAvailableSymbols(nextSymbols);
        }
      } catch (err) {
        if (!cancelled) {
          setSymbolError(err.message || 'Failed to load available symbols');
        }
      } finally {
        if (!cancelled) {
          setIsLoadingAvailableSymbols(false);
        }
      }
    };

    loadAvailableSymbols();

    return () => {
      cancelled = true;
    };
  }, [marketCategory]);

  const buildToolSettingsFromDrawing = useCallback((drawing) => {
    if (!drawing?.type) return {};

    const settings = {};

    if (drawing.color) {
      settings.color = drawing.color;
    }

    if (Number.isFinite(Number(drawing.strokeWidth))) {
      settings.strokeWidth = Number(drawing.strokeWidth);
    }

    if (drawing.lineStyle) {
      settings.lineStyle = drawing.lineStyle;
    }

    if (typeof drawing.textBold === 'boolean') {
      settings.textBold = drawing.textBold;
    }

    if (typeof drawing.textItalic === 'boolean') {
      settings.textItalic = drawing.textItalic;
    }

    if (Number.isFinite(Number(drawing.textSize))) {
      settings.textSize = Number(drawing.textSize);
    }

    if (typeof drawing.labelText === 'string') {
      settings.labelText = drawing.labelText;
    }

    if (TEXT_MARKER_TYPES.includes(drawing.type) && typeof drawing.text === 'string') {
      settings.labelText = drawing.text;
    }

    if (drawing.labelVertical) {
      settings.labelVertical = drawing.labelVertical;
    }

    if (drawing.labelHorizontal) {
      settings.labelHorizontal = drawing.labelHorizontal;
    }

    return settings;
  }, []);

  const persistToolSettings = useCallback((nextSettings) => {
    try {
      localStorage.setItem(toolSettingsStorageKey, JSON.stringify(nextSettings));
    } catch {}

    axios.put('/market-tool-settings', {
      settings: nextSettings,
    }).catch(() => {});
  }, [toolSettingsStorageKey]);

  const saveToolSettingsForType = useCallback((type, updates) => {
    if (!type || !updates || !Object.keys(updates).length) return;

    setToolSettings((currentSettings) => {
      const nextSettings = {
        ...currentSettings,
        [type]: {
          ...(currentSettings[type] ?? {}),
          ...updates,
        },
      };

      persistToolSettings(nextSettings);
      return nextSettings;
    });
  }, [persistToolSettings]);

  const getToolSettingsForType = useCallback((type) => {
    return toolSettings[type] ?? {};
  }, [toolSettings]);

  const chartDisplay = useMemo(() => {
    const saved = toolSettings.chartDisplay ?? {};
    return {
      candles: { ...DEFAULT_CHART_DISPLAY.candles, ...(saved.candles ?? {}) },
      priceLines: { ...DEFAULT_CHART_DISPLAY.priceLines, ...(saved.priceLines ?? {}) },
      statusLine: { ...DEFAULT_CHART_DISPLAY.statusLine, ...(saved.statusLine ?? {}) },
      scales: { ...DEFAULT_CHART_DISPLAY.scales, ...(saved.scales ?? {}) },
      canvas: { ...DEFAULT_CHART_DISPLAY.canvas, ...(saved.canvas ?? {}) },
    };
  }, [toolSettings.chartDisplay]);

  const updateChartDisplay = useCallback((patch) => {
    saveToolSettingsForType('chartDisplay', {
      candles: { ...chartDisplay.candles, ...(patch.candles ?? {}) },
      priceLines: { ...chartDisplay.priceLines, ...(patch.priceLines ?? {}) },
      statusLine: { ...chartDisplay.statusLine, ...(patch.statusLine ?? {}) },
      scales: { ...chartDisplay.scales, ...(patch.scales ?? {}) },
      canvas: { ...chartDisplay.canvas, ...(patch.canvas ?? {}) },
    });
  }, [chartDisplay, saveToolSettingsForType]);

  const timeframeFavorites = useMemo(() => (
    Array.isArray(toolSettings.timeframeFavorites?.list) ? toolSettings.timeframeFavorites.list : DEFAULT_TIMEFRAME_FAVORITES
  ), [toolSettings.timeframeFavorites]);

  const handleTimeframeFavoritesChange = useCallback((nextList) => {
    saveToolSettingsForType('timeframeFavorites', { list: nextList });
  }, [saveToolSettingsForType]);

  const [isChartSettingsOpen, setIsChartSettingsOpen] = useState(false);
  const [isLegendActive, setIsLegendActive] = useState(false);

  useEffect(() => {
    if (!isLegendActive) return undefined;
    const handleOutsideClick = (event) => {
      if (event.target?.closest?.('[data-chart-ui="market-legend"]')) return;
      setIsLegendActive(false);
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isLegendActive]);

  const getToolPresetsForType = useCallback((type) => {
    return Array.isArray(toolSettings.presets?.[type])
      ? toolSettings.presets[type]
      : [];
  }, [toolSettings]);

  const saveToolPreset = useCallback((type, preset) => {
    if (!type || !preset?.name || !preset?.settings) return;

    setToolSettings((currentSettings) => {
      const currentPresets = Array.isArray(currentSettings.presets?.[type])
        ? currentSettings.presets[type]
        : [];
      const normalizedName = preset.name.trim();
      const nextPreset = {
        id: preset.id ?? `${type}-${Date.now()}`,
        name: normalizedName,
        settings: preset.settings,
      };
      const nextTypePresets = [
        nextPreset,
        ...currentPresets.filter((item) => item.name.toLowerCase() !== normalizedName.toLowerCase()),
      ].slice(0, 20);
      const nextSettings = {
        ...currentSettings,
        presets: {
          ...(currentSettings.presets ?? {}),
          [type]: nextTypePresets,
        },
      };

      persistToolSettings(nextSettings);
      return nextSettings;
    });
  }, [persistToolSettings]);

  const deleteToolPreset = useCallback((type, preset) => {
    if (!type || !preset) return;

    setToolSettings((currentSettings) => {
      const currentPresets = Array.isArray(currentSettings.presets?.[type])
        ? currentSettings.presets[type]
        : [];
      const presetId = preset.id;
      const presetName = preset.name;
      const nextTypePresets = currentPresets.filter((item) => {
        if (presetId) return item.id !== presetId;

        return String(item.name ?? '').toLowerCase() !== String(presetName ?? '').toLowerCase();
      });
      const nextSettings = {
        ...currentSettings,
        presets: {
          ...(currentSettings.presets ?? {}),
          [type]: nextTypePresets,
        },
      };

      persistToolSettings(nextSettings);
      return nextSettings;
    });
  }, [persistToolSettings]);


  useEffect(() => {
    let cancelled = false;

    const loadToolSettings = async () => {
      let localSettings = {};

      try {
        const parsed = JSON.parse(localStorage.getItem(toolSettingsStorageKey) ?? '{}');
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          localSettings = parsed;
        }
      } catch {}

      try {
        const response = await axios.get('/market-tool-settings', {
          headers: { Accept: 'application/json' },
        });
        const serverSettings = response.data?.settings;
        const nextSettings = Array.isArray(serverSettings)
          ? {}
          : serverSettings && typeof serverSettings === 'object'
            ? serverSettings
            : {};

        if (!cancelled) {
          setToolSettings(nextSettings);
          try {
            localStorage.setItem(toolSettingsStorageKey, JSON.stringify(nextSettings));
          } catch {}
        }
      } catch {
        if (!cancelled) {
          setToolSettings(localSettings);
        }
      }
    };

    loadToolSettings();

    return () => {
      cancelled = true;
    };
  }, [toolSettingsStorageKey]);

  const persistDrawingsToServer = useCallback(async (nextDrawings, activeSymbol = symbol) => {
    await axios.put('/market-drawings', {
      symbol: activeSymbol,
      exchange,
      category: marketCategory,
      drawings: nextDrawings,
    });
  }, [exchange, marketCategory, symbol]);

  const saveDrawings = useCallback((nextDrawings) => {
    setDrawings(nextDrawings);
    drawingsRef.current = nextDrawings;
    try {
      localStorage.setItem(buildStorageKey(symbol, exchange, marketCategory, preferenceUserId), JSON.stringify(nextDrawings));
    } catch {}

    const saveVersion = drawingSaveVersionRef.current + 1;
    drawingSaveVersionRef.current = saveVersion;
    setDrawingSaveStatus('saving');

    const queuedSave = drawingSaveQueueRef.current
      .catch(() => {})
      .then(() => persistDrawingsToServer(nextDrawings));

    drawingSaveQueueRef.current = queuedSave;
    queuedSave
      .then(() => {
        if (drawingSaveVersionRef.current === saveVersion) {
          setDrawingSaveStatus('saved');
        }
      })
      .catch(() => {
        if (drawingSaveVersionRef.current === saveVersion) {
          setDrawingSaveStatus('local');
        }
      });
  }, [exchange, marketCategory, persistDrawingsToServer, preferenceUserId, symbol]);

  const getDrawingScope = useCallback(() => {
    return `${exchange}:${marketCategory}:${symbol}`;
  }, [exchange, marketCategory, symbol]);

  const pushDrawingUndoSnapshot = useCallback((selectedId = selectedDrawingIdRef.current) => {
    if (!drawingsRef.current.length) return;

    drawingUndoStackRef.current = [
      ...drawingUndoStackRef.current,
      {
        scope: getDrawingScope(),
        drawings: cloneDrawingsForHistory(drawingsRef.current),
        selectedDrawingId: selectedId,
      },
    ].slice(-MAX_DRAWING_UNDO_STEPS);
  }, [getDrawingScope]);

  const handleUndoDrawings = useCallback(() => {
    const currentScope = getDrawingScope();
    const stack = drawingUndoStackRef.current;
    let snapshotIndex = -1;

    for (let index = stack.length - 1; index >= 0; index -= 1) {
      if (stack[index].scope === currentScope) {
        snapshotIndex = index;
        break;
      }
    }

    if (snapshotIndex === -1) return false;

    const [snapshot] = stack.splice(snapshotIndex, 1);
    drawingUndoStackRef.current = stack;

    saveDrawings(snapshot.drawings);
    const restoredSelectedId = snapshot.drawings.some((drawing) => drawing.id === snapshot.selectedDrawingId)
      ? snapshot.selectedDrawingId
      : null;

    setSelectedDrawingId(restoredSelectedId);
    setTempDrawing(null);
    setTextInput(null);
    setTool(null);

    return true;
  }, [getDrawingScope, saveDrawings]);

  useEffect(() => {
    drawingUndoStackRef.current = [];
  }, [exchange, marketCategory, symbol]);

  const appendDrawing = useCallback((drawing) => {
    const next = [...drawingsRef.current, drawing];
    saveToolSettingsForType(drawing.type, buildToolSettingsFromDrawing(drawing));
    saveDrawings(next);
    setSelectedDrawingId(drawing.id);
  }, [buildToolSettingsFromDrawing, saveDrawings, saveToolSettingsForType]);

  const loadStoredDrawings = useCallback(async () => {
    let localDrawings = [];
    const storageKey = buildStorageKey(symbol, exchange, marketCategory, preferenceUserId);

    try {
      const parsed = JSON.parse(localStorage.getItem(storageKey) ?? '[]');
      if (Array.isArray(parsed)) {
        localDrawings = parsed;
      }
    } catch {}

    try {
      const response = await axios.get('/market-drawings', {
        params: { symbol, exchange, category: marketCategory },
        headers: { Accept: 'application/json' },
      });

      const serverDrawings = Array.isArray(response.data?.drawings)
        ? response.data.drawings
        : [];
      const nextDrawings = response.data?.exists ? serverDrawings : [];

      try {
        localStorage.setItem(storageKey, JSON.stringify(nextDrawings));
      } catch {}

      return nextDrawings;
    } catch {
      return localDrawings;
    }
  }, [exchange, marketCategory, preferenceUserId, symbol]);

  useEffect(() => {
    let cancelled = false;

    loadStoredDrawings().then((saved) => {
      if (cancelled) return;
      setDrawings(saved);
      drawingsRef.current = saved;
      setSelectedDrawingId((selectedId) => (
        saved.some((drawing) => drawing.id === selectedId) ? selectedId : null
      ));
    });

    return () => {
      cancelled = true;
    };
  }, [loadStoredDrawings]);

  const getDrawingTimes = useCallback((items) => {
    return items.flatMap((drawing) => {
      if (isTwoPointDrawing(drawing)) {
        return [drawing.start?.time, drawing.end?.time, drawing.stop?.time, drawing.anchor?.time];
      }

      if (TEXT_MARKER_TYPES.includes(drawing.type)) {
        return [drawing.point?.time];
      }

      if (isPathDrawing(drawing)) {
        return (drawing.points ?? []).map((point) => point?.time);
      }

      return [];
    }).filter((time) => Number.isFinite(Number(time))).map(Number);
  }, []);

  const selectedPriceAutoscaleInfoProvider = useCallback((original) => {
    const autoscaleInfo = original();
    const selectedPrice = selectedReplayPriceRef.current;
    const account = backtestAccountRef.current;
    const activeSymbol = symbolRef.current;
    const backtestPrices = [
      ...(account?.pendingPositions ?? []),
      ...(account?.openPositions ?? []),
    ]
      .filter((position) => position.symbol === activeSymbol)
      .flatMap((position) => [position.entryPrice, position.stopLoss, position.takeProfit])
      .map(Number)
      .filter((price) => Number.isFinite(price) && price > 0);

    if (!autoscaleInfo) {
      return autoscaleInfo;
    }

    if (Number.isFinite(selectedPrice)) {
      backtestPrices.push(selectedPrice);
    }

    if (!backtestPrices.length) return autoscaleInfo;

    const priceRange = autoscaleInfo.priceRange ?? {
      minValue: backtestPrices[0],
      maxValue: backtestPrices[0],
    };
    let minValue = Math.min(priceRange.minValue, ...backtestPrices);
    let maxValue = Math.max(priceRange.maxValue, ...backtestPrices);

    if (minValue === maxValue) {
      const padding = Math.max(Math.abs(minValue) * 0.01, 1);
      minValue -= padding;
      maxValue += padding;
    }

    return {
      ...autoscaleInfo,
      priceRange: {
        minValue,
        maxValue,
      },
      margins: autoscaleInfo.margins ?? {
        above: 12,
        below: 12,
      },
    };
  }, []);

  const getChartCoordinates = useCallback((x, y) => {
    const chart = chartRef.current;
    const series = candleSeriesRef.current;
    if (!chart || !series || !allCandles.length) {
      logDrawDebug('getChartCoordinates: bail (no chart/series/candles)', { hasChart: Boolean(chart), hasSeries: Boolean(series), allCandlesLength: allCandles.length });
      return null;
    }

    const logical = chart.timeScale().coordinateToLogical(x);
    const rawTime = chart.timeScale().coordinateToTime(x);
    const rawPrice = series.coordinateToPrice(y);

    if (logical == null || rawPrice == null) {
      logDrawDebug('getChartCoordinates: bail (null logical/price)', { x, y, logical, rawPrice });
      return null;
    }

    const estimatedTime = estimateTimeFromLogical(allCandles, Number(logical));
    const nearestIndex =
      rawTime == null
        ? Math.min(Math.max(Math.round(logical), 0), allCandles.length - 1)
        : findNearestCandleIndex(allCandles, rawTime);

    if (nearestIndex < 0 || !allCandles[nearestIndex]) {
      logDrawDebug('getChartCoordinates: bail (bad nearestIndex)', { x, y, logical, rawTime, nearestIndex, allCandlesLength: allCandles.length });
      return null;
    }

    const result = {
      time: Number.isFinite(estimatedTime) ? estimatedTime : allCandles[nearestIndex].time,
      logical: Number(logical),
      price: Number(rawPrice),
    };
    logDrawDebug('getChartCoordinates: result', { x, y, logical, rawTime, estimatedTime, nearestIndex, allCandlesLength: allCandles.length, lastCandleTime: allCandles[allCandles.length - 1]?.time, result });
    return result;
  }, [allCandles]);

  const toScreen = useCallback((pointOrTime, price) => {
    const chart = chartRef.current;
    const series = candleSeriesRef.current;
    if (!chart || !series) return null;

    const point =
      typeof pointOrTime === 'object' && pointOrTime !== null
        ? pointOrTime
        : { time: pointOrTime, price };

    const intervalSeconds = TIMEFRAME_SECONDS[loadedTimeframe] ?? 60;
    const projectionCandles = allCandles.length ? allCandles : visibleCandles;
    const logicalFromTime = estimateDrawingLogicalFromTime(
      projectionCandles,
      point.time,
      intervalSeconds
    );

    const x =
      Number.isFinite(logicalFromTime)
        ? chart.timeScale().logicalToCoordinate(logicalFromTime)
        : (
            Number.isFinite(point.logical)
              ? chart.timeScale().logicalToCoordinate(point.logical)
              : chart.timeScale().timeToCoordinate(point.time)
          );
    const y = series.priceToCoordinate(point.price);

    const lastCandleTime = projectionCandles[projectionCandles.length - 1]?.time;
    if (lastCandleTime != null && Number(point.time) > Number(lastCandleTime)) {
      logDrawDebug('toScreen: future point', { pointTime: point.time, lastCandleTime, logicalFromTime, x, y });
    }

    if (x == null || y == null) return null;
    return { x, y };
  }, [allCandles, loadedTimeframe, visibleCandles]);

  const setReplayPointFromCoordinates = useCallback((x, y, moveCandle = true) => {
    const chart = chartRef.current;
    const candleSeries = candleSeriesRef.current;
    const candles = allCandlesRef.current;
    if (!chart || !candleSeries || !candles.length) return;

    const time = chart.timeScale().coordinateToTime(x);
    if (moveCandle && time != null) {
      const nearestIndex = findNearestCandleIndex(candles, time);
      if (nearestIndex >= 0) {
        setReplayIndex(nearestIndex);
        setSelectedReplayPrice(Number(candles[nearestIndex].close));
        setIsPlaying(false);
      }
      return;
    }

    const price = candleSeries.coordinateToPrice(y);
    if (price != null && Number.isFinite(Number(price))) {
      setSelectedReplayPrice(Number(price));
    }
  }, []);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return undefined;

    const getPriceAction = (event) => {
      if (
        toolRef.current
        || isReplayPricePickActiveRef.current
        || event.target?.closest?.('[data-chart-ui], button, input, textarea, select')
      ) {
        return null;
      }

      const series = candleSeriesRef.current;
      if (!series) return null;

      const rect = el.getBoundingClientRect();
      const y = event.clientY - rect.top;
      if (y < 12 || y > rect.height - 28) return null;

      const price = series.coordinateToPrice(y);
      if (!Number.isFinite(Number(price))) return null;

      return {
        y,
        price: Number(price),
      };
    };

    const handlePriceHover = (event) => {
      if (event.target?.closest?.('[data-chart-ui="order-price-action"], [data-chart-ui="alert-price-action"]')) return;
      setChartOrderAction(getPriceAction(event));
    };

    const handleMouseLeave = (event) => {
      if (event.relatedTarget?.closest?.('[data-chart-ui="order-price-action"], [data-chart-ui="alert-price-action"]')) return;
      setChartOrderAction(null);
    };

    const handleContextMenu = (event) => {
      const action = getPriceAction(event);
      if (!action) return;

      event.preventDefault();
      event.stopPropagation();
      setChartOrderAction(action);
      setChartContextMenu({
        x: Math.max(8, Math.min(event.clientX, window.innerWidth - 228)),
        y: Math.max(8, Math.min(event.clientY, window.innerHeight - 116)),
        price: action.price,
      });
    };

    el.addEventListener('mousemove', handlePriceHover);
    el.addEventListener('mouseleave', handleMouseLeave);
    el.addEventListener('contextmenu', handleContextMenu);

    return () => {
      el.removeEventListener('mousemove', handlePriceHover);
      el.removeEventListener('mouseleave', handleMouseLeave);
      el.removeEventListener('contextmenu', handleContextMenu);
    };
  }, []);

  useEffect(() => {
    if (!chartContextMenu) return undefined;

    chartContextMenuFirstItemRef.current?.focus();

    const closeMenu = (event) => {
      if (event?.type === 'pointerdown' && chartContextMenuRef.current?.contains(event.target)) return;
      setChartContextMenu(null);
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setChartContextMenu(null);
        return;
      }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;

      const items = Array.from(chartContextMenuRef.current?.querySelectorAll('[role="menuitem"]') ?? []);
      if (!items.length) return;
      event.preventDefault();
      const currentIndex = items.indexOf(document.activeElement);
      const nextIndex = event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? items.length - 1
          : event.key === 'ArrowDown'
            ? (currentIndex + 1 + items.length) % items.length
            : (currentIndex - 1 + items.length) % items.length;
      items[nextIndex].focus();
    };

    document.addEventListener('pointerdown', closeMenu);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('wheel', closeMenu, true);
    window.addEventListener('resize', closeMenu);
    window.addEventListener('scroll', closeMenu, true);

    return () => {
      document.removeEventListener('pointerdown', closeMenu);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('wheel', closeMenu, true);
      window.removeEventListener('resize', closeMenu);
      window.removeEventListener('scroll', closeMenu, true);
    };
  }, [chartContextMenu]);

  useEffect(() => {
    if (!indicatorContextMenu) return undefined;

    indicatorContextMenuFirstItemRef.current?.focus();

    const closeMenu = (event) => {
      if (event?.type === 'pointerdown' && indicatorContextMenuRef.current?.contains(event.target)) return;
      setIndicatorContextMenu(null);
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setIndicatorContextMenu(null);
        return;
      }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;

      const items = Array.from(indicatorContextMenuRef.current?.querySelectorAll('[role="menuitem"]') ?? []);
      if (!items.length) return;
      event.preventDefault();
      const currentIndex = items.indexOf(document.activeElement);
      const nextIndex = event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? items.length - 1
          : event.key === 'ArrowDown'
            ? (currentIndex + 1 + items.length) % items.length
            : (currentIndex - 1 + items.length) % items.length;
      items[nextIndex].focus();
    };

    document.addEventListener('pointerdown', closeMenu);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('wheel', closeMenu, true);
    window.addEventListener('resize', closeMenu);
    window.addEventListener('scroll', closeMenu, true);

    return () => {
      document.removeEventListener('pointerdown', closeMenu);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('wheel', closeMenu, true);
      window.removeEventListener('resize', closeMenu);
      window.removeEventListener('scroll', closeMenu, true);
    };
  }, [indicatorContextMenu]);

  useEffect(() => {
    setChartContextMenu(null);
    setIndicatorContextMenu(null);
  }, [exchange, marketCategory, symbol, timeframe]);

  const getDefaultPositionStop = useCallback((type, entry, target) => {
    const priceMove = Math.abs(target.price - entry.price);
    const stopPrice =
      type === 'long-position'
        ? entry.price - priceMove
        : entry.price + priceMove;

    return {
      ...target,
      price: stopPrice,
    };
  }, []);

  const renderedDrawings = useMemo(() => {
    const all = [...drawings, ...(tempDrawing ? [tempDrawing] : [])]
      .filter((drawing) => !drawing.visibleTimeframe || drawing.visibleTimeframe === loadedTimeframe)
      .filter((drawing) => {
        const isPosition = isPositionDrawing(drawing);
        if (isPosition) return !hiddenLayers.positions;
        return !hiddenLayers.drawings;
      });

    return all.map((drawing) => {
      if (isLineLikeDrawing(drawing)) {
        const p1 = toScreen(drawing.start);
        const p2 = toScreen(drawing.end);
        if (!p1 || !p2) return null;
        const p3 = drawing.anchor ? toScreen(drawing.anchor) : null;

        if (drawing.type === 'vertical-line') {
          return { ...drawing, screen: { p1: { x: p1.x, y: 0 }, p2: { x: p1.x, y: overlaySize.height } } };
        }
        if (drawing.type === 'ray') {
          const dx = p2.x - p1.x || 1, endX = dx >= 0 ? overlaySize.width : 0;
          return { ...drawing, screen: { p1, p2, rayEnd: { x: endX, y: p1.y + ((p2.y - p1.y) * ((endX - p1.x) / dx)) } } };
        }
        if (drawing.type === 'extended-line') {
          const dx = p2.x - p1.x || 1;
          const slope = (p2.y - p1.y) / dx;
          const leftX = 0, rightX = overlaySize.width;
          return {
            ...drawing,
            screen: {
              p1,
              p2,
              rayStart: { x: leftX, y: p1.y + slope * (leftX - p1.x) },
              rayEnd: { x: rightX, y: p1.y + slope * (rightX - p1.x) },
            },
          };
        }
        if (isHorizontalRayDrawing(drawing)) {
          return {
            ...drawing,
            screen: {
              p1: drawing.type === 'horizontal-line' ? { x: 0, y: p1.y } : p1,
              p2,
              rayEnd: {
                x: Math.max(overlaySize.width, p1.x),
                y: p1.y,
              },
            },
          };
        }

        return { ...drawing, screen: { p1, p2, ...(p3 ? { p3 } : {}) } };
      }

      if (BOX_TOOL_TYPES.includes(drawing.type)) {
        const p1 = toScreen(drawing.start);
        const p2 = toScreen(drawing.end);
        if (!p1 || !p2) return null;
        return { ...drawing, screen: { p1, p2 } };
      }

      if (isPositionDrawing(drawing)) {
        const p1 = toScreen(drawing.start);
        const p2 = toScreen(drawing.end);
        const stop = drawing.stop ?? getDefaultPositionStop(drawing.type, drawing.start, drawing.end);
        const pStop = toScreen(stop);
        const progressPoint = resolvePositionProgressPoint(drawing, stop, visibleCandles);
        const pCurrent = progressPoint ? toScreen(progressPoint) : null;
        if (!p1 || !p2 || !pStop) return null;
        return {
          ...drawing,
          stop,
          currentPrice: progressPoint?.price ?? drawing.start.price,
          screen: {
            p1,
            p2,
            pStop,
            ...(pCurrent ? { pCurrent } : {}),
          },
        };
      }

      if (TEXT_MARKER_TYPES.includes(drawing.type)) {
        const p = toScreen(drawing.point);
        if (!p) return null;
        const pRight = PRICE_ANCHORED_MARKER_TYPES.includes(drawing.type) ? { x: overlaySize.width, y: p.y } : null;
        return { ...drawing, screen: { p, ...(pRight ? { pRight } : {}) } };
      }

      if (isPathDrawing(drawing)) {
        const points = (drawing.points ?? []).map((point) => toScreen(point));
        if (points.length < 1 || points.some((point) => !point)) return null;
        const previewPoint = drawing.previewPoint ? toScreen(drawing.previewPoint) : null;
        return {
          ...drawing,
          screen: {
            points,
            ...(previewPoint ? { previewPoint } : {}),
          },
        };
      }

      return null;
    }).filter(Boolean);
  }, [drawings, tempDrawing, toScreen, replayIndex, overlaySize, overlayRenderVersion, getDefaultPositionStop, loadedTimeframe, visibleCandles, hiddenLayers.drawings, hiddenLayers.positions]);

  const renderedBacktestOrders = useMemo(() => {
    const series = candleSeriesRef.current;
    if (!series || !overlaySize.width) return [];

    const buildLine = (position, kind, price, options = {}) => {
      const value = getPositiveNumber(price);
      if (value == null) return null;

      const y = series.priceToCoordinate(value);
      if (y == null) return null;

      const kindLabel = kind === 'entry' ? (position.status === 'pending' ? 'ENTRY' : 'OPEN') : kind.toUpperCase();
      const sideLabel = position.category === 'spot' ? 'BUY' : (position.side === 'short' ? 'SHORT' : 'LONG');

      let pnlText = null;
      let pnlPositive = null;
      if (options.pnlText !== undefined) {
        pnlText = options.pnlText;
        pnlPositive = options.pnlPositive ?? null;
      } else if (kind === 'sl' || kind === 'tp') {
        const positionPnl = estimatePositionNetPnl(position, value, backtestAccount?.feeRate);
        const formattedPositionPnl = formatOverlayPnl(positionPnl);
        if (formattedPositionPnl) {
          pnlPositive = positionPnl >= 0;
          pnlText = `${pnlPositive ? '+' : '-'}${formattedPositionPnl}`;
        }
      }

      return {
        id: options.id ?? `${position.status}:${position.id}:${kind}`,
        positionId: position.id,
        status: position.status,
        side: position.side,
        kind,
        price: value,
        y,
        dashed: options.dashed ?? position.status === 'pending',
        color: options.color ?? (kind === 'tp' ? '#22c55e' : kind === 'sl' ? '#ef4444' : '#f59e0b'),
        isDraft: Boolean(options.isDraft),
        canCancel: Boolean(options.canCancel),
        label: options.label ?? `${sideLabel} ${kindLabel} ${formatOverlayPrice(value)}`,
        pnlText,
        pnlPositive,
      };
    };
    const draftEntryPrice = getPositiveNumber(
      backtestOrderDraft?.isPendingOrder
        ? backtestOrderDraft?.entryPrice
        : backtestOrderDraft?.effectiveEntryPrice
    );
    const draftStopLoss = getPositiveNumber(backtestOrderDraft?.stopLoss) ?? (
      draftEntryPrice
        ? backtestOrderDraft?.side === 'short'
          ? draftEntryPrice * 1.01
          : draftEntryPrice * 0.99
        : null
    );
    const draftTakeProfit = getPositiveNumber(backtestOrderDraft?.takeProfit) ?? (
      draftEntryPrice
        ? backtestOrderDraft?.side === 'short'
          ? draftEntryPrice * 0.99
          : draftEntryPrice * 1.01
        : null
    );
    const draftProfit = formatOverlayPnl(backtestOrderDraft?.estimatedProfit);
    const draftLoss = formatOverlayPnl(backtestOrderDraft?.estimatedLoss);

    return [
      ...(backtestOrderDraft?.visible
        ? [
            buildLine(
              {
                id: 'draft',
                status: 'draft',
                side: backtestOrderDraft.side,
              },
              'entry',
              draftEntryPrice,
              {
                id: 'draft:entry',
                isDraft: true,
                canCancel: true,
                cancelDraft: true,
                dashed: true,
                label: `${marketCategory === 'spot' ? 'BUY' : (backtestOrderDraft.side === 'short' ? 'SHORT' : 'LONG')} ${backtestOrderDraft.isPendingOrder ? 'ORDER' : 'ENTRY'} ${formatOverlayPrice(draftEntryPrice)}`,
              }
            ),
            buildLine(
              {
                id: 'draft',
                status: 'draft',
                side: backtestOrderDraft.side,
              },
              'sl',
              draftStopLoss,
              {
                id: 'draft:sl',
                isDraft: true,
                dashed: true,
                label: `SL ${formatOverlayPrice(draftStopLoss)}`,
                pnlText: draftLoss ? `-${draftLoss}` : null,
                pnlPositive: draftLoss ? false : null,
              }
            ),
            buildLine(
              {
                id: 'draft',
                status: 'draft',
                side: backtestOrderDraft.side,
              },
              'tp',
              draftTakeProfit,
              {
                id: 'draft:tp',
                isDraft: true,
                dashed: true,
                label: `TP ${formatOverlayPrice(draftTakeProfit)}`,
                pnlText: draftProfit ? `+${draftProfit}` : null,
                pnlPositive: draftProfit ? true : null,
              }
            ),
          ]
        : []),
      ...(backtestAccount?.pendingPositions ?? [])
        .filter((position) => position.symbol === symbol)
        .flatMap((position) => [
          buildLine({ ...position, status: 'pending' }, 'entry', position.entryPrice, { dashed: true, canCancel: true }),
          buildLine({ ...position, status: 'pending' }, 'sl', position.stopLoss, { dashed: true }),
          buildLine({ ...position, status: 'pending' }, 'tp', position.takeProfit, { dashed: true }),
        ]),
      ...(backtestAccount?.openPositions ?? [])
        .filter((position) => position.symbol === symbol)
        .flatMap((position) => {
          const openPosition = { ...position, status: 'open' };
          const livePnl = estimatePositionNetPnl(
            openPosition,
            executionPrice,
            backtestAccount?.feeRate
          );
          const formattedLivePnl = formatOverlayPnl(livePnl);
          const livePnlLabel = formattedLivePnl
            ? `  LIVE ${livePnl >= 0 ? '+' : '-'}${formattedLivePnl} ${backtestAccount?.quoteCurrency ?? 'USDT'}`
            : '';
          const sideLabel = position.category === 'spot' ? 'BUY' : (position.side === 'short' ? 'SHORT' : 'LONG');
          // Mark the managed-exit rules directly on the lines they affect, matching how
          // exchanges label a trailing/break-even stop or a multi-target take-profit on the
          // chart itself rather than leaving it discoverable only in a side list.
          const slQualifiers = [
            position.trailingStopPercent ? 'TRAIL' : null,
            position.breakEvenTriggerPercent ? 'BE' : null,
          ].filter(Boolean);
          const slPrefix = slQualifiers.length ? `${slQualifiers.join('+')} ` : '';
          const tpSuffix = position.partialTakeProfitPercent && !position.partialTakeProfitExecuted
            ? ` · ${position.partialTakeProfitPercent}% close`
            : '';

          return [
            buildLine(openPosition, 'entry', position.entryPrice, {
              dashed: false,
              color: livePnl == null ? '#f59e0b' : livePnl >= 0 ? '#22c55e' : '#ef4444',
              label: `${sideLabel} OPEN ${formatOverlayPrice(position.entryPrice)}${livePnlLabel}`,
            }),
            buildLine(openPosition, 'sl', position.stopLoss, {
              dashed: false,
              label: `${sideLabel} ${slPrefix}SL ${formatOverlayPrice(position.stopLoss)}`,
            }),
            buildLine(openPosition, 'tp', position.takeProfit, {
              dashed: false,
              label: `${sideLabel} TP ${formatOverlayPrice(position.takeProfit)}${tpSuffix}`,
            }),
          ];
        }),
    ].filter(Boolean);
  }, [backtestAccount, backtestOrderDraft, executionPrice, marketCategory, overlayRenderVersion, overlaySize.width, symbol]);

  const renderedTradeMarkers = useMemo(() => {
    const chart = chartRef.current;
    const series = candleSeriesRef.current;
    if (!chart || !series || !allCandles.length || !visibleCandles.length) return [];
    const intervalSeconds = TIMEFRAME_SECONDS[loadedTimeframe] ?? 60;
    const lastVisibleTime = Number(visibleCandles[visibleCandles.length - 1].time);

    return (backtestAccount?.trades ?? [])
      .filter((trade) => trade.symbol === symbol)
      // A trade executed later than the candle currently revealed in Replay hasn't
      // "happened yet" from this vantage point. Positioning used to run against the
      // full unsliced `allCandles` timeline, so a future trade's marker still resolved
      // to a valid logical index and got extrapolated far past the last rendered
      // candle into empty chart space instead of disappearing with it.
      .filter((trade) => Number.isFinite(lastVisibleTime) && Number(trade.executedAtTime) <= lastVisibleTime)
      .map((trade) => {
        const logical = estimateDrawingLogicalFromTime(
          allCandles,
          Number(trade.executedAtTime),
          intervalSeconds
        );
        const x = Number.isFinite(logical)
          ? chart.timeScale().logicalToCoordinate(logical)
          : chart.timeScale().timeToCoordinate(Number(trade.executedAtTime));
        const y = series.priceToCoordinate(Number(trade.price));
        if (x == null || y == null) return null;
        const isBuy = (trade.action === 'open' && trade.side === 'long') || (trade.action === 'close' && trade.side === 'short');
        return { id: trade.id, x, y, label: isBuy ? 'B' : 'S', color: isBuy ? '#16a34a' : '#dc2626' };
      }).filter(Boolean);
  }, [allCandles, visibleCandles, backtestAccount?.trades, loadedTimeframe, overlayRenderVersion, symbol]);

  const swingPointMarkers = useMemo(() => {
    if (!isLegendActive) return [];
    const chart = chartRef.current;
    const series = candleSeriesRef.current;
    if (!chart || !series || allCandles.length < 5) return [];

    const visibleRange = chart.timeScale().getVisibleRange();
    if (!visibleRange) return [];

    const fromTime = Number(visibleRange.from);
    const toTime = Number(visibleRange.to);
    const candles = allCandles.filter((c) => Number(c.time) >= fromTime && Number(c.time) <= toTime);
    if (candles.length < 5) return [];

    const highs = candles.map((c) => Number(c.high));
    const lows = candles.map((c) => Number(c.low));

    // Reversal must be at least 5% of the *current price level* (the standard ZigZag
    // definition), not a fraction of the visible span — a span-based threshold shrinks
    // to near-nothing in choppy/sideways stretches (price wanders without the span
    // growing much) and marks a pivot on almost every candle there.
    const reversalPct = 0.05;
    const pivots = [];
    let direction = 0; // 0 = undetermined, 1 = tracking a high, -1 = tracking a low
    let extremeHighIndex = 0;
    let extremeHigh = highs[0];
    let extremeLowIndex = 0;
    let extremeLow = lows[0];

    for (let i = 1; i < candles.length; i += 1) {
      if (direction <= 0) {
        if (lows[i] <= extremeLow) {
          extremeLow = lows[i];
          extremeLowIndex = i;
        }
        if (extremeLow > 0 && (highs[i] - extremeLow) / extremeLow >= reversalPct) {
          pivots.push({ index: extremeLowIndex, price: extremeLow, type: 'low' });
          direction = 1;
          extremeHigh = highs[i];
          extremeHighIndex = i;
          continue; // this candle just confirmed the low pivot — don't also test it as the high pivot below using the single-candle range that was just seeded
        }
      }
      if (direction >= 0) {
        if (highs[i] >= extremeHigh) {
          extremeHigh = highs[i];
          extremeHighIndex = i;
        }
        if (extremeHigh > 0 && (extremeHigh - lows[i]) / extremeHigh >= reversalPct) {
          pivots.push({ index: extremeHighIndex, price: extremeHigh, type: 'high' });
          direction = -1;
          extremeLow = lows[i];
          extremeLowIndex = i;
        }
      }
    }

    return pivots.reduce((points, pivot) => {
      const candle = candles[pivot.index];
      const x = chart.timeScale().timeToCoordinate(Number(candle.time));
      const y = series.priceToCoordinate(pivot.price);
      if (x == null || y == null) return points;
      points.push({ id: `${pivot.type}-${candle.time}`, x, y: pivot.type === 'low' ? y + 8 : y - 8 });
      return points;
    }, []);
  }, [allCandles, isLegendActive, overlayRenderVersion]);

  const hitTestDrawing = useCallback((x, y) => {
    const point = { x, y };
    const tolerance = isTouchInputRef.current ? 16 : 8;
    const fibTolerance = isTouchInputRef.current ? 12 : 6;

    for (let i = renderedDrawings.length - 1; i >= 0; i -= 1) {
      const d = renderedDrawings[i];

      if (isLineLikeDrawing(d)) {
        const { p1, p2, rayStart, rayEnd } = d.screen;
        if (distanceToSegment(point, rayStart ?? p1, rayEnd ?? p2) <= tolerance) return d.id;

        if (d.type === 'fib-extension' && d.screen.p3 && distanceToSegment(point, p2, d.screen.p3) <= tolerance) {
          return d.id;
        }
        if (THREE_POINT_SHAPE_TYPES.includes(d.type) && d.screen.p3) {
          if (distanceToSegment(point, p2, d.screen.p3) <= tolerance) return d.id;
          if (distanceToSegment(point, p1, d.screen.p3) <= tolerance) return d.id;
        }
        if (d.type === 'parallel-channel' && d.screen.p3) {
          const dx = d.screen.p3.x - p2.x, dy = d.screen.p3.y - p2.y;
          if (distanceToSegment(point, { x: p1.x + dx, y: p1.y + dy }, { x: p2.x + dx, y: p2.y + dy }) <= tolerance) return d.id;
        }

        if (['fib-retracement', 'fib-extension'].includes(d.type)) {
          const hitFibLevel = getRenderedFibonacciLevels(d, overlaySize.width).some((level) => {
            const levelPointA = { x: level.x1, y: level.y };
            const levelPointB = { x: level.x2, y: level.y };
            return distanceToSegment(point, levelPointA, levelPointB) <= fibTolerance;
          });

          if (hitFibLevel) return d.id;
        }
      }

      if (BOX_TOOL_TYPES.includes(d.type)) {
        const { p1, p2 } = d.screen;
        const rect = normalizeVisibleRect(p1, p2);
        const inside =
          x >= rect.left &&
          x <= rect.left + rect.width &&
          y >= rect.top &&
          y <= rect.top + rect.height;

        if (inside) return d.id;
      }

      if (isPositionDrawing(d)) {
        const { p1, p2, pStop } = d.screen;
        const top = Math.min(p1.y, p2.y, pStop.y);
        const bottom = Math.max(p1.y, p2.y, pStop.y);
        const left = Math.min(p1.x, p2.x, pStop.x);
        const right = Math.max(p1.x, p2.x, pStop.x);
        const inside =
          x >= left &&
          x <= right &&
          y >= top &&
          y <= bottom;

        if (inside) return d.id;
      }

      if (TEXT_MARKER_TYPES.includes(d.type)) {
        const { p } = d.screen;
        if (Math.abs(x - p.x) <= 80 && Math.abs(y - p.y) <= 24) return d.id;
      }

      if (isPathDrawing(d)) {
        const points = d.screen.points ?? [];
        for (let index = 1; index < points.length; index += 1) {
          if (distanceToSegment(point, points[index - 1], points[index]) <= tolerance) return d.id;
        }

        if (points.some((pathPoint) => Math.abs(x - pathPoint.x) <= tolerance && Math.abs(y - pathPoint.y) <= tolerance)) {
          return d.id;
        }
      }
    }

    return null;
  }, [overlaySize.width, renderedDrawings]);

  const hitTestBacktestOrder = useCallback((x, y) => {
    for (let i = renderedBacktestOrders.length - 1; i >= 0; i -= 1) {
      const item = renderedBacktestOrders[i];
      const nearCancel =
        item.canCancel &&
        x >= overlaySize.width - 124 &&
        x <= overlaySize.width - 104 &&
        Math.abs(y - item.y) <= 12;
      const nearLine = Math.abs(y - item.y) <= 6 && x >= 0 && x <= overlaySize.width;
      const nearHandle =
        x >= overlaySize.width - 24 &&
        x <= overlaySize.width &&
        Math.abs(y - item.y) <= 12;

      if (nearCancel) {
        return { ...item, action: 'cancel' };
      }

      if (nearLine || nearHandle) {
        return item;
      }
    }

    return null;
  }, [overlaySize.width, renderedBacktestOrders]);

  const hitTestResizeHandle = useCallback((x, y) => {
    if (!selectedDrawingIdRef.current) return null;

    const selected = renderedDrawings.find((d) => d.id === selectedDrawingIdRef.current);
    if (!selected || TEXT_MARKER_TYPES.includes(selected.type)) return null;

    const handles = [];

    if (isLineLikeDrawing(selected)) {
      handles.push({ handle: 'start', point: selected.screen.p1 });

      if (!isHorizontalRayDrawing(selected)) {
        handles.push({ handle: 'end', point: selected.screen.p2 });
      }

      if (['fib-extension', 'parallel-channel', ...THREE_POINT_SHAPE_TYPES].includes(selected.type) && selected.screen.p3) {
        handles.push({ handle: 'anchor', point: selected.screen.p3 });
      }
    }

    if (isPositionDrawing(selected)) {
      handles.push(
        { handle: 'start', point: selected.screen.p1 },
        { handle: 'end', point: selected.screen.p2 },
        { handle: 'stop', point: selected.screen.pStop }
      );
    }

    if (isPathDrawing(selected)) {
      (selected.screen.points ?? []).forEach((point, index) => {
        handles.push({ handle: `point:${index}`, point });
      });
    }

    if (BOX_TOOL_TYPES.includes(selected.type)) {
      const { p1, p2 } = selected.screen;
      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2;

      handles.push(
        { handle: 'start', point: p1 },
        { handle: 'end', point: p2 },
        { handle: 'start-x-end-y', point: { x: p1.x, y: p2.y } },
        { handle: 'end-x-start-y', point: { x: p2.x, y: p1.y } },
        { handle: 'start-time', point: { x: p1.x, y: midY } },
        { handle: 'end-time', point: { x: p2.x, y: midY } },
        { handle: 'start-price', point: { x: midX, y: p1.y } },
        { handle: 'end-price', point: { x: midX, y: p2.y } }
      );
    }

    const handleTolerance = isTouchInputRef.current ? 16 : 8;
    for (const item of handles) {
      if (Math.abs(x - item.point.x) <= handleTolerance && Math.abs(y - item.point.y) <= handleTolerance) {
        return { drawingId: selected.id, handle: item.handle };
      }
    }

    return null;
  }, [renderedDrawings]);

  const updateLocalBacktestPositionLine = useCallback((positionId, updates) => {
    setBacktestAccount((currentAccount) => {
      if (!currentAccount) return currentAccount;

      const updatePosition = (position) => (
        position.id === positionId
          ? { ...position, ...updates }
          : position
      );

      return {
        ...currentAccount,
        pendingPositions: (currentAccount.pendingPositions ?? []).map(updatePosition),
        openPositions: (currentAccount.openPositions ?? []).map(updatePosition),
      };
    });
  }, []);

  const handleUpdateBacktestPositionRisk = useCallback(async (dragState) => {
    if (!dragState?.positionId) return;

    const payload = {
      price: getPositiveNumber(executionPrice),
    };

    if (dragState.kind === 'entry') {
      payload.entry_price = dragState.price;
    }

    if (dragState.kind === 'sl') {
      payload.stop_loss = dragState.price;
    }

    if (dragState.kind === 'tp') {
      payload.take_profit = dragState.price;
    }

    try {
      const response = await axios.put(`/market-backtest/positions/${dragState.positionId}/risk`, payload);
      setBacktestAccount(response.data?.account ?? null);
      setBacktestError('');
    } catch (err) {
      setBacktestError(err.response?.data?.message ?? err.message ?? 'Failed to update position prices');
      loadBacktestAccount(executionPrice);
    }
  }, [executionPrice, loadBacktestAccount]);

  // Unlike handleUpdateBacktestPositionRisk above (the chart-line-drag path), this is driven
  // by PositionsPanel's TP/SL modal, which shows its own inline error banner and needs the
  // raw rejection to do that — so, deliberately, no setBacktestError/loadBacktestAccount
  // fallback here; the caller awaits this directly and reads err.response itself.
  const handleUpdatePositionRiskLevels = useCallback(async (positionId, { stopLoss, takeProfit }) => {
    const response = await axios.put(`/market-backtest/positions/${positionId}/risk`, {
      stop_loss: stopLoss,
      take_profit: takeProfit,
    });
    setBacktestAccount(response.data?.account ?? null);
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    isNarrowChartRef.current = containerRef.current.clientWidth > 0 && containerRef.current.clientWidth < NARROW_CHART_BREAKPOINT;

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth || 800,
      height: containerRef.current.clientHeight || 0,
      layout: {
        background: { color: chartTheme.background },
        textColor: chartTheme.text,
        attributionLogo: false,
        fontSize: isNarrowChartRef.current ? 9 : 10,
        panes: {
          enableResize: true,
          separatorColor: chartTheme.mode === 'dark' ? 'rgba(255, 255, 255, 0.12)' : 'rgba(15, 23, 42, 0.12)',
          separatorHoverColor: '#2dd4bf',
        },
      },
      grid: {
        vertLines: { color: chartTheme.grid },
        horzLines: { color: chartTheme.grid },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
      },
      rightPriceScale: {
        borderColor: chartTheme.border,
        scaleMargins: {
          top: 0.1,
          bottom: 0.2,
        },
      },
      timeScale: {
        borderColor: chartTheme.border,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 8,
        barSpacing: candleSize,
      },
      handleScroll: true,
      handleScale: true,
      localization: {
        priceFormatter: (value) => formatPriceScaleValue(value, isNarrowChartRef.current),
      },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: candleColors.up,
      downColor: candleColors.down,
      borderUpColor: candleColors.up,
      borderDownColor: candleColors.down,
      wickUpColor: candleColors.up,
      wickDownColor: candleColors.down,
      borderVisible: true,
      priceLineVisible: true,
      lastValueVisible: true,
      priceFormat: {
        type: 'custom',
        minMove: 0.00000001,
        formatter: (value) => formatPriceScaleValue(value, isNarrowChartRef.current),
      },
      autoscaleInfoProvider: selectedPriceAutoscaleInfoProvider,
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'custom', minMove: 1, formatter: formatCompactVolume },
      lastValueVisible: false,
      priceLineVisible: false,
    }, 1);
    const smaSeries = chart.addSeries(LineSeries, { color: '#2dd4bf', lineWidth: 2, priceLineVisible: false, lastValueVisible: false, visible: false });
    const emaSeries = chart.addSeries(LineSeries, { color: '#f59e0b', lineWidth: 2, priceLineVisible: false, lastValueVisible: false, visible: false });
    const rsiSeries = chart.addSeries(LineSeries, { color: '#a855f7', lineWidth: 2, priceLineVisible: false, lastValueVisible: true, visible: false }, 2);
    const macdSeries = chart.addSeries(LineSeries, { color: '#2dd4bf', lineWidth: 2, priceLineVisible: false, lastValueVisible: true, visible: false }, 3);
    const macdSignalSeries = chart.addSeries(LineSeries, { color: '#f59e0b', lineWidth: 2, priceLineVisible: false, lastValueVisible: false, visible: false }, 3);
    const macdHistogramSeries = chart.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false, base: 0, visible: false }, 3);

    const handleVisibleRangeChange = () => {
      // lightweight-charts fires this on every pointer move of a drag — several
      // times per frame. This used to cancel the pending overlay frame and then
      // force its own synchronous flushSync render for each one, so a single
      // drag ran N full renders per frame of a component with seven overlay
      // memos keyed on overlayRenderVersion (drawings, trade markers, legend,
      // pane geometry). Coalescing into one animation frame collapses that to
      // at most one render per frame, which is all a 60Hz display can show
      // anyway, while the flushSync inside the frame keeps the commit
      // synchronous so the overlay still lands in the same paint as the candles
      // it annotates — the property the original microtask was protecting.
      //
      // Sharing overlayRenderFrameRef with scheduleOverlayRender is deliberate:
      // if a frame is already pending, the version bump it performs serves this
      // event too, so the two paths never render the same frame twice.
      //
      // The animation frame also keeps flushSync out of React's own
      // render/commit stack — lightweight-charts can fire this synchronously
      // from inside it (the initial visible-range set during the chart-creation
      // effect, doubly so under StrictMode), which is what the previous
      // queueMicrotask was avoiding.
      // During a held drag the dedicated per-frame loop (stepViewportDragOverlay)
      // is already flushing every frame, so scheduling a second flush here would
      // just render the same frame twice — same short-circuit, and same reason,
      // as handleViewportInteraction's below.
      if (!isViewportDraggingRef.current && overlayRenderFrameRef.current == null) {
        overlayRenderFrameRef.current = requestAnimationFrame(() => {
          overlayRenderFrameRef.current = null;
          flushSync(() => setOverlayRenderVersion((version) => version + 1));
        });
      }
      if (isProgrammaticRangeChangeRef.current) return;
      setFollowReplay(false);
    };

    const handleChartClick = (param) => {
      const clickedCandle = param?.time != null ? param?.seriesData?.get(candleSeries) : null;
      const clickedHigh = Number(clickedCandle?.high);
      const clickedLow = Number(clickedCandle?.low);
      const clickedHighY = Number.isFinite(clickedHigh) ? candleSeries.priceToCoordinate(clickedHigh) : null;
      const clickedLowY = Number.isFinite(clickedLow) ? candleSeries.priceToCoordinate(clickedLow) : null;
      const pointY = Number(param?.point?.y);
      const isClickOnCandle = clickedCandle
        && Number.isFinite(clickedHighY)
        && Number.isFinite(clickedLowY)
        && Number.isFinite(pointY)
        && pointY >= Math.min(clickedHighY, clickedLowY) - 3
        && pointY <= Math.max(clickedHighY, clickedLowY) + 3;

      setIsLegendActive(isClickOnCandle);

      if (!isReplayPricePickActiveRef.current) {
        const hoveredSeries = param?.hoveredSeries;
        let indicatorType = hoveredSeries === volumeSeriesRef.current
          ? 'volume'
          : [macdSeriesRef.current, macdSignalSeriesRef.current, macdHistogramSeriesRef.current].includes(hoveredSeries)
            ? 'macd'
          : hoveredSeries === smaSeriesRef.current
            ? 'sma'
            : hoveredSeries === emaSeriesRef.current
              ? 'ema'
              : hoveredSeries === rsiSeriesRef.current
                ? 'rsi'
                : null;

        if (!indicatorType && param?.point && param?.seriesData) {
          const pointY = Number(param.point.y);
          const paneIndex = Number(param.paneIndex ?? 0);
          let nextLowerPaneForHitTest = 1;
          const isVolumeVisible = indicatorsRef.current.volume && indicatorsRef.current.volumeVisible !== false;
          const volumePane = isVolumeVisible ? nextLowerPaneForHitTest++ : -1;
          const isRsiVisible = indicatorsRef.current.rsi && indicatorsRef.current.rsiVisible !== false;
          const rsiPane = isRsiVisible ? nextLowerPaneForHitTest++ : -1;
          const macdPane = indicatorsRef.current.macd && indicatorsRef.current.macdVisible !== false
            ? nextLowerPaneForHitTest++
            : -1;

          const volumeSeries = volumeSeriesRef.current;
          const volumeValue = Number(param.seriesData.get(volumeSeries)?.value);
          if (volumeSeries && volumePane === paneIndex && Number.isFinite(volumeValue)) {
            const volumeY = Number(volumeSeries.priceToCoordinate(volumeValue));
            const volumeBaseY = Number(volumeSeries.priceToCoordinate(0));
            if (
              Number.isFinite(volumeY) &&
              Number.isFinite(volumeBaseY) &&
              pointY >= Math.min(volumeY, volumeBaseY) - 4 &&
              pointY <= Math.max(volumeY, volumeBaseY) + 4
            ) {
              indicatorType = 'volume';
            }
          }

          const macdHistogram = macdHistogramSeriesRef.current;
          const macdHistogramValue = Number(param.seriesData.get(macdHistogram)?.value);
          if (!indicatorType && macdHistogram && macdPane === paneIndex && Number.isFinite(macdHistogramValue)) {
            const histogramY = Number(macdHistogram.priceToCoordinate(macdHistogramValue));
            const histogramBaseY = Number(macdHistogram.priceToCoordinate(0));
            if (
              Number.isFinite(histogramY) &&
              Number.isFinite(histogramBaseY) &&
              pointY >= Math.min(histogramY, histogramBaseY) - 4 &&
              pointY <= Math.max(histogramY, histogramBaseY) + 4
            ) {
              indicatorType = 'macd';
            }
          }

          const candidates = [
            { type: 'sma', series: smaSeriesRef.current, pane: 0 },
            { type: 'ema', series: emaSeriesRef.current, pane: 0 },
            { type: 'rsi', series: rsiSeriesRef.current, pane: rsiPane },
            { type: 'macd', series: macdSeriesRef.current, pane: macdPane },
            { type: 'macd', series: macdSignalSeriesRef.current, pane: macdPane },
          ];
          let closest = null;

          candidates.forEach(({ type, series, pane }) => {
            if (indicatorType) return;
            if (!series || !indicatorsRef.current[type] || indicatorsRef.current[`${type}Visible`] === false || pane !== paneIndex) return;
            const value = Number(param.seriesData.get(series)?.value);
            if (!Number.isFinite(value)) return;
            const seriesY = Number(series.priceToCoordinate(value));
            if (!Number.isFinite(seriesY)) return;
            const distance = Math.abs(seriesY - pointY);
            if (distance <= 10 && (!closest || distance < closest.distance)) closest = { type, distance };
          });

          if (closest) indicatorType = closest.type;
        }

        if (indicatorType) {
          setExpandedIndicator(indicatorType);
          setSelectedDrawingId(null);
          setTool(null);
        } else {
          setExpandedIndicator(null);
        }
        return;
      }
      if (isSpacePressedRef.current) return;
      if (toolRef.current) return;
      if (dragDrawingRef.current) return;
      if (!param?.point) return;

      setReplayPointFromCoordinates(param.point.x, param.point.y, true);
      setReplayMode(true);
      setIsReplayPricePickActive(false);
    };

    const handleCrosshairMove = (param) => {
      const candle = param?.time != null ? param?.seriesData?.get(candleSeries) : null;
      const nextCandle = candle && [candle.open, candle.high, candle.low, candle.close].every((value) => Number.isFinite(Number(value)))
        ? {
            time: Number(param.time),
            open: Number(candle.open),
            high: Number(candle.high),
            low: Number(candle.low),
            close: Number(candle.close),
          }
        : null;

      setHoveredLegendCandle((current) => {
        if (!nextCandle) return current === null ? current : null;
        if (
          current?.time === nextCandle.time
          && current?.open === nextCandle.open
          && current?.high === nextCandle.high
          && current?.low === nextCandle.low
          && current?.close === nextCandle.close
        ) {
          return current;
        }

        return nextCandle;
      });
    };

    chart.timeScale().subscribeVisibleLogicalRangeChange(handleVisibleRangeChange);
    chart.subscribeClick(handleChartClick);
    chart.subscribeCrosshairMove(handleCrosshairMove);

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;
    smaSeriesRef.current = smaSeries;
    emaSeriesRef.current = emaSeries;
    rsiSeriesRef.current = rsiSeries;
    macdSeriesRef.current = macdSeries;
    macdSignalSeriesRef.current = macdSignalSeries;
    macdHistogramSeriesRef.current = macdHistogramSeries;

    resizeObserverRef.current = new ResizeObserver(() => {
      if (!containerRef.current || !chartRef.current) return;
      const width = containerRef.current.clientWidth;
      const wasNarrow = isNarrowChartRef.current;
      isNarrowChartRef.current = width > 0 && width < NARROW_CHART_BREAKPOINT;
      chartRef.current.applyOptions({
        width,
        height: containerRef.current.clientHeight || CHART_HEIGHT,
        ...(wasNarrow !== isNarrowChartRef.current
          ? { layout: { fontSize: isNarrowChartRef.current ? 9 : 10 } }
          : null),
      });
      // Changing the chart's total height can silently reset/redistribute
      // per-pane heights set by the indicators effect (observed: volume's
      // explicit setHeight() gets wiped out, main pane fills the gap) -
      // reassert them right after any chart-level resize.
      applyIndicatorPaneHeightsRef.current();
      scheduleOverlayRender();
    });

    resizeObserverRef.current.observe(containerRef.current);

    const findSeriesForPane = (paneIndex) => {
      const candidates = [
        candleSeriesRef.current,
        volumeSeriesRef.current,
        rsiSeriesRef.current,
        macdSeriesRef.current,
        macdSignalSeriesRef.current,
        macdHistogramSeriesRef.current,
        smaSeriesRef.current,
        emaSeriesRef.current,
      ];

      for (const candidate of candidates) {
        if (!candidate) continue;
        try {
          if (candidate.getPane?.()?.paneIndex?.() === paneIndex) return candidate;
        } catch {
          // series may already be disposed
        }
      }

      return null;
    };

    const getCurrentPriceRange = (paneIndex, series, paneHeight) => {
      const chart = chartRef.current;
      if (!series) return null;

      const visibleRange = chart?.priceScale('right', paneIndex)?.getVisibleRange();
      if (
        visibleRange &&
        Number.isFinite(Number(visibleRange.from)) &&
        Number.isFinite(Number(visibleRange.to)) &&
        Number(visibleRange.from) !== Number(visibleRange.to)
      ) {
        return {
          from: Math.min(Number(visibleRange.from), Number(visibleRange.to)),
          to: Math.max(Number(visibleRange.from), Number(visibleRange.to)),
        };
      }

      const topPrice = series.coordinateToPrice(0);
      const bottomPrice = series.coordinateToPrice(paneHeight);

      if (
        topPrice != null &&
        bottomPrice != null &&
        Number.isFinite(Number(topPrice)) &&
        Number.isFinite(Number(bottomPrice)) &&
        Number(topPrice) !== Number(bottomPrice)
      ) {
        return {
          from: Math.min(Number(topPrice), Number(bottomPrice)),
          to: Math.max(Number(topPrice), Number(bottomPrice)),
        };
      }

      if (paneIndex !== 0) return null;

      const prices = visibleCandlesRef.current.flatMap((candle) => [candle.high, candle.low]);
      if (!prices.length) return null;

      const minPrice = Math.min(...prices);
      const maxPrice = Math.max(...prices);
      const padding = Math.max((maxPrice - minPrice) * 0.1, Math.abs(maxPrice) * 0.001, 1);

      return {
        from: minPrice - padding,
        to: maxPrice + padding,
      };
    };

    const handlePriceScaleWheel = (event) => {
      const chart = chartRef.current;
      const el = containerRef.current;
      if (!chart || !el || event.deltaY === 0) return;

      const panes = chart.panes?.() ?? [];
      if (!panes.length) return;

      const priceScaleWidth = chart.priceScale('right').width();
      if (!priceScaleWidth) return;

      const rect = el.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const isOnRightPriceScale = x >= rect.width - priceScaleWidth && x <= rect.width;

      if (!isOnRightPriceScale || y < 0 || y > rect.height) return;

      let paneTop = 0;
      let paneIndex = null;
      let paneHeight = 0;
      for (let i = 0; i < panes.length; i += 1) {
        const height = Number(panes[i]?.getHeight?.()) || 0;
        if (y >= paneTop && y < paneTop + height) {
          paneIndex = i;
          paneHeight = height;
          break;
        }
        paneTop += height;
      }
      if (paneIndex == null) return;

      const series = findSeriesForPane(paneIndex);
      if (!series) return;

      const range = getCurrentPriceRange(paneIndex, series, paneHeight);
      if (!range) return;

      const span = range.to - range.from;
      if (!Number.isFinite(span) || span <= 0) return;

      const paneLocalY = y - paneTop;
      const cursorPrice = series.coordinateToPrice(paneLocalY);
      const anchorPrice =
        cursorPrice != null && Number.isFinite(Number(cursorPrice))
          ? Number(cursorPrice)
          : range.from + span / 2;
      const anchorRatio = Math.min(Math.max((anchorPrice - range.from) / span, 0), 1);
      const zoomFactor = event.deltaY < 0 ? 0.85 : 1.15;
      const nextSpan = Math.max(span * zoomFactor, Math.abs(anchorPrice) * 0.000001, 0.000001);

      event.preventDefault();
      event.stopImmediatePropagation();

      chart.priceScale('right', paneIndex).setVisibleRange({
        from: anchorPrice - nextSpan * anchorRatio,
        to: anchorPrice + nextSpan * (1 - anchorRatio),
      });
      scheduleOverlayRender();
    };

    // Dragging the right price scale is handled entirely inside lightweight-charts with no
    // subscription event of its own (unlike the time scale's subscribeVisibleLogicalRangeChange
    // above) — the canvas repaints synchronously as part of the browser's own mouse handling,
    // invisible to React. Reacting to individual `mousemove` events (the previous approach)
    // wasn't reliable: nothing guarantees every native mousemove during a fast drag actually
    // reaches this listener before the library's own canvas has already moved on, so the SVG
    // overlay could still fall a step behind and visibly wiggle/misalign against the candles.
    // This instead drives the overlay from its own requestAnimationFrame loop for the entire
    // mousedown-to-mouseup span, independent of how many (or few) native events fire in between —
    // it re-syncs every real frame no matter which internal gesture is happening.
    const stepViewportDragOverlay = () => {
      if (!isViewportDraggingRef.current) {
        viewportDragFrameRef.current = null;
        return;
      }
      flushSync(() => setOverlayRenderVersion((version) => version + 1));
      viewportDragFrameRef.current = requestAnimationFrame(stepViewportDragOverlay);
    };

    const handleViewportDragStart = () => {
      // Matches the same condition the chart's own handleScroll/handleScale options use — with
      // a drawing tool active (and space not held), a mousedown-drag draws instead of panning or
      // scaling, so there is no viewport change for this loop to keep the overlay synced with.
      if (!isSpacePressedRef.current && toolRef.current) return;
      isViewportDraggingRef.current = true;
      if (!viewportDragFrameRef.current) {
        viewportDragFrameRef.current = requestAnimationFrame(stepViewportDragOverlay);
      }
    };

    const handleViewportDragEnd = () => {
      if (!isViewportDraggingRef.current) return;
      isViewportDraggingRef.current = false;
      if (viewportDragFrameRef.current) {
        cancelAnimationFrame(viewportDragFrameRef.current);
        viewportDragFrameRef.current = null;
      }
      // One last sync in case the mouseup lands between two animation frames.
      queueMicrotask(() => {
        flushSync(() => setOverlayRenderVersion((version) => version + 1));
      });
    };

    const handleViewportInteraction = () => {
      if (isViewportDraggingRef.current) return; // the per-frame drag loop above already covers this
      if (overlayRenderFrameRef.current) {
        cancelAnimationFrame(overlayRenderFrameRef.current);
        overlayRenderFrameRef.current = null;
      }
      queueMicrotask(() => {
        flushSync(() => setOverlayRenderVersion((version) => version + 1));
      });
    };

    containerRef.current.addEventListener('wheel', handlePriceScaleWheel, { passive: false, capture: true });
    containerRef.current.addEventListener('wheel', handleViewportInteraction, { passive: true });
    // Registered on `window`, not containerRef.current, and on both event models: an indicator
    // pane's own price scale, and pane-height resizing (layout.panes.enableResize, the divider
    // between stacked panes) are, like the main price scale, handled entirely inside
    // lightweight-charts with no subscription event of their own. Some of these internal
    // gestures render on nested elements (e.g. the resize-divider hit target) that may capture
    // the pointer or otherwise not reliably bubble a plain container-scoped listener; a window
    // listener still sees the event on its way down/up regardless of which descendant it
    // targets. isPointInContainer guards against starting the loop for clicks elsewhere on the
    // page entirely; isViewportDraggingRef coalesces a duplicate start if both event models fire.
    const isPointInContainer = (event) => {
      const el = containerRef.current;
      if (!el) return false;
      const point = event.touches?.[0] ?? event;
      const rect = el.getBoundingClientRect();
      return (
        point.clientX >= rect.left && point.clientX <= rect.right
        && point.clientY >= rect.top && point.clientY <= rect.bottom
      );
    };
    const handleWindowViewportDragStart = (event) => {
      if (!isPointInContainer(event)) return;
      handleViewportDragStart();
    };
    window.addEventListener('mousedown', handleWindowViewportDragStart, { passive: true });
    window.addEventListener('pointerdown', handleWindowViewportDragStart, { passive: true });
    window.addEventListener('mouseup', handleViewportDragEnd, { passive: true });
    window.addEventListener('pointerup', handleViewportDragEnd, { passive: true });
    containerRef.current.addEventListener('mousemove', handleViewportInteraction, { passive: true });
    containerRef.current.addEventListener('mouseup', handleViewportInteraction, { passive: true });
    containerRef.current.addEventListener('mouseleave', handleViewportInteraction, { passive: true });

    return () => {
      if (replayTimerRef.current) {
        clearInterval(replayTimerRef.current);
        replayTimerRef.current = null;
      }

      chart.timeScale().unsubscribeVisibleLogicalRangeChange(handleVisibleRangeChange);
      chart.unsubscribeClick(handleChartClick);
      chart.unsubscribeCrosshairMove(handleCrosshairMove);

      if (containerRef.current) {
        containerRef.current.removeEventListener('wheel', handlePriceScaleWheel, { capture: true });
        containerRef.current.removeEventListener('wheel', handleViewportInteraction);
        containerRef.current.removeEventListener('mousemove', handleViewportInteraction);
        containerRef.current.removeEventListener('mouseup', handleViewportInteraction);
        containerRef.current.removeEventListener('mouseleave', handleViewportInteraction);
      }
      window.removeEventListener('mousedown', handleWindowViewportDragStart);
      window.removeEventListener('pointerdown', handleWindowViewportDragStart);
      window.removeEventListener('mouseup', handleViewportDragEnd);
      window.removeEventListener('pointerup', handleViewportDragEnd);

      if (overlayRenderFrameRef.current) {
        cancelAnimationFrame(overlayRenderFrameRef.current);
        overlayRenderFrameRef.current = null;
      }

      isViewportDraggingRef.current = false;
      if (viewportDragFrameRef.current) {
        cancelAnimationFrame(viewportDragFrameRef.current);
        viewportDragFrameRef.current = null;
      }

      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
        resizeObserverRef.current = null;
      }

      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      smaSeriesRef.current = null;
      emaSeriesRef.current = null;
      rsiSeriesRef.current = null;
      macdSeriesRef.current = null;
      macdSignalSeriesRef.current = null;
      macdHistogramSeriesRef.current = null;
    };
  }, [scheduleOverlayRender, selectedPriceAutoscaleInfoProvider, setReplayPointFromCoordinates]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    chart.timeScale().applyOptions({
      barSpacing: candleSize,
    });
    scheduleOverlayRender();
  }, [candleSize, scheduleOverlayRender]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    chart.applyOptions({
      layout: {
        background: { color: chartTheme.background },
        textColor: chartTheme.text,
        attributionLogo: false,
        fontSize: isNarrowChartRef.current ? 9 : 10,
      },
      grid: {
        vertLines: { color: chartTheme.grid },
        horzLines: { color: chartTheme.grid },
      },
      rightPriceScale: {
        borderColor: chartTheme.border,
      },
      timeScale: {
        borderColor: chartTheme.border,
      },
    });
    scheduleOverlayRender();
  }, [chartTheme, scheduleOverlayRender]);

  useEffect(() => {
    try { localStorage.setItem(indicatorStorageKey, JSON.stringify(indicators)); } catch {}
    const volume = volumeSeriesRef.current; const sma = smaSeriesRef.current; const ema = emaSeriesRef.current; const rsi = rsiSeriesRef.current;
    const macd = macdSeriesRef.current; const macdSignal = macdSignalSeriesRef.current; const macdHistogram = macdHistogramSeriesRef.current;
    const indicatorsGloballyHidden = Boolean(hiddenLayers.indicators);
    const isVolumeVisible = indicators.volume && indicators.volumeVisible !== false && !indicatorsGloballyHidden;
    volume?.applyOptions({ visible: isVolumeVisible });
    sma?.applyOptions({ visible: indicators.sma && indicators.smaVisible !== false && !indicatorsGloballyHidden, color: indicators.smaColor ?? '#2dd4bf', lineWidth: Number(indicators.smaLineWidth) || 2 });
    ema?.applyOptions({ visible: indicators.ema && indicators.emaVisible !== false && !indicatorsGloballyHidden, color: indicators.emaColor ?? '#f59e0b', lineWidth: Number(indicators.emaLineWidth) || 2 });
    const isRsiVisible = indicators.rsi && indicators.rsiVisible !== false && !indicatorsGloballyHidden;
    const isMacdVisible = indicators.macd && indicators.macdVisible !== false && !indicatorsGloballyHidden;
    rsi?.applyOptions({ visible: isRsiVisible, color: indicators.rsiColor ?? '#a855f7', lineWidth: Number(indicators.rsiLineWidth) || 2 });
    macd?.applyOptions({ visible: isMacdVisible, color: indicators.macdColor ?? '#2dd4bf', lineWidth: Number(indicators.macdLineWidth) || 2 });
    macdSignal?.applyOptions({ visible: isMacdVisible, color: indicators.macdSignalColor ?? '#f59e0b', lineWidth: Number(indicators.macdLineWidth) || 2 });
    macdHistogram?.applyOptions({ visible: isMacdVisible });

    volume?.moveToPane(0);
    rsi?.moveToPane(0);
    macd?.moveToPane(0);
    macdSignal?.moveToPane(0);
    macdHistogram?.moveToPane(0);

    let nextLowerPane = 1;
    const paneHeightJobs = [];
    if (isVolumeVisible) {
      volume?.moveToPane(nextLowerPane);
      const volumeSize = Math.min(45, Math.max(10, Number(indicators.volumeSize) || 20));
      const paneIndex = nextLowerPane;
      paneHeightJobs.push(() => chartRef.current?.panes?.()[paneIndex]?.setHeight(
        Math.max(60, Math.round((overlaySize.height || CHART_HEIGHT) * (volumeSize / 100)))
      ));
      nextLowerPane += 1;
    }
    if (isRsiVisible) {
      rsi?.moveToPane(nextLowerPane);
      const paneIndex = nextLowerPane;
      paneHeightJobs.push(() => chartRef.current?.panes?.()[paneIndex]?.setHeight(
        Math.max(80, Math.round((overlaySize.height || CHART_HEIGHT) * ((Number(indicators.rsiSize) || 25) / 100)))
      ));
      nextLowerPane += 1;
    }
    if (isMacdVisible) {
      macd?.moveToPane(nextLowerPane);
      macdSignal?.moveToPane(nextLowerPane);
      macdHistogram?.moveToPane(nextLowerPane);
      const paneIndex = nextLowerPane;
      paneHeightJobs.push(() => chartRef.current?.panes?.()[paneIndex]?.setHeight(
        Math.max(80, Math.round((overlaySize.height || CHART_HEIGHT) * ((Number(indicators.macdSize) || 25) / 100)))
      ));
    }

    // A pane just created by moveToPane() doesn't reliably accept setHeight()
    // in the same synchronous tick (observed: the call silently no-ops on
    // some mounts, leaving the pane at 0px and the main pane stretched to
    // fill the gap). Layout can also keep shifting for a bit after mount
    // (fonts, scrollbars, intervening container resizes - each of which can
    // reset per-pane heights back to an even split via the container
    // ResizeObserver's applyOptions({height}) call, see the ref below) -
    // reasserting on a short interval for a moment reliably outlasts that
    // instability instead of gambling on one specific retry delay.
    const applyPaneHeights = () => paneHeightJobs.forEach((job) => job());
    applyIndicatorPaneHeightsRef.current = applyPaneHeights;
    applyPaneHeights();
    const raf1 = requestAnimationFrame(applyPaneHeights);
    let watchdogTicks = 0;
    const watchdogInterval = setInterval(() => {
      applyPaneHeights();
      scheduleOverlayRender();
      watchdogTicks += 1;
      if (watchdogTicks >= 8) clearInterval(watchdogInterval);
    }, 150);

    scheduleOverlayRender();

    return () => {
      cancelAnimationFrame(raf1);
      clearInterval(watchdogInterval);
    };
  }, [indicatorStorageKey, indicators, overlaySize.height, scheduleOverlayRender, hiddenLayers.indicators]);

  useEffect(() => {
    smaSeriesRef.current?.setData(indicators.sma ? movingAverage(visibleCandles, Number(indicators.smaPeriod) || 20) : []);
    emaSeriesRef.current?.setData(indicators.ema ? exponentialMovingAverage(visibleCandles, Number(indicators.emaPeriod) || 20) : []);
    rsiSeriesRef.current?.setData(indicators.rsi ? relativeStrengthIndex(visibleCandles, Number(indicators.rsiPeriod) || 14) : []);
    const macdFastPeriod = Math.max(2, Number(indicators.macdFastPeriod) || 12);
    const macdSlowPeriod = Math.max(macdFastPeriod + 1, Number(indicators.macdSlowPeriod) || 26);
    const macdData = indicators.macd
      ? movingAverageConvergenceDivergence(
        visibleCandles,
        macdFastPeriod,
        macdSlowPeriod,
        Math.max(2, Number(indicators.macdSignalPeriod) || 9)
      )
      : { macd: [], signal: [], histogram: [] };
    macdSeriesRef.current?.setData(macdData.macd);
    macdSignalSeriesRef.current?.setData(macdData.signal);
    macdHistogramSeriesRef.current?.setData(macdData.histogram.map((point) => ({
      ...point,
      color: point.value >= 0 ? (indicators.macdUpColor ?? '#26a69a') : (indicators.macdDownColor ?? '#ef5350'),
    })));
    scheduleOverlayRender();
  }, [indicators, scheduleOverlayRender, visibleCandles]);

  useEffect(() => {
    if (selectedIndicator && !indicators[selectedIndicator]) {
      setSelectedIndicator(null);
    }
    if (expandedIndicator && !indicators[expandedIndicator]) {
      setExpandedIndicator(null);
    }
  }, [expandedIndicator, indicators, selectedIndicator]);

  useEffect(() => {
    if (tool || selectedDrawingId) {
      setSelectedIndicator(null);
      setExpandedIndicator(null);
    }
  }, [selectedDrawingId, tool]);

  useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    if (!candleSeries) return;

    const { bodyEnabled, borderEnabled, borderUp, borderDown, wickEnabled, wickUp, wickDown } = chartDisplay.candles;
    // lightweight-charts has no bodyVisible option — the body is always
    // upColor/downColor fill, so "hiding" it means making that fill
    // transparent (hollow candle) rather than toggling a visibility flag.
    const TRANSPARENT = 'rgba(0, 0, 0, 0)';

    candleSeries.applyOptions({
      upColor: bodyEnabled ? candleColors.up : TRANSPARENT,
      downColor: bodyEnabled ? candleColors.down : TRANSPARENT,
      borderVisible: borderEnabled,
      borderUpColor: borderUp || candleColors.up,
      borderDownColor: borderDown || candleColors.down,
      wickVisible: wickEnabled,
      wickUpColor: wickUp || candleColors.up,
      wickDownColor: wickDown || candleColors.down,
    });
  }, [candleColors.down, candleColors.up, chartDisplay.candles]);

  useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    if (!candleSeries) return;

    candleSeries.applyOptions({ priceLineVisible: chartDisplay.priceLines.last });
  }, [chartDisplay.priceLines.last]);

  useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    if (!candleSeries) return undefined;

    if (previousClosePriceLineRef.current) {
      candleSeries.removePriceLine(previousClosePriceLineRef.current);
      previousClosePriceLineRef.current = null;
    }

    if (chartDisplay.priceLines.previousClose && allCandles.length > 1) {
      const previousClose = Number(allCandles[allCandles.length - 2]?.close);
      if (Number.isFinite(previousClose)) {
        previousClosePriceLineRef.current = candleSeries.createPriceLine({
          price: previousClose,
          color: chartTheme.text,
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          axisLabelVisible: true,
          title: 'Prev close',
        });
      }
    }

    return () => {
      if (previousClosePriceLineRef.current && candleSeriesRef.current) {
        candleSeriesRef.current.removePriceLine(previousClosePriceLineRef.current);
        previousClosePriceLineRef.current = null;
      }
    };
  }, [chartDisplay.priceLines.previousClose, allCandles, chartTheme.text]);

  useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    if (!candleSeries) return undefined;

    [highPriceLineRef, lowPriceLineRef].forEach((ref) => {
      if (ref.current) {
        candleSeries.removePriceLine(ref.current);
        ref.current = null;
      }
    });

    if (chartDisplay.priceLines.highLow && visibleCandles.length) {
      const highs = visibleCandles.map((c) => Number(c.high)).filter(Number.isFinite);
      const lows = visibleCandles.map((c) => Number(c.low)).filter(Number.isFinite);
      if (highs.length && lows.length) {
        highPriceLineRef.current = candleSeries.createPriceLine({
          price: Math.max(...highs),
          color: '#22c55e',
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          axisLabelVisible: true,
          title: 'High',
        });
        lowPriceLineRef.current = candleSeries.createPriceLine({
          price: Math.min(...lows),
          color: '#ef4444',
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          axisLabelVisible: true,
          title: 'Low',
        });
      }
    }

    return () => {
      const series = candleSeriesRef.current;
      if (!series) return;
      [highPriceLineRef, lowPriceLineRef].forEach((ref) => {
        if (ref.current) {
          series.removePriceLine(ref.current);
          ref.current = null;
        }
      });
    };
  }, [chartDisplay.priceLines.highLow, visibleCandles]);

  useEffect(() => {
    const chart = chartRef.current;
    const candleSeries = candleSeriesRef.current;
    if (!chart || !candleSeries) return;

    chart.priceScale('right').applyOptions({
      mode: chartDisplay.scales.logScale ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal,
    });

    candleSeries.applyOptions({
      priceFormat: {
        type: 'custom',
        minMove: 0.00000001,
        formatter: chartDisplay.scales.precision === 'default'
          ? (value) => formatPriceScaleValue(value, isNarrowChartRef.current)
          : (value) => Number(value).toFixed(Number(chartDisplay.scales.precision)),
      },
    });
  }, [chartDisplay.scales.logScale, chartDisplay.scales.precision]);

  useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    if (!candleSeries) return;
    // Independent of the one-off `autoScale: true` re-enable on Replay -> Live
    // transitions elsewhere in this effect (that reset is intentional and left
    // as-is); this only reflects the user's Scales preference otherwise.
    candleSeries.priceScale().applyOptions({ autoScale: chartDisplay.scales.autoScale });
  }, [chartDisplay.scales.autoScale]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    chart.applyOptions({
      layout: {
        background: { color: chartDisplay.canvas.background || chartTheme.background },
      },
      grid: {
        vertLines: { color: chartDisplay.canvas.gridColor || chartTheme.grid },
        horzLines: { color: chartDisplay.canvas.gridColor || chartTheme.grid },
      },
    });
  }, [chartDisplay.canvas.background, chartDisplay.canvas.gridColor, chartTheme.background, chartTheme.grid]);

  useEffect(() => {
    const chart = chartRef.current;
    const candleSeries = candleSeriesRef.current;
    const volumeSeries = volumeSeriesRef.current;

    if (!chart || !candleSeries || !volumeSeries) return;

    // Live streaming replaces the full series data on every tick (setAllCandles
    // gives visibleCandles a new array identity per WebSocket message, not only
    // when a bar completes) — unlike Replay, where visibleCandles only changes
    // on an explicit step/play. lightweight-charts' own shiftVisibleRangeOnNewBar
    // (on by default) silently re-anchors the visible logical range whenever
    // setData grows the bar count while the previous last bar was still on
    // screen — exactly the geometry of having scrolled a little into the empty
    // future whitespace to place a drawing. That reflow moves the viewport out
    // from under the cursor between mousedown and the next tick, so a click
    // there can land on the wrong point or appear to do nothing. Every other
    // viewport-mutating call site in this file guards itself with
    // isProgrammaticRangeChangeRef; this tick path is the one that never was,
    // and docs/developer/live-market-streaming.md already states the general
    // rule ("preserve the user's viewport") this brings the tick path in line
    // with. Restoring the pre-update range only when the user wasn't already
    // pinned to the live edge keeps genuine "follow the live price" behavior
    // intact for anyone actually watching the edge.
    const timeScale = chart.timeScale();
    const priorVisibleRange = !replayMode ? timeScale.getVisibleLogicalRange() : null;
    const previousLastIndex = previousVisibleCandleCountRef.current - 1;
    const wasPinnedToLiveEdge = !priorVisibleRange || priorVisibleRange.to >= previousLastIndex;

    candleSeries.setData(
      visibleCandles.map((c) => ({
        time: c.time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }))
    );

    volumeSeries.setData(visibleVolume);

    if (!replayMode && priorVisibleRange && !wasPinnedToLiveEdge) {
      timeScale.setVisibleLogicalRange(priorVisibleRange);
    }

    previousVisibleCandleCountRef.current = visibleCandles.length;

    // Returning to Live expands visibleCandles from the Replay slice to the
    // complete series. Wait until that complete data has reached the chart
    // before moving the viewport; scrolling earlier leaves the viewport at
    // the old Replay checkpoint while the live price line uses the last bar.
    if (pendingBackToLiveRef.current && !replayMode) {
      pendingBackToLiveRef.current = false;
      isProgrammaticRangeChangeRef.current = true;
      requestAnimationFrame(() => {
        chart.timeScale().scrollToRealTime();
        requestAnimationFrame(() => {
          candleSeries.priceScale().applyOptions({ autoScale: true });
          isProgrammaticRangeChangeRef.current = false;
          scheduleOverlayRender();
        });
      });
    }

    scheduleOverlayRender();
  }, [replayMode, scheduleOverlayRender, visibleCandles, visibleVolume]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !allCandles.length) return;
    if (pendingVisibleViewRef.current || pendingVisibleLogicalRangeRef.current) return;

    const viewportKey = `${exchange}:${marketCategory}:${symbol}:${timeframe}`;
    if (viewportInitializedKeyRef.current === viewportKey) return;
    viewportInitializedKeyRef.current = viewportKey;

    isProgrammaticRangeChangeRef.current = true;
    chart.timeScale().fitContent();
    resetPriceScalesToAutoScale(chart);

    requestAnimationFrame(() => {
      isProgrammaticRangeChangeRef.current = false;
      scheduleOverlayRender();
    });
  }, [allCandles.length, exchange, marketCategory, scheduleOverlayRender, symbol, timeframe]);

  useEffect(() => {
    const chart = chartRef.current;
    const pendingView = pendingVisibleViewRef.current;
    if (!chart || !pendingView || !visibleCandles.length) return;
    if (pendingVisibleLogicalRangeRef.current) return;

    pendingVisibleViewRef.current = null;
    isProgrammaticRangeChangeRef.current = true;

    const intervalSeconds = TIMEFRAME_SECONDS[timeframe] ?? 60;
    const rawCenterLogical = estimateDrawingLogicalFromTime(
      visibleCandles,
      pendingView.centerTime,
      intervalSeconds
    );
    // Replay mode truncates visibleCandles to the replay cursor (see the
    // visibleCandles memo). A viewport carried over from the previous
    // timeframe can center on a time past that cursor — most easily hit
    // switching to a coarser timeframe like 30m, where far fewer bars cover
    // the same real-time span — landing the whole logical range beyond the
    // last real candle. The chart then reads as completely blank even
    // though the data and legend are fine. Clamp to the last loaded bar so
    // some real candles always stay in view, mirroring the same clamp used
    // for drawing-anchor framing above.
    const centerLogical = Number.isFinite(rawCenterLogical) && replayMode
      ? Math.min(rawCenterLogical, visibleCandles.length - 1)
      : rawCenterLogical;
    const span = Math.max(Number(pendingView.logicalSpan) || 0, 6);

    if (Number.isFinite(centerLogical)) {
      chart.timeScale().setVisibleLogicalRange({
        from: centerLogical - (span / 2),
        to: centerLogical + (span / 2),
      });
    } else if (pendingView.timeRange?.from != null && pendingView.timeRange?.to != null) {
      chart.timeScale().setVisibleRange(pendingView.timeRange);
    } else {
      chart.timeScale().fitContent();
    }
    resetPriceScalesToAutoScale(chart);

    viewportInitializedKeyRef.current = `${exchange}:${marketCategory}:${symbol}:${timeframe}`;

    requestAnimationFrame(() => {
      isProgrammaticRangeChangeRef.current = false;
      scheduleOverlayRender();
    });
  }, [exchange, marketCategory, replayMode, scheduleOverlayRender, symbol, timeframe, visibleCandles.length]);

  useEffect(() => {
    const chart = chartRef.current;
    const pendingRange = pendingVisibleLogicalRangeRef.current;
    if (!chart || !pendingRange || !visibleCandles.length) return;

    pendingVisibleLogicalRangeRef.current = null;
    pendingVisibleViewRef.current = null;
    isProgrammaticRangeChangeRef.current = true;
    chart.timeScale().setVisibleLogicalRange(pendingRange);
    resetPriceScalesToAutoScale(chart);
    viewportInitializedKeyRef.current = `${exchange}:${marketCategory}:${symbol}:${timeframe}`;

    requestAnimationFrame(() => {
      isProgrammaticRangeChangeRef.current = false;
      scheduleOverlayRender();
    });
  }, [exchange, marketCategory, scheduleOverlayRender, symbol, timeframe, visibleCandles.length]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !replayMode || !followReplay || !visibleCandles.length) return;

    isProgrammaticRangeChangeRef.current = true;
    chart.timeScale().scrollToPosition(5, false);

    requestAnimationFrame(() => {
      isProgrammaticRangeChangeRef.current = false;
      scheduleOverlayRender();
    });
  }, [followReplay, replayIndex, replayMode, scheduleOverlayRender, visibleCandles.length]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    chart.applyOptions({
      handleScroll: isSpacePressed || !tool,
      handleScale: isSpacePressed || !tool,
    });
  }, [isSpacePressed, tool]);

  useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    if (!candleSeries) return;

    candleSeries.applyOptions({
      autoscaleInfoProvider: selectedPriceAutoscaleInfoProvider,
    });

    if (selectedPriceLineRef.current) {
      candleSeries.removePriceLine(selectedPriceLineRef.current);
      selectedPriceLineRef.current = null;
    }

    if (selectedReplayPrice != null) {
      selectedPriceLineRef.current = candleSeries.createPriceLine({
        price: selectedReplayPrice,
        color: chartTheme.selectedReplayPriceMarker,
        lineWidth: 2,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: 'Replay',
      });
    }

    return () => {
      if (selectedPriceLineRef.current && candleSeriesRef.current) {
        candleSeriesRef.current.removePriceLine(selectedPriceLineRef.current);
        selectedPriceLineRef.current = null;
      }
    };
  }, [
    replayMode,
    selectedPriceAutoscaleInfoProvider,
    selectedReplayPrice,
    chartTheme,
    timeframe,
    backtestAccount,
    symbol,
    visibleCandles.length,
  ]);

  useEffect(() => {
    if (!replayMode || !isPlaying || replayIndex >= allCandles.length - 1) {
      if (replayTimerRef.current) {
        clearInterval(replayTimerRef.current);
        replayTimerRef.current = null;
      }
      return;
    }

    replayTimerRef.current = setInterval(() => {
      setReplayIndex((prev) => {
        if (prev >= allCandles.length - 1) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, playbackSpeed);

    return () => {
      if (replayTimerRef.current) {
        clearInterval(replayTimerRef.current);
        replayTimerRef.current = null;
      }
    };
  }, [replayMode, isPlaying, replayIndex, allCandles.length, playbackSpeed]);

  const getKeyboardPriceStep = useCallback(() => {
    const series = candleSeriesRef.current;
    const height = overlaySize.height || CHART_HEIGHT;

    if (series && height > 0) {
      const middleY = height / 2;
      const priceAtMiddle = series.coordinateToPrice(middleY);
      const priceAtOffset = series.coordinateToPrice(Math.max(0, middleY - 8));
      const step = Math.abs(Number(priceAtOffset) - Number(priceAtMiddle));

      if (Number.isFinite(step) && step > 0) {
        return step;
      }
    }

    const visibleCandles = visibleCandlesRef.current.length
      ? visibleCandlesRef.current
      : allCandles;
    const highs = visibleCandles.map((candle) => Number(candle.high)).filter(Number.isFinite);
    const lows = visibleCandles.map((candle) => Number(candle.low)).filter(Number.isFinite);
    const high = highs.length ? Math.max(...highs) : 0;
    const low = lows.length ? Math.min(...lows) : 0;
    const range = high - low;

    return range > 0 ? range / 100 : 1;
  }, [allCandles, overlaySize.height]);

  const handleNudgeSelectedDrawing = useCallback((key, multiplier = 1) => {
    const selectedId = selectedDrawingIdRef.current;
    if (!selectedId) return false;

    const selected = drawingsRef.current.find((drawing) => drawing.id === selectedId);
    if (!selected) return false;

    const intervalSeconds = TIMEFRAME_SECONDS[timeframe] ?? 60;
    const priceStep = getKeyboardPriceStep();
    let deltaLogical = 0;
    let deltaTime = 0;
    let deltaPrice = 0;

    if (key === 'ArrowLeft' || key === 'ArrowRight') {
      deltaLogical = (key === 'ArrowLeft' ? -1 : 1) * multiplier;
      deltaTime = intervalSeconds * deltaLogical;
    }

    if (key === 'ArrowUp' || key === 'ArrowDown') {
      deltaPrice = (key === 'ArrowUp' ? 1 : -1) * priceStep * multiplier;
    }

    if (!deltaTime && !deltaPrice && !deltaLogical) return false;

    const next = drawingsRef.current.map((drawing) => (
      drawing.id === selectedId
        ? offsetDrawing(drawing, deltaTime, deltaPrice, deltaLogical)
        : drawing
    ));

    saveDrawings(next);
    setSelectedDrawingId(selectedId);
    return true;
  }, [getKeyboardPriceStep, saveDrawings, timeframe]);

  const handleDuplicateSelectedDrawing = useCallback(() => {
    const selectedId = selectedDrawingIdRef.current;
    if (!selectedId) return false;

    const selected = drawingsRef.current.find((drawing) => drawing.id === selectedId);
    if (!selected) return false;

    const intervalSeconds = TIMEFRAME_SECONDS[timeframe] ?? 60;
    const priceStep = getKeyboardPriceStep();
    const duplicate = offsetDrawing(
      {
        ...structuredClone(selected),
        id: `drawing-${Date.now()}`,
      },
      intervalSeconds,
      priceStep,
      1
    );
    const next = [...drawingsRef.current, duplicate];

    saveDrawings(next);
    setSelectedDrawingId(duplicate.id);
    setTool(null);
    setTempDrawing(null);
    setTextInput(null);

    return true;
  }, [getKeyboardPriceStep, saveDrawings, timeframe]);

  const handleFinishPathDrawing = useCallback(() => {
    const currentTemp = tempDrawingRef.current;
    if (!isPathDrawing(currentTemp)) return false;

    if ((currentTemp.points ?? []).length < 2) {
      tempDrawingRef.current = null;
      setTempDrawing(null);
      return false;
    }

    const completed = {
      ...currentTemp,
      id: `drawing-${Date.now()}`,
    };
    delete completed.previewPoint;

    appendDrawing(completed);
    tempDrawingRef.current = null;
    setTempDrawing(null);
    setTool(null);
    return true;
  }, [appendDrawing]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      const target = event.target;
      const tag = target?.tagName?.toLowerCase();
      const isTyping =
        tag === 'input' ||
        tag === 'textarea' ||
        target?.isContentEditable;

      if (isTyping) return;

      if (event.altKey && !event.repeat && ['l', 's'].includes(event.key.toLowerCase())) {
        const key = event.key.toLowerCase();
        if (key === 's' && marketCategory === 'spot') return;
        event.preventDefault();
        quickOpenBacktestPositionRef.current?.(key === 'l' ? 'long' : 'short');
        return;
      }

      if (event.code === 'Space') {
        event.preventDefault();

        if (!event.repeat) {
          if (!replayMode) {
            const nextIndex = Math.min(
              Math.max(0, Math.floor(allCandles.length * 0.3)),
              Math.max(0, allCandles.length - 1)
            );

            setReplayMode(true);
            setFollowReplay(true);
            setReplayIndex(nextIndex);
            setSelectedReplayPrice(allCandles[nextIndex]?.close ?? null);
            setIsReplayPricePickActive(false);
            setIsPlaying(true);
          } else if (replayIndex < allCandles.length - 1) {
            setIsPlaying((prev) => !prev);
          }
        }
      }

      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
        const multiplier = event.shiftKey ? 5 : 1;

        if (handleNudgeSelectedDrawing(event.key, multiplier)) {
          event.preventDefault();
        }
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        if (handleUndoDrawings()) {
          event.preventDefault();
        }
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') {
        if (handleDuplicateSelectedDrawing()) {
          event.preventDefault();
        }
      }

      if (event.key === 'Enter') {
        if (handleFinishPathDrawing()) {
          event.preventDefault();
        }
      }

      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedDrawingIdRef.current) {
        event.preventDefault();
        pushDrawingUndoSnapshot(selectedDrawingIdRef.current);
        const next = drawingsRef.current.filter((d) => d.id !== selectedDrawingIdRef.current);
        saveDrawings(next);
        setSelectedDrawingId(null);
      }

      if (event.key === 'Escape') {
        setIsFullscreen(false);
        setIsFullscreenEntryPanelOpen(false);
        tempDrawingRef.current = null;
        setTempDrawing(null);
        setTool(null);
        setTextInput(null);
        resizeDrawingRef.current = null;
        dragDrawingRef.current = null;
        dragBacktestOrderRef.current = null;
        setIsReplayPricePickActive(false);
      }
    };

    const handleKeyUp = (event) => {
      if (event.code === 'Space') {
        event.preventDefault();
        setIsSpacePressed(false);
        dragDrawingRef.current = null;
        resizeDrawingRef.current = null;
        dragBacktestOrderRef.current = null;
      }
    };

    window.addEventListener('keydown', handleKeyDown, { passive: false });
    window.addEventListener('keyup', handleKeyUp, { passive: false });

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [allCandles, handleDuplicateSelectedDrawing, handleFinishPathDrawing, handleNudgeSelectedDrawing, handleUndoDrawings, marketCategory, pushDrawingUndoSnapshot, replayIndex, replayMode, saveDrawings]);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;

    const getRelativePoint = (event) => {
      const rect = el.getBoundingClientRect();
      return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
    };

    const isInMainPricePane = (y) => {
      const paneHeight = Number(chartRef.current?.panes?.()[0]?.getHeight?.());
      return !Number.isFinite(paneHeight) || (y >= 0 && y <= paneHeight);
    };

    const setChartMouseInteractions = (enabled) => {
      const chart = chartRef.current;
      if (!chart) return;

      chart.applyOptions({
        handleScroll: enabled,
        handleScale: enabled,
      });
    };

    const restoreChartMouseInteractions = () => {
      setChartMouseInteractions(isSpacePressedRef.current || !toolRef.current);
    };

    const handleMouseDown = (event) => {
      if (
        event.target?.closest?.(
          '[data-chart-ui], button, input, textarea, select, [contenteditable="true"]'
        )
      ) {
        return;
      }

      if (isSpacePressedRef.current) {
        dragDrawingRef.current = null;
        return;
      }

      const { x, y } = getRelativePoint(event);
      if (!isInMainPricePane(y)) return;

      const backtestOrderHit = hitTestBacktestOrder(x, y);
      if (backtestOrderHit?.action === 'cancel') {
        event.preventDefault();
        event.stopPropagation();
        if (backtestOrderHit.cancelDraft) {
          setOrderDraftClearRequest({ id: Date.now() });
        } else {
          cancelBacktestPositionRef.current?.(backtestOrderHit.positionId);
        }
        return;
      }

      if (backtestOrderHit) {
        const coords = getChartCoordinates(x, y);
        if (!coords) return;

        event.preventDefault();
        event.stopPropagation();
        setChartMouseInteractions(false);
        dragBacktestOrderRef.current = {
          positionId: backtestOrderHit.positionId,
          status: backtestOrderHit.status,
          kind: backtestOrderHit.kind,
          price: backtestOrderHit.price,
          isDraft: backtestOrderHit.isDraft,
        };
        dragDrawingRef.current = null;
        resizeDrawingRef.current = null;
        return;
      }

      const resizeHit = hitTestResizeHandle(x, y);
      if (resizeHit) {
        const drawing = drawingsRef.current.find((d) => d.id === resizeHit.drawingId);
        if (!drawing) return;

        if (drawing.locked || allDrawingsLockedRef.current) {
          event.preventDefault();
          event.stopPropagation();
          setSelectedDrawingId(resizeHit.drawingId);
          resizeDrawingRef.current = null;
          dragDrawingRef.current = null;
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        setChartMouseInteractions(false);
        resizeDrawingRef.current = {
          ...resizeHit,
          originalDrawing: drawing,
        };
        dragDrawingRef.current = null;
        setSelectedDrawingId(resizeHit.drawingId);
        return;
      }

      if (MULTI_POINT_TOOL_TYPES.includes(toolRef.current)) {
        const coords = getChartCoordinates(x, y);
        if (!coords) return;

        event.preventDefault();
        event.stopPropagation();

        const currentTemp = tempDrawingRef.current;
        const savedToolSettings = getToolSettingsForType(toolRef.current);
        const nextTemp = isPathDrawing(currentTemp)
          ? {
              ...currentTemp,
              points: [...(currentTemp.points ?? []), coords],
              previewPoint: coords,
            }
          : {
              id: `temp-${Date.now()}`,
              type: toolRef.current,
              points: [coords],
              previewPoint: coords,
              strokeWidth: savedToolSettings.strokeWidth ?? DEFAULT_FREEHAND_STROKE_WIDTH[toolRef.current] ?? 1,
              lineStyle: savedToolSettings.lineStyle ?? 'solid',
              color: savedToolSettings.color ?? drawingColorRef.current,
              labelText: '',
              labelVertical: savedToolSettings.labelVertical ?? 'top',
              labelHorizontal: savedToolSettings.labelHorizontal ?? 'center',
              textBold: Boolean(savedToolSettings.textBold),
              textItalic: Boolean(savedToolSettings.textItalic),
              textSize: savedToolSettings.textSize,
            };

        tempDrawingRef.current = nextTemp;
        setTempDrawing(nextTemp);

        // Pattern/wave tools have a fixed vertex count (MULTI_POINT_PATTERN_LABELS'
        // length); 'path' itself has no entry there and stays freehand until dblclick.
        const requiredPointCount = MULTI_POINT_PATTERN_LABELS[toolRef.current]?.length;
        if (requiredPointCount && nextTemp.points.length >= requiredPointCount) {
          handleFinishPathDrawing();
        }
        return;
      }

      if (TWO_POINT_TOOL_TYPES.includes(toolRef.current)) {
        const coords = getChartCoordinates(x, y);
        if (!coords) return;

        event.preventDefault();
        event.stopPropagation();

        const currentTemp = tempDrawingRef.current;

        if (!currentTemp) {
          const savedToolSettings = getToolSettingsForType(toolRef.current);
          setTempDrawing({
            id: `temp-${Date.now()}`,
            type: toolRef.current,
            start: coords,
            end: coords,
            strokeWidth: savedToolSettings.strokeWidth ?? 1,
            lineStyle: savedToolSettings.lineStyle ?? 'solid',
            color: savedToolSettings.color ?? drawingColorRef.current,
            labelText: '',
            labelVertical: savedToolSettings.labelVertical ?? 'top',
            labelHorizontal: savedToolSettings.labelHorizontal ?? 'center',
            textBold: Boolean(savedToolSettings.textBold),
            textItalic: Boolean(savedToolSettings.textItalic),
            textSize: savedToolSettings.textSize,
          });
        } else {
          let endPoint = ['horizontal-ray', 'horizontal-line', 'date-range'].includes(currentTemp.type)
            ? { ...coords, price: currentTemp.start.price }
            : coords;

          if (isPositionDrawing(currentTemp)) {
            endPoint = normalizePositionTarget(currentTemp.type, currentTemp.start, endPoint);
          }

          if (['fib-extension', 'parallel-channel', ...THREE_POINT_SHAPE_TYPES].includes(currentTemp.type) && !currentTemp.anchor) {
            setTempDrawing({
              ...currentTemp,
              end: endPoint,
              anchor: endPoint,
            });
            return;
          }

          const completed = {
            id: `drawing-${Date.now()}`,
            type: currentTemp.type,
            start: currentTemp.start,
            end: endPoint,
            strokeWidth: currentTemp.strokeWidth ?? 1,
            lineStyle: currentTemp.lineStyle ?? 'solid',
            color: currentTemp.color ?? drawingColorRef.current,
            labelText: currentTemp.labelText ?? '',
            labelVertical: currentTemp.labelVertical ?? 'top',
            labelHorizontal: currentTemp.labelHorizontal ?? 'center',
            textBold: Boolean(currentTemp.textBold),
            textItalic: Boolean(currentTemp.textItalic),
            textSize: currentTemp.textSize,
            timeframe,
          };

          if (['fib-extension', 'parallel-channel', ...THREE_POINT_SHAPE_TYPES].includes(currentTemp.type)) {
            completed.end = currentTemp.end;
            completed.anchor = coords;
          }

          if (isPositionDrawing(completed)) {
            completed.stop = getDefaultPositionStop(completed.type, completed.start, completed.end);
          }

          appendDrawing(completed);
          setTempDrawing(null);
          setTool(null);
        }
        return;
      }

      if (TEXT_MARKER_TYPES.includes(toolRef.current)) {
        const coords = getChartCoordinates(x, y);
        if (!coords) return;

        event.preventDefault();
        event.stopPropagation();

        const savedToolSettings = getToolSettingsForType(toolRef.current);

        // Arrow markers are pure icon stamps (no caption), so skip the text
        // popover entirely and place them on a single click.
        if (ICON_ONLY_MARKER_TYPES.includes(toolRef.current)) {
          appendDrawing({
            id: `drawing-${Date.now()}`,
            type: toolRef.current,
            point: coords,
            text: '',
            color: savedToolSettings.color ?? drawingColorRef.current,
            labelText: '',
            textBold: Boolean(savedToolSettings.textBold),
            textItalic: Boolean(savedToolSettings.textItalic),
            textSize: savedToolSettings.textSize,
          });
          setTool(null);
          return;
        }

        setTextInput({
          x,
          y,
          point: coords,
          type: toolRef.current,
        });
        setTextDraft(savedToolSettings.labelText ?? '');
        return;
      }

      const hitId = hitTestDrawing(x, y);
      if (hitId) {
        event.preventDefault();
        event.stopPropagation();
        setChartMouseInteractions(false);
        setSelectedDrawingId(hitId);
        resizeDrawingRef.current = null;

        const coords = getChartCoordinates(x, y);
        const drawing = drawingsRef.current.find((d) => d.id === hitId);
        if (drawing?.locked || allDrawingsLockedRef.current) {
          dragDrawingRef.current = null;
          restoreChartMouseInteractions();
          return;
        }
        if (coords && drawing) {
          let anchor;
          if (isTwoPointDrawing(drawing)) {
            anchor = drawing.start;
          } else if (isPathDrawing(drawing)) {
            anchor = drawing.points?.[0];
          } else if (TEXT_MARKER_TYPES.includes(drawing.type)) {
            anchor = drawing.point;
          }

          dragDrawingRef.current = {
            drawingId: hitId,
            startMouse: coords,
            originalDrawing: drawing,
            anchor,
          };
        }
        return;
      }

      setSelectedDrawingId(null);
      dragDrawingRef.current = null;
      resizeDrawingRef.current = null;
      // no replay-price auto-drag here; native chart behavior stays active
    };

    const handleMouseMove = (event) => {
      const { x, y } = getRelativePoint(event);
      const bounds = el.getBoundingClientRect();
      const isInsideChart = x >= 0 && x <= bounds.width && y >= 0 && y <= bounds.height && isInMainPricePane(y);
      if (TWO_POINT_TOOL_TYPES.includes(toolRef.current)) {
        logDrawDebug('mousemove: bounds check', { x, y, boundsWidth: bounds.width, boundsHeight: bounds.height, isInsideChart, isSpacePressed: isSpacePressedRef.current, hasTemp: Boolean(tempDrawingRef.current) });
      }
      const hoveredDrawingId = isInsideChart ? hitTestDrawing(x, y) : null;
      const hoveredDrawing = hoveredDrawingId
        ? drawingsRef.current.find((drawing) => drawing.id === hoveredDrawingId)
        : null;
      setHoveredPositionDrawingId(isPositionDrawing(hoveredDrawing) ? hoveredDrawingId : null);

      const backtestOrderHoverHit = isInsideChart ? hitTestBacktestOrder(x, y) : null;
      setIsHoveringBacktestOrderCancel(backtestOrderHoverHit?.action === 'cancel');

      if (isSpacePressedRef.current || !isInsideChart) return;

      if (TWO_POINT_TOOL_TYPES.includes(toolRef.current) && tempDrawingRef.current) {
        const coords = getChartCoordinates(x, y);
        if (!coords) return;

        event.preventDefault();
        event.stopPropagation();

        setTempDrawing((prev) => {
          if (!prev) return prev;
          let endPoint = ['horizontal-ray', 'horizontal-line', 'date-range'].includes(prev.type)
            ? { ...coords, price: prev.start.price }
            : coords;

          if (isPositionDrawing(prev)) {
            endPoint = normalizePositionTarget(prev.type, prev.start, endPoint);
          }

          if (['fib-extension', 'parallel-channel', ...THREE_POINT_SHAPE_TYPES].includes(prev.type) && prev.anchor) {
            return { ...prev, anchor: coords };
          }

          logDrawDebug('mousemove: temp end updated', { type: prev.type, start: prev.start, endPoint });
          return { ...prev, end: endPoint };
        });
        return;
      }

      if (MULTI_POINT_TOOL_TYPES.includes(toolRef.current) && isPathDrawing(tempDrawingRef.current)) {
        const coords = getChartCoordinates(x, y);
        if (!coords) return;

        event.preventDefault();
        event.stopPropagation();

        const nextTemp = {
          ...tempDrawingRef.current,
          previewPoint: coords,
        };
        tempDrawingRef.current = nextTemp;
        setTempDrawing(nextTemp);
        return;
      }

      if (resizeDrawingRef.current) {
        const coords = getChartCoordinates(x, y);
        if (!coords) return;

        event.preventDefault();
        event.stopPropagation();

        const { drawingId, handle, originalDrawing } = resizeDrawingRef.current;
        const resized = { ...originalDrawing };

        if (isHorizontalRayDrawing(resized)) {
          if (handle === 'start') {
            resized.start = coords;
            resized.end = { ...resized.end, price: coords.price };
          }
        } else if (isLineLikeDrawing(resized)) {
          resized[handle] = coords;
        }

        if (isPathDrawing(resized) && handle.startsWith('point:')) {
          const index = Number(handle.slice('point:'.length));
          if (Number.isInteger(index) && Array.isArray(resized.points) && resized.points[index]) {
            resized.points = resized.points.map((point, pointIndex) => (
              pointIndex === index ? coords : point
            ));
          }
        }

        if (isPositionDrawing(resized)) {
          const isLongPosition = resized.type === 'long-position';

          if (handle === 'start') {
            const rewardDistance = Math.abs(Number(resized.end.price) - Number(resized.start.price));
            const riskDistance = Math.abs(Number(resized.start.price) - Number(resized.stop.price));
            resized.start = coords;
            resized.end = {
              ...resized.end,
              price: isLongPosition ? coords.price + rewardDistance : coords.price - rewardDistance,
            };
            resized.stop = {
              ...resized.stop,
              price: isLongPosition ? coords.price - riskDistance : coords.price + riskDistance,
            };
          } else if (handle === 'end') {
            resized.end = normalizePositionTarget(resized.type, resized.start, coords);
            resized.stop = {
              ...resized.stop,
              time: coords.time,
              logical: coords.logical,
            };
          } else if (handle === 'stop') {
            const riskDistance = Math.max(
              Math.abs(Number(coords.price) - Number(resized.start.price)),
              Math.abs(Number(resized.start.price)) * 0.001,
              0.00000001
            );
            resized.stop = {
              ...coords,
              price: isLongPosition
                ? Number(resized.start.price) - riskDistance
                : Number(resized.start.price) + riskDistance,
            };
            resized.end = {
              ...resized.end,
              time: coords.time,
              logical: coords.logical,
            };
          }
        }

        if (BOX_TOOL_TYPES.includes(resized.type)) {
          if (handle === 'start') {
            resized.start = coords;
          } else if (handle === 'end') {
            resized.end = coords;
          } else if (handle === 'start-x-end-y') {
            resized.start = { ...resized.start, time: coords.time };
            resized.end = { ...resized.end, price: coords.price };
          } else if (handle === 'end-x-start-y') {
            resized.end = { ...resized.end, time: coords.time };
            resized.start = { ...resized.start, price: coords.price };
          } else if (handle === 'start-time') {
            resized.start = { ...resized.start, time: coords.time };
          } else if (handle === 'end-time') {
            resized.end = { ...resized.end, time: coords.time };
          } else if (handle === 'start-price') {
            resized.start = { ...resized.start, price: coords.price };
          } else if (handle === 'end-price') {
            resized.end = { ...resized.end, price: coords.price };
          }
        }

        const next = drawingsRef.current.map((d) => (d.id === drawingId ? resized : d));
        setDrawings(next);
        drawingsRef.current = next;
        return;
      }

      if (dragBacktestOrderRef.current) {
        const coords = getChartCoordinates(x, y);
        if (!coords) return;

        event.preventDefault();
        event.stopPropagation();

        const dragState = {
          ...dragBacktestOrderRef.current,
          price: coords.price,
        };
        dragBacktestOrderRef.current = dragState;

        if (dragState.isDraft) {
          const value = String(Number(coords.price.toFixed(8)));
          setBacktestOrderDraft((currentDraft) => {
            if (!currentDraft) return currentDraft;

            if (dragState.kind === 'entry') {
              return { ...currentDraft, entryPrice: value, effectiveEntryPrice: coords.price };
            }

            if (dragState.kind === 'sl') {
              return { ...currentDraft, stopLoss: value };
            }

            if (dragState.kind === 'tp') {
              return { ...currentDraft, takeProfit: value };
            }

            return currentDraft;
          });
          setOrderLineDraftPatch({
            kind: dragState.kind,
            value,
            version: Date.now(),
          });
          return;
        }

        const updates = {};
        if (dragState.kind === 'entry') {
          updates.entryPrice = coords.price;
        } else if (dragState.kind === 'sl') {
          updates.stopLoss = coords.price;
        } else if (dragState.kind === 'tp') {
          updates.takeProfit = coords.price;
        }

        updateLocalBacktestPositionLine(dragState.positionId, updates);
        return;
      }

      if (dragDrawingRef.current) {
        const coords = getChartCoordinates(x, y);
        if (!coords) return;

        event.preventDefault();
        event.stopPropagation();

        const { drawingId, startMouse, originalDrawing } = dragDrawingRef.current;
        const deltaTime = coords.time - startMouse.time;
        const deltaLogical =
          Number.isFinite(coords.logical) && Number.isFinite(startMouse.logical)
            ? coords.logical - startMouse.logical
            : undefined;
        const deltaPrice = coords.price - startMouse.price;

        const moved = offsetDrawing(originalDrawing, deltaTime, deltaPrice, deltaLogical);
        const next = drawingsRef.current.map((d) => (d.id === drawingId ? moved : d));
        setDrawings(next);
        drawingsRef.current = next;
      }
    };

    const handleMouseUp = () => {
      if (dragBacktestOrderRef.current) {
        const dragState = dragBacktestOrderRef.current;
        dragBacktestOrderRef.current = null;
        restoreChartMouseInteractions();
        if (!dragState.isDraft) {
          handleUpdateBacktestPositionRisk(dragState);
        }
      }

      if (resizeDrawingRef.current) {
        saveDrawings(drawingsRef.current);
        resizeDrawingRef.current = null;
        restoreChartMouseInteractions();
      }

      if (dragDrawingRef.current) {
        saveDrawings(drawingsRef.current);
        dragDrawingRef.current = null;
        restoreChartMouseInteractions();
      }
    };

    const handleDoubleClick = (event) => {
      if (!MULTI_POINT_TOOL_TYPES.includes(toolRef.current)) return;
      if (!isInMainPricePane(getRelativePoint(event).y)) return;

      event.preventDefault();
      event.stopPropagation();
      handleFinishPathDrawing();
    };

    // Touch devices dispatch TouchEvent, not MouseEvent, so mousedown/mousemove/mouseup
    // never fire on tap/drag. Wrap the single active touch point into a minimal
    // MouseEvent-shaped object (only the fields the handlers above read) and reuse the
    // exact same logic, so tool drawing/dragging/resizing behaves identically to mouse.
    const toMouseLikeEvent = (nativeEvent, touchPoint) => ({
      target: nativeEvent.target,
      clientX: touchPoint.clientX,
      clientY: touchPoint.clientY,
      preventDefault: () => nativeEvent.preventDefault(),
      stopPropagation: () => nativeEvent.stopPropagation(),
    });

    const handleTouchStart = (event) => {
      if (event.touches.length !== 1) return; // let native pinch-zoom/pan pass through untouched
      isTouchInputRef.current = true;
      handleMouseDown(toMouseLikeEvent(event, event.touches[0]));
    };

    const handleTouchMove = (event) => {
      if (event.touches.length !== 1) return;
      handleMouseMove(toMouseLikeEvent(event, event.touches[0]));
    };

    let lastTouchEndAt = 0;
    const DOUBLE_TAP_MS = 350;

    const handleTouchEnd = (event) => {
      handleMouseUp();

      const now = Date.now();
      const isDoubleTap = now - lastTouchEndAt < DOUBLE_TAP_MS;
      lastTouchEndAt = now;
      if (isDoubleTap && MULTI_POINT_TOOL_TYPES.includes(toolRef.current)) {
        lastTouchEndAt = 0;
        handleDoubleClick(toMouseLikeEvent(event, event.changedTouches[0]));
      }
    };

    el.addEventListener('mousedown', handleMouseDown, true);
    el.addEventListener('dblclick', handleDoubleClick, true);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    el.addEventListener('touchstart', handleTouchStart, { capture: true, passive: false });
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd);
    window.addEventListener('touchcancel', handleTouchEnd);

    return () => {
      el.removeEventListener('mousedown', handleMouseDown, true);
      el.removeEventListener('dblclick', handleDoubleClick, true);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);

      el.removeEventListener('touchstart', handleTouchStart, { capture: true });
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [appendDrawing, getChartCoordinates, getDefaultPositionStop, getToolSettingsForType, handleFinishPathDrawing, handleUpdateBacktestPositionRisk, hitTestBacktestOrder, hitTestDrawing, hitTestResizeHandle, saveDrawings, updateLocalBacktestPositionLine]);

  useEffect(() => {
    async function fetchKlines() {
      // Waiting for the saved-progress round trip only matters when this
      // fetch might auto-resume a bookmarked replay position for the new
      // symbol (shouldRestoreSavedReplay below, which requires !replayMode) —
      // that needs the *new* symbol's own progress row, not whatever was left
      // over from the previous one. While already actively replaying,
      // shouldRestoreSavedReplay can never be true regardless of how fresh
      // replayProgressLoadedKey is, so blocking here only added a needless
      // network round trip before every symbol/timeframe switch could even
      // start fetching candles — most noticeable (and most likely to time
      // out) on Replay's already-slower, larger history fetch below.
      if (!replayMode && replayProgressLoadedKey !== replayProgressKey) return;
      timeframePrefetchCancelRef.current?.();
      timeframePrefetchCancelRef.current = null;

      const historyKey = `${exchange}:${marketCategory}:${symbol}:${timeframe}`;
      if (timeframeTransitionKeyRef.current && timeframeTransitionKeyRef.current !== historyKey) {
        timeframeTransitionKeyRef.current = null;
      }
      const isTimeframeTransition = timeframeTransitionKeyRef.current === historyKey;
      if (historyReadyKeyRef.current !== historyKey) {
        pendingLiveCandlesRef.current = [];
        setLoading(!isTimeframeTransition);
      }

      // Symbol/timeframe switches that hit the candle cache resolve loading
      // true->false within the same effect tick (no await between them), so
      // React never paints the skeleton overlay even though a background
      // revalidation fetch still runs. The top bar covers that gap so a
      // switch always shows *some* feedback, cached or not.
      NProgress.start();

      const requestId = fetchRequestIdRef.current + 1;
      fetchRequestIdRef.current = requestId;
      candleFetchAbortRef.current?.abort();
      const controller = new AbortController();
      candleFetchAbortRef.current = controller;
      // Replay is per-symbol/exchange/category, not a chart-wide sticky mode:
      // switching to a different market (isSymbolChange) only continues
      // Replay if *that* market has its own saved checkpoint
      // (market_replay_progress row) — it never carries over just because
      // the market switched away from happened to be mid-replay. A
      // timeframe change on the same market is a continuation, not a
      // switch, and simply keeps whatever mode (Live or Replay) was already
      // active, same as before this distinction existed.
      const isSymbolChange = !isTimeframeTransition;
      const hasFreshCheckpointForKey =
        replayAccessAllowed === true
        && replayProgressLoadedKey === replayProgressKey
        && restoredReplayProgressKeyRef.current !== replayProgressKey
        && Number.isFinite(Number(savedReplayProgress?.replay_time));
      const shouldRestoreSavedReplay = hasFreshCheckpointForKey && (isSymbolChange || !replayMode);
      const wasInReplay = isSymbolChange
        ? shouldRestoreSavedReplay
        : (replayMode || shouldRestoreSavedReplay);
      // selectedReplayPriceRef holds a raw price level, not a proportional
      // position — reusing it across a symbol change (rather than just a
      // timeframe change on the same symbol) plots a stale price from the
      // old symbol as the new chart's "Replay" line (e.g. a BTC-range price
      // rendered on an ETH chart), which forces the price scale to stretch
      // to fit both and squashes the real candles into a sliver. Only trust
      // it when isTimeframeTransition confirms the symbol/exchange/category
      // didn't change; otherwise fall through to the nearest-candle-close
      // fallback below, which is meaningful for whatever symbol is now active.
      const previousSelectedReplayPrice = shouldRestoreSavedReplay
        ? savedReplayProgress?.selected_price
        : (isTimeframeTransition ? selectedReplayPriceRef.current : null);
      const previousReplayTime = shouldRestoreSavedReplay
        ? Number(savedReplayProgress.replay_time)
        : (replayMode ? allCandles[replayIndex]?.time : null);
      const drawingTimes = wasInReplay ? getDrawingTimes(drawingsRef.current) : [];
      const shouldFrameDrawings = wasInReplay && drawingTimes.length > 0;
      const anchorTimes = [
        previousReplayTime,
        ...drawingTimes,
      ].filter((time) => Number.isFinite(Number(time))).map(Number);
      const anchorStart = anchorTimes.length ? Math.min(...anchorTimes) : null;
      const anchorEnd = anchorTimes.length ? Math.max(...anchorTimes) : null;
      const replayAnchorTime =
        Number.isFinite(Number(previousReplayTime))
          ? Number(previousReplayTime)
          : anchorEnd;
      const replayProgress =
        wasInReplay && allCandles.length > 1
          ? replayIndex / (allCandles.length - 1)
          : 0.3;
      let hasUsableCache = false;
      setError('');
      setIsPlaying(false);
      setFollowReplay(!shouldFrameDrawings);
      setSelectedDrawingId(null);
      setTempDrawing(null);
      setTextInput(null);
      setIsReplayPricePickActive(false);
      pendingVisibleLogicalRangeRef.current = null;

      try {
        const interval = INTERVAL_MAP[timeframe];
        if (!interval) throw new Error(`Unsupported timeframe: ${timeframe}`);

        const rememberCandles = (cacheKey, candles) => {
          const cache = candleCacheRef.current;
          if (cache.has(cacheKey)) {
            cache.delete(cacheKey);
          }

          cache.set(cacheKey, {
            candles,
            cachedAt: Date.now(),
          });

          while (cache.size > CANDLE_CACHE_LIMIT) {
            const oldestKey = cache.keys().next().value;
            cache.delete(oldestKey);
          }

          writePersistedCandleCache(preferenceUserId, cacheKey, candles);
        };

        const fetchCandles = async (requestParams, signal = controller.signal, attempt = 0) => {
          const fetchOptions = {
            headers: { Accept: 'application/json' },
          };

          if (signal) {
            fetchOptions.signal = signal;
          }

          const response = await fetch(`/api/klines?${requestParams.toString()}`, fetchOptions);

          if (response.status === 429 && attempt === 0) {
            // Retry-After reports the full remaining window of a per-minute
            // limiter (up to ~60s) — waiting that long blocks the chart with a
            // silent spinner and usually loses the race to the 30s failsafe
            // below anyway, which then shows a generic "taking too long"
            // message instead of the accurate rate-limit one from the catch
            // block. Cap the wait short: a real reset within a few seconds
            // still gets one retry, otherwise fail fast so the honest message
            // reaches the user in seconds, not up to a minute.
            const retryAfterSeconds = Math.min(Number(response.headers.get('Retry-After')) || 3, 3);
            await new Promise((resolve) => setTimeout(resolve, retryAfterSeconds * 1000));
            return fetchCandles(requestParams, signal, attempt + 1);
          }

          const result = await response.json().catch(() => null);

          if (!response.ok) {
            const httpError = new Error(result?.message || `HTTP ${response.status}`);
            httpError.status = response.status;
            throw httpError;
          }

          if (!result?.success) {
            throw new Error(result?.message || 'Failed to fetch candles');
          }

          const normalizedCandles = normalizeApiCandles(result.candles);

          if (normalizedCandles.length < 2) {
            throw new Error('Not enough candle history is available for this market yet.');
          }

          return normalizedCandles;
        };

        const applyCandles = (normalized, { updateReplayState = true } = {}) => {
          const complete = normalizeApiCandles([...normalized, ...pendingLiveCandlesRef.current]);
          pendingLiveCandlesRef.current = [];
          historyReadyKeyRef.current = historyKey;
          setAllCandles(complete);
          setLoadedTimeframe(timeframe);

          if (!updateReplayState) return;

          let nextReplayIndex = Math.min(
            complete.length - 1,
            Math.max(0, Math.round((complete.length - 1) * replayProgress))
          );

          if (wasInReplay && previousReplayTime != null) {
            const nearestReplayIndex = findNearestCandleIndex(complete, previousReplayTime);
            if (nearestReplayIndex >= 0) {
              nextReplayIndex = nearestReplayIndex;
            }
          }

          if (shouldFrameDrawings) {
            const intervalSeconds = TIMEFRAME_SECONDS[timeframe] ?? 60;
            const frameLogicals = [
              previousReplayTime,
              ...drawingTimes,
            ]
              .map((time) => estimateDrawingLogicalFromTime(complete, time, intervalSeconds))
              .filter((logical) => Number.isFinite(logical))
              // Replay mode truncates the rendered series to `nextReplayIndex` — no
              // bar beyond the replay point is ever loaded into the chart. A drawing
              // anchored after the replay time (very common: drawings are often made
              // against the live chart, then replay is scrubbed to an earlier point)
              // must not be allowed to push the framed viewport past that boundary,
              // or the real (truncated) candles get squeezed into an invisible sliver
              // at the left edge of an otherwise-empty requested range — the chart
              // reads as completely blank even though the data and legend are fine.
              .map((logical) => Math.min(logical, nextReplayIndex));

            if (frameLogicals.length) {
              const minLogical = Math.min(...frameLogicals, nextReplayIndex);
              const maxLogical = Math.max(...frameLogicals, nextReplayIndex);
              const span = Math.max(maxLogical - minLogical, 6);
              const padding = Math.max(6, span * 0.18);

              pendingVisibleLogicalRangeRef.current = {
                from: Math.max(minLogical - padding, -20),
                to: maxLogical + padding,
              };
            }
          }

          setReplayIndex(nextReplayIndex);
          setReplayMode(wasInReplay);
          if (shouldRestoreSavedReplay) {
            restoredReplayProgressKeyRef.current = replayProgressKey;
          }
          setSelectedReplayPrice(
            wasInReplay
              ? previousSelectedReplayPrice ?? complete[nextReplayIndex]?.close ?? null
              : null
          );
        };

        const params = new URLSearchParams({
          symbol,
          exchange,
          interval,
          category: marketCategory,
          limit: '1000',
          max_candles: wasInReplay ? '20000' : '5000',
        });

        if (wasInReplay && replayAnchorTime != null) {
          const intervalSeconds = TIMEFRAME_SECONDS[timeframe] ?? 60;
          const requestedCandles = 20000;
          const windowSeconds = intervalSeconds * requestedCandles;
          const forwardCandles = Math.max(250, Math.round(requestedCandles * 0.05));
          const nowMs = Date.now();
          const replayFocusedEnd = replayAnchorTime + (intervalSeconds * forwardCandles);
          const minimumEndForAnchors =
            anchorStart != null && anchorEnd != null && anchorEnd - anchorStart <= windowSeconds
              ? Math.min(anchorEnd + (intervalSeconds * 10), anchorStart + windowSeconds)
              : null;
          const anchoredEndSeconds = Math.max(
            replayFocusedEnd,
            minimumEndForAnchors ?? replayFocusedEnd
          );
          const anchoredEndMs = Math.min(nowMs, Math.round(anchoredEndSeconds * 1000));

          params.set('end', String(anchoredEndMs));
        }

        const cacheKey = buildCandleCacheKey({
          exchange,
          marketCategory,
          symbol,
          timeframe,
          end: params.get('end') ?? 'latest',
        });
        const persistedCache = readPersistedCandleCache(preferenceUserId, cacheKey);
        if (!candleCacheRef.current.has(cacheKey) && persistedCache?.candles?.length) {
          candleCacheRef.current.set(cacheKey, persistedCache);
        }
        const cachedCandles = candleCacheRef.current.get(cacheKey)?.candles;
        const shouldBlockForCandles = !cachedCandles?.length && historyReadyKeyRef.current !== historyKey;

        setLoading(shouldBlockForCandles && !isTimeframeTransition);

        if (cachedCandles?.length) {
          hasUsableCache = true;
          applyCandles(cachedCandles);
          setLoading(false);
        }

        // Replay fetches page through the exchange in up to ~20 sequential
        // requests to gather max_candles=20000 of history and can legitimately
        // take a while. Without a ceiling, a stalled upstream request (a slow
        // exchange, a network hiccup) leaves the fetch pending indefinitely —
        // the shield above never clears and the chart looks permanently
        // broken with no error, since nothing ever reaches the catch block.
        const normalized = await Promise.race([
          fetchCandles(params),
          new Promise((_resolve, reject) => {
            window.setTimeout(() => {
              reject(new Error('Chart data is taking longer than expected to load. Please try again.'));
            }, wasInReplay ? 60000 : 30000);
          }),
        ]);

        if (fetchRequestIdRef.current !== requestId) return;

        rememberCandles(cacheKey, normalized);
        applyCandles(normalized);

        if (!wasInReplay) {
          const prefetchTimeframe = (PREFETCH_TIMEFRAME_MAP[timeframe] ?? [])[0];
          if (prefetchTimeframe) {
            const prefetchInterval = INTERVAL_MAP[prefetchTimeframe];
            if (!prefetchInterval) return;

            const prefetchCacheKey = buildCandleCacheKey({
              exchange,
              marketCategory,
              symbol,
              timeframe: prefetchTimeframe,
            });

            if (candleCacheRef.current.has(prefetchCacheKey) || readPersistedCandleCache(preferenceUserId, prefetchCacheKey)) return;

            const prefetchParams = new URLSearchParams({
              symbol,
              exchange,
              interval: prefetchInterval,
              category: marketCategory,
              limit: '1000',
              max_candles: '5000',
            });

            const prefetchController = new AbortController();
            const runPrefetch = () => {
              fetchCandles(prefetchParams, prefetchController.signal)
                .then((prefetchedCandles) => {
                  rememberCandles(prefetchCacheKey, prefetchedCandles);
                })
                .catch(() => {});
            };
            const idleId = typeof window.requestIdleCallback === 'function'
              ? window.requestIdleCallback(runPrefetch, { timeout: 1500 })
              : window.setTimeout(runPrefetch, 750);

            timeframePrefetchCancelRef.current = () => {
              prefetchController.abort();
              if (typeof window.cancelIdleCallback === 'function') {
                window.cancelIdleCallback(idleId);
              } else {
                window.clearTimeout(idleId);
              }
            };
          }
        }

      } catch (err) {
        if (fetchRequestIdRef.current !== requestId) return;
        if (err?.name === 'AbortError') return;
        setError(err?.status === 429 ? 'Chart data is temporarily rate-limited. Please wait a moment and try again.' : (err.message || 'Failed to load chart'));

        if (!hasUsableCache && !allCandles.length) {
          setAllCandles([]);
          setReplayMode(false);
          setSelectedReplayPrice(null);
        } else if (wasInReplay) {
          setReplayMode(true);
          setSelectedReplayPrice(previousSelectedReplayPrice ?? allCandles[replayIndex]?.close ?? null);
        }
      } finally {
        if (fetchRequestIdRef.current === requestId) {
          if (candleFetchAbortRef.current === controller) {
            candleFetchAbortRef.current = null;
          }
          setLoading(false);
          NProgress.done();
          if (timeframeTransitionKeyRef.current === historyKey) {
            timeframeTransitionKeyRef.current = null;
          }
        }
      }
    }

    fetchKlines();

    return () => {
      candleFetchAbortRef.current?.abort();
      timeframePrefetchCancelRef.current?.();
      timeframePrefetchCancelRef.current = null;
    };
  }, [exchange, marketCategory, symbol, timeframe, getDrawingTimes, preferenceUserId, replayAccessAllowed, replayProgressKey, replayProgressLoadedKey, savedReplayProgress]);

  const startReplayMode = (startIndex = Math.max(0, Math.floor(allCandles.length * 0.3))) => {
    const nextIndex = Math.min(Math.max(0, startIndex), Math.max(0, allCandles.length - 1));

    setReplayMode(true);
    setFollowReplay(true);
    setReplayIndex(nextIndex);
    setSelectedReplayPrice(allCandles[nextIndex]?.close ?? null);
    setIsReplayPricePickActive(false);
  };

  const toggleReplayMode = async () => {
    setIsPlaying(false);

    if (!replayMode) {
      if (!await requireReplayAccess({ showProgress: true })) return;
      setTool(null);
      setTempDrawing(null);
      setTextInput(null);
      setSelectedDrawingId(null);
      setIsReplayPricePickActive(true);
      return;
    }

    // Going live changes only the current view. The last replay checkpoint
    // and its price guide remain available until the market context changes.
    pendingBackToLiveRef.current = true;
    setReplayMode(false);
    setFollowReplay(true);
    setTool(null);
    setTempDrawing(null);
    setTextInput(null);
    setIsReplayPricePickActive(false);
  };

  // Shared by the left rail's Replay surface and the in-chart ReplayControlBar
  // so the access check can never drift between the two entry points.
  const handleToggleReplayPricePick = async () => {
    if (!await requireReplayAccess({ showProgress: true })) return;
    setIsReplayPricePickActive((prev) => !prev);
  };

  const handleCreatePriceAlert = useCallback((presetPrice = null) => {
    if (replayMode) {
      setAlertNotice('Price alerts are available for live markets only, not Replay/backtest.');
      window.setTimeout(() => setAlertNotice(''), 6000);
      return;
    }
    const initialPrice = Number.isFinite(Number(presetPrice)) ? Number(presetPrice) : currentPrice;
    setAlertDraft({ price: initialPrice ? String(initialPrice) : '', type: Number(initialPrice) < Number(currentPrice) ? 'drop' : 'rise' });
    setAlertError('');
    setAlertModalOpen(true);
  }, [currentPrice, replayMode]);

  const cancelPriceAlert = useCallback(async (alertId) => {
    try {
      await axios.delete(`/market-price-alerts/${alertId}`);
      setPriceAlerts(items => items.filter(item => item.id !== alertId));
    } catch (error) { setAlertError(error.response?.data?.message ?? 'Could not cancel this alert.'); }
  }, []);

  const toggleAlertSound = useCallback(async () => {
    const next = !alertSoundEnabled; setAlertSoundEnabled(next);
    try {
      await axios.patch('/notification-preferences', { alert_sound_enabled: next });
      if (next) { const ctx = new AudioContext(); const oscillator = ctx.createOscillator(); oscillator.connect(ctx.destination); oscillator.frequency.value = 880; oscillator.start(); oscillator.stop(ctx.currentTime + .18); }
    } catch {}
  }, [alertSoundEnabled]);

  const savePriceAlert = useCallback(async () => {
    const targetPrice = Number(alertDraft.price);
    if (!Number.isFinite(targetPrice) || targetPrice <= 0) { setAlertError('Enter a valid price greater than zero.'); return; }
    if (alertDraft.type === 'rise' && targetPrice <= Number(currentPrice)) { setAlertError('A rise alert must be above the current price.'); return; }
    if (alertDraft.type === 'drop' && targetPrice >= Number(currentPrice)) { setAlertError('A drop alert must be below the current price.'); return; }
    try {
      const response = await axios.post('/market-price-alerts', { exchange, category: marketCategory, symbol, target_price: targetPrice, direction: alertDraft.type === 'rise' ? 'above' : 'below', last_price: currentPrice });
      setPriceAlerts((items) => [response.data.alert, ...items]);
      setAlertModalOpen(false);
    } catch (err) { setAlertError(err.response?.data?.message ?? 'Could not set this alert.'); }
  }, [alertDraft, currentPrice, exchange, marketCategory, symbol]);

  useEffect(() => {
    Promise.all([axios.get('/market-price-alerts'), axios.get('/notifications/feed')]).then(([alerts, notifications]) => {
      setPriceAlerts((alerts.data.alerts ?? []).filter((item) => item.exchange === exchange && item.category === marketCategory && item.symbol === symbol && item.status === 'active'));
      setAlertSoundEnabled(notifications.data?.alert_sound_enabled !== false);
    }).catch(() => {});
  }, [exchange, marketCategory, symbol]);

  useEffect(() => {
    const series = candleSeriesRef.current;
    if (!series) return;
    alertPriceLinesRef.current.forEach((line) => { try { series.removePriceLine(line); } catch {} });
    alertPriceLinesRef.current.clear();
    priceAlerts.forEach((alert) => {
      const line = series.createPriceLine({ price: Number(alert.target_price), color: '#9ca3af', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: `⏰ ${alert.direction === 'above' ? 'Rise' : 'Drop'}` });
      alertPriceLinesRef.current.set(alert.id, line);
    });
  }, [priceAlerts]);

  useEffect(() => {
    if (replayMode || alertCheckInFlightRef.current || !Number.isFinite(Number(currentPrice))) return;

    const price = Number(currentPrice);
    const shouldCheck = priceAlerts.some((alert) => {
      const target = Number(alert.target_price);
      const last = alert.last_price == null ? null : Number(alert.last_price);
      if (!Number.isFinite(target)) return false;
      if (alert.direction === 'above') return price >= target;
      if (alert.direction === 'below') return price <= target;
      return Number.isFinite(last) && ((last < target && price >= target) || (last > target && price <= target));
    });

    if (!shouldCheck) return;

    alertCheckInFlightRef.current = true;
    axios.post('/market-price-alerts/check', {
      exchange,
      category: marketCategory,
      symbol,
      price,
    }).then(({ data }) => {
      const triggered = Array.isArray(data?.triggered) ? data.triggered : [];
      const alertIds = new Set(triggered.map((item) => Number(item.alert_id)));
      if (alertIds.size) {
        setPriceAlerts((items) => items.filter((item) => !alertIds.has(Number(item.id))));
        triggered.forEach((item) => window.dispatchEvent(new CustomEvent('backtradelab-alert-triggered', {
          detail: { id: Number(item.notification_id), content: item.content },
        })));
      } else {
        axios.get('/market-price-alerts').then((response) => {
          setPriceAlerts((response.data?.alerts ?? []).filter((item) => item.exchange === exchange && item.category === marketCategory && item.symbol === symbol && item.status === 'active'));
        }).catch(() => {});
      }
    }).catch(() => {}).finally(() => {
      alertCheckInFlightRef.current = false;
    });
  }, [currentPrice, exchange, marketCategory, priceAlerts, replayMode, symbol]);

  const activeExchangeSymbol = useMemo(() => {
    const selected = symbols.find((item) => (
      item.symbol === symbol
      && item.exchange === exchange
      && item.category === marketCategory
    ));
    return selected?.exchange_symbol ?? symbol;
  }, [exchange, marketCategory, symbol, symbols]);

  useEffect(() => {
    if (replayMode) {
      setLiveConnectionStatus('polling');
      return undefined;
    }

    setLiveConnectionStatus('connecting');
    return createLiveCandleStream({
      exchange,
      category: marketCategory,
      symbol,
      exchangeSymbol: activeExchangeSymbol,
      timeframe,
      onStatus: setLiveConnectionStatus,
      onOpen: () => {},
      onError: (streamError) => {
        if (import.meta.env.DEV) console.warn('[live-candle-stream]', streamError?.message, streamError?.cause ?? '');
      },
      onCandle: (nextCandle) => {
        const receivedAt = Date.now();
        setLiveFeedInfo({ source: 'websocket', receivedAt });
        setFeedStatusClock(receivedAt);
        const historyKey = `${exchange}:${marketCategory}:${symbol}:${timeframe}`;
        if (historyReadyKeyRef.current !== historyKey) {
          pendingLiveCandlesRef.current = normalizeApiCandles([...pendingLiveCandlesRef.current, nextCandle]);
          return;
        }
        setAllCandles((items) => normalizeApiCandles([...items, nextCandle]));
      },
    });
  }, [activeExchangeSymbol, exchange, marketCategory, replayMode, symbol, timeframe]);

  useEffect(() => {
    if (replayMode || liveConnectionStatus === 'live') return undefined;
    let cancelled = false;
    let timer = null;
    const refreshLatest = async () => {
      if (document.hidden || !navigator.onLine || cancelled) return;
      try {
        const params = new URLSearchParams({
          exchange,
          category: marketCategory,
          symbol,
          interval: INTERVAL_MAP[timeframe],
          limit: '2',
          max_candles: '2',
          fresh: '1',
        });
        const response = await fetch(`/api/klines?${params.toString()}`, { headers: { Accept: 'application/json' } });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const result = await response.json();
        const latest = normalizeApiCandles(result.candles ?? []).at(-1);
        if (!cancelled && latest) {
          const receivedAt = Date.now();
          setLiveFeedInfo({ source: 'rest', receivedAt });
          setFeedStatusClock(receivedAt);
          setAllCandles((items) => normalizeApiCandles([...items, latest]));
          setLiveConnectionStatus((status) => (
            status === 'live' || status === 'connecting' || status === 'reconnecting'
              ? status
              : 'polling'
          ));
        }
      } catch {}
    };
    const startPolling = () => {
      window.clearInterval(timer);
      if (document.hidden || !navigator.onLine || cancelled) return;
      refreshLatest();
      timer = window.setInterval(refreshLatest, MARKET_DATA_POLL_SECONDS * 1000);
    };
    const stopPolling = () => window.clearInterval(timer);
    const handleVisibility = () => document.hidden ? stopPolling() : startPolling();
    startPolling();
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('online', startPolling);
    window.addEventListener('offline', stopPolling);
    return () => {
      cancelled = true;
      stopPolling();
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('online', startPolling);
      window.removeEventListener('offline', stopPolling);
    };
  }, [exchange, liveConnectionStatus, marketCategory, replayMode, symbol, timeframe]);

  const stepBackward = async () => {
    setIsPlaying(false);
    setFollowReplay(false);
    if (!await requireReplayAccess({ showProgress: true })) return;

    if (!replayMode) {
      const startIndex = Math.max(0, allCandles.length - 2);
      startReplayMode(startIndex);
      return;
    }

    setReplayIndex((prev) => {
      const next = Math.max(prev - 1, 0);
      setSelectedReplayPrice(allCandles[next]?.close ?? null);
      return next;
    });
  };

  const stepForward = async () => {
    setIsPlaying(false);
    setFollowReplay(false);
    if (!await requireReplayAccess({ showProgress: true })) return;

    if (!replayMode) {
      startReplayMode();
      return;
    }

    setReplayIndex((prev) => {
      const next = Math.min(prev + 1, allCandles.length - 1);
      setSelectedReplayPrice(allCandles[next]?.close ?? null);
      return next;
    });
  };

  const togglePlay = async () => {
    if (!await requireReplayAccess({ showProgress: true })) return;
    if (!replayMode) {
      startReplayMode();
      setIsPlaying(true);
      return;
    }
    if (replayIndex >= allCandles.length - 1) return;
    setIsPlaying((prev) => !prev);
  };

  const resetReplay = () => {
    setIsPlaying(false);
    setFollowReplay(true);
    const latestIndex = Math.max(0, allCandles.length - 1);
    setReplayMode(true);
    setReplayIndex(latestIndex);
    setSelectedReplayPrice(allCandles[latestIndex]?.close ?? null);
    setTool(null);
    setTempDrawing(null);
    setTextInput(null);
    setIsReplayPricePickActive(false);
  };

  const handleFollowReplay = () => {
    setFollowReplay(true);
    const chart = chartRef.current;
    if (!chart) return;

    isProgrammaticRangeChangeRef.current = true;
    chart.timeScale().scrollToPosition(5, false);

    requestAnimationFrame(() => {
      isProgrammaticRangeChangeRef.current = false;
    });
  };

  const handleSaveText = () => {
    if (!textInput || !textDraft.trim()) {
      setTextInput(null);
      return;
    }

    const markerType = textInput.type && TEXT_MARKER_TYPES.includes(textInput.type) ? textInput.type : 'text';
    const textSettings = getToolSettingsForType(markerType);
    const drawing = {
      id: `drawing-${Date.now()}`,
      type: markerType,
      point: textInput.point,
      text: textDraft.trim(),
      color: textSettings.color ?? drawingColor,
      labelText: textDraft.trim(),
      textBold: Boolean(textSettings.textBold),
      textItalic: Boolean(textSettings.textItalic),
      textSize: textSettings.textSize,
    };

    if (markerType === 'signpost') {
      drawing.signpostNumber = drawingsRef.current.filter((d) => d.type === 'signpost').length + 1;
    }

    appendDrawing(drawing);
    saveToolSettingsForType(markerType, {
      color: drawing.color,
      labelText: drawing.text,
      textBold: drawing.textBold,
      textItalic: drawing.textItalic,
      textSize: drawing.textSize,
    });

    setTextInput(null);
    setTextDraft('');
    setTool(null);
  };

  const handleToolChange = (nextTool) => {
    const resolvedTool = typeof nextTool === 'function' ? nextTool(toolRef.current) : nextTool;

    setTool(resolvedTool);
    if (resolvedTool) {
      setSelectedDrawingId(null);
    }
    setTempDrawing(null);
    setTextInput(null);
    setIsReplayPricePickActive(false);
  };

  const handleReadyToolChange = (groupName, nextTool) => {
    setToolSettings((current) => {
      const next = { ...current, readyTools: { ...(current.readyTools ?? {}), [groupName]: nextTool } };
      persistToolSettings(next);
      return next;
    });
  };

  const performClearDrawings = () => {
    pushDrawingUndoSnapshot(selectedDrawingIdRef.current);
    saveDrawings([]);
    setSelectedDrawingId(null);
    setShowClearDrawingsConfirm(false);
  };

  const handleClearDrawings = () => {
    if (drawingsRef.current.length) {
      setShowClearDrawingsConfirm(true);
      return;
    }

    performClearDrawings();
  };

  const handleResetChartView = () => {
    const chart = chartRef.current;
    if (!chart) return;

    isProgrammaticRangeChangeRef.current = true;
    chart.timeScale().fitContent();
    resetPriceScalesToAutoScale(chart);

    requestAnimationFrame(() => {
      isProgrammaticRangeChangeRef.current = false;
      scheduleOverlayRender();
    });
  };

  const handleDeleteSelectedDrawing = () => {
    if (!selectedDrawingId) return;

    pushDrawingUndoSnapshot(selectedDrawingId);
    const next = drawings.filter((d) => d.id !== selectedDrawingId);
    saveDrawings(next);
    setSelectedDrawingId(null);
  };

  const handleToggleLockAllDrawings = () => {
    setAllDrawingsLocked((current) => !current);
  };

  const handleToggleVisibility = (key) => {
    setHiddenLayers((current) => {
      if (key === 'all') {
        const nextValue = !(current.drawings && current.indicators && current.positions);
        return { drawings: nextValue, indicators: nextValue, positions: nextValue };
      }
      return { ...current, [key]: !current[key] };
    });
  };

  const handleDrawingWidthChange = (strokeWidth, options = {}) => {
    const selectedId = selectedDrawingIdRef.current;
    const selected = drawingsRef.current.find((drawing) => drawing.id === selectedId);
    const targetType = selected?.type ?? tempDrawingRef.current?.type ?? toolRef.current;

    if (!targetType) return;

    if (!options.skipDefaultSave) {
      saveToolSettingsForType(targetType, { strokeWidth });
    }

    if (tempDrawingRef.current?.type === targetType) {
      setTempDrawing((prev) => (prev ? { ...prev, strokeWidth } : prev));
    }

    if (!selectedId) return;

    const next = drawingsRef.current.map((drawing) => {
      if (drawing.id !== selectedId) return drawing;
      if (!isLineLikeDrawing(drawing) && !isPathDrawing(drawing) && !isPositionDrawing(drawing) && !BOX_TOOL_TYPES.includes(drawing.type)) return drawing;

      return {
        ...drawing,
        strokeWidth,
      };
    });

    saveDrawings(next);
  };

  const handleDrawingLineStyleChange = (lineStyle, options = {}) => {
    const selectedId = selectedDrawingIdRef.current;
    const selected = drawingsRef.current.find((drawing) => drawing.id === selectedId);
    const targetType = selected?.type ?? tempDrawingRef.current?.type ?? toolRef.current;
    const normalizedStyle = lineStyle === 'dashed' ? 'dashed' : 'solid';

    if (!targetType) return;

    if (!options.skipDefaultSave) {
      saveToolSettingsForType(targetType, { lineStyle: normalizedStyle });
    }

    if (tempDrawingRef.current?.type === targetType) {
      setTempDrawing((prev) => (prev ? { ...prev, lineStyle: normalizedStyle } : prev));
    }

    if (!selectedId) return;

    const next = drawingsRef.current.map((drawing) => {
      if (drawing.id !== selectedId) return drawing;
      if (!isLineLikeDrawing(drawing) && !isPathDrawing(drawing) && !BOX_TOOL_TYPES.includes(drawing.type)) return drawing;

      return {
        ...drawing,
        lineStyle: normalizedStyle,
      };
    });

    saveDrawings(next);
  };

  const handleDrawingColorChange = (color, options = {}) => {
    const selectedId = selectedDrawingIdRef.current;
    const selected = drawingsRef.current.find((drawing) => drawing.id === selectedId);
    const targetType = selected?.type ?? tempDrawingRef.current?.type ?? toolRef.current;

    setDrawingColor(color);

    if (tempDrawingRef.current) {
      setTempDrawing((prev) => (prev ? { ...prev, color } : prev));
    }

    if (targetType && !options.skipDefaultSave) {
      saveToolSettingsForType(targetType, { color });
    }

    if (!selectedId) return;

    const next = drawingsRef.current.map((drawing) => (
      drawing.id === selectedId
        ? { ...drawing, color }
        : drawing
    ));

    saveDrawings(next);
  };

  const handleDrawingLabelChange = (updates, options = {}) => {
    const selectedId = selectedDrawingIdRef.current;
    const selected = drawingsRef.current.find((drawing) => drawing.id === selectedId);
    const targetType = selected?.type ?? tempDrawingRef.current?.type ?? toolRef.current;

    if (!targetType) return;

    const settingsUpdate = TEXT_MARKER_TYPES.includes(targetType)
      ? {
          ...(updates.labelText !== undefined || updates.text !== undefined
            ? { labelText: updates.labelText ?? updates.text ?? '' }
            : {}),
          ...(updates.textBold !== undefined ? { textBold: Boolean(updates.textBold) } : {}),
          ...(updates.textItalic !== undefined ? { textItalic: Boolean(updates.textItalic) } : {}),
          ...(updates.textSize !== undefined ? { textSize: Number(updates.textSize) } : {}),
        }
      : updates;

    if (!options.skipDefaultSave) {
      saveToolSettingsForType(targetType, settingsUpdate);
    }

    if (TEXT_MARKER_TYPES.includes(targetType) && typeof settingsUpdate.labelText === 'string') {
      setTextDraft(settingsUpdate.labelText);
    }

    if (tempDrawingRef.current?.type === targetType) {
      setTempDrawing((prev) => (prev ? { ...prev, ...updates } : prev));
    }

    if (!selectedId) return;

    const next = drawingsRef.current.map((drawing) => {
      if (
        drawing.id !== selectedId ||
        (!isLineLikeDrawing(drawing) && !isPathDrawing(drawing) && !isPositionDrawing(drawing) && !BOX_TOOL_TYPES.includes(drawing.type) && !TEXT_MARKER_TYPES.includes(drawing.type))
      ) {
        return drawing;
      }

      return {
        ...drawing,
        ...updates,
      };
    });

    saveDrawings(next);
  };

  const handleSaveSelectedToolPreset = (presetName, overrideDrawing) => {
    const selected = overrideDrawing ?? drawingsRef.current.find((drawing) => drawing.id === selectedDrawingIdRef.current);
    if (!selected || !PRESET_ENABLED_TOOL_TYPES.includes(selected.type)) return;

    const settings = buildToolSettingsFromDrawing(selected);
    const fallbackName = (
      TEXT_MARKER_TYPES.includes(selected.type)
        ? selected.text
        : selected.labelText
    )?.trim();
    const normalizedPresetName = (presetName ?? fallbackName ?? '').trim();

    if (!normalizedPresetName) return;

    saveToolPreset(selected.type, {
      name: normalizedPresetName,
      settings,
    });
    saveToolSettingsForType(selected.type, settings);
  };

  const handleApplyToolPreset = (type, preset) => {
    if (!type || !preset?.settings) return;

    const settings = preset.settings;

    saveToolSettingsForType(type, settings);

    if (settings.color) {
      setDrawingColor(settings.color);
    }

    if (TEXT_MARKER_TYPES.includes(toolRef.current) && settings.labelText) {
      setTextDraft(settings.labelText);
    }

    if (tempDrawingRef.current?.type === type) {
      setTempDrawing((prev) => (prev ? { ...prev, ...settings } : prev));
    }

    if (selectedDrawingIdRef.current) {
      const next = drawingsRef.current.map((drawing) => {
        if (drawing.id !== selectedDrawingIdRef.current || drawing.type !== type) {
          return drawing;
        }

        return {
          ...drawing,
          ...settings,
          ...(TEXT_MARKER_TYPES.includes(type) && settings.labelText ? { text: settings.labelText } : {}),
        };
      });

      saveDrawings(next);
    }
  };

  const handleDeleteToolPreset = (type, preset) => {
    deleteToolPreset(type, preset);
  };

  const handleCancelText = () => {
    setTextInput(null);
    setTool(null);
  };

  const handleSymbolChange = useCallback((value) => {
    const [nextExchange, nextCategory, ...symbolParts] = String(value).split(':');
    const nextSymbol = symbolParts.join(':') || nextCategory || nextExchange;
    const resolvedExchange = symbolParts.length ? nextExchange : 'bybit';
    const resolvedCategory = symbolParts.length ? nextCategory : 'spot';

    // Every call here is a deliberate user pick (search result, watchlist chip),
    // never a background restore — loadMarketSymbols's own fallback-correction
    // must not snap the chart back just because a brand-new symbol hasn't
    // finished (or failed to) save yet. Comparing against the *latest* pick
    // rather than a one-shot flag keeps this correct through a rapid burst of
    // switches, where several loadMarketSymbols calls can resolve out of order.
    justSwitchedSymbolKeyRef.current = `${resolvedExchange}:${resolvedCategory}:${nextSymbol}`;

    setExchange(resolvedExchange);
    setMarketCategory(resolvedCategory);
    setSymbol(nextSymbol);
  }, []);

  const handleAddSymbol = async (symbolToAdd) => {
    if (symbolToAdd?.preventDefault) {
      symbolToAdd.preventDefault();
    }

    const requestedSymbol = typeof symbolToAdd === 'string' ? symbolToAdd : symbolToAdd?.symbol;
    const requestedExchange = typeof symbolToAdd === 'object' ? symbolToAdd?.exchange : null;
    const selectedAvailableSymbol = availableSymbols.find((item) => (
      item.symbol === requestedSymbol
      && (!requestedExchange || item.exchange === requestedExchange)
      && (item.category ?? 'spot') === marketCategory
    ));
    const rawSymbol = selectedAvailableSymbol?.symbol ?? requestedSymbol ?? '';
    const normalizedSymbol = (selectedAvailableSymbol?.symbol ?? rawSymbol).trim().toUpperCase();
    if (!normalizedSymbol) return;

    // The chart already switched to this symbol synchronously in
    // ChartHeader.jsx's handleSelectSymbol before this call starts — this
    // function only persists it to the user's saved-symbol list in the
    // background. It must not mutate exchange/marketCategory/symbol itself
    // (a slow save resolving after the user has since switched again would
    // otherwise yank the chart back), and a request-id guard keeps a stale
    // response from clobbering a newer save's error/spinner state.
    const requestId = symbolPersistIdRef.current + 1;
    symbolPersistIdRef.current = requestId;

    setIsSavingSymbol(true);
    setSymbolError('');

    try {
      // No manual X-CSRF-TOKEN header here — axios already sends one
      // automatically, read fresh from the XSRF-TOKEN cookie on every
      // request (bootstrap.js), which self-heals if the session's token
      // rotates (e.g. session()->regenerate() on login). A manually-set
      // header from the <meta> tag, captured once at initial page load,
      // takes precedence over that and never updates for the rest of an
      // Inertia SPA session — reintroducing this previously caused every
      // save here to fail with a stale-token 419 after any login.
      const response = await axios.post('/market-symbols', {
        symbol: normalizedSymbol,
        exchange: selectedAvailableSymbol?.exchange ?? 'bybit',
        exchange_symbol: selectedAvailableSymbol?.exchange_symbol ?? normalizedSymbol,
        coin_name: selectedAvailableSymbol?.coin_name ?? selectedAvailableSymbol?.baseCoin ?? normalizedSymbol,
        base_coin: selectedAvailableSymbol?.baseCoin ?? '',
        quote_coin: selectedAvailableSymbol?.quoteCoin ?? '',
        category: selectedAvailableSymbol?.category ?? marketCategory,
      }, {
        headers: { Accept: 'application/json' },
      });

      const result = response.data;

      if (!result?.success) {
        throw new Error(result.message || 'Failed to save symbol');
      }

      const savedSymbol = result.symbol;

      setSymbols((currentSymbols) => {
        if (currentSymbols.some((item) => (
          item.symbol === savedSymbol.symbol
          && (item.exchange ?? 'bybit') === (savedSymbol.exchange ?? 'bybit')
          && (item.category ?? 'spot') === (savedSymbol.category ?? 'spot')
        ))) {
          return currentSymbols.map((item) => (
            item.symbol === savedSymbol.symbol
            && (item.exchange ?? 'bybit') === (savedSymbol.exchange ?? 'bybit')
            && (item.category ?? 'spot') === (savedSymbol.category ?? 'spot')
              ? savedSymbol
              : item
          ));
        }

        return [...currentSymbols, savedSymbol].sort((a, b) => (
          a.symbol.localeCompare(b.symbol)
          || (a.exchange ?? '').localeCompare(b.exchange ?? '')
          || (a.category ?? '').localeCompare(b.category ?? '')
        ));
      });
      broadcastChange('backtradelab-symbols-changed');
      if (symbolPersistIdRef.current === requestId) setSymbolError('');
    } catch (err) {
      const validationErrors = err.response?.data?.errors;
      const firstValidationError = validationErrors
        ? Object.values(validationErrors).flat().find(Boolean)
        : null;
      const message = err.response?.status === 419
        ? 'Your session security token expired. Refresh the page, sign in again if needed, then add the symbol.'
        : err.response?.status === 429
          ? "You're switching symbols too fast — wait a few seconds and try again."
          : firstValidationError
            ?? err.response?.data?.message
            ?? err.message
            ?? 'Failed to save symbol';
      if (symbolPersistIdRef.current === requestId) setSymbolError(message);
    } finally {
      if (symbolPersistIdRef.current === requestId) setIsSavingSymbol(false);
    }
  };

  const captureBacktestSnapshot = async () => {
    try {
      return await captureChartSnapshot(wrapperRef.current, chartTheme.background);
    } catch {
      return null;
    }
  };

  const handleOpenBacktestPosition = async ({
    side,
    orderType = 'market',
    marginMode = 'isolated',
    notional,
    leverage,
    entryPrice,
    stopLoss,
    stopLossPnlPercent,
    takeProfit,
    takeProfitPnlPercent,
    playbookId,
    checklistAnswers,
    trailingStopPercent,
    breakEvenTriggerPercent,
    partialTakeProfitPercent,
  }) => {
    const fillPrice = getPositiveNumber(entryPrice) ?? getPositiveNumber(executionPrice);

    if (['conditional', 'limit', 'trigger'].includes(orderType) && getPositiveNumber(entryPrice) == null) {
      setBacktestError('Set an entry price for a pending order.');
      return;
    }

    if (fillPrice == null) {
      setBacktestError('No valid entry price is available for this position.');
      return;
    }

    setIsBacktestLoading(true);
    setBacktestError('');

    try {
      const previousPositionIds = new Set([
        ...(backtestAccount?.openPositions ?? []).map((position) => position.id),
        ...(backtestAccount?.pendingPositions ?? []).map((position) => position.id),
      ]);
      const snapshot = await captureBacktestSnapshot();
      const response = await axios.post('/market-backtest/positions', {
        symbol,
        session_id: backtestAccount?.activeSession?.id,
        exchange,
        category: marketCategory,
        timeframe,
        side,
        order_type: orderType,
        margin_mode: marginMode,
        notional,
        leverage,
        price: fillPrice,
        executed_at_time: executionTime,
        ...(getPositiveNumber(stopLoss) != null ? { stop_loss: getPositiveNumber(stopLoss) } : {}),
        ...(getPositiveNumber(stopLossPnlPercent) != null ? { stop_loss_pnl_percent: getPositiveNumber(stopLossPnlPercent) } : {}),
        ...(getPositiveNumber(takeProfit) != null ? { take_profit: getPositiveNumber(takeProfit) } : {}),
        ...(getPositiveNumber(takeProfitPnlPercent) != null ? { take_profit_pnl_percent: getPositiveNumber(takeProfitPnlPercent) } : {}),
        ...(playbookId ? { playbook_id: playbookId, checklist_answers: checklistAnswers } : {}),
        ...(getPositiveNumber(trailingStopPercent) != null ? { trailing_stop_percent: getPositiveNumber(trailingStopPercent) } : {}),
        ...(getPositiveNumber(breakEvenTriggerPercent) != null ? { break_even_trigger_percent: getPositiveNumber(breakEvenTriggerPercent) } : {}),
        ...(getPositiveNumber(partialTakeProfitPercent) != null ? { partial_take_profit_percent: getPositiveNumber(partialTakeProfitPercent) } : {}),
      });

      const nextAccount = response.data?.account ?? null;
      setBacktestAccount(nextAccount);
      const riskWarnings = response.data?.riskGuardrails?.breaches ?? [];
      if (riskWarnings.length) {
        setBacktestError(`Risk warning: ${riskWarnings.map((item) => item.message).join(' ')}`);
      }

      const createdPosition = [
        ...(nextAccount?.openPositions ?? []),
        ...(nextAccount?.pendingPositions ?? []),
      ].find((position) => !previousPositionIds.has(position.id));

      if (createdPosition) {
        const { type, message } = buildFillToastMessage(createdPosition);
        handleToast(message, type);
      }

      if (createdPosition && snapshot) {
        uploadBacktestSnapshot(createdPosition.id, 'entry', snapshot).catch(() => {});
      }

      // Best-effort safety net, not authoritative: the server's Cross monitor (a separate
      // long-running process, disabled by default — see docs/developer/deployment-and-production.md)
      // is what's actually supposed to catch a maintenance breach. Requesting an evaluation right
      // after taking on new Cross risk means a breach doesn't have to wait for that monitor's next
      // poll cycle (or for the monitor to even be running) before this account's own next action.
      if (createdPosition?.marginMode === 'cross' && createdPosition.status === 'open') {
        axios.post('/market-backtest/cross/evaluate', {
          mode: replayMode ? 'replay' : 'live',
          session_id: nextAccount?.activeSession?.id,
        }).then((evaluateResponse) => {
          const liquidation = evaluateResponse.data?.liquidation;
          if (!liquidation) return;
          setBacktestAccount(evaluateResponse.data?.account ?? null);
          // The notification is persisted server-side (CrossLiquidationService), so dispatch the
          // same event TraderNavbar's poll uses for background-triggered liquidations — this shows
          // the toast immediately instead of waiting up to 5s for the next feed poll, and the
          // shared dedup-by-id in TraderNavbar prevents that poll from showing it a second time.
          window.dispatchEvent(new CustomEvent('backtradelab-cross-liquidated', {
            detail: {
              id: Number(liquidation.notificationId),
              content: liquidation.notificationContent
                ?? `Cross portfolio liquidated · ${liquidation.closedTrades?.length ?? 0} position(s) closed`,
            },
          }));
        }).catch(() => {});
      }
    } catch (err) {
      setBacktestError(err.response?.data?.message ?? err.message ?? 'Failed to open position');
    } finally {
      setIsBacktestLoading(false);
    }
  };

  quickOpenBacktestPositionRef.current = (side) => {
    const maxMargin = getMaxBacktestMarginForCash(
      backtestAccountRef.current?.cashBalance,
      1,
      backtestAccountRef.current?.feeRate ?? 0.0004
    );
    const notional = maxMargin == null ? 1000 : Math.max(Math.min(1000, maxMargin), 0);

    if (notional < 1) {
      setBacktestError('Insufficient paper balance for the minimum 1 USDT margin plus entry fee.');
      return;
    }

    handleOpenBacktestPosition({
      side,
      orderType: 'market',
      notional,
      leverage: 1,
    });
  };

  const uploadBacktestSnapshot = async (positionId, type, snapshot) => {
    if (!positionId || !snapshot) return;

    const formData = new FormData();
    formData.append('type', type);
    formData.append('snapshot', snapshot, `${type}-snapshot.png`);

    if (executionTime != null) {
      formData.append('captured_at_time', executionTime);
    }

    await axios.post(`/market-backtest/positions/${positionId}/snapshot`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  };

  const handleStartBacktestSession = async () => {
    setIsBacktestLoading(true);
    setBacktestError('');

    try {
      const response = await axios.post('/market-backtest/sessions', {
        symbol,
        exchange,
        category: marketCategory,
        timeframe,
        started_at_time: executionTime,
      });

      setBacktestAccount(response.data?.account ?? null);
    } catch (err) {
      setBacktestError(err.response?.data?.message ?? err.message ?? 'Failed to start session');
    } finally {
      setIsBacktestLoading(false);
    }
  };

  const handleEndBacktestSession = async () => {
    const sessionId = backtestAccount?.activeSession?.id;
    if (!sessionId) return;

    setIsBacktestLoading(true);
    setBacktestError('');

    try {
      const response = await axios.post(`/market-backtest/sessions/${sessionId}/end`, {
        ended_at_time: executionTime,
      });

      setBacktestAccount(response.data?.account ?? null);
    } catch (err) {
      setBacktestError(err.response?.data?.message ?? err.message ?? 'Failed to end session');
    } finally {
      setIsBacktestLoading(false);
    }
  };

  const handleTriggerBacktestPosition = async (
    positionId,
    entryPrice,
    entryTime = executionTime,
    { silent = false } = {}
  ) => {
    const triggerPrice = getPositiveNumber(entryPrice);

    if (!positionId || triggerPrice == null) {
      setBacktestError('No valid pending entry price is available.');
      return false;
    }

    if (!silent) {
      setIsBacktestLoading(true);
      setBacktestError('');
    }

    try {
      const snapshot = await captureBacktestSnapshot();
      const response = await axios.post(`/market-backtest/positions/${positionId}/trigger`, {
        price: triggerPrice,
        executed_at_time: entryTime,
      });

      const nextAccount = response.data?.account ?? null;
      setBacktestAccount(nextAccount);

      const filledPosition = (nextAccount?.openPositions ?? []).find((item) => item.id === positionId);
      if (filledPosition) {
        const { type, message } = buildFillToastMessage(filledPosition);
        handleToast(message, type);
      }

      if (snapshot) {
        uploadBacktestSnapshot(positionId, 'entry', snapshot).catch(() => {});
      }
      return true;
    } catch (err) {
      setBacktestError(err.response?.data?.message ?? err.message ?? 'Failed to trigger pending entry');
      return false;
    } finally {
      if (!silent) {
        setIsBacktestLoading(false);
      }
    }
  };

  triggerBacktestPositionRef.current = handleTriggerBacktestPosition;

  const handleCancelBacktestPosition = async (positionId) => {
    if (!positionId) return;

    const targetPosition = backtestAccount?.pendingPositions?.find((item) => item.id === positionId) ?? null;

    setIsBacktestLoading(true);
    setBacktestError('');

    try {
      const response = await axios.post(`/market-backtest/positions/${positionId}/cancel`);
      setBacktestAccount(response.data?.account ?? null);
      if (targetPosition) {
        const { type, message } = buildCancelToastMessage(targetPosition);
        handleToast(message, type);
      }
    } catch (err) {
      setBacktestError(err.response?.data?.message ?? err.message ?? 'Failed to cancel pending entry');
    } finally {
      setIsBacktestLoading(false);
    }
  };

  cancelBacktestPositionRef.current = handleCancelBacktestPosition;

  const handleCloseBacktestPosition = async (
    positionId,
    closePrice = executionPrice,
    closeTime = executionTime,
    { silent = false, closeReason = null } = {}
  ) => {
    const exitPrice = getPositiveNumber(closePrice);

    if (!positionId || exitPrice == null) {
      setBacktestError('No replay price is available for closing.');
      return;
    }

    const targetPosition = backtestAccount?.openPositions?.find((item) => item.id === positionId) ?? null;

    if (!silent) {
      setIsBacktestLoading(true);
      setBacktestError('');
    }

    try {
      const snapshot = await captureBacktestSnapshot();
      const response = await axios.post(`/market-backtest/positions/${positionId}/close`, {
        price: exitPrice,
        executed_at_time: closeTime,
        ...(closeReason ? { close_reason: closeReason } : {}),
      });

      setBacktestAccount(response.data?.account ?? null);

      const closedTrade = response.data?.closedTrade ?? null;
      if (closedTrade) {
        const { type, message } = buildCloseToastMessage(closedTrade, targetPosition);
        handleToast(message, type);
      }

      if (snapshot) {
        uploadBacktestSnapshot(positionId, 'exit', snapshot).catch(() => {});
      }
      return true;
    } catch (err) {
      setBacktestError(err.response?.data?.message ?? err.message ?? 'Failed to close position');
      return false;
    } finally {
      if (!silent) {
        setIsBacktestLoading(false);
      }
    }
  };

  closeBacktestPositionRef.current = handleCloseBacktestPosition;

  useEffect(() => {
    if (!positionMonitorCandle || !backtestAccount?.pendingPositions?.length) return;

    const candleHigh = Number(positionMonitorCandle.high);
    const candleLow = Number(positionMonitorCandle.low);
    const candleTime = positionMonitorCandle.time;

    if (!Number.isFinite(candleHigh) || !Number.isFinite(candleLow)) return;

    const triggeredEntries = backtestAccount.pendingPositions
      .filter((position) => position.symbol === symbol)
      .filter((position) => Number(position.openedAtTime) !== Number(candleTime))
      .map((position) => {
        const entryPrice = Number(position.entryPrice);

        if (!Number.isFinite(entryPrice) || entryPrice <= 0) return null;
        if (candleLow > entryPrice || candleHigh < entryPrice) return null;

        return {
          id: position.id,
          entryPrice,
          key: `${position.id}:${candleTime}:entry`,
        };
      })
      .filter(Boolean)
      .filter((item) => !autoTriggeredPositionRef.current.has(item.key));

    if (!triggeredEntries.length) return;

    let cancelled = false;

    const openTriggeredEntries = async () => {
      setBacktestError('');

      for (const item of triggeredEntries) {
        if (cancelled) return;
        autoTriggeredPositionRef.current.add(item.key);
        const didOpen = await triggerBacktestPositionRef.current?.(item.id, item.entryPrice, candleTime, { silent: true });
        if (!didOpen) {
          autoTriggeredPositionRef.current.delete(item.key);
        }
      }
    };

    openTriggeredEntries();

    return () => {
      cancelled = true;
    };
  }, [backtestAccount, positionMonitorCandle, symbol]);

  useEffect(() => {
    lastMonitoredReplayIndexRef.current = null;
  }, [symbol, timeframe, replayMode]);

  useEffect(() => {
    if (!positionMonitorCandle || !backtestAccount?.openPositions?.length) return;

    const latestHigh = Number(positionMonitorCandle.high);
    const latestLow = Number(positionMonitorCandle.low);
    if (!Number.isFinite(latestHigh) || !Number.isFinite(latestLow)) return;

    // Normally there's just one candle to check: the current one. But Replay can also jump
    // the playhead forward by more than one bar in a single step — dragging/seeking the
    // timeline, not just Step Forward/Play — and each of those older effect runs only ever
    // looked at `positionMonitorCandle`, the single *landing* bar. Every bar in between was
    // silently never checked at all. If price crossed a SL/TP/liquidation level on one of
    // those skipped bars, it was gone for good: a later bar's own high/low no longer reaches
    // that level once price has moved back away from it, so the position stayed open forever
    // despite genuinely having been hit. `lastMonitoredReplayIndexRef` tracks the last index
    // this effect actually looked at; when the gap is more than one bar, every bar in the gap
    // is checked in order instead of only the newest one.
    let candlesToCheck = [positionMonitorCandle];
    if (replayMode) {
      const lastIndex = lastMonitoredReplayIndexRef.current;
      if (lastIndex != null && replayIndex > lastIndex + 1) {
        // Bounded so an extreme jump (e.g. dragging the timeline across thousands of bars)
        // can't queue thousands of sequential requests — falls back to the most recent
        // POSITION_MONITOR_GAP_LIMIT bars of the gap rather than the true full range.
        const gapStart = Math.max(lastIndex + 1, replayIndex - POSITION_MONITOR_GAP_LIMIT + 1);
        const gapCandles = allCandles
          .slice(gapStart, replayIndex + 1)
          .filter((candle) => Number.isFinite(Number(candle?.high)) && Number.isFinite(Number(candle?.low)));
        if (gapCandles.length) candlesToCheck = gapCandles;
      }
      lastMonitoredReplayIndexRef.current = replayIndex;
    }

    const managedPositions = backtestAccount.openPositions
      .filter((position) => position.symbol === symbol)
      .filter((position) => position.liquidationPrice || position.trailingStopPercent || position.breakEvenTriggerPercent || position.partialTakeProfitPercent);

    const triggeredPositions = backtestAccount.openPositions
      .filter((position) => position.symbol === symbol)
      .filter((position) => !position.liquidationPrice && !position.trailingStopPercent && !position.breakEvenTriggerPercent && !position.partialTakeProfitPercent)
      .map((position) => {
        const stopLoss = Number(position.stopLoss);
        const takeProfit = Number(position.takeProfit);
        const hasStopLoss = Number.isFinite(stopLoss) && stopLoss > 0;
        const hasTakeProfit = Number.isFinite(takeProfit) && takeProfit > 0;

        const positionCandles = candlesToCheck.filter(
          (candle) => Number(candle.time) > Number(position.openedAtTime)
        );

        for (const candle of positionCandles) {
          const candleHigh = Number(candle.high);
          const candleLow = Number(candle.low);
          if (!Number.isFinite(candleHigh) || !Number.isFinite(candleLow)) continue;

          let exitPrice = null;
          let trigger = null;

          if (position.side === 'long') {
            if (hasStopLoss && candleLow <= stopLoss) {
              exitPrice = stopLoss;
              trigger = 'sl';
            } else if (hasTakeProfit && candleHigh >= takeProfit) {
              exitPrice = takeProfit;
              trigger = 'tp';
            }
          }

          if (position.side === 'short') {
            if (hasStopLoss && candleHigh >= stopLoss) {
              exitPrice = stopLoss;
              trigger = 'sl';
            } else if (hasTakeProfit && candleLow <= takeProfit) {
              exitPrice = takeProfit;
              trigger = 'tp';
            }
          }

          if (exitPrice) {
            return {
              id: position.id,
              exitPrice,
              trigger,
              candleTime: candle.time,
              key: `${position.id}:${candle.time}:${trigger}`,
            };
          }
        }

        return null;
      })
      .filter(Boolean)
      .filter((item) => !autoClosedPositionRef.current.has(item.key));

    // Managed and simple positions are checked in the same effect pass — they used to be
    // mutually exclusive (an early `return` after handling managed positions meant any simple
    // position sharing a symbol with a managed one never got its TP/SL checked at all). That
    // was unreachable dead code before Spot positions existed (every position always had a
    // truthy liquidationPrice, so `triggeredPositions` was always empty in practice) but became
    // a real bug once Spot positions (liquidationPrice === null) could coexist on the same
    // symbol as a leveraged position.
    if (!managedPositions.length && !triggeredPositions.length) return;

    let cancelled = false;

    if (managedPositions.length) {
      const processManagedPositions = async () => {
        const snapshot = await captureBacktestSnapshot();
        for (const position of managedPositions) {
          if (cancelled) continue;
          // A live tick can re-run this effect many times a second, each spawning its own
          // async pass over the same open positions. Without this guard, two overlapping
          // passes could both have an in-flight process-candle request for the same position;
          // whichever lands second finds it already closed and 404s with a raw Eloquent
          // "model not found" message. Only one request per position may be in flight at once.
          if (pendingManagedPositionRef.current.has(position.id)) continue;
          pendingManagedPositionRef.current.add(position.id);
          try {
            // Only bars strictly after this position's own entry apply — a shared gap can
            // span bars from before this position existed if it was opened partway through it.
            const positionCandles = candlesToCheck.filter(
              (candle) => Number(candle.time) > Number(position.openedAtTime)
            );

            for (const candle of positionCandles) {
              if (cancelled) break;

              const candleHigh = Number(candle.high);
              const candleLow = Number(candle.low);
              const candleTime = candle.time;
              if (!Number.isFinite(candleHigh) || !Number.isFinite(candleLow)) continue;

              // Keyed on the running high/low (not just candleTime) so a still-forming live
              // candle is re-checked every time price makes a new extreme, instead of only
              // once per bar.
              const key = `${position.id}:${candleTime}:${candleHigh}:${candleLow}:managed`;
              if (autoClosedPositionRef.current.has(key)) continue;
              autoClosedPositionRef.current.add(key);

              try {
                const response = await axios.post(`/market-backtest/positions/${position.id}/process-candle`, {
                  high: candleHigh,
                  low: candleLow,
                  price: Number(candle.close),
                  executed_at_time: candleTime,
                });
                const nextAccount = response.data?.account ?? null;
                // Apply this unconditionally, even if `cancelled` — a newer candle/tick
                // superseding this effect run does not mean the server's response stopped
                // being true. The position may genuinely be closed now; discarding that here
                // would leave it permanently "stuck open" on the frontend, since every later
                // re-check of an already-closed position just 404s (see below) and never
                // corrects the state.
                setBacktestAccount(nextAccount);

                const closedTrade = response.data?.closedTrade ?? null;
                if (closedTrade) {
                  const { type, message } = buildCloseToastMessage(closedTrade, position);
                  handleToast(message, type);
                }

                const remainsOpen = (nextAccount?.openPositions ?? []).some((item) => item.id === position.id);
                if (!remainsOpen) {
                  if (snapshot) uploadBacktestSnapshot(position.id, 'exit', snapshot).catch(() => {});
                  break; // closed — no need to keep checking later bars in this gap for it
                }
              } catch (err) {
                autoClosedPositionRef.current.delete(key);
                // A 404 here means another check already closed/removed this position first —
                // expected under the race above, not a real failure worth alarming the user with.
                if (err.response?.status !== 404) {
                  setBacktestError(err.response?.data?.message ?? 'Failed to process position rules');
                }
                break;
              }
            }
          } finally {
            pendingManagedPositionRef.current.delete(position.id);
          }
        }
      };
      processManagedPositions();
    }

    if (triggeredPositions.length) {
      const closeTriggeredPositions = async () => {
        setBacktestError('');

        for (const item of triggeredPositions) {
          if (cancelled) return;
          autoClosedPositionRef.current.add(item.key);
          const didClose = await closeBacktestPositionRef.current?.(item.id, item.exitPrice, item.candleTime, {
            silent: true,
            closeReason: item.trigger === 'sl' ? 'stop_loss' : 'take_profit',
          });
          if (!didClose) {
            autoClosedPositionRef.current.delete(item.key);
          }
        }
      };

      closeTriggeredPositions();
    }

    return () => {
      cancelled = true;
    };
  }, [allCandles, backtestAccount, positionMonitorCandle, replayIndex, replayMode, symbol]);

  const handleToggleFullscreen = () => {
    setIsFullscreen((current) => {
      if (current) setIsFullscreenEntryPanelOpen(false);
      return !current;
    });
    scheduleOverlayRender();
  };

  const handleTimeframeChange = useCallback((nextTimeframe) => {
    if (nextTimeframe === timeframe) return;

    setChartContextMenu(null);
    setChartOrderAction(null);

    const timeScale = chartRef.current?.timeScale?.();
    const visibleRange = timeScale?.getVisibleRange?.();
    const logicalRange = timeScale?.getVisibleLogicalRange?.();

    if (
      visibleRange?.from != null
      && visibleRange?.to != null
      && Number.isFinite(Number(logicalRange?.from))
      && Number.isFinite(Number(logicalRange?.to))
    ) {
      const fromTime = Number(visibleRange.from);
      const toTime = Number(visibleRange.to);
      pendingVisibleViewRef.current = {
        timeRange: visibleRange,
        centerTime: fromTime + ((toTime - fromTime) / 2),
        logicalSpan: Math.max((Number(logicalRange.to) - Number(logicalRange.from)) * 0.72, 6),
      };
    } else {
      pendingVisibleViewRef.current = null;
    }

    timeframeTransitionKeyRef.current = `${exchange}:${marketCategory}:${symbol}:${nextTimeframe}`;
    setTimeframe(nextTimeframe);
  }, [exchange, marketCategory, symbol, timeframe]);

  const chartHeaderProps = {
    symbol,
    exchange,
    marketCategory,
    symbols,
    availableSymbols,
    isSavingSymbol,
    isLoadingAvailableSymbols,
    symbolError,
    timeframe,
    timeframeOptions,
    timeframeFavorites,
    replayMode,
    replayAccessStatus,
    liveConnectionStatus,
    currentPrice,
    selectedReplayPrice,
    indicators,
    onSymbolChange: handleSymbolChange,
    onCategoryChange: setMarketCategory,
    onAddSymbol: handleAddSymbol,
    onTimeframeChange: handleTimeframeChange,
    onTimeframeFavoritesChange: handleTimeframeFavoritesChange,
    onToggleReplayMode: toggleReplayMode,
    onIndicatorsChange: setIndicators,
    onOpenIndicatorSettings: (indicator) => {
      setSelectedIndicator(indicator);
      setSelectedDrawingId(null);
      setTool(null);
    },
    onCreatePriceAlert: handleCreatePriceAlert,
    chartTheme,
  };

  return (
    <>
    {confirmElement}
    {/* Manual wiring, not IconTooltipButton: this button needs `fixed`
        positioning on itself, and IconTooltipButton's wrapping <span>
        hardcodes `relative` — same class landing on the same element
        conflicts on the `position` property, and `relative` was winning,
        so the button rendered inline instead of pinned to the viewport
        corner (see CancelAlertButton above for the sibling absolute-child
        version of this same pitfall). */}
    <button
      ref={restartTourTooltip.anchorRef}
      type="button"
      aria-label="Restart workspace tour"
      onClick={()=>setTourStep(0)}
      onMouseEnter={restartTourTooltip.show}
      onMouseLeave={restartTourTooltip.hide}
      onFocus={restartTourTooltip.show}
      onBlur={restartTourTooltip.hide}
      className="fixed bottom-4 right-4 z-[10000] flex h-9 w-9 items-center justify-center rounded-full border border-[#2dd4bf]/40 bg-[#131722] text-[#5eead4] shadow-xl"
    ><HelpCircle size={17}/></button>
    <AnchoredTooltipPortal pos={restartTourTooltip.pos} label="Restart workspace tour" isDark={chartTheme.mode === 'dark'} zIndexClass="z-[10001]" />
    {showSubscriptionModal && <SubscriptionModal onClose={() => setShowSubscriptionModal(false)} onTrialActivated={() => {
      setReplayAccessAllowed(true);
      replayAccessAllowedRef.current = true;
      setShowSubscriptionModal(false);
    }} />}
    {replayAccessError && <div className="fixed right-4 top-4 z-[10004] max-w-sm rounded-lg border border-red-500/40 bg-[#131722] p-4 text-sm text-white shadow-2xl"><div>{replayAccessError}</div><div className="mt-2 flex gap-3"><button onClick={() => requireReplayAccess({ showProgress: true })} className="font-semibold text-[#5eead4]">Try again</button><button onClick={() => setReplayAccessError('')} className="text-[#9598a1]">Dismiss</button></div></div>}
    {alertNotice && <div className="fixed right-4 top-4 z-[10003] flex max-w-sm items-start gap-3 rounded-lg border border-amber-400/40 bg-[#131722] p-4 text-sm text-white shadow-2xl"><Bell size={18} className="mt-0.5 shrink-0 text-amber-400"/><span>{alertNotice}</span><button onClick={()=>setAlertNotice('')} aria-label="Dismiss alert"><X size={16}/></button></div>}
    {alertModalOpen && <div className="fixed inset-0 z-[10002] flex items-end justify-center bg-black/60 p-4 sm:items-center" onMouseDown={(e)=>e.target===e.currentTarget&&setAlertModalOpen(false)}><div className={`w-full max-w-sm rounded-xl border p-5 shadow-2xl ${chartTheme.mode==='dark'?'border-[#2a2e39] bg-[#131722] text-white':'border-slate-200 bg-white text-slate-900'}`} role="dialog" aria-modal="true"><div className="flex items-center justify-between"><h2 className="flex items-center gap-2 font-bold"><Bell size={17}/>Set {symbol} alert</h2><button onClick={()=>setAlertModalOpen(false)} aria-label="Close"><X size={18}/></button></div><label className="mt-4 block text-xs font-semibold">Price<input autoFocus type="number" min="0" step="any" value={alertDraft.price} onChange={(e)=>setAlertDraft((d)=>({...d,price:e.target.value}))} className="mt-1 h-10 w-full rounded-md border border-gray-600 bg-transparent px-3 outline-none focus:border-[#2dd4bf]"/></label><div className="mt-3 grid grid-cols-2 gap-2">{[['rise','Rise to price'],['drop','Drop to price']].map(([value,label])=><button key={value} onClick={()=>setAlertDraft((d)=>({...d,type:value}))} className={`h-10 rounded-md border text-xs font-semibold ${alertDraft.type===value?'border-[#2dd4bf] bg-[#2dd4bf] text-white':'border-gray-600'}`}>{label}</button>)}</div>{alertError&&<p className="mt-2 text-xs text-red-400">{alertError}</p>}<button onClick={savePriceAlert} className="mt-4 h-10 w-full rounded-md bg-[#2dd4bf] text-sm font-bold text-white">Create alert</button></div></div>}
    {showClearDrawingsConfirm && (
      <div
        className="fixed inset-0 z-[10002] flex items-center justify-center bg-black/60 p-4"
        onMouseDown={(e) => e.target === e.currentTarget && setShowClearDrawingsConfirm(false)}
      >
        <div
          className={`w-full max-w-sm rounded-xl border p-5 shadow-2xl ${chartTheme.mode === 'dark' ? 'border-[#2a2e39] bg-[#131722] text-white' : 'border-slate-200 bg-white text-slate-900'}`}
          role="dialog"
          aria-modal="true"
          aria-label="Clear all drawings"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold">Clear all drawings?</h2>
            <button onClick={() => setShowClearDrawingsConfirm(false)} aria-label="Close">
              <X size={18} />
            </button>
          </div>
          <p className="mt-3 text-sm text-[#9598a1]">
            This removes every drawing on this market's chart. You can undo it with Ctrl/Cmd + Z right after.
          </p>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => setShowClearDrawingsConfirm(false)}
              className={`h-10 flex-1 rounded-md border text-sm font-semibold ${chartTheme.mode === 'dark' ? 'border-[#2a2e39] text-white hover:bg-white/5' : 'border-slate-300 text-slate-700 hover:bg-slate-50'}`}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={performClearDrawings}
              className="h-10 flex-1 rounded-md bg-red-600 text-sm font-bold text-white hover:bg-red-500"
            >
              Clear all
            </button>
          </div>
        </div>
      </div>
    )}
    {tourStep >= 0 && <WorkspaceTour step={tourStep} steps={tourSteps} onStep={setTourStep} onFinish={finishTour} dark={chartTheme.mode==='dark'}/>}
    <ChartSettingsModal
      open={isChartSettingsOpen}
      onClose={() => setIsChartSettingsOpen(false)}
      isDark={chartTheme.mode === 'dark'}
      candleColors={candleColors}
      candleSize={candleSize}
      chartDisplay={chartDisplay}
      onCandleColorChange={setCandleColors}
      onCandleSizeChange={setCandleSize}
      onChartDisplayChange={updateChartDisplay}
      presetItems={getToolPresetsForType(CHART_SETTINGS_PRESET_TYPE)}
      onSavePreset={(name, settings) => saveToolPreset(CHART_SETTINGS_PRESET_TYPE, { name, settings })}
      onDeletePreset={(preset) => deleteToolPreset(CHART_SETTINGS_PRESET_TYPE, preset)}
    />
    {alertModalOpen && <aside className={`fixed bottom-4 right-4 z-[10003] w-[min(92vw,320px)] rounded-xl border p-4 shadow-2xl sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2 ${chartTheme.mode === 'dark' ? 'border-[#2a2e39] bg-[#131722] text-white' : 'border-slate-200 bg-white text-slate-900'}`}><div className="flex items-center justify-between"><h3 className="text-sm font-bold">Alert settings</h3><button onClick={toggleAlertSound} className="rounded-md border px-2 py-1 text-xs font-semibold">Sound {alertSoundEnabled ? 'on' : 'off'}</button></div><p className="mt-2 text-[11px] text-[#787b86]">Alerts monitor live markets in the background. Replay alerts are disabled.</p><div className="mt-3 max-h-44 space-y-2 overflow-y-auto">{priceAlerts.map(alert => <div key={alert.id} className="flex items-center justify-between rounded-md border p-2 text-xs"><span>{alert.direction} {formatOverlayPrice(Number(alert.target_price))}</span><button onClick={() => cancelPriceAlert(alert.id)} className="text-red-400" aria-label="Cancel alert"><Trash2 size={14}/></button></div>)}{!priceAlerts.length && <div className="text-xs text-[#787b86]">No active alerts for this market.</div>}</div></aside>}
    {chartContextMenu && (
      <div
        ref={chartContextMenuRef}
        role="menu"
        aria-label={`Chart actions at ${formatOverlayPrice(chartContextMenu.price)}`}
        data-chart-ui="price-context-menu"
        onContextMenu={(event) => event.preventDefault()}
        className={`fixed z-[10005] w-[220px] overflow-hidden rounded-lg border p-1.5 shadow-2xl ${chartTheme.mode === 'dark' ? 'border-[#363a45] bg-[#1e222d] text-[#d1d4dc]' : 'border-slate-200 bg-white text-slate-800'}`}
        style={{ left: chartContextMenu.x, top: chartContextMenu.y }}
      >
        <div className="px-2.5 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-wide text-[#787b86]">
          Price {formatOverlayPrice(chartContextMenu.price)}
        </div>
        <button
          ref={chartContextMenuFirstItemRef}
          type="button"
          role="menuitem"
          onClick={() => {
            const price = chartContextMenu.price;
            setChartContextMenu(null);
            handleCreatePriceAlert(price);
          }}
          className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-xs font-semibold outline-none ${chartTheme.mode === 'dark' ? 'hover:bg-white/10 focus:bg-white/10' : 'hover:bg-slate-100 focus:bg-slate-100'}`}
        >
          <Bell size={15} className="text-amber-500" />
          Set Alarm
        </button>
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            const price = chartContextMenu.price;
            setChartContextMenu(null);
            setChartOrderRequest({ id: Date.now(), price });
          }}
          className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-xs font-semibold outline-none ${chartTheme.mode === 'dark' ? 'hover:bg-white/10 focus:bg-white/10' : 'hover:bg-slate-100 focus:bg-slate-100'}`}
        >
          <Wallet size={15} className="text-[#5eead4]" />
          Trigger Position
        </button>
        <div className={`my-1 border-t ${chartTheme.mode === 'dark' ? 'border-[#363a45]' : 'border-slate-200'}`} />
        <button
          type="button"
          role="menuitem"
          disabled={!drawings.length}
          onClick={() => {
            setChartContextMenu(null);
            handleClearDrawings();
          }}
          className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-xs font-semibold text-red-500 outline-none disabled:cursor-not-allowed disabled:opacity-40 ${
            chartTheme.mode === 'dark' ? 'hover:bg-white/10 focus:bg-white/10' : 'hover:bg-slate-100 focus:bg-slate-100'
          }`}
        >
          <Trash2 size={15} />
          Clear Tools
        </button>
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            setChartContextMenu(null);
            handleResetChartView();
          }}
          className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-xs font-semibold outline-none ${chartTheme.mode === 'dark' ? 'hover:bg-white/10 focus:bg-white/10' : 'hover:bg-slate-100 focus:bg-slate-100'}`}
        >
          <RotateCcw size={15} className="text-[#787b86]" />
          Reset Chart
        </button>
        <div className={`my-1 border-t ${chartTheme.mode === 'dark' ? 'border-[#363a45]' : 'border-slate-200'}`} />
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            setChartContextMenu(null);
            setIsChartSettingsOpen(true);
          }}
          className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-xs font-semibold outline-none ${chartTheme.mode === 'dark' ? 'hover:bg-white/10 focus:bg-white/10' : 'hover:bg-slate-100 focus:bg-slate-100'}`}
        >
          <Settings size={15} className="text-[#787b86]" />
          Chart Settings
        </button>
      </div>
    )}
    <div
      ref={fullscreenRef}
      className={
        isFullscreen
          ? 'fixed inset-0 z-[9999] flex h-[100dvh] flex-col overflow-hidden bg-black-screen-color'
          : 'overflow-hidden rounded-lg border'
      }
      style={isFullscreen ? { backgroundColor: chartTheme.panel } : { borderColor: chartTheme.border, backgroundColor: chartTheme.panel }}
    >
      <FullscreenChartHeader
        chartHeaderProps={chartHeaderProps}
        isFullscreen={isFullscreen}
        chartTheme={chartTheme}
        backtestAccount={backtestAccount}
        isEntryPanelOpen={isFullscreenEntryPanelOpen}
        onEntryPanelOpenChange={setIsFullscreenEntryPanelOpen}
        showAppName={isFullscreen}
        onToggleFullscreen={() => {
          if (isFullscreen) {
            setIsFullscreenEntryPanelOpen(false);
          }
          handleToggleFullscreen();
        }}
      />

      <div className="ml-[52px] min-h-0 flex-1">
        <div className={`relative flex min-w-0 flex-col ${isFullscreen ? 'h-full' : ''}`}>
          <ChartStage
            wrapperRef={wrapperRef}
            containerRef={containerRef}
            isFullscreen={isFullscreen}
            timeframe={timeframe}
            replayMode={replayMode}
            currentPriceCoordinate={currentPriceCoordinate}
            isSpacePressed={isSpacePressed}
            isReplayPricePickActive={isReplayPricePickActive}
            isHoveringBacktestOrderCancel={isHoveringBacktestOrderCancel}
            tool={tool}
            chartTheme={chartTheme}
            overlaySize={overlaySize}
            mainPaneHeight={mainPaneHeight}
            renderedDrawings={renderedDrawings}
            renderedBacktestOrders={renderedBacktestOrders}
            renderedTradeMarkers={renderedTradeMarkers}
            swingPointMarkers={swingPointMarkers}
            selectedDrawingId={selectedDrawingId}
            hoveredPositionDrawingId={hoveredPositionDrawingId}
            textInput={textInput}
            textDraft={textDraft}
            onTextDraftChange={setTextDraft}
            onSaveText={handleSaveText}
            onCancelText={handleCancelText}
            onToggleFullscreen={handleToggleFullscreen}
          />

          <ChartBottomBar
            chartTheme={chartTheme}
            visibleLiveStatus={visibleLiveStatus}
            browserOnline={browserOnline}
            liveFeedInfo={liveFeedInfo}
            isLiveFeedDelayed={isLiveFeedDelayed}
            liveFeedAgeSeconds={liveFeedAgeSeconds}
            latestCandleStartedAt={latestCandleStartedAt}
            exchange={exchange}
            marketCategory={marketCategory}
            timezone={timezone}
            timezoneOptions={timezoneOptions}
            timezoneSaving={timezoneSaving}
            onTimezoneChange={handleTimezoneChange}
          />

          <ChartMarketLegend
            symbol={symbol}
            exchange={exchange}
            timeframe={timeframe}
            candle={legendCandle}
            isTimeframeLoading={isTimeframeLoading}
            chartTheme={chartTheme}
            showSymbol={chartDisplay.statusLine.symbol}
            showExchange={chartDisplay.statusLine.exchange}
            showOhlc={chartDisplay.statusLine.ohlc}
            showChange={chartDisplay.statusLine.change}
            isActive={isLegendActive || tourSteps[tourStep]?.selector === '[data-tour="appearance"]'}
            onOpenSettings={() => setIsChartSettingsOpen(true)}
          />

          <IndicatorSettingsPanel
            indicators={indicators}
            selectedIndicator={selectedIndicator}
            onChange={setIndicators}
            onClose={() => setSelectedIndicator(null)}
            chartTheme={chartTheme}
          />

          <IndicatorClickTargets
            indicators={indicators}
            paneTops={indicatorPaneTops}
            expandedIndicator={expandedIndicator}
            chartTheme={chartTheme}
            onAction={(indicator, action, event) => {
              if (action === 'expand') {
                setExpandedIndicator((current) => (current === indicator ? null : indicator));
                setSelectedDrawingId(null);
                setTool(null);
                return;
              }
              if (action === 'settings') {
                setSelectedIndicator(indicator);
                setSelectedDrawingId(null);
                setTool(null);
                return;
              }
              if (action === 'toggle-visible') {
                setIndicators((current) => ({
                  ...current,
                  [`${indicator}Visible`]: current[`${indicator}Visible`] === false,
                }));
                return;
              }
              if (action === 'remove') {
                setIndicators((current) => ({ ...current, [indicator]: false }));
                setSelectedIndicator((current) => (current === indicator ? null : current));
                setExpandedIndicator((current) => (current === indicator ? null : current));
                return;
              }
              if (action === 'menu') {
                setIndicatorContextMenu({
                  type: indicator,
                  x: Math.max(8, Math.min(event.clientX, window.innerWidth - 208)),
                  y: Math.max(8, Math.min(event.clientY, window.innerHeight - 120)),
                });
              }
            }}
          />

          {indicatorContextMenu && (
            <IndicatorContextMenu
              indicatorKey={indicatorContextMenu.type}
              x={indicatorContextMenu.x}
              y={indicatorContextMenu.y}
              indicators={indicators}
              chartTheme={chartTheme}
              menuRef={indicatorContextMenuRef}
              firstItemRef={indicatorContextMenuFirstItemRef}
              onToggleVisible={() => {
                const key = indicatorContextMenu.type;
                setIndicators((current) => ({
                  ...current,
                  [`${key}Visible`]: current[`${key}Visible`] === false,
                }));
                setIndicatorContextMenu(null);
              }}
              onOpenSettings={() => {
                setSelectedIndicator(indicatorContextMenu.type);
                setSelectedDrawingId(null);
                setTool(null);
                setIndicatorContextMenu(null);
              }}
              onRemove={() => {
                const key = indicatorContextMenu.type;
                setIndicators((current) => ({ ...current, [key]: false }));
                setSelectedIndicator((current) => (current === key ? null : current));
                setExpandedIndicator((current) => (current === key ? null : current));
                setIndicatorContextMenu(null);
              }}
            />
          )}

          {isTimeframeLoading && (
            <div
              data-chart-ui="timeframe-loading-shield"
              role="status"
              aria-live="polite"
              aria-label={`Loading ${timeframe} candles`}
              onContextMenu={(event) => event.preventDefault()}
              className="absolute -left-[52px] bottom-0 right-0 top-0 z-[75] flex cursor-wait items-center justify-center bg-black/25"
            >
              {showTimeframeLoadingHint && (
                <div className="flex items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 text-xs font-medium text-white shadow-lg">
                  <LoaderCircle size={13} className="animate-spin" />
                  Loading {timeframe} history…
                </div>
              )}
            </div>
          )}

          {priceAlerts.map(alert => {
            const y = candleSeriesRef.current?.priceToCoordinate?.(Number(alert.target_price));
            if (!Number.isFinite(Number(y))) return null;
            return (
              <CancelAlertButton
                key={`cancel-alert-${alert.id}`}
                top={Math.max(2, Number(y) - 10)}
                label={`Cancel alert at ${formatOverlayPrice(Number(alert.target_price))}`}
                isDark={chartTheme.mode === 'dark'}
                onClick={() => cancelPriceAlert(alert.id)}
              />
            );
          })}

          {chartOrderAction && !loading && !error && <div className="pointer-events-none absolute left-0 right-0 z-10 border-t border-dashed border-[#787b86]" style={{ top: chartOrderAction.y }} />}
          <div className="hidden" aria-hidden="true">
            <button
              type="button"
              className={`flex items-center gap-1.5 rounded border px-2 py-1 text-[10px] font-semibold shadow outline-none transition focus:ring-2 focus:ring-[#2dd4bf]/60 ${chartTheme.mode === 'dark' ? 'border-[#2a2e39] bg-[#131722]/95 text-[#d1d4dc]' : 'border-slate-200 bg-white/95 text-slate-700'}`}
              aria-label={`${visibleLiveStatus.label}. Show market feed details.`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${
                visibleLiveStatus.key === 'replay' ? 'bg-violet-500'
                  : visibleLiveStatus.key === 'offline' ? 'bg-red-500'
                    : visibleLiveStatus.key === 'live' ? 'bg-emerald-500'
                      : visibleLiveStatus.key === 'polling' ? 'bg-sky-500'
                        : 'animate-pulse bg-amber-400'
              }`} />
              {visibleLiveStatus.label}
            </button>
            <div
              role="tooltip"
              className={`pointer-events-none absolute bottom-full right-0 mb-2 w-72 translate-y-1 rounded-lg border p-3 text-xs opacity-0 shadow-2xl transition group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100 ${chartTheme.mode === 'dark' ? 'border-[#363a45] bg-[#1e222d] text-[#d1d4dc]' : 'border-slate-200 bg-white text-slate-800'}`}
            >
              <div className="mb-2 flex items-center justify-between gap-3 border-b border-current/10 pb-2">
                <span className="font-bold">Market feed</span>
                <span className={`font-semibold ${isLiveFeedDelayed ? 'text-amber-500' : browserOnline ? 'text-emerald-500' : 'text-red-500'}`}>{visibleLiveStatus.label}</span>
              </div>
              <dl className="space-y-1.5">
                <div className="flex justify-between gap-4"><dt className="text-[#787b86]">Internet</dt><dd className="text-right font-semibold">{browserOnline ? 'Online' : 'Offline'}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-[#787b86]">Feed</dt><dd className="text-right font-semibold">{liveFeedInfo.source === 'websocket' ? 'WebSocket' : liveFeedInfo.source === 'rest' ? 'REST fallback' : 'Waiting for first update'}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-[#787b86]">Market</dt><dd className="text-right font-semibold">{exchange.toUpperCase()} · {marketCategory === 'spot' ? 'Spot' : 'Futures'}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-[#787b86]">Last update</dt><dd className="max-w-[165px] text-right font-semibold">{formatLocalFeedTime(liveFeedInfo.receivedAt)}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-[#787b86]">Chart delay</dt><dd className={`text-right font-semibold ${isLiveFeedDelayed ? 'text-amber-500' : ''}`}>{formatFeedAge(liveFeedAgeSeconds)}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-[#787b86]">Candle started</dt><dd className="max-w-[165px] text-right font-semibold">{formatLocalFeedTime(latestCandleStartedAt)}</dd></div>
              </dl>
              <p className="mt-2 border-t border-current/10 pt-2 text-[10px] leading-4 text-[#787b86]">Delay is the time since BacktradeLab received a valid candle, not network latency.</p>
            </div>
          </div>

          {chartOrderAction && !loading && !error && (
            <button
              ref={createOrderTooltip.anchorRef}
              type="button"
              data-chart-ui="order-price-action"
              onClick={() => setChartOrderRequest({
                id: Date.now(),
                price: chartOrderAction.price,
              })}
              onMouseEnter={createOrderTooltip.show}
              onMouseLeave={(event) => {
                createOrderTooltip.hide();
                if (wrapperRef.current?.contains(event.relatedTarget)) return;
                setChartOrderAction(null);
              }}
              onFocus={createOrderTooltip.show}
              onBlur={createOrderTooltip.hide}
              className={`absolute z-20 flex h-7 w-7 items-center justify-center rounded-full border p-0 text-base font-bold leading-none shadow-lg ${
                chartTheme.mode === 'dark'
                  ? 'border-gray-600 bg-skin-black text-white hover:bg-white hover:text-black'
                  : 'border-slate-400 bg-white text-slate-900 hover:bg-slate-900 hover:text-white'
              }`}
              style={{
                right: 58,
                top: Math.max(4, chartOrderAction.y - 14),
              }}
              aria-label={`Create order at ${formatOverlayPrice(chartOrderAction.price)}`}
            >
              <span aria-hidden="true">+</span>
            </button>
          )}
          <AnchoredTooltipPortal pos={createOrderTooltip.pos} label={chartOrderAction ? `Create order at ${formatOverlayPrice(chartOrderAction.price)}` : ''} isDark={chartTheme.mode === 'dark'} />

          {chartOrderAction && !loading && !error && (
            <button
              ref={setAlertTooltip.anchorRef}
              type="button"
              data-chart-ui="alert-price-action"
              onMouseDown={(event) => { event.preventDefault(); event.stopPropagation(); }}
              onClick={(event) => { event.preventDefault(); event.stopPropagation(); handleCreatePriceAlert(chartOrderAction.price); }}
              onMouseEnter={setAlertTooltip.show}
              onMouseLeave={setAlertTooltip.hide}
              onFocus={setAlertTooltip.show}
              onBlur={setAlertTooltip.hide}
              className="absolute left-2 z-20 flex h-6 w-6 items-center justify-center rounded bg-amber-500 text-black shadow-lg hover:bg-amber-400"
              style={{ top: Math.max(4, chartOrderAction.y - 12) }}
              aria-label={`Set alert at ${formatOverlayPrice(chartOrderAction.price)}`}
            >
              <Bell size={13} />
            </button>
          )}
          <AnchoredTooltipPortal pos={setAlertTooltip.pos} label={chartOrderAction ? `Set alert at ${formatOverlayPrice(chartOrderAction.price)}` : ''} isDark={chartTheme.mode === 'dark'} />

          {(loading || error) && (
            <div
              data-chart-ui="chart-status"
              className={`pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-lg text-sm font-medium backdrop-blur-[1px] ${
                loading
                  ? chartTheme.mode === 'dark'
                    ? 'text-white'
                    : 'text-slate-700'
                  : 'text-red-400'
              }`}
              style={{ backgroundColor: chartTheme.overlay }}
            >
              {loading ? (
                <ChartSkeletonLoader isDark={chartTheme.mode === 'dark'} />
              ) : error}
            </div>
          )}

          {/* Floats over the bottom of the canvas rather than taking a row, so
              entering/leaving Replay never resizes the chart. Only rendered in
              Replay — the chart header owns entering and exiting. */}
          <ReplayControlBar
            replayMode={replayMode}
            isPlaying={isPlaying}
            replayIndex={replayIndex}
            candleCount={allCandles.length}
            playbackSpeed={playbackSpeed}
            followReplay={followReplay}
            isReplayPricePickActive={isReplayPricePickActive}
            replayAccessStatus={replayAccessStatus}
            replayAccessError={replayAccessError}
            onTogglePlay={togglePlay}
            onStepBackward={stepBackward}
            onStepForward={stepForward}
            onResetReplay={resetReplay}
            onFollowReplay={handleFollowReplay}
            onToggleReplayPricePick={handleToggleReplayPricePick}
            onRetryReplayAccess={() => requireReplayAccess({ showProgress: true })}
            onPlaybackSpeedChange={setPlaybackSpeed}
            chartTheme={chartTheme}
          />

          <ReplayPanel
            className={isFullscreen ? 'fixed bottom-7 left-0 right-0 top-12 z-[70]' : 'absolute -left-[52px] bottom-7 right-0 top-0 z-50'}
            fullscreenDrawingOnly={isFullscreen}
            groupedWorkspaceRail={!isFullscreen}
            marketCategory={marketCategory}
            fullscreenEntryPanelOpen={isFullscreenEntryPanelOpen}
            onFullscreenEntryPanelOpenChange={setIsFullscreenEntryPanelOpen}
            tool={tool}
            drawingColor={drawingColor}
            drawings={drawings}
            drawingSaveStatus={drawingSaveStatus}
            selectedDrawingId={selectedDrawingId}
            selectedDrawing={selectedDrawing}
            toolSettings={toolSettings}
            symbol={symbol}
            timeframe={timeframe}
            executionPrice={executionPrice}
            backtestAccount={backtestAccount}
            backtestError={backtestError}
            isBacktestLoading={isBacktestLoading}
            onToolChange={handleToolChange}
            onReadyToolChange={handleReadyToolChange}
            onDrawingColorChange={handleDrawingColorChange}
            onDrawingWidthChange={handleDrawingWidthChange}
            onDrawingLineStyleChange={handleDrawingLineStyleChange}
            onDrawingLabelChange={handleDrawingLabelChange}
            onSaveSelectedToolPreset={handleSaveSelectedToolPreset}
            onApplyToolPreset={handleApplyToolPreset}
            onDeleteToolPreset={handleDeleteToolPreset}
            onClearDrawings={handleClearDrawings}
            onDuplicateSelectedDrawing={handleDuplicateSelectedDrawing}
            onDeleteSelectedDrawing={handleDeleteSelectedDrawing}
            allDrawingsLocked={allDrawingsLocked}
            onToggleLockAllDrawings={handleToggleLockAllDrawings}
            hiddenLayers={hiddenLayers}
            onToggleVisibility={handleToggleVisibility}
            onStartBacktestSession={handleStartBacktestSession}
            onEndBacktestSession={handleEndBacktestSession}
            onOpenBacktestPosition={handleOpenBacktestPosition}
            onCloseBacktestPosition={handleCloseBacktestPosition}
            onCancelBacktestPosition={handleCancelBacktestPosition}
            orderLineDraftPatch={orderLineDraftPatch}
            orderEntryRequest={chartOrderRequest}
            orderDraftClearRequest={orderDraftClearRequest}
            onBacktestOrderDraftChange={setBacktestOrderDraft}
            chartTheme={chartTheme}
            overlayWidth={overlaySize.width}
          />
        </div>
      </div>

      {!isFullscreen && (
        <PositionsPanel
          backtestAccount={backtestAccount}
          symbol={symbol}
          executionPrice={executionPrice}
          chartTheme={chartTheme}
          onClosePosition={handleCloseBacktestPosition}
          onCancelOrder={handleCancelBacktestPosition}
          onUpdatePositionRisk={handleUpdatePositionRiskLevels}
        />
      )}
    </div>
    </>
  );
}

import React, { useEffect, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ArrowUpRight, Bookmark, Flag, FileText, MapPin, MessageCircle, Quote, Save, Signpost, StickyNote, Tag, X } from 'lucide-react';
import getAppLogo from '../../SystemSettings/ApplicationLogo';
import { CHART_HEIGHT, DRAWING_COLOR, DRAWING_FILL, TIMEFRAME_SECONDS } from './constants';
import {
  colorToRgba,
  CYCLE_TOOL_TYPES,
  isHorizontalRayDrawing,
  isLineLikeDrawing,
  isPathDrawing,
  isPositionDrawing,
  MULTI_POINT_PATTERN_LABELS,
  normalizeVisibleRect,
} from './utils';

function formatSignedNumber(value, digits = 2) {
  const sign = value > 0 ? '+' : '';
  return `${sign}${Number(value).toFixed(digits)}`;
}

function formatPriceLabel(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '---';

  return number.toLocaleString(undefined, {
    minimumFractionDigits: number >= 100 ? 2 : 4,
    maximumFractionDigits: number >= 100 ? 2 : 6,
  });
}

function ChartCandleCountdown({ timeframe, priceCoordinate, overlayHeight, chartTheme }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const candleSeconds = TIMEFRAME_SECONDS[timeframe] ?? 60;
  const remaining = Math.max(0, candleSeconds - (Math.floor(now / 1000) % candleSeconds));
  const label = [
    Math.floor(remaining / 3600),
    Math.floor((remaining % 3600) / 60),
    remaining % 60,
  ].map((value) => String(value).padStart(2, '0')).join(':');
  const top = Number.isFinite(Number(priceCoordinate))
    ? Math.min(Math.max(Number(priceCoordinate) + 14, 4), Math.max(Number(overlayHeight) - 26, 4))
    : null;

  if (top == null) return null;

  return (
    <div
      className="pointer-events-none absolute right-0 z-10 min-w-[72px] rounded-sm border px-1.5 py-1 text-center text-[10px] font-semibold leading-none tabular-nums shadow"
      style={{
        top,
        backgroundColor: chartTheme?.panel ?? '#131722',
        borderColor: chartTheme?.border ?? '#2a2e39',
        color: chartTheme?.text ?? '#b2b5be',
      }}
    >
      <span className="mr-1 opacity-70">Close</span>{label}
    </div>
  );
}

function formatDuration(seconds) {
  const totalSeconds = Math.max(Math.round(Math.abs(seconds)), 0);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${minutes}m`;
  if (minutes) return `${minutes}m`;
  return `${totalSeconds}s`;
}

const FIB_RETRACEMENT_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
const BOX_TOOL_TYPES = ['rect', 'circle', 'price-range', 'date-range', 'price-date-range'];
const SHAPE_TOOL_TYPES = ['triangle', 'arc', 'curve', 'double-curve'];
const THREE_POINT_TYPES = ['fib-extension', 'parallel-channel', 'triangle', 'curve', 'double-curve'];
const TEXT_MARKER_TYPES = [
  'text', 'anchored-text', 'note', 'anchored-note', 'callout', 'comment', 'price-label', 'price-note', 'signpost', 'flag-mark',
  'arrow-marker', 'arrow-mark-up', 'arrow-mark-down', 'arrow-mark-left', 'arrow-mark-right',
];
const PRICE_ANCHORED_MARKER_TYPES = ['price-label', 'price-note'];
const TEXT_MARKER_ICONS = {
  'anchored-text': MapPin,
  note: StickyNote,
  'anchored-note': FileText,
  callout: Quote,
  comment: MessageCircle,
  'price-label': Tag,
  'price-note': Bookmark,
  signpost: Signpost,
  'flag-mark': Flag,
  'arrow-marker': ArrowUpRight,
  'arrow-mark-up': ArrowUp,
  'arrow-mark-down': ArrowDown,
  'arrow-mark-left': ArrowLeft,
  'arrow-mark-right': ArrowRight,
};
const TEXT_MARKER_LABELS = {
  text: 'Text',
  'anchored-text': 'Anchored Text',
  note: 'Note',
  'anchored-note': 'Anchored Note',
  callout: 'Callout',
  comment: 'Comment',
  'price-label': 'Price Label',
  'price-note': 'Price Note',
  signpost: 'Signpost',
  'flag-mark': 'Flag Mark',
};
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

const FIB_LEVEL_COLORS = {
  0: '#787b86',
  0.236: '#f23645',
  0.382: '#ff9800',
  0.5: '#ffeb3b',
  0.618: '#4caf50',
  0.786: '#089981',
  1: '#2196f3',
  1.272: '#2962ff',
  1.414: '#673ab7',
  1.618: '#9c27b0',
  2: '#e91e63',
  2.272: '#ff5252',
  2.414: '#ff6d00',
  2.618: '#00bcd4',
  3.618: '#ab47bc',
  4.236: '#7e57c2',
};

const FIB_LABEL_WIDTH = 126;
const RIGHT_PRICE_SCALE_SAFE_GAP = 92;

function isFibonacciDrawing(drawing) {
  return ['fib-retracement', 'fib-extension'].includes(drawing?.type);
}

function formatFibLevel(level) {
  return Number.isInteger(level) ? String(level) : Number(level).toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}

function getFibonacciRange(drawing, overlayWidth) {
  const { p1, p2, p3 } = drawing.screen;
  const anchorPoint = drawing.type === 'fib-extension' ? (p3 ?? p2) : p1;
  const points = drawing.type === 'fib-extension' && p3 ? [p1, p2, p3] : [p1, p2];
  const leftX = Math.max(0, Math.min(...points.map((point) => point.x)));
  const rightX = Math.max(...points.map((point) => point.x), overlayWidth);
  const drawingRightX = Math.max(...points.map((point) => point.x));
  const maxLabelX = Math.max(8, overlayWidth - RIGHT_PRICE_SCALE_SAFE_GAP - FIB_LABEL_WIDTH);
  const labelX = Math.min(Math.max(drawingRightX + 8, 8), maxLabelX);

  return {
    anchorPoint,
    leftX,
    rightX,
    labelX,
  };
}

function getFibonacciLevels(drawing, overlayWidth) {
  const levels = drawing.type === 'fib-extension'
    ? FIB_EXTENSION_LEVELS
    : FIB_RETRACEMENT_LEVELS;
  const { p1, p2, p3 } = drawing.screen;
  const anchor = drawing.type === 'fib-extension' ? (drawing.anchor ?? drawing.end) : drawing.start;
  const { anchorPoint, leftX, rightX, labelX } = getFibonacciRange(drawing, overlayWidth);
  const priceDelta = drawing.end.price - drawing.start.price;
  const yDelta = p2.y - p1.y;

  return levels.map((level) => {
    const price = anchor.price + (priceDelta * level);

    return {
      level,
      price,
      y: anchorPoint.y + (yDelta * level),
      x1: leftX,
      x2: rightX,
      labelX,
      color: FIB_LEVEL_COLORS[level] ?? '#ffffff',
      label: `${formatFibLevel(level)}  ${formatPriceLabel(price)}`,
    };
  });
}

function FibLevelBadge({ item, overlayHeight, chartTheme, textWeight = '600', textStyle }) {
  const labelWidth = Math.min(Math.max(item.label.length * 6.2 + 16, 76), FIB_LABEL_WIDTH);
  const x = item.labelX;
  const y = Math.min(Math.max(item.y - 10, 4), Math.max(overlayHeight - 24, 4));
  const isDark = chartTheme?.mode !== 'light';
  const fill = isDark ? 'rgba(21, 22, 23, 0.96)' : 'rgba(255, 255, 255, 0.96)';
  const textFill = isDark ? '#f8fafc' : '#0f172a';

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={labelWidth}
        height={20}
        rx={3}
        fill={fill}
        stroke={item.color}
        strokeWidth="1"
      />
      <text
        x={x + labelWidth - 7}
        y={y + 14}
        textAnchor="end"
        fill={textFill}
        fontSize="11"
        fontWeight={textWeight}
        fontStyle={textStyle}
      >
        {item.label}
      </text>
    </g>
  );
}

function getToolLabel(drawing) {
  const priceDelta = drawing.end.price - drawing.start.price;
  const percentDelta = drawing.start.price
    ? (priceDelta / drawing.start.price) * 100
    : 0;
  const duration = formatDuration(drawing.end.time - drawing.start.time);
  const prefix = drawing.type === 'forecast' ? 'Forecast ' : 'Delta ';

  return `${prefix}${formatSignedNumber(priceDelta)} (${formatSignedNumber(percentDelta)}%) | ${duration}`;
}

function getRangeLabel(drawing) {
  const priceDelta = drawing.end.price - drawing.start.price;
  const percent = drawing.start.price ? (priceDelta / drawing.start.price) * 100 : 0;
  const duration = formatDuration(drawing.end.time - drawing.start.time);
  const bars = Math.max(1, Math.round(Math.abs(drawing.end.time - drawing.start.time) / (TIMEFRAME_SECONDS[drawing.timeframe] ?? 60)));
  if (drawing.type === 'price-range') return `${formatSignedNumber(priceDelta)} (${formatSignedNumber(percent)}%)`;
  if (drawing.type === 'date-range') return `${duration} · ${bars} bars`;
  return `${formatSignedNumber(priceDelta)} (${formatSignedNumber(percent)}%) · ${duration} · ${bars} bars`;
}

function getPositionGeometry(drawing) {
  const { p1, p2, pStop, pCurrent } = drawing.screen;
  const isLong = drawing.type === 'long-position';
  const targetY = p2.y;
  const stopY = pStop.y;
  const left = Math.min(p1.x, p2.x, pStop.x);
  const right = Math.max(p1.x, p2.x, pStop.x);
  const width = Math.max(right - left, 2);
  const entryPrice = drawing.start.price;
  const targetPrice = drawing.end.price;
  const stopPrice = drawing.stop.price;
  const reward = Math.abs(targetPrice - entryPrice);
  const risk = Math.abs(entryPrice - stopPrice);
  const rewardPercent = entryPrice ? (reward / entryPrice) * 100 : 0;
  const riskPercent = entryPrice ? (risk / entryPrice) * 100 : 0;
  const riskReward = reward / Math.max(risk, 0.0000001);
  const currentPrice = Number(drawing.currentPrice ?? entryPrice);
  const openPnl = isLong ? currentPrice - entryPrice : entryPrice - currentPrice;
  const openPnlPercent = entryPrice ? (openPnl / entryPrice) * 100 : 0;

  return {
    isLong,
    left,
    width,
    targetY,
    stopY,
    entryY: p1.y,
    positionRect: normalizeVisibleRect({ x: left, y: Math.min(targetY, stopY) }, { x: right, y: Math.max(targetY, stopY) }),
    profitRect: normalizeVisibleRect({ x: left, y: p1.y }, { x: right, y: targetY }),
    lossRect: normalizeVisibleRect({ x: left, y: p1.y }, { x: right, y: stopY }),
    currentRect: pCurrent
      ? normalizeVisibleRect(p1, pCurrent)
      : null,
    currentIsProfit: pCurrent
      ? (isLong ? pCurrent.y < p1.y : pCurrent.y > p1.y)
      : false,
    targetPoint: { x: p2.x, y: targetY },
    stopPoint: { x: pStop.x, y: stopY },
    riskReward,
    openPnl,
    targetLabel: `Target: ${formatPriceLabel(reward)} (${rewardPercent.toFixed(2)}%) · Price: ${formatPriceLabel(targetPrice)}`,
    openPnlLabel: `Open P&L: ${formatSignedNumber(openPnl)} (${formatSignedNumber(openPnlPercent)}%)`,
    riskRewardLabel: `Risk/Reward Ratio: ${riskReward.toFixed(2)}`,
    stopLabel: `Stop: ${formatPriceLabel(risk)} (${riskPercent.toFixed(2)}%) · Price: ${formatPriceLabel(stopPrice)}`,
    priceLabels: [
      {
        key: 'entry',
        label: `Entry ${formatPriceLabel(entryPrice)}`,
        y: p1.y,
        color: '#5b8cff',
      },
      {
        key: 'tp',
        label: `TP ${formatPriceLabel(targetPrice)}`,
        y: targetY,
        color: '#22c55e',
      },
      {
        key: 'sl',
        label: `SL ${formatPriceLabel(stopPrice)}`,
        y: stopY,
        color: '#ef4444',
      },
    ],
  };
}

function getArrowHeadPoints(start, end, size = 10) {
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const left = {
    x: end.x - size * Math.cos(angle - Math.PI / 6),
    y: end.y - size * Math.sin(angle - Math.PI / 6),
  };
  const right = {
    x: end.x - size * Math.cos(angle + Math.PI / 6),
    y: end.y - size * Math.sin(angle + Math.PI / 6),
  };

  return `${end.x},${end.y} ${left.x},${left.y} ${right.x},${right.y}`;
}

function getLineLabelPosition(drawing) {
  const { p1, p2 } = drawing.screen;
  const visibleEnd = drawing.screen.rayEnd ?? p2;
  const horizontal = drawing.labelHorizontal ?? 'center';
  const vertical = drawing.labelVertical ?? 'top';
  const leftPoint = p1.x <= visibleEnd.x ? p1 : visibleEnd;
  const rightPoint = p1.x <= visibleEnd.x ? visibleEnd : p1;
  const anchor =
    horizontal === 'left'
      ? leftPoint
      : horizontal === 'right'
        ? rightPoint
        : {
            x: (p1.x + visibleEnd.x) / 2,
            y: (p1.y + visibleEnd.y) / 2,
          };
  const yOffset =
    vertical === 'top'
      ? -10
      : vertical === 'bottom'
        ? 18
        : 4;
  const textAnchor =
    horizontal === 'left'
      ? 'start'
      : horizontal === 'right'
        ? 'end'
        : 'middle';

  return {
    x: anchor.x,
    y: anchor.y + yOffset,
    textAnchor,
  };
}

function getLineLabelGapSegments(start, end, labelText, drawing) {
  if (
    !labelText ||
    (drawing.labelHorizontal ?? 'center') !== 'center' ||
    (drawing.labelVertical ?? 'top') !== 'middle'
  ) {
    return null;
  }

  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (!Number.isFinite(length) || length < 12) return null;

  const textWidth = Math.min(Math.max(labelText.length * 6 + 10, 24), 160);
  const halfGap = Math.min(textWidth / 2, Math.max(length / 2 - 3, 0));
  if (halfGap <= 0) return null;

  const unitX = dx / length;
  const unitY = dy / length;
  const center = {
    x: (start.x + end.x) / 2,
    y: (start.y + end.y) / 2,
  };

  return [
    {
      x1: start.x,
      y1: start.y,
      x2: center.x - unitX * halfGap,
      y2: center.y - unitY * halfGap,
    },
    {
      x1: center.x + unitX * halfGap,
      y1: center.y + unitY * halfGap,
      x2: end.x,
      y2: end.y,
    },
  ];
}

function buildPathData(points) {
  if (!Array.isArray(points) || !points.length) return '';

  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ');
}

function getPathLabelPosition(drawing) {
  const points = drawing.screen?.points ?? [];
  if (!points.length) return null;

  const horizontal = drawing.labelHorizontal ?? 'center';
  const vertical = drawing.labelVertical ?? 'top';
  const index =
    horizontal === 'left'
      ? 0
      : horizontal === 'right'
        ? points.length - 1
        : Math.floor((points.length - 1) / 2);
  const anchor = points[index];
  const yOffset =
    vertical === 'top'
      ? -10
      : vertical === 'bottom'
        ? 18
        : 4;
  const textAnchor =
    horizontal === 'left'
      ? 'start'
      : horizontal === 'right'
        ? 'end'
        : 'middle';

  return {
    x: anchor.x,
    y: anchor.y + yOffset,
    textAnchor,
  };
}

function getDrawingTextWeight(drawing) {
  return drawing?.textBold ? '800' : '600';
}

function getDrawingTextStyle(drawing) {
  return drawing?.textItalic ? 'italic' : undefined;
}

function getBoxLabelPosition(rect, drawing) {
  const horizontal = drawing.labelHorizontal ?? 'center';
  const vertical = drawing.labelVertical ?? 'top';
  const x =
    horizontal === 'left'
      ? rect.left + 8
      : horizontal === 'right'
        ? rect.left + rect.width - 8
        : rect.left + rect.width / 2;
  const y =
    vertical === 'top'
      ? rect.top + 16
      : vertical === 'bottom'
        ? rect.top + rect.height - 8
        : rect.top + rect.height / 2 + 4;
  const textAnchor =
    horizontal === 'left'
      ? 'start'
      : horizontal === 'right'
        ? 'end'
        : 'middle';

  return { x, y, textAnchor };
}

function PositionPriceBadge({ item, overlayWidth, overlayHeight, textWeight = '700', textStyle }) {
  const priceScaleWidth = Math.min(88, Math.max(64, overlayWidth * 0.18));
  const labelWidth = Math.min(Math.max(item.label.length * 5.4 + 12, 62), priceScaleWidth - 4);
  const x = Math.max(overlayWidth - labelWidth - 2, 0);
  const y = Math.min(Math.max(item.y - 11, 8), Math.max(overlayHeight - 30, 8));

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={labelWidth}
        height={22}
        rx={2}
        fill="rgba(21, 22, 23, 0.96)"
        stroke={item.color}
        strokeWidth="1"
      />
      <text
        x={x + labelWidth / 2}
        y={y + 15}
        textAnchor="middle"
        fill={item.color}
        fontSize="9"
        fontWeight={textWeight}
        fontStyle={textStyle}
      >
        {item.label}
      </text>
    </g>
  );
}

function PositionInfoBadge({ x, y, lines, color, maxWidth = 300, centered = false, wrap = true }) {
  const items = (Array.isArray(lines) ? lines : [lines]).flatMap((line) => (
    String(line).split(' · ').map((part) => part.trim()).filter(Boolean)
  ));
  const displayItems = wrap ? items : [Array.isArray(lines) ? lines.join(' ') : String(lines)];
  const longest = Math.max(...displayItems.map((line) => String(line).length), 1);
  const width = Math.min(Math.max(longest * 5.8 + 18, 112), Math.max(maxWidth, 112));
  const height = displayItems.length > 1 ? (displayItems.length * 15) + 8 : 24;
  const left = centered ? x - width / 2 : x;

  return (
    <g transform={`translate(${left} ${y})`}>
      <rect width={width} height={height} rx="5" fill={color} />
      {displayItems.map((line, index) => (
        <text
          key={`${line}-${index}`}
          x={width / 2}
          y={displayItems.length > 1 ? 15 + (index * 15) : 16}
          textAnchor="middle"
          fill="#ffffff"
          fontSize="11"
          fontWeight="700"
        >
          {line}
        </text>
      ))}
    </g>
  );
}

function BacktestOrderOverlay({ renderedBacktestOrders = [], overlaySize, chartTheme }) {
  if (!renderedBacktestOrders.length) return null;

  const isDark = chartTheme?.mode !== 'light';
  const badgeFill = isDark ? 'rgba(21, 22, 23, 0.96)' : 'rgba(255, 255, 255, 0.96)';
  const textFill = isDark ? '#f8fafc' : '#0f172a';
  const priceScaleGap = 96;
  const x2 = overlaySize.width;
  const badgeHeight = 22;

  return (
    <svg
      className="pointer-events-none absolute inset-0 z-[11]"
      width={overlaySize.width}
      height={overlaySize.height}
      style={{ width: '100%', height: `${overlaySize.height}px` }}
    >
      {renderedBacktestOrders.map((item) => {
        const badgeY = Math.min(Math.max(item.y - badgeHeight / 2, 4), Math.max(overlaySize.height - badgeHeight - 2, 4));
        const groupRightEdge = item.canCancel
          ? Math.max(overlaySize.width - priceScaleGap - 34, 8)
          : Math.max(overlaySize.width - priceScaleGap - 8, 8);

        const hasPnl = Boolean(item.pnlText);
        const pnlWidth = hasPnl
          ? Math.min(Math.max(item.pnlText.length * 6.4 + 16, 56), 120)
          : 0;
        const pnlX = hasPnl ? Math.max(groupRightEdge - pnlWidth, 8) : groupRightEdge;
        const pnlTextColor = item.pnlPositive === false ? '#ef4444' : item.pnlPositive === true ? '#22c55e' : textFill;

        const priceGroupRight = hasPnl ? Math.max(pnlX - 4, 8) : groupRightEdge;
        const estimatedTextWidth = item.label.length * 6.4;
        const maxBadgeWidth = Math.max(40, priceGroupRight - 8);
        const badgeWidth = Math.min(Math.max(estimatedTextWidth + 22, 82), maxBadgeWidth);
        const badgeX = Math.max(8, priceGroupRight - badgeWidth);
        const availableTextWidth = Math.max(badgeWidth - 16, 1);
        const shouldCompressText = estimatedTextWidth > availableTextWidth;

        return (
          <g key={item.id}>
            <line
              x1={0}
              y1={item.y}
              x2={x2}
              y2={item.y}
              stroke={item.color}
              strokeWidth={0.5}
              strokeDasharray={item.dashed ? '7,5' : undefined}
              opacity="0.95"
            />
            <rect
              x={badgeX}
              y={badgeY}
              width={badgeWidth}
              height={badgeHeight}
              rx={2}
              fill={item.color}
              stroke={item.color}
              strokeWidth="1"
            />
            <text
              x={badgeX + badgeWidth - 8}
              y={badgeY + badgeHeight / 2 + 4}
              textAnchor="end"
              fill="#ffffff"
              fontSize="11"
              fontWeight="700"
              textLength={shouldCompressText ? availableTextWidth : undefined}
              lengthAdjust={shouldCompressText ? 'spacingAndGlyphs' : undefined}
            >
              {item.label}
            </text>
            {hasPnl && (
              <>
                <rect
                  x={pnlX}
                  y={badgeY}
                  width={pnlWidth}
                  height={badgeHeight}
                  rx={2}
                  fill={badgeFill}
                  stroke={item.color}
                  strokeWidth="1"
                />
                <text
                  x={pnlX + pnlWidth - 8}
                  y={badgeY + badgeHeight / 2 + 4}
                  textAnchor="end"
                  fill={pnlTextColor}
                  fontSize="11"
                  fontWeight="700"
                >
                  {item.pnlText}
                </text>
              </>
            )}
            <rect
              x={Math.max(overlaySize.width - 14, 4)}
              y={item.y - 5}
              width={10}
              height={10}
              rx={2}
              fill={chartTheme?.background ?? '#151617'}
              stroke={item.color}
              strokeWidth={2}
            />
            {item.canCancel && (
              <>
                <rect
                  x={Math.max(overlaySize.width - priceScaleGap - 28, 4)}
                  y={item.y - 8}
                  width={16}
                  height={16}
                  rx={2}
                  fill={chartTheme?.background ?? '#151617'}
                  stroke="#ef4444"
                  strokeWidth={1.5}
                />
                <text
                  x={Math.max(overlaySize.width - priceScaleGap - 20, 12)}
                  y={item.y + 4}
                  textAnchor="middle"
                  fill="#ef4444"
                  fontSize="12"
                  fontWeight="800"
                >
                  x
                </text>
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function DrawingOverlay({ renderedDrawings, selectedDrawingId, hoveredPositionDrawingId, overlaySize, chartTheme }) {
  const selectedDrawing = renderedDrawings.find((d) => d.id === selectedDrawingId);

  const resizeHandles = [];

  if (isLineLikeDrawing(selectedDrawing)) {
    resizeHandles.push(selectedDrawing.screen.p1);

    if (!isHorizontalRayDrawing(selectedDrawing)) {
      resizeHandles.push(selectedDrawing.screen.p2);
    }

    if (THREE_POINT_TYPES.includes(selectedDrawing.type) && selectedDrawing.screen.p3) {
      resizeHandles.push(selectedDrawing.screen.p3);
    }
  }

  if (isPositionDrawing(selectedDrawing)) {
    const geometry = getPositionGeometry(selectedDrawing);
    resizeHandles.push(selectedDrawing.screen.p1, geometry.targetPoint, geometry.stopPoint);
  }

  if (isPathDrawing(selectedDrawing)) {
    resizeHandles.push(...(selectedDrawing.screen.points ?? []));
  }

  if (BOX_TOOL_TYPES.includes(selectedDrawing?.type)) {
    const { p1, p2 } = selectedDrawing.screen;
    const midX = (p1.x + p2.x) / 2;
    const midY = (p1.y + p2.y) / 2;

    resizeHandles.push(
      p1,
      p2,
      { x: p1.x, y: p2.y },
      { x: p2.x, y: p1.y },
      { x: p1.x, y: midY },
      { x: p2.x, y: midY },
      { x: midX, y: p1.y },
      { x: midX, y: p2.y }
    );
  }

  return (
    <div className="pointer-events-none absolute left-0 top-0 z-10 overflow-hidden" style={{ width: '100%', height: overlaySize.height }}>
      <svg
        className="pointer-events-none absolute inset-0"
        width={Math.max(overlaySize.width - 88, 0)}
        height={overlaySize.height}
        style={{ width: 'calc(100% - 88px)', height: '100%' }}
      >
        {renderedDrawings.map((d) => {
          const drawingColor = d.color ?? DRAWING_COLOR;
          const stroke = drawingColor;
          const strokeWidth = d.id.startsWith('temp-')
            ? (d.strokeWidth ?? 1)
            : Math.max(d.strokeWidth ?? 1, 1);
          const textWeight = getDrawingTextWeight(d);
          const textStyle = getDrawingTextStyle(d);
          const textSize = Number(d.textSize) || 12;

          if (isPathDrawing(d)) {
            const pathPoints = [
              ...(d.screen.points ?? []),
              ...(d.screen.previewPoint ? [d.screen.previewPoint] : []),
            ];
            const pathData = buildPathData(pathPoints);
            const labelText = d.showText === false ? '' : d.labelText?.trim();
            const labelPosition = labelText ? getPathLabelPosition(d) : null;
            const pathDashArray = d.id.startsWith('temp-')
              ? '5,5'
              : d.lineStyle === 'dashed'
                ? '8,5'
                : undefined;
            // Brush/Highlighter are freehand ink, not a click-anchored path — hide the
            // per-vertex dots so they read as a stroke, not a connect-the-dots line.
            // Selection still shows drag handles at each point (separate, unconditional
            // resize-handle list in the parent), so editability isn't affected.
            const isFreehandPaint = d.type === 'brush' || d.type === 'highlighter';

            return (
              <g key={d.id}>
                {pathData && (
                  <path
                    d={pathData}
                    fill="none"
                    stroke={stroke}
                    strokeWidth={strokeWidth}
                    strokeOpacity={d.type === 'highlighter' ? 0.35 : 1}
                    strokeDasharray={pathDashArray}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                )}
                {!isFreehandPaint && (d.screen.points ?? []).map((point, index) => (
                  <circle
                    key={`${d.id}-point-${index}`}
                    cx={point.x}
                    cy={point.y}
                    r={3}
                    fill={stroke}
                    stroke={chartTheme?.background ?? '#151617'}
                    strokeWidth={1.5}
                  />
                ))}
                {MULTI_POINT_PATTERN_LABELS[d.type]?.map((vertexLabel, index) => {
                  if (!vertexLabel) return null;
                  const point = d.screen.points?.[index];
                  if (!point) return null;
                  return (
                    <text
                      key={`${d.id}-vertex-label-${index}`}
                      x={point.x}
                      y={point.y - 10}
                      textAnchor="middle"
                      fill="#ffffff"
                      fontSize="11"
                      fontWeight="700"
                      paintOrder="stroke"
                      stroke="rgba(15, 23, 42, 0.95)"
                      strokeWidth="3"
                      strokeLinejoin="round"
                    >
                      {vertexLabel}
                    </text>
                  );
                })}
                {labelText && !d.id.startsWith('temp-') && labelPosition && (
                  <text
                    x={labelPosition.x}
                    y={labelPosition.y}
                    textAnchor={labelPosition.textAnchor}
                    fill="#ffffff"
                    fontSize={textSize}
                    fontWeight={textWeight}
                    fontStyle={textStyle}
                    paintOrder="stroke"
                    stroke="rgba(15, 23, 42, 0.95)"
                    strokeWidth="4"
                    strokeLinejoin="round"
                  >
                    {labelText}
                  </text>
                )}
              </g>
            );
          }

          if (isLineLikeDrawing(d)) {
            const lineStart = d.screen.rayStart ?? d.screen.p1;
            const lineEnd = d.screen.rayEnd ?? d.screen.p2;
            const isUtilityTool = d.type === 'measure' || d.type === 'forecast';
            const isDashedLine = d.lineStyle === 'dashed';
            const labelText = d.showText === false ? '' : d.labelText?.trim();
            const labelPosition = labelText ? getLineLabelPosition(d) : null;
            const lineGapSegments = getLineLabelGapSegments(lineStart, lineEnd, labelText, d);
            const lineDashArray = d.id.startsWith('temp-')
              ? '5,5'
              : d.type === 'forecast'
                ? '8,5'
                : d.type === 'measure'
                  ? '4,4'
                  : isDashedLine
                    ? '8,5'
                    : undefined;
            const midpoint = {
              x: (lineStart.x + lineEnd.x) / 2,
              y: (lineStart.y + lineEnd.y) / 2,
            };

            if (isFibonacciDrawing(d)) {
              const fibLevels = getFibonacciLevels(d, overlaySize.width);

              return (
                <g key={d.id}>
                  <line
                    x1={d.screen.p1.x}
                    y1={d.screen.p1.y}
                    x2={d.screen.p2.x}
                    y2={d.screen.p2.y}
                    stroke={stroke}
                    strokeWidth={Math.max(strokeWidth, 1)}
                    strokeDasharray={d.id.startsWith('temp-') ? '5,5' : '4,4'}
                    opacity="0.8"
                  />
                  {d.type === 'fib-extension' && d.screen.p3 && (
                    <line
                      x1={d.screen.p2.x}
                      y1={d.screen.p2.y}
                      x2={d.screen.p3.x}
                      y2={d.screen.p3.y}
                      stroke={stroke}
                      strokeWidth={Math.max(strokeWidth, 1)}
                      strokeDasharray="4,4"
                      opacity="0.55"
                    />
                  )}
                  {fibLevels.map((item) => (
                    <g key={`${d.id}-${item.level}`}>
                      <line
                        x1={item.x1}
                        y1={item.y}
                        x2={item.x2}
                        y2={item.y}
                        stroke={item.color}
                        strokeWidth={strokeWidth}
                        strokeDasharray={
                          d.id.startsWith('temp-')
                            ? '5,5'
                            : isDashedLine
                              ? '8,5'
                              : undefined
                        }
                        opacity={item.level === 0 || item.level === 1 ? 0.95 : 0.72}
                      />
                      {!d.id.startsWith('temp-') && (
                        <FibLevelBadge
                          item={item}
                          overlayHeight={overlaySize.height}
                          chartTheme={chartTheme}
                          textWeight={textWeight}
                          textStyle={textStyle}
                        />
                      )}
                    </g>
                  ))}
                  {labelText && !d.id.startsWith('temp-') && (
                    <text
                      x={labelPosition.x}
                      y={labelPosition.y}
                      textAnchor={labelPosition.textAnchor}
                      fill="#ffffff"
                      fontSize={textSize}
                      fontWeight={textWeight}
                      fontStyle={textStyle}
                      paintOrder="stroke"
                      stroke="rgba(15, 23, 42, 0.95)"
                      strokeWidth="4"
                      strokeLinejoin="round"
                    >
                      {labelText}
                    </text>
                  )}
                </g>
              );
            }

            if (d.type === 'parallel-channel' && d.screen.p3) {
              const offsetX = d.screen.p3.x - d.screen.p2.x, offsetY = d.screen.p3.y - d.screen.p2.y;
              return <g key={d.id}><polygon points={`${d.screen.p1.x},${d.screen.p1.y} ${d.screen.p2.x},${d.screen.p2.y} ${d.screen.p2.x + offsetX},${d.screen.p2.y + offsetY} ${d.screen.p1.x + offsetX},${d.screen.p1.y + offsetY}`} fill={colorToRgba(stroke, .12)} stroke="none"/><line x1={d.screen.p1.x} y1={d.screen.p1.y} x2={d.screen.p2.x} y2={d.screen.p2.y} stroke={stroke} strokeWidth={strokeWidth}/><line x1={d.screen.p1.x + offsetX} y1={d.screen.p1.y + offsetY} x2={d.screen.p2.x + offsetX} y2={d.screen.p2.y + offsetY} stroke={stroke} strokeWidth={strokeWidth}/></g>;
            }

            if (d.type === 'sine-line') {
              const { p1, p2 } = d.screen;
              const baselineY = (p1.y + p2.y) / 2;
              const amplitude = Math.max(Math.abs(p2.y - p1.y) / 2, 20);
              const span = p2.x - p1.x;
              const steps = 48;
              const sinePoints = Array.from({ length: steps + 1 }, (_, index) => {
                const t = index / steps;
                return {
                  x: p1.x + span * t,
                  y: baselineY - amplitude * Math.sin(t * Math.PI * 2),
                };
              });

              return (
                <g key={d.id}>
                  <path
                    d={buildPathData(sinePoints)}
                    fill="none"
                    stroke={stroke}
                    strokeWidth={strokeWidth}
                    strokeDasharray={d.id.startsWith('temp-') ? '5,5' : (d.lineStyle === 'dashed' ? '8,5' : undefined)}
                    strokeLinecap="round"
                  />
                </g>
              );
            }

            if (d.type === 'cyclic-lines' || d.type === 'time-cycles') {
              const { p1, p2 } = d.screen;
              const period = Math.abs(p2.x - p1.x);
              const isTimeCycles = d.type === 'time-cycles';

              if (period < 2) {
                return (
                  <g key={d.id}>
                    <line x1={p1.x} y1={0} x2={p1.x} y2={overlaySize.height} stroke={stroke} strokeWidth={strokeWidth} strokeDasharray="4,4" />
                  </g>
                );
              }

              const anchorX = Math.min(p1.x, p2.x);
              const firstK = Math.ceil(-anchorX / period);
              const lastK = Math.floor((overlaySize.width - anchorX) / period);
              const maxRepeats = 60;
              const lineXs = [];
              for (let k = firstK; k <= lastK && lineXs.length < maxRepeats; k += 1) {
                lineXs.push(anchorX + (k * period));
              }

              return (
                <g key={d.id}>
                  {lineXs.map((x, index) => {
                    const isAnchor = Math.abs(x - p1.x) < 0.5 || Math.abs(x - p2.x) < 0.5;
                    return (
                      <line
                        key={`${d.id}-cycle-${index}`}
                        x1={x}
                        y1={0}
                        x2={x}
                        y2={overlaySize.height}
                        stroke={stroke}
                        strokeWidth={isAnchor ? Math.max(strokeWidth, 1.5) : Math.max(strokeWidth - 0.5, 1)}
                        strokeDasharray={
                          d.id.startsWith('temp-')
                            ? '5,5'
                            : isTimeCycles
                              ? '2,5'
                              : isAnchor
                                ? (d.lineStyle === 'dashed' ? '8,5' : undefined)
                                : '6,6'
                        }
                        opacity={isAnchor ? 1 : 0.65}
                      />
                    );
                  })}
                </g>
              );
            }

            if (SHAPE_TOOL_TYPES.includes(d.type)) {
              const { p1, p2, p3 } = d.screen;
              const shapeDashArray = d.id.startsWith('temp-') ? '5,5' : (d.lineStyle === 'dashed' ? '8,5' : undefined);

              if (d.type === 'triangle' && p3) {
                return (
                  <polygon
                    key={d.id}
                    points={`${p1.x},${p1.y} ${p2.x},${p2.y} ${p3.x},${p3.y}`}
                    fill={colorToRgba(stroke, d.id.startsWith('temp-') ? 0.08 : 0.16) || DRAWING_FILL}
                    stroke={stroke}
                    strokeWidth={strokeWidth}
                    strokeDasharray={shapeDashArray}
                  />
                );
              }

              if (d.type === 'arc') {
                const radius = Math.max(Math.hypot(p2.x - p1.x, p2.y - p1.y) * 0.75, 1);
                return (
                  <path
                    key={d.id}
                    d={`M ${p1.x} ${p1.y} A ${radius} ${radius} 0 0 1 ${p2.x} ${p2.y}`}
                    fill="none"
                    stroke={stroke}
                    strokeWidth={strokeWidth}
                    strokeDasharray={shapeDashArray}
                  />
                );
              }

              if (d.type === 'curve' && p3) {
                return (
                  <path
                    key={d.id}
                    d={`M ${p1.x} ${p1.y} Q ${p3.x} ${p3.y} ${p2.x} ${p2.y}`}
                    fill="none"
                    stroke={stroke}
                    strokeWidth={strokeWidth}
                    strokeDasharray={shapeDashArray}
                  />
                );
              }

              if (d.type === 'double-curve' && p3) {
                const midX = (p1.x + p2.x) / 2, midY = (p1.y + p2.y) / 2;
                const offX = p3.x - midX, offY = p3.y - midY;
                const c1x = p1.x + (p2.x - p1.x) / 3 + offX, c1y = p1.y + (p2.y - p1.y) / 3 + offY;
                const c2x = p1.x + (2 * (p2.x - p1.x)) / 3 - offX, c2y = p1.y + (2 * (p2.y - p1.y)) / 3 - offY;
                return (
                  <path
                    key={d.id}
                    d={`M ${p1.x} ${p1.y} C ${c1x} ${c1y} ${c2x} ${c2y} ${p2.x} ${p2.y}`}
                    fill="none"
                    stroke={stroke}
                    strokeWidth={strokeWidth}
                    strokeDasharray={shapeDashArray}
                  />
                );
              }
              // triangle/curve/double-curve without p3 yet (mid-creation) fall through to the plain two-point line preview below.
            }

            return (
              <g key={d.id}>
                {lineGapSegments ? (
                  lineGapSegments.map((segment, index) => (
                    <line
                      key={`${d.id}-line-segment-${index}`}
                      x1={segment.x1}
                      y1={segment.y1}
                      x2={segment.x2}
                      y2={segment.y2}
                      stroke={stroke}
                      strokeWidth={strokeWidth}
                      strokeDasharray={lineDashArray}
                    />
                  ))
                ) : (
                  <line
                    x1={lineStart.x}
                    y1={lineStart.y}
                    x2={lineEnd.x}
                    y2={lineEnd.y}
                    stroke={stroke}
                    strokeWidth={strokeWidth}
                    strokeDasharray={lineDashArray}
                  />
                )}
                {(d.type === 'forecast' || d.type === 'arrow' || d.type === 'arrow-line') && (
                  <polygon
                    points={getArrowHeadPoints(d.screen.p1, d.screen.p2)}
                    fill={stroke}
                  />
                )}
                {d.type === 'arrow-line' && (
                  <circle cx={d.screen.p1.x} cy={d.screen.p1.y} r={3} fill={stroke} />
                )}
                {d.type === 'measure' && (
                  <>
                    <circle cx={d.screen.p1.x} cy={d.screen.p1.y} r={4} fill={stroke} />
                    <circle cx={d.screen.p2.x} cy={d.screen.p2.y} r={4} fill={stroke} />
                    {!d.id.startsWith('temp-') && d.end.price !== d.start.price && (
                      <polygon
                        points={getArrowHeadPoints(d.screen.p1, d.screen.p2, 8)}
                        fill={d.end.price > d.start.price ? '#22c55e' : '#ef4444'}
                      />
                    )}
                  </>
                )}
                {isUtilityTool && !d.id.startsWith('temp-') && (
                  <text
                    x={midpoint.x + 8}
                    y={midpoint.y - 10}
                    fill="#ffffff"
                    fontSize="12"
                    fontWeight={textWeight}
                    fontStyle={textStyle}
                    paintOrder="stroke"
                    stroke="rgba(15, 23, 42, 0.95)"
                    strokeWidth="4"
                    strokeLinejoin="round"
                  >
                    {getToolLabel(d)}
                  </text>
                )}
                {labelText && !d.id.startsWith('temp-') && (
                  <text
                    x={labelPosition.x}
                    y={labelPosition.y}
                    textAnchor={labelPosition.textAnchor}
                    fill="#ffffff"
                    fontSize={textSize}
                    fontWeight={textWeight}
                    fontStyle={textStyle}
                    paintOrder="stroke"
                    stroke="rgba(15, 23, 42, 0.95)"
                    strokeWidth="4"
                    strokeLinejoin="round"
                  >
                    {labelText}
                  </text>
                )}
              </g>
            );
          }

          if (isPositionDrawing(d)) {
            const geometry = getPositionGeometry(d);
            const outline = '#5b8cff';
            const baseProfitFill = chartTheme?.mode === 'light'
              ? 'rgba(34, 197, 94, 0.16)'
              : 'rgba(34, 197, 94, 0.14)';
            const baseLossFill = chartTheme?.mode === 'light'
              ? 'rgba(239, 68, 68, 0.14)'
              : 'rgba(239, 68, 68, 0.13)';
            const currentFill = geometry.currentIsProfit
              ? 'rgba(34, 197, 94, 0.12)'
              : 'rgba(239, 68, 68, 0.11)';
            const targetBadgeY = Math.min(Math.max(geometry.isLong ? geometry.targetY - 42 : geometry.targetY + 4, 2), Math.max(overlaySize.height - 42, 2));
            const stopBadgeY = Math.min(Math.max(geometry.isLong ? geometry.stopY + 4 : geometry.stopY - 42, 2), Math.max(overlaySize.height - 42, 2));
            const entryBadgeY = Math.min(Math.max(geometry.entryY - 19, 2), Math.max(overlaySize.height - 40, 2));
            const openPnlColor = geometry.openPnl > 0 ? '#089981' : geometry.openPnl < 0 ? '#f23645' : '#2962ff';

            return (
              <g key={d.id}>
                <rect
                  x={geometry.profitRect.left}
                  y={geometry.profitRect.top}
                  width={geometry.profitRect.width}
                  height={geometry.profitRect.height}
                  fill={baseProfitFill}
                  stroke="none"
                />
                <rect
                  x={geometry.lossRect.left}
                  y={geometry.lossRect.top}
                  width={geometry.lossRect.width}
                  height={geometry.lossRect.height}
                  fill={baseLossFill}
                  stroke="none"
                />
                {geometry.currentRect && (
                  <rect
                    x={geometry.currentRect.left}
                    y={geometry.currentRect.top}
                    width={geometry.currentRect.width}
                    height={geometry.currentRect.height}
                    fill={currentFill}
                    stroke="none"
                  />
                )}
                <line
                  x1={geometry.left}
                  y1={geometry.entryY}
                  x2={geometry.left + geometry.width}
                  y2={geometry.entryY}
                  stroke={outline}
                  strokeWidth="1"
                />
                {d.screen.pCurrent && (
                  <>
                    <line
                      x1={d.screen.p1.x}
                      y1={d.screen.p1.y}
                      x2={d.screen.pCurrent.x}
                      y2={d.screen.pCurrent.y}
                      stroke="#9ca3af"
                      strokeWidth={1}
                      strokeDasharray="6,5"
                      opacity="0.95"
                    />
                    <circle
                      cx={d.screen.pCurrent.x}
                      cy={d.screen.pCurrent.y}
                      r={3}
                      fill="#9ca3af"
                      stroke={chartTheme?.background ?? '#151617'}
                      strokeWidth={2}
                    />
                  </>
                )}
                {!d.id.startsWith('temp-') && (d.id === selectedDrawingId || d.id === hoveredPositionDrawingId) && (
                  <>
                    <PositionInfoBadge
                      x={geometry.left + (geometry.width / 2)}
                      y={targetBadgeY}
                      lines={geometry.targetLabel}
                      color="#089981"
                      maxWidth={Math.max(geometry.width, 360)}
                      centered
                      wrap={false}
                    />
                    <PositionInfoBadge
                      x={geometry.left + (geometry.width / 2)}
                      y={stopBadgeY}
                      lines={geometry.stopLabel}
                      color="#f23645"
                      maxWidth={Math.max(geometry.width, 360)}
                      centered
                      wrap={false}
                    />
                    <PositionInfoBadge
                      x={geometry.left + (geometry.width / 2)}
                      y={entryBadgeY}
                      lines={[geometry.openPnlLabel, geometry.riskRewardLabel]}
                      color={openPnlColor}
                      maxWidth={Math.max(geometry.width * 0.8, 176)}
                      centered
                    />
                    <g opacity="0" aria-hidden="true" transform={`translate(${geometry.left + 6} ${geometry.entryY - 10})`}>
                      <rect width={geometry.isLong ? 132 : 138} height="20" rx="3" fill={geometry.isLong ? '#16a34a' : '#dc2626'} />
                      <text x="7" y="14" fill="#ffffff" fontSize="10" fontWeight="800">
                        {geometry.directionLabel} · {geometry.entryLabel}
                      </text>
                    </g>
                    <text opacity="0" aria-hidden="true"
                      x={geometry.left + geometry.width - 6}
                      y={geometry.entryY - 6}
                      textAnchor="end"
                      fill="#cbd5e1"
                      fontSize="9"
                      fontWeight="700"
                    >
                      {geometry.durationLabel}
                    </text>
                  </>
                )}
              </g>
            );
          }

          if (['rect', 'circle', 'price-range', 'date-range', 'price-date-range'].includes(d.type)) {
            const rect = normalizeVisibleRect(d.screen.p1, d.screen.p2);
            const labelText = d.showText === false ? '' : d.labelText?.trim();
            const labelPosition = labelText ? getBoxLabelPosition(rect, d) : null;
            const rectDashArray = d.id.startsWith('temp-')
              ? '5,5'
              : d.lineStyle === 'dashed'
                ? '8,5'
                : undefined;
            const shapeFill = d.id.startsWith('temp-')
              ? colorToRgba(stroke, 0.08)
              : colorToRgba(stroke, 0.16) || DRAWING_FILL;

            return (
              <g key={d.id}>
                {d.type === 'circle' ? (
                  <ellipse
                    cx={rect.left + rect.width / 2}
                    cy={rect.top + rect.height / 2}
                    rx={rect.width / 2}
                    ry={rect.height / 2}
                    fill={shapeFill}
                    stroke={stroke}
                    strokeWidth={strokeWidth}
                    strokeDasharray={rectDashArray}
                  />
                ) : (
                  <rect
                    x={rect.left}
                    y={rect.top}
                    width={rect.width}
                    height={rect.height}
                    fill={shapeFill}
                    stroke={stroke}
                    strokeWidth={strokeWidth}
                    strokeDasharray={rectDashArray}
                  />
                )}
                {['date-range', 'price-date-range'].includes(d.type) && !d.id.startsWith('temp-') && d.end.time !== d.start.time && (() => {
                  const isForward = d.end.time > d.start.time;
                  const arrowColor = d.end.price >= d.start.price ? '#22c55e' : '#ef4444';
                  const centerY = rect.top + rect.height / 2;
                  const left = { x: rect.left, y: centerY };
                  const right = { x: rect.left + rect.width, y: centerY };
                  const shaftStart = isForward ? left : right;
                  const shaftEnd = isForward ? right : left;
                  return (
                    <g>
                      <line x1={shaftStart.x} y1={shaftStart.y} x2={shaftEnd.x} y2={shaftEnd.y} stroke={arrowColor} strokeWidth="2" />
                      <polygon points={getArrowHeadPoints(shaftStart, shaftEnd, 8)} fill={arrowColor} />
                    </g>
                  );
                })()}
                {['price-range', 'price-date-range'].includes(d.type) && !d.id.startsWith('temp-') && d.end.price !== d.start.price && (() => {
                  const isUp = d.end.price > d.start.price;
                  const arrowColor = isUp ? '#22c55e' : '#ef4444';
                  const centerX = rect.left + rect.width / 2;
                  const top = { x: centerX, y: rect.top };
                  const bottom = { x: centerX, y: rect.top + rect.height };
                  const shaftStart = isUp ? bottom : top;
                  const shaftEnd = isUp ? top : bottom;
                  return (
                    <g>
                      <line x1={shaftStart.x} y1={shaftStart.y} x2={shaftEnd.x} y2={shaftEnd.y} stroke={arrowColor} strokeWidth="2" />
                      <polygon points={getArrowHeadPoints(shaftStart, shaftEnd, 8)} fill={arrowColor} />
                    </g>
                  );
                })()}
                {d.type !== 'rect' && d.type !== 'circle' && !d.id.startsWith('temp-') && <text x={rect.left + 8} y={rect.top + 18} fill="#ffffff" fontSize="12" fontWeight="700" paintOrder="stroke" stroke="rgba(15,23,42,.95)" strokeWidth="4">{getRangeLabel(d)}</text>}
                {labelText && !d.id.startsWith('temp-') && (
                  <text
                    x={labelPosition.x}
                    y={labelPosition.y}
                    textAnchor={labelPosition.textAnchor}
                    fill="#ffffff"
                    fontSize={textSize}
                    fontWeight={textWeight}
                    fontStyle={textStyle}
                    paintOrder="stroke"
                    stroke="rgba(15, 23, 42, 0.95)"
                    strokeWidth="4"
                    strokeLinejoin="round"
                  >
                    {labelText}
                  </text>
                )}
              </g>
            );
          }

          return null;
        })}

        {resizeHandles.map((point, index) => (
          <rect
            key={`resize-${selectedDrawingId}-${index}`}
            x={point.x - 5}
            y={point.y - 5}
            width={10}
            height={10}
            fill={chartTheme?.background ?? '#151617'}
            stroke="#fbbf24"
            strokeWidth={2}
            rx={2}
          />
        ))}
      </svg>

      <svg
        className="pointer-events-none absolute inset-0 z-20"
        width={overlaySize.width}
        height={overlaySize.height}
        style={{ width: '100%', height: '100%' }}
        aria-hidden="true"
      >
        {renderedDrawings
          .filter((drawing) => isPositionDrawing(drawing) && !drawing.id.startsWith('temp-'))
          .flatMap((drawing) => {
            const geometry = getPositionGeometry(drawing);
            return geometry.priceLabels.map((item) => (
              <PositionPriceBadge
                key={`${drawing.id}-${item.key}`}
                item={item}
                overlayWidth={overlaySize.width}
                overlayHeight={overlaySize.height}
                textWeight={drawing.textBold ? '800' : '700'}
                textStyle={getDrawingTextStyle(drawing)}
              />
            ));
          })}
      </svg>

      {renderedDrawings
        .filter((d) => TEXT_MARKER_TYPES.includes(d.type) && d.showText !== false)
        .map((d) => {
          const Icon = TEXT_MARKER_ICONS[d.type];
          const isCallout = d.type === 'callout';
          const markerColor = d.color ?? '#ffffff';

          return (
            <React.Fragment key={d.id}>
              {PRICE_ANCHORED_MARKER_TYPES.includes(d.type) && d.screen.pRight && (
                <svg className="pointer-events-none absolute inset-0" style={{ width: '100%', height: '100%' }}>
                  <line
                    x1={d.screen.p.x}
                    y1={d.screen.p.y}
                    x2={d.screen.pRight.x}
                    y2={d.screen.pRight.y}
                    stroke={markerColor}
                    strokeWidth={1}
                    strokeDasharray="4,4"
                    opacity="0.6"
                  />
                </svg>
              )}
              <div
                className="pointer-events-none absolute z-10"
                style={{
                  left: d.screen.p.x + 8,
                  top: d.screen.p.y - 10,
                  transform: 'translateY(-50%)',
                }}
              >
                <span
                  className={`inline-flex items-center gap-1.5 text-xs font-semibold ${isCallout ? 'rounded-md border px-2 py-1' : ''}`}
                  style={{
                    color: markerColor,
                    fontWeight: d.textBold ? 800 : 600,
                    fontStyle: d.textItalic ? 'italic' : undefined,
                    fontSize: d.textSize ? `${d.textSize}px` : undefined,
                    textShadow: isCallout ? undefined : '0 1px 2px rgba(0, 0, 0, 0.9)',
                    background: isCallout ? 'rgba(15, 23, 42, 0.92)' : undefined,
                    borderColor: isCallout ? markerColor : undefined,
                  }}
                >
                  {d.type === 'signpost' ? (
                    <span
                      className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold"
                      style={{ background: markerColor, color: '#0b0e14' }}
                    >
                      {d.signpostNumber ?? '•'}
                    </span>
                  ) : Icon ? (
                    <Icon size={13} className="shrink-0" />
                  ) : null}
                  {d.text}
                </span>
              </div>
            </React.Fragment>
          );
        })}
    </div>
  );
}

function TextInputPopover({
  textInput,
  textDraft,
  overlaySize,
  onTextDraftChange,
  onSaveText,
  onCancel,
}) {
  if (!textInput) return null;

  return (
    <div
      data-chart-ui="text-input"
      className="absolute z-20 w-56 rounded-lg border border-gray-700 bg-skin-black p-3 shadow-2xl"
      style={{
        left: Math.min(textInput.x + 12, Math.max(overlaySize.width - 240, 12)),
        top: Math.max(textInput.y - 12, 12),
      }}
    >
      <div className="mb-2 text-xs font-medium text-gray-300">{TEXT_MARKER_LABELS[textInput.type] ?? 'Text'} label</div>
      <input
        value={textDraft}
        onChange={(e) => onTextDraftChange(e.target.value)}
        placeholder="Enter note"
        autoFocus
        className="mb-2 w-full rounded border border-gray-700 bg-black-table-color px-3 py-2 text-sm text-white outline-none focus:border-gray-500"
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSaveText();
          if (e.key === 'Escape') onCancel();
        }}
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onSaveText}
          className="inline-flex items-center gap-1.5 rounded bg-skin-black-light px-3 py-2 text-xs font-medium text-white hover:bg-skin-black"
        >
          <Save size={14} />
          Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1.5 rounded bg-black-table-color px-3 py-2 text-xs font-medium text-white hover:bg-skin-black-light"
        >
          <X size={14} />
          Cancel
        </button>
      </div>
    </div>
  );
}

function ChartBrandLogo({ chartTheme }) {
  const [appLogo, setAppLogo] = useState('');
  useEffect(() => {
    let cancelled = false;

    getAppLogo().then((logo) => {
      if (!cancelled) {
        setAppLogo(logo);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!appLogo) return null;

  return (
    <div
      className="pointer-events-none absolute bottom-10 left-[3px] z-10 flex h-7 w-12 items-center justify-center opacity-75"
      aria-hidden="true"
    >
      <img
        src={appLogo}
        alt=""
        className="max-h-6 max-w-10 object-contain"
        draggable="false"
      />
    </div>
  );
}

export default function ChartStage({
  wrapperRef,
  containerRef,
  isFullscreen,
  timeframe,
  replayMode,
  currentPriceCoordinate,
  isSpacePressed,
  isReplayPricePickActive,
  isHoveringBacktestOrderCancel,
  tool,
  chartTheme,
  overlaySize,
  mainPaneHeight,
  renderedDrawings,
  renderedBacktestOrders,
  renderedTradeMarkers,
  swingPointMarkers,
  selectedDrawingId,
  hoveredPositionDrawingId,
  textInput,
  textDraft,
  onTextDraftChange,
  onSaveText,
  onCancelText,
  onToggleFullscreen,
}) {
  const [replayPickPreviewX, setReplayPickPreviewX] = useState(null);
  const [isChartDragging, setIsChartDragging] = useState(false);
  const mainOverlaySize = {
    ...overlaySize,
    height: Math.max(0, Math.min(Number(mainPaneHeight) || overlaySize.height, overlaySize.height)),
  };

  useEffect(() => {
    if (!isReplayPricePickActive) {
      setReplayPickPreviewX(null);
    }
  }, [isReplayPricePickActive]);

  useEffect(() => {
    const stopDragging = () => setIsChartDragging(false);
    window.addEventListener('mouseup', stopDragging);
    window.addEventListener('blur', stopDragging);
    return () => {
      window.removeEventListener('mouseup', stopDragging);
      window.removeEventListener('blur', stopDragging);
    };
  }, []);

  const handleReplayPickPreviewMove = (event) => {
    if (!isReplayPricePickActive) return;

    const bounds = event.currentTarget.getBoundingClientRect();
    setReplayPickPreviewX(Math.min(Math.max(event.clientX - bounds.left, 0), bounds.width));
  };

  return (
    <div
      ref={wrapperRef}
      onMouseDown={(event) => {
        if (event.button !== 0 || event.target?.closest?.('button, input, textarea, select, [data-chart-ui]')) return;
        setIsChartDragging(true);
      }}
      onMouseMove={handleReplayPickPreviewMove}
      onMouseLeave={() => setReplayPickPreviewX(null)}
      className={`relative min-h-0 overflow-hidden rounded-lg ${
        isFullscreen ? 'flex-1' : ''
      }`}
      style={{
        backgroundColor: chartTheme?.background ?? '#151617',
        height: isFullscreen ? '100%' : `min(${CHART_HEIGHT}px, max(420px, calc(100dvh - 220px)))`,
        cursor: isChartDragging
          ? 'grabbing'
          : isSpacePressed
            ? 'grab'
          : isHoveringBacktestOrderCancel
            ? 'pointer'
          : tool || isReplayPricePickActive
            ? 'crosshair'
            : 'default',
      }}
    >
      <div ref={containerRef} className="absolute inset-0 z-0" />

      {isReplayPricePickActive && replayPickPreviewX != null && (
        <div className="pointer-events-none absolute left-0 top-0 z-[9] overflow-hidden" style={{ width: '100%', height: mainOverlaySize.height }}>
          <div
            className="absolute bottom-0 top-0 border-l-2 border-dashed border-blue-400"
            style={{ left: replayPickPreviewX }}
          />
          <div
            className="absolute bottom-0 right-0 top-0 bg-[#131722]/75"
            style={{ left: replayPickPreviewX + 2 }}
          />
          <div
            className="absolute top-3 -translate-x-1/2 whitespace-nowrap rounded bg-[#2962ff] px-2 py-1 text-[11px] font-semibold text-white shadow-lg"
            style={{ left: replayPickPreviewX }}
          >
            Select replay start
          </div>
        </div>
      )}

      <ChartBrandLogo chartTheme={chartTheme} />

      {!replayMode && (
        <ChartCandleCountdown
          timeframe={timeframe}
          priceCoordinate={currentPriceCoordinate}
          overlayHeight={mainOverlaySize.height}
          chartTheme={chartTheme}
        />
      )}

      <DrawingOverlay
        renderedDrawings={renderedDrawings}
        selectedDrawingId={selectedDrawingId}
        hoveredPositionDrawingId={hoveredPositionDrawingId}
        overlaySize={mainOverlaySize}
        chartTheme={chartTheme}
      />

      <BacktestOrderOverlay
        renderedBacktestOrders={renderedBacktestOrders}
        overlaySize={mainOverlaySize}
        chartTheme={chartTheme}
      />

      <svg className="pointer-events-none absolute inset-0 z-[12]" width={overlaySize.width} height={mainOverlaySize.height} aria-hidden="true">
        {(renderedTradeMarkers ?? []).map((marker) => (
          <g key={marker.id} transform={`translate(${marker.x - 7} ${marker.y - 7})`}>
            <rect width="14" height="14" rx="2.5" fill={marker.color} />
            <text x="7" y="10" textAnchor="middle" fill="#ffffff" fontSize="8" fontWeight="800">{marker.label}</text>
          </g>
        ))}
        {(swingPointMarkers ?? []).map((marker) => (
          <circle key={marker.id} cx={marker.x} cy={marker.y} r="4" fill="none" stroke="#2962ff" strokeWidth="1.5" />
        ))}
      </svg>

      <TextInputPopover
        textInput={textInput}
        textDraft={textDraft}
        overlaySize={mainOverlaySize}
        onTextDraftChange={onTextDraftChange}
        onSaveText={onSaveText}
        onCancel={onCancelText}
      />
    </div>
  );
}

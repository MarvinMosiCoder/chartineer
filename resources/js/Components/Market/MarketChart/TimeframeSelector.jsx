import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Star } from 'lucide-react';
import { useAnchoredTooltip, AnchoredTooltipPortal } from '../../Tooltip/AnchoredTooltip';

const GRID_WIDTH = 280;

// The grid pops up from a chevron that can sit inside a narrow, `overflow-y-auto`
// mobile toolbar (FullscreenChartHeader's compact menu) — a plain `absolute` panel
// gets clipped by that ancestor's scroll box instead of floating over the chart.
// Portaling to document.body and positioning from the trigger's own
// getBoundingClientRect (same escape-the-clipping-ancestor pattern as
// Components/Tooltip/AnchoredTooltip.jsx's AnchoredTooltipPortal, used below)
// keeps it fully visible and viewport-clamped regardless of that ancestor.
function useAnchoredGridPosition() {
  const anchorRef = useRef(null);
  const [pos, setPos] = useState(null);
  const open = () => {
    const rect = anchorRef.current?.getBoundingClientRect();
    if (!rect) return;
    const left = Math.min(Math.max(8, rect.right - GRID_WIDTH), window.innerWidth - GRID_WIDTH - 8);
    setPos({ top: rect.bottom + 8, left });
  };
  return { anchorRef, pos, open, close: () => setPos(null) };
}

// A grid cell needs its own useAnchoredTooltip() instance, so it must be a
// real component rather than inline JSX inside the .map() below — hooks
// can't be called per-iteration inside a loop callback.
function TimeframeGridCell({ tf, isActive, isFav, isDark, onSelect, onToggleFavorite }) {
  const { anchorRef, pos, show, hide } = useAnchoredTooltip('bottom');
  return (
    <div
      ref={anchorRef}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        onSelect();
      }}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      className={`relative flex h-10 cursor-pointer items-center justify-center rounded text-xs font-semibold outline-none ${
        isActive
          ? 'bg-[#2962ff] text-white'
          : isDark ? 'bg-white/5 text-gray-200 hover:bg-white/10' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
      }`}
    >
      {tf.value}
      <button
        type="button"
        onClick={(event) => { event.stopPropagation(); onToggleFavorite(); }}
        className={`absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full ${
          isFav ? 'text-amber-400' : isActive ? 'text-white/60 hover:text-amber-300' : isDark ? 'text-gray-600 hover:text-amber-400' : 'text-slate-300 hover:text-amber-500'
        }`}
        aria-label={isFav ? `Remove ${tf.label} from favorites` : `Add ${tf.label} to favorites`}
      >
        <Star size={11} fill={isFav ? 'currentColor' : 'none'} />
      </button>
      {/* z-[10022]: this cell lives inside the "Select period" panel, itself
          portaled at z-[10021] — the shared default z-[9999] would paint
          the tooltip underneath that panel instead of above it. */}
      <AnchoredTooltipPortal pos={pos} label={tf.label} isDark={isDark} zIndexClass="z-[10022]" />
    </div>
  );
}

// Own useAnchoredTooltip() instance per pill (can't call the hook directly in
// the .map() callback below), and manual wiring rather than IconTooltipButton:
// that wrapper duplicates the full className — including `px-2` — onto both
// its <span> and the <button>, doubling the horizontal padding on every pill
// and visibly widening the row (same root cause as IconTooltipButton doubling
// visible border/background elsewhere, e.g. FullscreenChartHeader.jsx's
// Watchlists/Enter Position buttons; see docs/developer/trading-chart.md).
function TimeframePill({ tf, isActive, isDark, onSelect }) {
  const { anchorRef, pos, show, hide } = useAnchoredTooltip('bottom');
  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        onClick={onSelect}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        className={`flex h-7 shrink-0 items-center justify-center rounded px-2 text-xs font-semibold transition-colors ${
          isActive
            ? 'text-emerald-500'
            : isDark ? 'text-gray-300 hover:bg-white/10 hover:text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
        }`}
      >
        {tf.value}
      </button>
      <AnchoredTooltipPortal pos={pos} label={tf.label} isDark={isDark} />
    </>
  );
}

export const MAX_TIMEFRAME_FAVORITES = 10;
export const DEFAULT_TIMEFRAME_FAVORITES = ['1m', '5m', '15m', '30m', '1h', '4h'];

/**
 * Quick-access favorite pills (e.g. "1m 5m 15m 30m 1h 4h") plus a chevron that opens a
 * "Select period" grid of every timeframe this exchange actually supports, each with a
 * star to add/remove it from the pill row. Replaces the plain native <select> the header
 * used before. Deliberately limited to this app's real, exchange-native intervals — no
 * custom/arbitrary periods (e.g. "27m"), since those would need candle resampling this
 * app doesn't implement, not just a UI change.
 */
export default function TimeframeSelector({ timeframe, timeframeOptions, favorites, onTimeframeChange, onFavoritesChange, chartTheme }) {
  const [isOpen, setIsOpen] = useState(false);
  const grid = useAnchoredGridPosition();
  // Reuses grid.anchorRef (see useAnchoredGridPosition above) rather than a
  // second ref on the same chevron button — see useAnchoredTooltip's
  // externalAnchorRef param.
  const chevronTooltip = useAnchoredTooltip('bottom', grid.anchorRef);
  const isDark = chartTheme?.mode === 'dark';

  const toggleOpen = () => {
    setIsOpen((value) => {
      const next = !value;
      if (next) grid.open(); else grid.close();
      return next;
    });
  };

  const favoriteSet = new Set(favorites);
  const pillTimeframes = timeframeOptions.filter((tf) => favoriteSet.has(tf.value));
  const isCurrentSupported = timeframeOptions.some((tf) => tf.value === timeframe);
  const isCurrentFavorited = pillTimeframes.some((tf) => tf.value === timeframe);
  // The active timeframe always stays visible in the row even if it isn't starred —
  // otherwise switching to a non-favorite via the grid would look like nothing is selected.
  const displayedTimeframes = !isCurrentSupported || isCurrentFavorited
    ? pillTimeframes
    : [...pillTimeframes, timeframeOptions.find((tf) => tf.value === timeframe)].filter(Boolean);

  const toggleFavorite = (value) => {
    if (favoriteSet.has(value)) {
      onFavoritesChange(favorites.filter((item) => item !== value));
      return;
    }
    if (favorites.length >= MAX_TIMEFRAME_FAVORITES) return;
    onFavoritesChange([...favorites, value]);
  };

  const shellClass = isDark ? 'border-gray-700 bg-black-table-color text-white' : 'border-slate-200 bg-white text-slate-900';
  const mutedClass = isDark ? 'text-gray-400' : 'text-slate-500';

  return (
    <div className="relative flex min-w-0 items-center gap-0.5">
      <div className="flex min-w-0 items-center gap-0.5 overflow-x-auto scrollbar-none">
        {displayedTimeframes.map((tf) => (
          <TimeframePill
            key={tf.value}
            tf={tf}
            isActive={tf.value === timeframe}
            isDark={isDark}
            onSelect={() => onTimeframeChange(tf.value)}
          />
        ))}
      </div>
      <span className="relative inline-flex shrink-0" onMouseEnter={chevronTooltip.show} onMouseLeave={chevronTooltip.hide} onFocus={chevronTooltip.show} onBlur={chevronTooltip.hide}>
        <button
          ref={grid.anchorRef}
          type="button"
          onClick={toggleOpen}
          className={`flex h-7 w-6 shrink-0 items-center justify-center rounded ${isDark ? 'text-gray-400 hover:bg-white/10 hover:text-white' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'}`}
          aria-label="Select period"
          aria-expanded={isOpen}
        >
          <ChevronDown size={14} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>
        <AnchoredTooltipPortal pos={chevronTooltip.pos} label="Select period" isDark={isDark} />
      </span>

      {isOpen && grid.pos && typeof document !== 'undefined' && createPortal(
        <>
          <button type="button" className="fixed inset-0 z-[10020] cursor-default" aria-label="Close period selector" onClick={() => setIsOpen(false)} />
          <div
            className={`fixed z-[10021] w-[280px] rounded-lg border p-3 shadow-2xl ${shellClass}`}
            style={{ top: grid.pos.top, left: grid.pos.left }}
            role="dialog"
            aria-label="Select period"
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold">Select period</span>
              <span className={`text-xs font-semibold ${mutedClass}`}>{favorites.length}/{MAX_TIMEFRAME_FAVORITES}</span>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {timeframeOptions.map((tf) => (
                <TimeframeGridCell
                  key={tf.value}
                  tf={tf}
                  isActive={tf.value === timeframe}
                  isFav={favoriteSet.has(tf.value)}
                  isDark={isDark}
                  onSelect={() => { onTimeframeChange(tf.value); setIsOpen(false); }}
                  onToggleFavorite={() => toggleFavorite(tf.value)}
                />
              ))}
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  );
}

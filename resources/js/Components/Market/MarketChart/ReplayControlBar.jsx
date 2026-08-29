import React, { useEffect, useRef, useState } from 'react';
import {
  Crosshair,
  LoaderCircle,
  LocateFixed,
  Pause,
  Play,
  RotateCcw,
  SkipBack,
  SkipForward,
} from 'lucide-react';

import { AnchoredTooltipPortal, useAnchoredTooltip } from '../../Tooltip/AnchoredTooltip';
import { PLAYBACK_SPEEDS } from './constants';

/**
 * The in-chart Replay transport bar.
 *
 * Replaces the left rail's Replay flyout: entering and leaving Replay is owned
 * by the chart header's own toggle (ChartHeader/FullscreenChartHeader ->
 * onToggleReplayMode), so this surface only ever exists *during* Replay and
 * never has to bootstrap it. That is why there is no "Start Replay" control
 * here and why the component renders nothing unless `replayMode` is true.
 *
 * It lives in its own file rather than in ReplayPanel.jsx on purpose —
 * ReplayPanel is already 3,600 lines covering drawing tools, the tool editor,
 * the drawing-settings dialog and order-entry math, and Replay was only ever a
 * tenant of it. Everything here is driven by props MarketChart.jsx already
 * owned; this component adds no state of its own beyond the speed menu's open
 * flag.
 *
 * Positioned absolutely over the bottom of the canvas rather than taking a row
 * in the layout, so entering or leaving Replay never resizes the chart (a
 * resize would reflow the price scale and can shift the user's viewport).
 */

const DIVIDER_CLASS = 'mx-1 h-5 w-px shrink-0';

function panelStyle(chartTheme) {
  const isDark = chartTheme?.mode !== 'light';

  return {
    backgroundColor: chartTheme?.panel ?? (isDark ? '#242627' : '#ffffff'),
    borderColor: chartTheme?.border ?? (isDark ? '#31363F' : '#e5e7eb'),
  };
}

function buttonClass(chartTheme, { active = false, variant = 'neutral' } = {}) {
  const isDark = chartTheme?.mode !== 'light';
  const base =
    'flex h-7 items-center justify-center gap-1.5 rounded-md px-2 text-[11px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50';

  if (variant === 'primary') {
    return `${base} ${isDark ? 'bg-white text-skin-black hover:bg-gray-200' : 'bg-skin-black text-white hover:bg-skin-black-light'}`;
  }

  if (variant === 'danger') return `${base} bg-red-600 text-white hover:bg-red-500`;
  if (variant === 'success') return `${base} bg-emerald-600 text-white hover:bg-emerald-700`;
  if (variant === 'warning') return `${base} bg-amber-600 text-white hover:bg-amber-700`;

  if (active) {
    return `${base} ${isDark ? 'bg-white text-skin-black hover:bg-gray-200' : 'bg-skin-black text-white hover:bg-skin-black-light'}`;
  }

  return `${base} ${isDark ? 'text-gray-200 hover:bg-skin-black-light hover:text-white' : 'text-slate-700 hover:bg-slate-100'}`;
}

/**
 * A bar button with the app's anchored-portal tooltip.
 *
 * Wired manually (own useAnchoredTooltip instance) rather than via
 * IconTooltipButton, for the reason documented in trading-chart.md: that
 * wrapper applies `className` to both its wrapping <span> and the <button>
 * inside it, so every visible `bg-*`/`rounded-*`/padding class renders twice
 * and shows up as a nested double box. Every button in this bar has a visible
 * background and padding, so it is exactly the case that breaks.
 *
 * Tooltips open upward — the bar is pinned to the bottom of the canvas, so a
 * right- or bottom-placed label would fall outside the chart.
 *
 * Hover/focus handlers sit on the wrapping <span>, not the <button>: Chrome
 * does not dispatch mouseenter/mouseleave to a disabled button, and these
 * controls disable while replay access is being checked — putting them on the
 * button would silently drop the tooltip in exactly that state.
 */
function BarButton({
  icon: Icon,
  label,
  onClick,
  disabled = false,
  active = false,
  variant = 'neutral',
  spin = false,
  chartTheme,
}) {
  const { anchorRef, pos, show, hide } = useAnchoredTooltip('top');
  const isDark = chartTheme?.mode !== 'light';

  return (
    <span
      className="relative flex shrink-0"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      <button
        ref={anchorRef}
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        className={buttonClass(chartTheme, { active, variant })}
      >
        <Icon size={14} className={spin ? 'animate-spin' : undefined} />
      </button>
      <AnchoredTooltipPortal pos={pos} label={label} isDark={isDark} />
    </span>
  );
}

/**
 * Replay-access failure, inline at the end of the bar.
 *
 * Its own component so the tooltip hook is not conditional: ReplayControlBar
 * returns null when Replay is inactive, so a hook added to its body after that
 * early return would change hook count between renders.
 *
 * The message is truncated to keep the bar narrow, with the full text on
 * hover — the same reason the old native `title` was here, now using the
 * app's own tooltip so it is styled and can escape the chart's clipping.
 */
function AccessErrorNotice({ message, onRetry, chartTheme, dividerClass }) {
  const { anchorRef, pos, show, hide } = useAnchoredTooltip('top');
  const isDark = chartTheme?.mode !== 'light';

  return (
    <>
      <span aria-hidden="true" className={dividerClass} />
      <div className="flex items-center gap-1.5 px-1 text-[11px] text-red-400" role="alert">
        <span
          ref={anchorRef}
          className="max-w-[180px] truncate"
          onMouseEnter={show}
          onMouseLeave={hide}
        >
          {message}
        </span>
        <AnchoredTooltipPortal pos={pos} label={message} isDark={isDark} />
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 font-semibold underline hover:no-underline"
        >
          Retry
        </button>
      </div>
    </>
  );
}

function SpeedMenu({ playbackSpeed, onPlaybackSpeedChange, chartTheme, disabled }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);
  const { anchorRef, pos, show, hide } = useAnchoredTooltip('top');
  const isDark = chartTheme?.mode !== 'light';
  const activeSpeed = PLAYBACK_SPEEDS.find((speed) => speed.value === playbackSpeed);

  // Same outside-click pattern as ChartHeader's dropdowns: a guarded document
  // mousedown listener, only registered while the menu is actually open.
  useEffect(() => {
    if (!isOpen) return undefined;

    const handleOutsideClick = (event) => {
      if (containerRef.current?.contains(event.target)) return;
      setIsOpen(false);
    };
    const handleEscape = (event) => {
      if (event.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  return (
    <div
      ref={containerRef}
      className="relative shrink-0"
      onMouseEnter={show}
      onMouseLeave={hide}
    >
      <button
        ref={anchorRef}
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        onFocus={show}
        onBlur={hide}
        disabled={disabled}
        aria-label="Playback speed"
        aria-expanded={isOpen}
        className={buttonClass(chartTheme, { active: isOpen })}
      >
        {activeSpeed?.label ?? '1x'}
        <span aria-hidden="true" className="text-[9px] leading-none opacity-70">▲</span>
      </button>
      {/* Suppressed while the menu is open — the open menu already names the
          control, and a label overlapping it just adds noise. */}
      {!isOpen && <AnchoredTooltipPortal pos={pos} label="Playback speed" isDark={isDark} />}

      {isOpen && (
        // Opens upward — the bar is pinned to the bottom of the canvas, so a
        // downward menu would render outside the chart.
        <div
          className="absolute bottom-full right-0 z-10 mb-1.5 w-24 overflow-hidden rounded-md border py-1 shadow-xl"
          style={panelStyle(chartTheme)}
          role="listbox"
        >
          {PLAYBACK_SPEEDS.map((speed) => {
            const isActive = speed.value === playbackSpeed;

            return (
              <button
                key={speed.value}
                type="button"
                role="option"
                aria-selected={isActive}
                onClick={() => {
                  onPlaybackSpeedChange(speed.value);
                  setIsOpen(false);
                }}
                className={`flex w-full items-center justify-between px-2.5 py-1.5 text-left text-[11px] font-semibold transition-colors ${
                  isActive
                    ? 'text-[#2dd4bf]'
                    : isDark
                      ? 'text-gray-200 hover:bg-white/10'
                      : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                {speed.label}
                {isActive && <span aria-hidden="true">✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function ReplayControlBar({
  replayMode,
  isPlaying,
  replayIndex,
  candleCount,
  playbackSpeed,
  followReplay,
  isReplayPricePickActive,
  replayAccessStatus = 'idle',
  replayAccessError = '',
  onTogglePlay,
  onStepBackward,
  onStepForward,
  onResetReplay,
  onFollowReplay,
  onToggleReplayPricePick,
  onRetryReplayAccess,
  onPlaybackSpeedChange,
  chartTheme,
}) {
  // Entering Replay is the header's job, so there is nothing for this bar to
  // show outside it — including during the "click a candle" price-pick step,
  // where ChartStage already draws its own dashed-line/dimmed-future affordance.
  if (!replayMode) return null;

  const isDark = chartTheme?.mode !== 'light';
  const isCheckingAccess = replayAccessStatus === 'checking-access';
  const dividerClass = `${DIVIDER_CLASS} ${isDark ? 'bg-gray-700' : 'bg-slate-300'}`;
  const position = Math.min(replayIndex + 1, candleCount);

  return (
    <div
      data-chart-ui="replay-control-bar"
      className="pointer-events-none absolute bottom-4 left-1/2 z-[60] flex max-w-[calc(100%-1rem)] -translate-x-1/2 justify-center"
    >
      <div
        className="pointer-events-auto flex items-center gap-0.5 rounded-lg border px-1.5 py-1 shadow-xl backdrop-blur-sm"
        style={panelStyle(chartTheme)}
        role="group"
        aria-label="Replay controls"
      >
        <BarButton
          icon={SkipBack}
          label="Step back"
          onClick={onStepBackward}
          disabled={isCheckingAccess}
          chartTheme={chartTheme}
        />

        <BarButton
          icon={isCheckingAccess ? LoaderCircle : isPlaying ? Pause : Play}
          spin={isCheckingAccess}
          label={isCheckingAccess ? 'Checking replay access…' : isPlaying ? 'Pause' : 'Play'}
          onClick={onTogglePlay}
          disabled={isCheckingAccess}
          variant="primary"
          chartTheme={chartTheme}
        />

        <BarButton
          icon={SkipForward}
          label="Step forward"
          onClick={onStepForward}
          disabled={isCheckingAccess}
          chartTheme={chartTheme}
        />

        <span aria-hidden="true" className={dividerClass} />

        {/* Position readout. Kept as its own flex child so a draggable scrubber
            can replace it later without disturbing the groups either side. */}
        <div
          className={`min-w-0 shrink px-2 text-[11px] font-semibold tabular-nums ${isDark ? 'text-gray-300' : 'text-slate-600'}`}
          aria-live="off"
        >
          <span className="truncate">
            {position.toLocaleString()} / {candleCount.toLocaleString()}
          </span>
        </div>

        <span aria-hidden="true" className={dividerClass} />

        <SpeedMenu
          playbackSpeed={playbackSpeed}
          onPlaybackSpeedChange={onPlaybackSpeedChange}
          chartTheme={chartTheme}
          disabled={isCheckingAccess}
        />

        <span aria-hidden="true" className={dividerClass} />

        <BarButton
          icon={Crosshair}
          label={isReplayPricePickActive ? 'Click a candle to set the price' : 'Set replay price'}
          onClick={onToggleReplayPricePick}
          disabled={isCheckingAccess}
          active={isReplayPricePickActive}
          variant={isReplayPricePickActive ? 'warning' : 'neutral'}
          chartTheme={chartTheme}
        />

        <BarButton
          icon={LocateFixed}
          label={followReplay ? 'Following the replay candle' : 'Follow the replay candle'}
          onClick={onFollowReplay}
          active={followReplay}
          variant={followReplay ? 'success' : 'neutral'}
          chartTheme={chartTheme}
        />

        {/* Jumps to the newest candle and stays in Replay — it is not an exit
            (that is the header's ✕) and not a rewind to the replay start. The
            old rail flyout labelled this "Go Latest" outside Replay for the
            same reason. */}
        <BarButton
          icon={RotateCcw}
          label="Reset to latest candle"
          onClick={onResetReplay}
          variant="danger"
          chartTheme={chartTheme}
        />

        {replayAccessError && (
          <AccessErrorNotice
            message={replayAccessError}
            onRetry={onRetryReplayAccess}
            chartTheme={chartTheme}
            dividerClass={dividerClass}
          />
        )}
      </div>
    </div>
  );
}

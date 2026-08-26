import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// The anchored-portal tooltip: a `createPortal`-into-`document.body` label
// positioned from `getBoundingClientRect()`, replacing the plain native
// `title` attribute and the older relative/absolute `Tooltip.jsx` wrapper.
// Escapes any overflow/z-index clipping ancestor, unlike either of those.
// See "Header command buttons: icon-only with anchored tooltips" in
// docs/developer/trading-chart.md. Previously duplicated independently in
// ChartHeader.jsx, ReplayPanel.jsx, WatchlistPanel.jsx, and TimeframeSelector.jsx.

const PLACEMENT_TRANSFORM = {
  right: '-translate-y-1/2',
  left: '-translate-y-1/2 -translate-x-full',
  bottom: '-translate-x-1/2',
  top: '-translate-x-1/2 -translate-y-full',
};

function positionFor(rect, placement) {
  switch (placement) {
    case 'left':
      return { top: rect.top + rect.height / 2, left: rect.left - 8 };
    case 'bottom':
      return { top: rect.bottom + 8, left: rect.left + rect.width / 2 };
    case 'top':
      return { top: rect.top - 8, left: rect.left + rect.width / 2 };
    case 'right':
    default:
      return { top: rect.top + rect.height / 2, left: rect.right + 8 };
  }
}

// `externalAnchorRef` lets a caller that already owns a ref to the anchor
// element for some other reason (e.g. a click-opened panel positioned off
// the same trigger) reuse it here instead of attaching a second `ref` to
// the same DOM node, which React does not support.
export function useAnchoredTooltip(placement = 'right', externalAnchorRef) {
  const internalRef = useRef(null);
  const anchorRef = externalAnchorRef ?? internalRef;
  const [pos, setPos] = useState(null);
  const show = () => {
    const rect = anchorRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPos({ ...positionFor(rect, placement), placement });
  };
  const hide = () => setPos(null);
  return { anchorRef, pos, show, hide };
}

export function AnchoredTooltipPortal({ pos, label, isDark, zIndexClass = 'z-[9999]' }) {
  if (!pos || !label || typeof document === 'undefined') return null;
  const transformClass = PLACEMENT_TRANSFORM[pos.placement] ?? PLACEMENT_TRANSFORM.right;
  return createPortal(
    <span
      role="tooltip"
      className={`pointer-events-none fixed ${zIndexClass} ${transformClass} whitespace-nowrap rounded-md border px-2 py-1 text-[11px] font-medium shadow-lg ${
        isDark ? 'border-[#363a45] bg-[#1e222d] text-white' : 'border-slate-200 bg-white text-slate-800'
      }`}
      style={{ top: pos.top, left: pos.left }}
    >
      {label}
    </span>,
    document.body
  );
}

// Convenience wrapper for the common "icon-only button + hover label" case.
//
// Hover/focus handlers live on the outer <span>, not the <button> itself:
// Chrome does not dispatch mouseenter/mouseleave to a disabled <button>, so a
// listener on the button would silently never show a tooltip explaining why
// a disabled action is disabled (e.g. PositionsPanel's "Close position").
// React's onMouseEnter/onMouseLeave already scope correctly to whichever
// element they're attached to, so moving them up costs nothing for the
// enabled case.
//
// `className` is applied to both this span and the button below, same as
// ReplayPanel.jsx's ToolEditorButton: callers often pass layout classes meant
// for a `flex`/`grid` parent (`flex-1`, `w-full`, `order-N`) expecting them to
// land on the actual flex/grid item — which, once wrapped here, is this span,
// not the button. Sizing/position classes take effect via the span; the
// button's own visual classes (colors, borders, padding) keep working
// exactly as before since it's still the visible element inside.
export function IconTooltipButton({
  label,
  isDark,
  className,
  wrapperClassName,
  style,
  onClick,
  onMouseDown,
  ariaLabel,
  disabled,
  showTooltipWhenDisabled = true,
  placement = 'right',
  zIndexClass,
  children,
  ...rest
}) {
  const { anchorRef, pos, show, hide } = useAnchoredTooltip(placement);
  const tooltipEnabled = !disabled || showTooltipWhenDisabled;
  return (
    <span
      className={`relative inline-flex shrink-0 ${wrapperClassName ?? className ?? ''}`}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      <button
        ref={anchorRef}
        type="button"
        onClick={onClick}
        onMouseDown={onMouseDown}
        disabled={disabled}
        aria-label={ariaLabel ?? label}
        className={className}
        style={style}
        {...rest}
      >
        {children}
      </button>
      {tooltipEnabled && <AnchoredTooltipPortal pos={pos} label={label} isDark={isDark} zIndexClass={zIndexClass} />}
    </span>
  );
}

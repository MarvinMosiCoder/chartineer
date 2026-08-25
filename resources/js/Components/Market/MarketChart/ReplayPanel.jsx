import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { createPortal } from 'react-dom';
import { usePage } from '@inertiajs/react';
import Select from 'react-select';
import { useAnchoredTooltip, AnchoredTooltipPortal, IconTooltipButton } from '../../Tooltip/AnchoredTooltip';
import {
  Activity,
  ArrowDown,
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  Bold,
  BoxSelect,
  Bookmark,
  Brush,
  ChartSpline,
  ChevronDown,
  ChevronRight,
  ChartNoAxesCombined,
  Circle,
  CircleDashed,
  Compass,
  Copy,
  Crosshair,
  Eye,
  EyeOff,
  Flag,
  FileText,
  Gauge,
  GitCommitHorizontal,
  GitFork,
  GripVertical,
  Highlighter,
  Italic,
  LayoutGrid,
  LocateFixed,
  LoaderCircle,
  Lock,
  MapPin,
  MessageCircle,
  MessageSquare,
  Milestone,
  MoreHorizontal,
  MousePointer2,
  Move,
  MoveHorizontal,
  MoveRight,
  MoveUpRight,
  MoveVertical,
  PaintBucket,
  Palette,
  Pause,
  Pencil,
  Play,
  Quote,
  Radical,
  Repeat,
  Repeat2,
  Route,
  Save,
  RotateCcw,
  Ruler,
  Settings,
  Shapes,
  Share2,
  Shuffle,
  Sigma,
  Signpost,
  SkipBack,
  SkipForward,
  Slash,
  Spline,
  Split,
  StickyNote,
  Tag,
  Trash2,
  TrendingDown,
  TrendingUp,
  Triangle,
  Type,
  Unlock,
  Wallet,
  Waves,
  Waypoints,
  Workflow,
  X,
} from 'lucide-react';
import { DRAWING_COLORS, DRAWING_WIDTHS, PLAYBACK_SPEEDS, TEXT_SIZES } from './constants';
import { subscribeToChange } from '../../../utils/crossTabSync';

const controlBaseClass =
  'inline-flex h-8 min-w-0 items-center justify-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-40';

function controlVariantClass(variant, isActive, chartTheme) {
  const isDark = chartTheme?.mode !== 'light';
  if (variant === 'primary') {
    return isDark
      ? 'bg-white text-skin-black hover:bg-gray-200'
      : 'bg-skin-black text-white hover:bg-skin-black-light';
  }
  if (variant === 'danger') return 'bg-red-600 text-white hover:bg-red-500';
  if (variant === 'success') return 'bg-emerald-600 text-white hover:bg-emerald-700';
  if (variant === 'warning') return 'bg-amber-600 text-white hover:bg-amber-700';

  return isActive
    ? isDark
      ? 'bg-white text-skin-black hover:bg-gray-200'
      : 'bg-skin-black text-white hover:bg-skin-black-light'
    : isDark
      ? 'border border-gray-700 bg-black-table-color text-gray-200 hover:bg-skin-black-light hover:text-white'
      : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-100';
}

function ControlButton({
  icon: Icon,
  children,
  active = false,
  variant = 'neutral',
  className = '',
  chartTheme,
  title,
  ...props
}) {
  return (
    <button
      type="button"
      aria-label={title}
      className={`${controlBaseClass} ${controlVariantClass(variant, active, chartTheme)} ${className}`}
      {...props}
    >
      {Icon && <Icon size={14} className={`shrink-0 ${Icon === LoaderCircle ? 'animate-spin' : ''}`} />}
      <span className="truncate">{children}</span>
    </button>
  );
}

function getPanelStyle(chartTheme) {
  const isDark = chartTheme?.mode === 'dark';
  const panel = chartTheme?.panel ?? (isDark ? '#242627' : '#ffffff');
  const border = chartTheme?.border ?? (isDark ? '#31363F' : '#e5e7eb');

  return {
    backgroundColor: panel,
    borderColor: border,
  };
}

function RailButton({ icon: Icon, active, disabled, title, onClick, chartTheme, dataChartUi }) {
  const isDark = chartTheme?.mode !== 'light';
  const inactiveTextClass = isDark ? 'text-[#b2b5be]' : 'text-slate-500';
  const hoverClass = isDark ? 'hover:bg-white/10 hover:text-white' : 'hover:bg-slate-100 hover:text-slate-900';
  const { anchorRef, pos, show, hide } = useAnchoredTooltip();

  return (
    <span className="relative flex">
      <button
        ref={anchorRef}
        type="button"
        onClick={onClick}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        disabled={disabled}
        data-chart-ui={dataChartUi}
        aria-label={title}
        className={`flex h-9 w-9 items-center justify-center rounded-md transition disabled:cursor-not-allowed disabled:opacity-35 ${
          active
            ? isDark ? 'bg-white/10 text-white' : 'bg-slate-200 text-slate-900'
            : `${inactiveTextClass} ${hoverClass}`
        }`}
      >
        <Icon size={18} />
      </button>
      {!disabled && <AnchoredTooltipPortal pos={pos} label={title} isDark={isDark} />}
    </span>
  );
}

function ToolGroupRailItem({ group, tool, toolSettings, handleToolChange, toggleGroup, chartTheme, isDarkTheme, dataTour }) {
  const readyType = group.tools.includes(toolSettings?.readyTools?.[group.name]) ? toolSettings.readyTools[group.name] : group.tools[0];
  const firstTool = TOOL_BUTTONS.find((item) => item.type === readyType);
  const isGroupActive = group.tools.includes(tool);
  const chevronTooltip = useAnchoredTooltip();

  return (
    <div className="group flex w-12 items-center justify-center" data-tour={dataTour}>
      <div className="relative flex items-center">
        <RailButton icon={firstTool?.icon ?? MousePointer2} active={isGroupActive} title={`${group.name}: ${firstTool?.label}`} onClick={() => handleToolChange(readyType)} chartTheme={chartTheme}/>
        <span className="absolute -right-2 top-0 z-10 flex h-9 w-2 items-center justify-center">
          <button
            ref={chevronTooltip.anchorRef}
            type="button"
            data-chart-ui="tools-flyout"
            onClick={() => toggleGroup(`tools:${group.name}`)}
            onMouseEnter={chevronTooltip.show}
            onMouseLeave={chevronTooltip.hide}
            onFocus={chevronTooltip.show}
            onBlur={chevronTooltip.hide}
            aria-label={`Choose ${group.name} tool`}
            className={`pointer-events-auto flex h-9 w-3 items-center justify-center rounded-sm text-[#787b86] opacity-40 transition-opacity duration-150 hover:opacity-100 group-hover:opacity-100 ${
              isDarkTheme ? 'hover:bg-white/10 hover:text-white' : 'hover:bg-slate-100 hover:text-slate-900'
            }`}
          ><ChevronRight size={9}/></button>
          <AnchoredTooltipPortal pos={chevronTooltip.pos} label={`Choose ${group.name} tool`} isDark={isDarkTheme} />
        </span>
      </div>
    </div>
  );
}

function Flyout({ title, icon: Icon, onClose, children, bodyClassName = 'space-y-3', chartTheme, className = '' }) {
  const isDark = chartTheme?.mode === 'dark';
  const titleClass = isDark ? 'text-gray-300' : 'text-slate-700';
  const closeClass = isDark
    ? 'text-gray-400 hover:bg-skin-black-light hover:text-white'
    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900';

  return (
    <div
      className={`ml-2 w-[min(300px,calc(100vw-5.5rem))] rounded-lg border p-3 shadow-2xl backdrop-blur ${
        isDark ? 'text-white' : 'text-slate-800'
      } ${className}`}
      style={{
        ...getPanelStyle(chartTheme),
        maxWidth: className.includes('max-w-none') ? 'none' : 'var(--replay-panel-content-width, 300px)',
      }}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className={`flex min-w-0 items-center gap-2 text-xs font-semibold uppercase tracking-wide ${titleClass}`}>
          {Icon && <Icon size={15} />}
          <span className="truncate">{title}</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className={`flex h-7 w-7 items-center justify-center rounded-md ${closeClass}`}
          aria-label="Close"
        >
          <X size={15} />
        </button>
      </div>
      <div className={bodyClassName}>{children}</div>
    </div>
  );
}

// Was a native `title` plus an optional, non-portaled CSS group-hover span
// (only ever opted into by the "Templates" button below) — replaced with
// the same anchored-portal tooltip as RailButton/AnchoredTooltipPortal above,
// so every ToolEditorButton gets a real hover label instead of most of them
// silently having none. `hideTooltip` replaces the old inverted
// `showTooltip` prop, still used only by "Templates" to avoid the tooltip
// overlapping its own open presets menu.
function ToolEditorButton({
  icon: Icon,
  title,
  active = false,
  disabled = false,
  onClick,
  children,
  className = '',
  chartTheme,
  hideTooltip = false,
}) {
  const isDark = chartTheme?.mode !== 'light';
  const { anchorRef, pos, show, hide } = useAnchoredTooltip();

  return (
    // `className` is applied to both this span and the button below: several
    // call sites pass Tailwind `order-N` (this row's a `flex` with siblings
    // conditionally rendered out of DOM order) which only takes effect on
    // the element that's actually the flex item in the parent row — now
    // this span, not the button it used to be applied to directly. Classes
    // like `rounded-r-lg` still need to land on the button for its own
    // visible shape, so it stays on both rather than trying to split them.
    <span className={`relative inline-flex shrink-0 ${className}`}>
      <button
        ref={anchorRef}
        type="button"
        onClick={onClick}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        disabled={disabled}
        aria-label={title}
        className={`relative inline-flex h-11 shrink-0 items-center justify-center gap-1.5 px-3 transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${
          active
            ? isDark ? 'bg-[#2a2e39] text-white' : 'bg-slate-200 text-slate-950'
            : isDark ? 'text-[#d1d4dc] hover:bg-white/[0.06] hover:text-white' : 'text-slate-700 hover:bg-slate-100 hover:text-slate-950'
        } ${className}`}
      >
        {Icon && <Icon size={20} strokeWidth={1.65} className="shrink-0" />}
        {children}
      </button>
      {!disabled && !hideTooltip && <AnchoredTooltipPortal pos={pos} label={title} isDark={isDark} />}
    </span>
  );
}

const TOOL_BUTTONS = [
  { type: 'line', label: 'Line', icon: Slash },
  { type: 'ray', label: 'Ray', icon: MoveRight },
  { type: 'arrow', label: 'Arrow', icon: TrendingUp },
  { type: 'horizontal-line', label: 'Horizontal Line', icon: MoveRight },
  { type: 'vertical-line', label: 'Vertical Line', icon: Slash },
  { type: 'parallel-channel', label: 'Parallel Channel', icon: ChartNoAxesCombined },
  { type: 'horizontal-ray', label: 'H Ray', icon: MoveRight },
  { type: 'extended-line', label: 'Extended Line', icon: ArrowLeftRight },
  { type: 'path', label: 'Path', icon: Slash },
  { type: 'fib-retracement', label: 'Fib Retrace', icon: Crosshair },
  { type: 'fib-extension', label: 'Fib Extension', icon: ChartNoAxesCombined },
  { type: 'long-position', label: 'Long', icon: TrendingUp },
  { type: 'short-position', label: 'Short', icon: TrendingDown },
  { type: 'forecast', label: 'Forecast', icon: ChartNoAxesCombined },
  { type: 'measure', label: 'Measure', icon: Ruler },
  { type: 'price-range', label: 'Price Range', icon: MoveVertical },
  { type: 'date-range', label: 'Date Range', icon: MoveHorizontal },
  { type: 'price-date-range', label: 'Price & Date Range', icon: Move },
  { type: 'rect', label: 'Box', icon: BoxSelect },
  { type: 'circle', label: 'Circle', icon: Circle },
  { type: 'triangle', label: 'Triangle', icon: Triangle },
  { type: 'arc', label: 'Arc', icon: CircleDashed },
  { type: 'curve', label: 'Curve', icon: Waves },
  { type: 'double-curve', label: 'Double Curve', icon: Spline },
  { type: 'text', label: 'Text', icon: Type },
  { type: 'anchored-text', label: 'Anchored Text', icon: MapPin },
  { type: 'note', label: 'Note', icon: StickyNote },
  { type: 'anchored-note', label: 'Anchored Note', icon: FileText },
  { type: 'callout', label: 'Callout', icon: Quote },
  { type: 'comment', label: 'Comment', icon: MessageCircle },
  { type: 'price-label', label: 'Price Label', icon: Tag },
  { type: 'price-note', label: 'Price Note', icon: Bookmark },
  { type: 'signpost', label: 'Signpost', icon: Signpost },
  { type: 'flag-mark', label: 'Flag Mark', icon: Flag },
  { type: 'xabcd-pattern', label: 'XABCD Pattern', icon: Waypoints },
  { type: 'cypher-pattern', label: 'Cypher Pattern', icon: Share2 },
  { type: 'head-and-shoulders', label: 'Head and Shoulders', icon: Milestone },
  { type: 'abcd-pattern', label: 'ABCD Pattern', icon: Route },
  { type: 'triangle-pattern', label: 'Triangle Pattern', icon: Triangle },
  { type: 'three-drives-pattern', label: 'Three Drives Pattern', icon: Activity },
  { type: 'elliott-impulse-wave', label: 'Elliott Impulse Wave (12345)', icon: ChartSpline },
  { type: 'elliott-correction-wave', label: 'Elliott Correction Wave (ABC)', icon: GitCommitHorizontal },
  { type: 'elliott-triangle-wave', label: 'Elliott Triangle Wave (ABCDE)', icon: GitFork },
  { type: 'elliott-double-combo-wave', label: 'Elliott Double Combo Wave (WXY)', icon: Shuffle },
  { type: 'elliott-triple-combo-wave', label: 'Elliott Triple Combo Wave (WXYZ)', icon: Split },
  { type: 'cyclic-lines', label: 'Cyclic Lines', icon: Repeat },
  { type: 'time-cycles', label: 'Time Cycles', icon: Repeat2 },
  { type: 'sine-line', label: 'Sine Line', icon: Radical },
  { type: 'brush', label: 'Brush', icon: Brush },
  { type: 'highlighter', label: 'Highlighter', icon: Highlighter },
  { type: 'arrow-marker', label: 'Arrow Marker', icon: ArrowUpRight },
  { type: 'arrow-line', label: 'Arrow', icon: MoveUpRight },
  { type: 'arrow-mark-up', label: 'Arrow Mark Up', icon: ArrowUp },
  { type: 'arrow-mark-down', label: 'Arrow Mark Down', icon: ArrowDown },
  { type: 'arrow-mark-left', label: 'Arrow Mark Left', icon: ArrowLeft },
  { type: 'arrow-mark-right', label: 'Arrow Mark Right', icon: ArrowRight },
];

const TEXT_MARKER_TYPES = [
  'text', 'anchored-text', 'note', 'anchored-note', 'callout', 'comment', 'price-label', 'price-note', 'signpost', 'flag-mark',
  'arrow-marker', 'arrow-mark-up', 'arrow-mark-down', 'arrow-mark-left', 'arrow-mark-right',
];
const PRICE_ANCHORED_MARKER_TYPES = ['price-label', 'price-note'];

const TOOL_GROUPS = [
  { name: 'Trend Lines', groupIcon: Spline, tools: ['line', 'ray', 'arrow', 'horizontal-line', 'vertical-line', 'horizontal-ray', 'extended-line', 'path', 'parallel-channel'] },
  { name: 'Fibonacci', groupIcon: Sigma, tools: ['fib-retracement', 'fib-extension'] },
  { name: 'Forecasting', groupIcon: Compass, tools: ['long-position', 'short-position', 'forecast', 'measure', 'price-range', 'date-range', 'price-date-range'] },
  {
    name: 'Geometric Shape',
    groupIcon: Shapes,
    // Same merged-flyout shape as the Patterns group below: `tools` stays flat for
    // ready-tool tracking/active-state, `sections` only drives the flyout's divided list.
    tools: [
      'rect', 'circle', 'triangle', 'arc', 'curve', 'double-curve',
      'brush', 'highlighter',
      'arrow-marker', 'arrow-line', 'arrow-mark-up', 'arrow-mark-down', 'arrow-mark-left', 'arrow-mark-right',
    ],
    sections: [
      { title: 'Shapes', tools: ['rect', 'circle', 'triangle', 'arc', 'curve', 'double-curve'] },
      { title: 'Brushes', tools: ['brush', 'highlighter'] },
      { title: 'Arrows', tools: ['arrow-marker', 'arrow-line', 'arrow-mark-up', 'arrow-mark-down', 'arrow-mark-left', 'arrow-mark-right'] },
    ],
  },
  { name: 'Annotation', groupIcon: MessageSquare, tools: ['text', 'anchored-text', 'note', 'anchored-note', 'callout', 'comment', 'price-label', 'price-note', 'signpost', 'flag-mark'] },
  {
    name: 'Patterns',
    groupIcon: Workflow,
    // `tools` stays a flat list (ready-tool tracking, compact-rail active state, etc.
    // all key off group.tools generically); `sections` is flyout-display-only, so the
    // one merged rail icon can still show 3 divided groups inside a single flyout.
    tools: [
      'xabcd-pattern', 'cypher-pattern', 'head-and-shoulders', 'abcd-pattern', 'triangle-pattern', 'three-drives-pattern',
      'elliott-impulse-wave', 'elliott-correction-wave', 'elliott-triangle-wave', 'elliott-double-combo-wave', 'elliott-triple-combo-wave',
      'cyclic-lines', 'time-cycles', 'sine-line',
    ],
    sections: [
      { title: 'Patterns', tools: ['xabcd-pattern', 'cypher-pattern', 'head-and-shoulders', 'abcd-pattern', 'triangle-pattern', 'three-drives-pattern'] },
      { title: 'Elliott Waves', tools: ['elliott-impulse-wave', 'elliott-correction-wave', 'elliott-triangle-wave', 'elliott-double-combo-wave', 'elliott-triple-combo-wave'] },
      { title: 'Cycles', tools: ['cyclic-lines', 'time-cycles', 'sine-line'] },
    ],
  },
];

const TOOL_LABELS = TOOL_BUTTONS.reduce((labels, toolButton) => ({
  ...labels,
  [toolButton.type]: toolButton.label,
}), {});

const WIDTH_TOOL_TYPES = TOOL_BUTTONS.map(item => item.type).filter(type => !TEXT_MARKER_TYPES.includes(type));
const LINE_STYLE_TOOL_TYPES = WIDTH_TOOL_TYPES;
const LABEL_TOOL_TYPES = WIDTH_TOOL_TYPES;
const PRESET_TOOL_TYPES = TOOL_BUTTONS.map(item => item.type);
// Long/Short position zones and entry line render with fixed profit/loss colors
// (ChartStage.jsx's isPositionDrawing branch) and never read drawing.color, so
// exposing a color control for them would silently do nothing.
const POSITION_TOOL_TYPES = ['long-position', 'short-position'];
const COLOR_TOOL_TYPES = PRESET_TOOL_TYPES.filter(type => !POSITION_TOOL_TYPES.includes(type));

function normalizeHexColor(value) {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  const match = trimmed.match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!match) return null;

  const hex = match[1];
  if (hex.length === 3) {
    return `#${hex.split('').map((char) => `${char}${char}`).join('')}`.toLowerCase();
  }

  return `#${hex}`.toLowerCase();
}

function getToolLabel(type) {
  return TOOL_LABELS[type] ?? (
    type
      ? type.charAt(0).toUpperCase() + type.slice(1)
      : ''
  );
}

function formatDrawingDateTime(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds)) return '';

  const date = new Date(seconds * 1000);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function parseDrawingDateTime(value, fallback) {
  const milliseconds = new Date(value).getTime();
  return Number.isFinite(milliseconds) ? Math.floor(milliseconds / 1000) : fallback;
}

export function ConfirmOverwriteDialog({ isDark, templateName, onCancel, onConfirm, overlayClassName = 'fixed inset-0', subjectLabel = 'tool settings' }) {
  const surfaceClass = isDark ? 'border-[#363a45] bg-[#1e222d] text-[#d1d4dc]' : 'border-slate-200 bg-white text-slate-800';
  const fieldClass = isDark ? 'border-[#434651] bg-[#1e222d] text-[#d1d4dc]' : 'border-slate-300 bg-white text-slate-800';
  const mutedClass = isDark ? 'text-[#b2b5be]' : 'text-slate-600';
  const dividerClass = isDark ? 'border-[#363a45]' : 'border-slate-200';

  return (
    <div className={`${overlayClassName} z-[10032] flex items-center justify-center bg-black/40 px-3`} data-chart-ui>
      <section className={`w-full max-w-sm overflow-hidden rounded-md border shadow-2xl ${surfaceClass}`} role="alertdialog" aria-modal="true" aria-label="Overwrite template">
        <header className="px-6 pb-3 pt-6">
          <h2 className="text-lg font-semibold">Overwrite template?</h2>
        </header>
        <div className={`px-6 pb-6 text-sm ${mutedClass}`}>
          Overwrite the “{templateName}” template with the current {subjectLabel}? This can’t be undone.
        </div>
        <footer className={`flex items-center justify-end gap-3 border-t px-6 py-5 ${dividerClass}`}>
          <button type="button" onClick={onCancel} className={`h-11 rounded-lg border px-5 text-sm font-semibold ${fieldClass}`}>Cancel</button>
          <button type="button" onClick={onConfirm} className="h-11 rounded-lg bg-amber-400 px-5 text-sm font-semibold text-slate-950 transition hover:bg-amber-300">Overwrite</button>
        </footer>
      </section>
    </div>
  );
}

const DIALOG_DRAG_MARGIN = 32;

function DrawingSettingsDialog({
  drawing,
  editorLabel,
  editorType,
  timeframe,
  chartTheme,
  canUsePresets,
  canEditColor,
  presetItems,
  onSaveTemplate,
  onDeleteToolPreset,
  onClose,
  onApply,
}) {
  const isDark = chartTheme?.mode !== 'light';
  const dragHandleTooltip = useAnchoredTooltip('bottom');
  const [activeTab, setActiveTab] = useState('style');
  const [draft, setDraft] = useState(() => ({ ...drawing }));
  const [showTemplateMenu, setShowTemplateMenu] = useState(false);
  const [showSaveAsDialog, setShowSaveAsDialog] = useState(false);
  const [templateNameDraft, setTemplateNameDraft] = useState('');
  const [pendingOverwriteName, setPendingOverwriteName] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  // True right after "Apply defaults" resets the draft and no field has been
  // manually re-picked since — lets Ok skip re-saving the tool type's default
  // style, so resetting *this* drawing doesn't also overwrite the user's saved
  // default for every future new drawing of this type.
  const [defaultsJustApplied, setDefaultsJustApplied] = useState(false);
  const panelRef = useRef(null);
  const dragCleanupRef = useRef(null);
  const tabs = ['style', 'text', 'coordinates', 'visibility'];
  const surfaceClass = isDark ? 'border-[#363a45] bg-[#1e222d] text-[#d1d4dc]' : 'border-slate-200 bg-white text-slate-800';
  const fieldClass = isDark
    ? 'border-[#434651] bg-[#1e222d] text-[#d1d4dc] focus:border-[#2962ff]'
    : 'border-slate-300 bg-white text-slate-800 focus:border-blue-600';
  const mutedClass = isDark ? 'text-[#b2b5be]' : 'text-slate-600';
  const dividerClass = isDark ? 'border-[#363a45]' : 'border-slate-200';
  const startPoint = draft.start ?? draft.point ?? null;
  const endPoint = draft.end ?? null;

  useEffect(() => {
    setDraft({ ...drawing });
    setActiveTab('style');
    setDragOffset({ x: 0, y: 0 });
    setDefaultsJustApplied(false);
  }, [drawing?.id]);

  useEffect(() => () => dragCleanupRef.current?.(), []);

  const handleDragHandlePointerDown = (event) => {
    if (event.button !== 0 || event.target.closest('button')) return;
    const panel = panelRef.current;
    if (!panel) return;

    event.preventDefault();
    const startClientX = event.clientX;
    const startClientY = event.clientY;
    const startOffset = dragOffset;
    const startRect = panel.getBoundingClientRect();

    const handleMove = (moveEvent) => {
      const nextLeft = startRect.left + (moveEvent.clientX - startClientX);
      const nextTop = startRect.top + (moveEvent.clientY - startClientY);
      const clampedLeft = Math.min(Math.max(nextLeft, DIALOG_DRAG_MARGIN - startRect.width), window.innerWidth - DIALOG_DRAG_MARGIN);
      const clampedTop = Math.min(Math.max(nextTop, 0), window.innerHeight - DIALOG_DRAG_MARGIN);

      setDragOffset({
        x: startOffset.x + (clampedLeft - startRect.left),
        y: startOffset.y + (clampedTop - startRect.top),
      });
    };

    const handleUp = () => {
      setIsDragging(false);
      document.removeEventListener('pointermove', handleMove);
      document.removeEventListener('pointerup', handleUp);
      dragCleanupRef.current = null;
    };

    setIsDragging(true);
    dragCleanupRef.current = handleUp;
    document.addEventListener('pointermove', handleMove);
    document.addEventListener('pointerup', handleUp);
  };

  const updatePoint = (key, field, value) => {
    setDraft((current) => {
      if (key === 'point') return { ...current, point: { ...current.point, [field]: value } };
      return { ...current, [key]: { ...current[key], [field]: value } };
    });
  };

  // Any manual style/text edit after "Apply defaults" is an explicit choice —
  // it should still update the tool type's saved default on Ok, same as before.
  const updateStyleDraft = (patch) => {
    setDraft((current) => ({ ...current, ...patch }));
    setDefaultsJustApplied(false);
  };

  const handleApplyDefaults = () => {
    setDraft((current) => ({
      ...current,
      ...(canEditColor ? { color: DRAWING_COLORS[0] } : {}),
      strokeWidth: 1,
      lineStyle: 'solid',
      textBold: false,
      textItalic: false,
      textSize: 12,
      labelVertical: 'top',
      labelHorizontal: 'center',
    }));
    setDefaultsJustApplied(true);
    setShowTemplateMenu(false);
  };

  const commitSaveTemplate = (name) => {
    onSaveTemplate?.(name, draft);
    setShowSaveAsDialog(false);
    setTemplateNameDraft('');
    setPendingOverwriteName(null);
  };

  const handleSaveTemplate = () => {
    const name = templateNameDraft.trim();
    if (!name) return;
    const existing = (presetItems ?? []).find((item) => String(item.name).toLowerCase() === name.toLowerCase());
    if (existing) {
      setPendingOverwriteName(existing.name);
      return;
    }
    commitSaveTemplate(name);
  };

  const handleApplyTemplate = (preset) => {
    if (!preset?.settings) return;
    setDraft((current) => ({
      ...current,
      ...preset.settings,
      ...(typeof preset.settings.labelText === 'string' ? { text: preset.settings.labelText, labelText: preset.settings.labelText } : {}),
    }));
    setShowTemplateMenu(false);
  };

  return (
    <div className="fixed inset-0 z-[10020] flex items-start justify-center bg-black/10 px-3 pt-[max(4.5rem,8vh)]" data-chart-ui onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section
        ref={panelRef}
        className={`w-full max-w-[476px] overflow-hidden rounded-md border shadow-2xl ${surfaceClass}`}
        role="dialog"
        aria-modal="true"
        aria-label={`${editorLabel} settings`}
        style={{ transform: `translate3d(${dragOffset.x}px, ${dragOffset.y}px, 0)`, willChange: 'transform' }}
      >
        <header
          ref={dragHandleTooltip.anchorRef}
          onPointerDown={handleDragHandlePointerDown}
          onMouseEnter={dragHandleTooltip.show}
          onMouseLeave={dragHandleTooltip.hide}
          className={`flex select-none items-center justify-between px-6 pb-4 pt-6 ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        >
          <div className="flex min-w-0 items-center gap-3">
            <h2 className="truncate text-xl font-semibold">{editorLabel}</h2>
            <Pencil size={19} strokeWidth={1.6} className={mutedClass} />
          </div>
          <button type="button" onClick={onClose} className={`flex h-9 w-9 items-center justify-center rounded transition ${isDark ? 'hover:bg-white/10' : 'hover:bg-slate-100'}`} aria-label="Close settings"><X size={27} strokeWidth={1.4} /></button>
          {/* z-[10022]: this dialog is portaled at z-[10020] (see the outer fixed
              wrapper below), so the shared default z-[9999] would paint the
              tooltip underneath it. */}
          <AnchoredTooltipPortal pos={dragHandleTooltip.pos} label="Drag to move" isDark={isDark} zIndexClass="z-[10022]" />
        </header>

        <nav className="relative flex px-6" aria-label="Drawing setting sections">
          {tabs.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`relative flex-1 pb-3 text-sm font-semibold capitalize transition ${activeTab === tab ? '' : mutedClass}`}
            >
              {tab}
              {activeTab === tab && <span className={`absolute bottom-0 left-2 right-2 h-1 rounded-full ${isDark ? 'bg-[#d1d4dc]' : 'bg-slate-700'}`} />}
            </button>
          ))}
          <span className={`absolute bottom-0 left-6 right-6 h-1 rounded-full ${isDark ? 'bg-[#434651]' : 'bg-slate-200'}`} style={{ zIndex: -1 }} />
        </nav>

        <div className="min-h-[278px] px-6 py-7">
          {activeTab === 'style' && (
            <div className="space-y-5">
              {canEditColor && (
                <label className="flex items-center justify-between gap-4 text-sm font-medium">
                  Line color
                  <div className="flex items-center gap-2">
                    <input type="color" value={normalizeHexColor(draft.color) ?? '#60a5fa'} onChange={(event) => updateStyleDraft({ color: event.target.value })} className={`h-11 w-11 cursor-pointer rounded-lg border p-1 ${fieldClass}`} />
                    <input value={draft.color ?? ''} onChange={(event) => updateStyleDraft({ color: event.target.value })} className={`h-11 w-28 rounded-lg border px-3 font-mono text-sm outline-none ${fieldClass}`} aria-label="Line color value" />
                  </div>
                </label>
              )}
              <label className="flex items-center justify-between gap-4 text-sm font-medium">
                Line width
                <select value={draft.strokeWidth ?? 1} onChange={(event) => updateStyleDraft({ strokeWidth: Number(event.target.value) })} className={`h-11 w-44 rounded-lg border px-3 outline-none ${fieldClass}`}>
                  {DRAWING_WIDTHS.map((width) => <option key={width} value={width}>{width}px</option>)}
                </select>
              </label>
              <label className="flex items-center justify-between gap-4 text-sm font-medium">
                Line style
                <select value={draft.lineStyle ?? 'solid'} onChange={(event) => updateStyleDraft({ lineStyle: event.target.value })} className={`h-11 w-44 rounded-lg border px-3 outline-none ${fieldClass}`}>
                  <option value="solid">Solid</option>
                  <option value="dashed">Dashed</option>
                </select>
              </label>
            </div>
          )}

          {activeTab === 'text' && (
            <div className="space-y-5">
              <label className="flex items-center gap-3 text-sm font-medium">
                <input type="checkbox" checked={draft.showText !== false} onChange={(event) => setDraft((current) => ({ ...current, showText: event.target.checked }))} className="h-5 w-5 accent-emerald-400" />
                Text
              </label>
              <div className="flex items-center gap-2">
                {canEditColor && (
                  <input type="color" value={normalizeHexColor(draft.color) ?? '#ffffff'} onChange={(event) => updateStyleDraft({ color: event.target.value })} className={`h-11 w-11 cursor-pointer rounded-lg border p-1 ${fieldClass}`} aria-label="Text color" />
                )}
                <button type="button" onClick={() => updateStyleDraft({ textBold: !draft.textBold })} className={`h-11 w-11 rounded-lg border text-lg font-bold ${fieldClass} ${draft.textBold ? 'ring-1 ring-[#2962ff]' : ''}`}>B</button>
                <button type="button" onClick={() => updateStyleDraft({ textItalic: !draft.textItalic })} className={`h-11 w-11 rounded-lg border text-lg italic ${fieldClass} ${draft.textItalic ? 'ring-1 ring-[#2962ff]' : ''}`}>I</button>
                <select value={Number(draft.textSize) || 12} onChange={(event) => updateStyleDraft({ textSize: Number(event.target.value) })} className={`h-11 flex-1 rounded-lg border px-2 text-sm outline-none ${fieldClass}`} aria-label="Text size">
                  {TEXT_SIZES.map((size) => <option key={size} value={size}>{size}px</option>)}
                </select>
              </div>
              <textarea value={draft.text ?? draft.labelText ?? ''} onChange={(event) => updateStyleDraft({ text: event.target.value, labelText: event.target.value })} disabled={draft.showText === false} className={`h-28 w-full resize-none rounded-lg border p-3 text-sm outline-none ${fieldClass} disabled:opacity-40`} placeholder="Drawing text" />
              <div className="grid grid-cols-[1fr_1fr_1fr] items-center gap-2">
                <span className="text-sm font-medium">Text alignment</span>
                <select value={draft.labelVertical ?? 'top'} onChange={(event) => updateStyleDraft({ labelVertical: event.target.value })} className={`h-11 rounded-lg border px-3 outline-none ${fieldClass}`}><option value="top">Top</option><option value="middle">Inside</option><option value="bottom">Bottom</option></select>
                <select value={draft.labelHorizontal ?? 'center'} onChange={(event) => updateStyleDraft({ labelHorizontal: event.target.value })} className={`h-11 rounded-lg border px-3 outline-none ${fieldClass}`}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select>
              </div>
            </div>
          )}

          {activeTab === 'coordinates' && (
            <div className="space-y-5">
              {startPoint && (
                <div className="grid grid-cols-[72px_1fr_1fr] items-center gap-2">
                  <span className="text-sm font-medium">Point 1</span>
                  <input type="datetime-local" value={formatDrawingDateTime(startPoint.time)} onChange={(event) => updatePoint(draft.point ? 'point' : 'start', 'time', parseDrawingDateTime(event.target.value, startPoint.time))} className={`h-11 min-w-0 rounded-lg border px-2 text-xs outline-none ${fieldClass}`} />
                  <input type="number" step="any" value={startPoint.price ?? ''} onChange={(event) => updatePoint(draft.point ? 'point' : 'start', 'price', Number(event.target.value))} className={`h-11 min-w-0 rounded-lg border px-3 text-sm outline-none ${fieldClass}`} placeholder="Price" />
                </div>
              )}
              {endPoint && (
                <div className="grid grid-cols-[72px_1fr_1fr] items-center gap-2">
                  <span className="text-sm font-medium">Point 2</span>
                  <input type="datetime-local" value={formatDrawingDateTime(endPoint.time)} onChange={(event) => updatePoint('end', 'time', parseDrawingDateTime(event.target.value, endPoint.time))} className={`h-11 min-w-0 rounded-lg border px-2 text-xs outline-none ${fieldClass}`} />
                  <input type="number" step="any" value={endPoint.price ?? ''} onChange={(event) => updatePoint('end', 'price', Number(event.target.value))} className={`h-11 min-w-0 rounded-lg border px-3 text-sm outline-none ${fieldClass}`} placeholder="Price" />
                </div>
              )}
              {!startPoint && <p className={`text-sm ${mutedClass}`}>This drawing does not expose editable coordinates.</p>}
            </div>
          )}

          {activeTab === 'visibility' && (
            <div className="space-y-4">
              <label className={`flex cursor-pointer items-center justify-between rounded-lg border p-4 ${dividerClass}`}>
                <div><div className="text-sm font-semibold">All timeframes</div><div className={`mt-1 text-xs ${mutedClass}`}>Show this drawing when changing timeframe.</div></div>
                <input type="checkbox" checked={!draft.visibleTimeframe} onChange={(event) => setDraft((current) => ({ ...current, visibleTimeframe: event.target.checked ? null : timeframe }))} className="h-5 w-5 accent-[#2962ff]" />
              </label>
              <label className={`flex cursor-pointer items-center justify-between rounded-lg border p-4 ${dividerClass}`}>
                <div><div className="text-sm font-semibold">Lock drawing</div><div className={`mt-1 text-xs ${mutedClass}`}>Prevent accidental moving and resizing.</div></div>
                <input type="checkbox" checked={Boolean(draft.locked)} onChange={(event) => setDraft((current) => ({ ...current, locked: event.target.checked }))} className="h-5 w-5 accent-[#2962ff]" />
              </label>
            </div>
          )}
        </div>

        <footer className={`flex items-center justify-between gap-3 border-t px-6 py-5 ${dividerClass}`}>
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowTemplateMenu((current) => !current)}
              disabled={!canUsePresets}
              className={`flex h-11 items-center gap-1.5 rounded-lg border px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${fieldClass}`}
            >
              Template
              <ChevronDown size={15} className={`transition-transform ${showTemplateMenu ? 'rotate-180' : ''}`} />
            </button>
            {showTemplateMenu && (
              <>
                <button type="button" className="fixed inset-0 z-[10029] cursor-default" onClick={() => setShowTemplateMenu(false)} aria-label="Close template menu" tabIndex={-1} />
                <div className={`absolute bottom-full left-0 z-[10030] mb-2 w-56 overflow-hidden rounded-lg border py-1.5 shadow-2xl ${surfaceClass}`}>
                  <button
                    type="button"
                    onClick={() => { setTemplateNameDraft(''); setShowSaveAsDialog(true); setShowTemplateMenu(false); }}
                    className={`block w-full px-4 py-2.5 text-left text-sm ${isDark ? 'hover:bg-white/10' : 'hover:bg-slate-100'}`}
                  >
                    Save as...
                  </button>
                  <button
                    type="button"
                    onClick={handleApplyDefaults}
                    className={`block w-full px-4 py-2.5 text-left text-sm ${isDark ? 'hover:bg-white/10' : 'hover:bg-slate-100'}`}
                  >
                    Apply defaults
                  </button>
                  <div className={`mx-4 my-1.5 border-t ${dividerClass}`} />
                  <div className={`px-4 pb-1 text-[11px] font-semibold uppercase tracking-wide ${mutedClass}`}>Templates</div>
                  <div className="max-h-44 space-y-0.5 overflow-y-auto px-2 pb-1.5">
                    {(presetItems ?? []).map((preset) => (
                      <div key={preset.id ?? preset.name} className="flex items-center gap-1">
                        <IconTooltipButton
                          label={`Apply ${preset.name}`}
                          isDark={isDark}
                          zIndexClass="z-[10031]"
                          onClick={() => handleApplyTemplate(preset)}
                          className={`h-9 flex-1 truncate rounded px-2 text-left text-sm ${isDark ? 'hover:bg-white/10' : 'hover:bg-slate-100'}`}
                        >
                          {preset.name}
                        </IconTooltipButton>
                        <IconTooltipButton
                          label={`Delete ${preset.name}`}
                          isDark={isDark}
                          zIndexClass="z-[10031]"
                          onClick={() => onDeleteToolPreset?.(editorType, preset)}
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-red-400 hover:bg-red-500/10"
                        >
                          <Trash2 size={14} />
                        </IconTooltipButton>
                      </div>
                    ))}
                    {!(presetItems ?? []).length && (
                      <span className={`block px-2 py-1 text-[11px] ${mutedClass}`}>No saved templates</span>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button type="button" onClick={onClose} className={`h-11 rounded-lg border px-5 text-sm font-semibold ${fieldClass}`}>Cancel</button>
            <button type="button" onClick={() => onApply(draft, { skipDefaultSave: defaultsJustApplied })} className="h-11 rounded-lg bg-emerald-400 px-5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300">Ok</button>
          </div>
        </footer>
      </section>

      {showSaveAsDialog && (
        <div className="fixed inset-0 z-[10031] flex items-center justify-center bg-black/40 px-3" data-chart-ui>
          <section className={`w-full max-w-sm overflow-hidden rounded-md border shadow-2xl ${surfaceClass}`} role="dialog" aria-modal="true" aria-label="Save drawing template as">
            <header className="flex items-center justify-between px-6 pb-4 pt-6">
              <h2 className="text-lg font-semibold">Save drawing template as</h2>
              <button type="button" onClick={() => setShowSaveAsDialog(false)} className={`flex h-9 w-9 items-center justify-center rounded transition ${isDark ? 'hover:bg-white/10' : 'hover:bg-slate-100'}`} aria-label="Close"><X size={22} strokeWidth={1.4} /></button>
            </header>
            <div className="px-6 pb-6">
              <label className={`mb-1 block text-sm font-medium ${mutedClass}`}>
                Template name:
                <input
                  type="text"
                  autoFocus
                  value={templateNameDraft}
                  onChange={(event) => setTemplateNameDraft(event.target.value)}
                  onKeyDown={(event) => { if (event.key === 'Enter') handleSaveTemplate(); }}
                  className={`mt-2 h-11 w-full rounded-lg border px-3 text-sm outline-none ${fieldClass}`}
                />
              </label>
            </div>
            <footer className={`flex items-center justify-end gap-3 border-t px-6 py-5 ${dividerClass}`}>
              <button type="button" onClick={() => setShowSaveAsDialog(false)} className={`h-11 rounded-lg border px-5 text-sm font-semibold ${fieldClass}`}>Cancel</button>
              <button type="button" onClick={handleSaveTemplate} disabled={!templateNameDraft.trim()} className="h-11 rounded-lg bg-emerald-400 px-5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-40">Save</button>
            </footer>
          </section>
        </div>
      )}

      {pendingOverwriteName && (
        <ConfirmOverwriteDialog
          isDark={isDark}
          templateName={pendingOverwriteName}
          onCancel={() => setPendingOverwriteName(null)}
          onConfirm={() => commitSaveTemplate(templateNameDraft.trim())}
        />
      )}
    </div>
  );
}

function TopToolEditorBar({
  editorLabel,
  editorType,
  timeframe,
  activeColor,
  activeStrokeWidth,
  activeLineStyle,
  activeLabelText,
  activeText,
  activeTextBold,
  activeTextItalic,
  activeLabelVertical,
  activeLabelHorizontal,
  canEditWidth,
  canEditLineStyle,
  canEditLabel,
  canEditText,
  canEditColor,
  canUsePresets,
  presetItems,
  presetNameDraft,
  setPresetNameDraft,
  selectedDrawing,
  openMenu,
  setOpenMenu,
  onDrawingColorChange,
  onDrawingWidthChange,
  onDrawingLineStyleChange,
  onDrawingLabelChange,
  onApplyToolPreset,
  onDeleteToolPreset,
  onDuplicateSelectedDrawing,
  onDeleteSelectedDrawing,
  onSavePreset,
  onSaveSelectedToolPreset,
  chartTheme,
  availableWidth,
  chartBoundsRef,
}) {
  const [hexColorDraft, setHexColorDraft] = useState(activeColor ?? '');
  const [showSaveAsDialog, setShowSaveAsDialog] = useState(false);
  const [pendingOverwriteName, setPendingOverwriteName] = useState(null);
  const gripTooltip = useAnchoredTooltip();

  const toggleMenu = (menu) => {
    setOpenMenu((currentMenu) => (currentMenu === menu ? null : menu));
  };

  const attemptSavePreset = () => {
    const trimmed = presetNameDraft.trim();
    if (!trimmed) return;
    const existing = (presetItems ?? []).find((item) => String(item.name).toLowerCase() === trimmed.toLowerCase());
    if (existing) {
      setPendingOverwriteName(existing.name);
      return;
    }
    onSavePreset();
    setShowSaveAsDialog(false);
  };

  const confirmOverwritePreset = () => {
    onSavePreset();
    setPendingOverwriteName(null);
    setShowSaveAsDialog(false);
  };

  const handleApplyToolDefaults = () => {
    // skipDefaultSave: this resets the *selected drawing* back to the system
    // defaults — it must not also overwrite the user's saved default style for
    // this tool type (toolSettings[type], used to seed future new drawings).
    if (canEditColor) onDrawingColorChange(DRAWING_COLORS[0], { skipDefaultSave: true });
    if (canEditWidth) onDrawingWidthChange(1, { skipDefaultSave: true });
    if (canEditLineStyle) onDrawingLineStyleChange('solid', { skipDefaultSave: true });
    if (canEditLabel || canEditText) {
      onDrawingLabelChange({
        textBold: false,
        textItalic: false,
        textSize: 12,
        labelVertical: 'top',
        labelHorizontal: 'center',
      }, { skipDefaultSave: true });
    }
    setOpenMenu(null);
  };

  const isDark = chartTheme?.mode !== 'light';
  const menuPanelClass = isDark
    ? 'absolute left-1/2 top-10 z-50 w-[min(300px,calc(100vw-2rem))] -translate-x-1/2 rounded-lg border border-gray-700 bg-skin-black/95 p-3 text-white shadow-2xl backdrop-blur'
    : 'absolute left-1/2 top-10 z-50 w-[min(300px,calc(100vw-2rem))] -translate-x-1/2 rounded-lg border border-slate-200 bg-white p-3 text-slate-800 shadow-2xl backdrop-blur';
  const editorLabelClass = isDark ? 'text-gray-400' : 'text-slate-600';
  const editorFieldClass = isDark
    ? 'border-gray-700 bg-black-table-color text-white placeholder:text-gray-500'
    : 'border-slate-300 bg-white text-slate-900 placeholder:text-slate-400';
  const editorOptionClass = (active) => (
    active
      ? isDark
        ? 'border-white bg-white text-skin-black'
        : 'border-skin-black bg-skin-black text-white'
      : isDark
        ? 'border-gray-700 bg-black-table-color text-white hover:bg-skin-black-light'
        : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
  );
  const displayColor = normalizeHexColor(activeColor) ?? activeColor ?? '#60a5fa';
  const EditorToolIcon = TOOL_BUTTONS.find((item) => item.type === editorType)?.icon ?? MousePointer2;

  useEffect(() => {
    setHexColorDraft(normalizeHexColor(activeColor) ?? activeColor ?? '');
  }, [activeColor]);

  const handleHexColorChange = (value) => {
    const nextValue = value.startsWith('#') ? value : `#${value}`;
    if (!/^#[0-9a-fA-F]{0,6}$/.test(nextValue)) return;

    setHexColorDraft(nextValue);

    const normalizedColor = normalizeHexColor(nextValue);
    if (normalizedColor) {
      onDrawingColorChange(normalizedColor);
    }
  };

  return (
    <div
      className="pointer-events-auto absolute top-2 z-[60] w-max rounded-lg border shadow-2xl backdrop-blur"
      style={{
        ...getPanelStyle(chartTheme),
        left: 'calc(50% + 24px)',
        maxWidth: `${Math.max(Number(availableWidth) || 140, 140)}px`,
        transform: 'translate3d(-50%, 0, 0)',
        willChange: 'transform',
      }}
    >
      <div className="flex h-11 max-w-full flex-nowrap items-center overflow-visible">
        <div
          ref={gripTooltip.anchorRef}
          onMouseEnter={gripTooltip.show}
          onMouseLeave={gripTooltip.hide}
          className={`flex h-11 w-7 shrink-0 cursor-grab items-center justify-center rounded-l-lg ${
            isDark ? 'text-[#787b86]' : 'text-slate-400'
          }`}
          aria-hidden="true"
        >
          <GripVertical size={17} strokeWidth={2} />
          <AnchoredTooltipPortal pos={gripTooltip.pos} label="Tool settings" isDark={isDark} />
        </div>

        <div className="relative order-1">
          <ToolEditorButton
            icon={LayoutGrid}
            title="Templates"
            active={openMenu === 'presets'}
            disabled={!canUsePresets}
            onClick={() => toggleMenu('presets')}
            className="rounded-sm"
            chartTheme={chartTheme}
            hideTooltip={openMenu === 'presets'}
          />
          {openMenu === 'presets' && (
            <div className={menuPanelClass}>
              {selectedDrawing && (
                <div className={`mb-2 space-y-0.5 border-b pb-2 ${isDark ? 'border-gray-800' : 'border-slate-200'}`}>
                  <button
                    type="button"
                    onClick={() => {
                      setPresetNameDraft('');
                      setShowSaveAsDialog(true);
                    }}
                    className={`flex h-9 w-full items-center gap-2 rounded px-2 text-left text-xs ${isDark ? 'hover:bg-white/10' : 'hover:bg-slate-100'}`}
                  >
                    <Save size={15} />
                    Save as...
                  </button>
                  <button
                    type="button"
                    onClick={handleApplyToolDefaults}
                    className={`flex h-9 w-full items-center gap-2 rounded px-2 text-left text-xs ${isDark ? 'hover:bg-white/10' : 'hover:bg-slate-100'}`}
                  >
                    <RotateCcw size={15} />
                    Apply defaults
                  </button>
                </div>
              )}
              <div className={`mb-2 text-xs font-semibold uppercase tracking-wide ${editorLabelClass}`}>Templates</div>
              <div className="max-h-44 space-y-1.5 overflow-y-auto pr-1">
                {presetItems.map((preset) => (
                  <div key={preset.id ?? preset.name} className="grid grid-cols-[minmax(0,1fr)_32px] gap-1.5">
                    <ControlButton
                      icon={MousePointer2}
                      onClick={() => {
                        onApplyToolPreset(editorType, preset);
                        setOpenMenu(null);
                      }}
                      title={`Use ${preset.name}`}
                      className="max-w-full justify-start"
                      chartTheme={chartTheme}
                    >
                      {preset.name}
                    </ControlButton>
                    <IconTooltipButton
                      label={`Delete ${preset.name}`}
                      isDark={isDark}
                      onClick={() => onDeleteToolPreset(editorType, preset)}
                      className="flex h-8 w-8 items-center justify-center rounded-md bg-red-950/70 text-red-200 hover:bg-red-900 hover:text-white"
                    >
                      <Trash2 size={14} />
                    </IconTooltipButton>
                  </div>
                ))}

                {!presetItems.length && (
                  <span className={`text-[11px] ${isDark ? 'text-gray-500' : 'text-slate-500'}`}>No saved templates</span>
                )}
              </div>
            </div>
          )}
          {showSaveAsDialog && typeof document !== 'undefined' && chartBoundsRef?.current && createPortal(
            <div className="pointer-events-auto absolute inset-0 z-[10031] flex items-center justify-center bg-black/40 px-3" data-chart-ui>
              <section
                className={`w-full max-w-sm overflow-hidden rounded-md border shadow-2xl ${
                  isDark ? 'border-[#363a45] bg-[#1e222d] text-[#d1d4dc]' : 'border-slate-200 bg-white text-slate-800'
                }`}
                role="dialog"
                aria-modal="true"
                aria-label="Save drawing template as"
              >
                <header className="flex items-center justify-between px-6 pb-4 pt-6">
                  <h2 className="text-lg font-semibold">Save drawing template as</h2>
                  <button
                    type="button"
                    onClick={() => setShowSaveAsDialog(false)}
                    className={`flex h-9 w-9 items-center justify-center rounded transition ${isDark ? 'hover:bg-white/10' : 'hover:bg-slate-100'}`}
                    aria-label="Close"
                  >
                    <X size={22} strokeWidth={1.4} />
                  </button>
                </header>
                <div className="px-6 pb-6">
                  <label className={`mb-1 block text-sm font-medium ${editorLabelClass}`}>
                    Template name:
                    <input
                      type="text"
                      autoFocus
                      value={presetNameDraft}
                      onChange={(event) => setPresetNameDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && presetNameDraft.trim()) {
                          attemptSavePreset();
                        }
                      }}
                      className={`mt-2 h-11 w-full rounded-lg border px-3 text-sm outline-none ${editorFieldClass}`}
                    />
                  </label>
                </div>
                <footer className={`flex items-center justify-end gap-3 border-t px-6 py-5 ${isDark ? 'border-[#363a45]' : 'border-slate-200'}`}>
                  <button
                    type="button"
                    onClick={() => setShowSaveAsDialog(false)}
                    className={`h-11 rounded-lg border px-5 text-sm font-semibold ${editorFieldClass}`}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={attemptSavePreset}
                    disabled={!presetNameDraft.trim()}
                    className="h-11 rounded-lg bg-emerald-400 px-5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Save
                  </button>
                </footer>
              </section>
            </div>,
            chartBoundsRef.current,
          )}
          {pendingOverwriteName && typeof document !== 'undefined' && chartBoundsRef?.current && createPortal(
            <ConfirmOverwriteDialog
              isDark={isDark}
              templateName={pendingOverwriteName}
              onCancel={() => setPendingOverwriteName(null)}
              onConfirm={confirmOverwritePreset}
              overlayClassName="pointer-events-auto absolute inset-0"
            />,
            chartBoundsRef.current,
          )}
        </div>

        <ToolEditorButton
          icon={EditorToolIcon}
          title={editorLabel || 'Selected tool'}
          className="order-2"
          chartTheme={chartTheme}
        >
          <span className="absolute bottom-1 left-3 right-3 h-0.5 rounded-full" style={{ backgroundColor: displayColor }} />
        </ToolEditorButton>

        {canEditColor && (
          <div className="relative order-3">
            <ToolEditorButton
              icon={PaintBucket}
              title="Color"
              active={openMenu === 'color'}
              onClick={() => toggleMenu('color')}
              chartTheme={chartTheme}
            >
              <span className="absolute bottom-1 left-3 right-3 h-0.5 rounded-full" style={{ backgroundColor: displayColor }} />
            </ToolEditorButton>
            {openMenu === 'color' && (
              <div className={menuPanelClass}>
                <div className={`mb-2 text-xs font-semibold uppercase tracking-wide ${editorLabelClass}`}>Color</div>
                <div className="mb-3 flex items-center gap-2">
                  <span
                    className="h-8 w-8 shrink-0 rounded-sm border border-gray-500"
                    style={{ backgroundColor: displayColor }}
                    aria-hidden="true"
                  />
                  <input
                    value={hexColorDraft}
                    onChange={(event) => handleHexColorChange(event.target.value)}
                    onBlur={() => {
                      const normalizedColor = normalizeHexColor(hexColorDraft);
                      setHexColorDraft(normalizedColor ?? displayColor);
                    }}
                    maxLength={7}
                    spellCheck={false}
                    placeholder="#60a5fa"
                    className={`h-8 min-w-0 flex-1 rounded border px-2 text-xs font-mono uppercase outline-none ${editorFieldClass}`}
                    aria-label="Hex color"
                  />
                </div>
                <div className="grid grid-cols-6 gap-1.5">
                  {DRAWING_COLORS.map((color) => {
                    const isActive = activeColor?.toLowerCase() === color.toLowerCase();

                    return (
                      <IconTooltipButton
                        key={color}
                        label={color}
                        isDark={isDark}
                        ariaLabel={`Use color ${color}`}
                        onClick={() => {
                          onDrawingColorChange(color);
                          setOpenMenu(null);
                        }}
                        className={`h-8 w-8 rounded-sm border ${
                          isActive ? 'border-white ring-2 ring-white' : 'border-gray-500'
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {canEditWidth && (
          <div className="relative order-5">
            <ToolEditorButton title="Line width" active={openMenu === 'width'} onClick={() => toggleMenu('width')} chartTheme={chartTheme} className="px-2.5">
              <span className="block h-px w-5 bg-current" />
              <span className="text-sm font-semibold tabular-nums">{activeStrokeWidth}px</span>
            </ToolEditorButton>
            {openMenu === 'width' && (
              <div className={menuPanelClass}>
                <div className={`mb-2 text-xs font-semibold uppercase tracking-wide ${editorLabelClass}`}>Line Width</div>
                <div className="grid grid-cols-6 gap-2">
                  {DRAWING_WIDTHS.map((width) => (
                    <IconTooltipButton
                      key={width}
                      label={`${width}px`}
                      isDark={isDark}
                      onClick={() => {
                        onDrawingWidthChange(width);
                        setOpenMenu(null);
                      }}
                      className={`flex h-8 items-center justify-center rounded border text-[11px] ${editorOptionClass(activeStrokeWidth === width)}`}
                    >
                      <span
                        className="block rounded-full bg-white"
                        style={{ width: 18, height: Math.max(width, 1) }}
                      />
                    </IconTooltipButton>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {canEditLineStyle && (
          <div className="relative order-4">
            <ToolEditorButton icon={Slash} title="Line style" active={openMenu === 'style'} onClick={() => toggleMenu('style')} chartTheme={chartTheme}>
              <span
                className="absolute bottom-1 left-3 right-3 h-0.5"
                style={activeLineStyle === 'dashed' ? {
                  backgroundImage: `repeating-linear-gradient(to right, ${displayColor} 0 5px, transparent 5px 8px)`,
                } : { backgroundColor: displayColor }}
              />
            </ToolEditorButton>
            {openMenu === 'style' && (
              <div className={menuPanelClass}>
                <div className={`mb-2 text-xs font-semibold uppercase tracking-wide ${editorLabelClass}`}>Line Style</div>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: 'solid', label: 'Solid', dash: false },
                    { value: 'dashed', label: 'Dashed', dash: true },
                  ].map((style) => (
                    <button
                      key={style.value}
                      type="button"
                      onClick={() => {
                        onDrawingLineStyleChange(style.value);
                        setOpenMenu(null);
                      }}
                      className={`flex h-9 items-center justify-center gap-2 rounded border px-2 text-xs font-medium ${editorOptionClass(activeLineStyle === style.value)}`}
                    >
                      <span
                        className="h-px w-8 bg-white"
                        style={style.dash ? {
                          backgroundImage: 'linear-gradient(to right, #fff 0 55%, transparent 55% 100%)',
                          backgroundSize: '8px 1px',
                          backgroundColor: 'transparent',
                        } : undefined}
                      />
                      {style.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="relative order-6">
          <ToolEditorButton icon={Type} title="Text style" active={openMenu === 'text-style'} onClick={() => toggleMenu('text-style')} chartTheme={chartTheme}>
            <span className="absolute bottom-1 left-3 right-3 h-0.5 rounded-full" style={{ backgroundColor: displayColor }} />
          </ToolEditorButton>
          {openMenu === 'text-style' && (
            <div className={menuPanelClass}>
              <div className={`mb-2 text-xs font-semibold uppercase tracking-wide ${editorLabelClass}`}>Text Style</div>
              <div className="grid grid-cols-2 gap-2">
                <IconTooltipButton
                  label="Bold text"
                  isDark={isDark}
                  onClick={() => onDrawingLabelChange({ textBold: !activeTextBold })}
                  className={`flex h-9 items-center justify-center gap-2 rounded border px-2 text-xs font-medium ${editorOptionClass(activeTextBold)}`}
                >
                  <Bold size={14} />
                  Bold
                </IconTooltipButton>
                <IconTooltipButton
                  label="Italic text"
                  isDark={isDark}
                  onClick={() => onDrawingLabelChange({ textItalic: !activeTextItalic })}
                  className={`flex h-9 items-center justify-center gap-2 rounded border px-2 text-xs font-medium ${editorOptionClass(activeTextItalic)}`}
                >
                  <Italic size={14} />
                  Italic
                </IconTooltipButton>
              </div>
            </div>
          )}
        </div>

        {selectedDrawing && (
          <div className="relative order-7">
            <ToolEditorButton icon={Settings} title="Drawing settings" active={openMenu === 'settings'} onClick={() => toggleMenu('settings')} chartTheme={chartTheme} />
          </div>
        )}

        {selectedDrawing && (
          <>
            <ToolEditorButton
              icon={Copy}
              title="Duplicate selected drawing"
              onClick={onDuplicateSelectedDrawing}
              className="order-8"
              chartTheme={chartTheme}
            />
            <ToolEditorButton
              icon={Trash2}
              title="Delete selected drawing"
              onClick={onDeleteSelectedDrawing}
              className="order-9 hover:!bg-red-500/15 hover:!text-red-400"
              chartTheme={chartTheme}
            />
            <div className="relative order-10">
              <ToolEditorButton
                icon={MoreHorizontal}
                title="More drawing actions"
                active={openMenu === 'actions'}
                onClick={() => toggleMenu('actions')}
                className="rounded-r-lg"
                chartTheme={chartTheme}
              />
              {openMenu === 'actions' && (
                <div className={`${menuPanelClass} !left-auto !right-0 !w-44 !translate-x-0`}>
                  <button type="button" onClick={() => { onDuplicateSelectedDrawing(); setOpenMenu(null); }} className={`flex h-9 w-full items-center gap-2 rounded px-2 text-left text-xs ${isDark ? 'hover:bg-white/10' : 'hover:bg-slate-100'}`}><Copy size={15} />Duplicate drawing</button>
                  <button type="button" onClick={() => { onDeleteSelectedDrawing(); setOpenMenu(null); }} className="flex h-9 w-full items-center gap-2 rounded px-2 text-left text-xs text-red-400 hover:bg-red-500/10"><Trash2 size={15} />Delete drawing</button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {openMenu === 'settings' && selectedDrawing && typeof document !== 'undefined' && createPortal(
        <DrawingSettingsDialog
          drawing={selectedDrawing}
          editorLabel={editorLabel}
          editorType={editorType}
          timeframe={timeframe}
          chartTheme={chartTheme}
          canUsePresets={canUsePresets}
          canEditColor={canEditColor}
          presetItems={presetItems}
          onSaveTemplate={onSaveSelectedToolPreset}
          onDeleteToolPreset={onDeleteToolPreset}
          onClose={() => setOpenMenu(null)}
          onApply={(nextDrawing, applyOptions = {}) => {
            const skipDefaultSave = Boolean(applyOptions.skipDefaultSave);
            if (canEditColor && nextDrawing.color !== activeColor) onDrawingColorChange(nextDrawing.color, { skipDefaultSave });
            if (canEditWidth && nextDrawing.strokeWidth !== activeStrokeWidth) onDrawingWidthChange(nextDrawing.strokeWidth, { skipDefaultSave });
            if (canEditLineStyle && nextDrawing.lineStyle !== activeLineStyle) onDrawingLineStyleChange(nextDrawing.lineStyle, { skipDefaultSave });
            onDrawingLabelChange({
              labelText: nextDrawing.labelText ?? '',
              ...(TEXT_MARKER_TYPES.includes(nextDrawing.type) ? { text: nextDrawing.text ?? nextDrawing.labelText ?? '' } : {}),
              labelVertical: nextDrawing.labelVertical ?? 'top',
              labelHorizontal: nextDrawing.labelHorizontal ?? 'center',
              textBold: Boolean(nextDrawing.textBold),
              textItalic: Boolean(nextDrawing.textItalic),
              textSize: Number(nextDrawing.textSize) || 12,
              showText: nextDrawing.showText !== false,
              locked: Boolean(nextDrawing.locked),
              visibleTimeframe: nextDrawing.visibleTimeframe ?? null,
              ...(nextDrawing.start ? { start: nextDrawing.start } : {}),
              ...(nextDrawing.end ? { end: nextDrawing.end } : {}),
              ...(nextDrawing.point ? { point: nextDrawing.point } : {}),
              ...(nextDrawing.points ? { points: nextDrawing.points } : {}),
            }, { skipDefaultSave });
            setOpenMenu(null);
          }}
        />,
        document.body
      )}
    </div>
  );
}

function formatMoney(value, digits = 2) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '---';
  return number.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function playbookSelectStyles(isDark) {
  return {
    control: (base, state) => ({
      ...base,
      minHeight: 32,
      height: 32,
      fontSize: 12,
      backgroundColor: isDark ? '#151617' : '#ffffff',
      borderColor: state.isFocused ? '#2962ff' : (isDark ? '#374151' : '#cbd5e1'),
      boxShadow: 'none',
      '&:hover': { borderColor: '#2962ff' },
    }),
    valueContainer: (base) => ({ ...base, height: 32, padding: '0 8px' }),
    input: (base) => ({ ...base, margin: 0, padding: 0, color: isDark ? '#fff' : '#0f172a' }),
    indicatorsContainer: (base) => ({ ...base, height: 32 }),
    indicatorSeparator: (base) => ({ ...base, display: 'none' }),
    placeholder: (base) => ({ ...base, fontSize: 12, color: isDark ? '#6b7280' : '#94a3b8' }),
    singleValue: (base) => ({ ...base, fontSize: 12, color: isDark ? '#fff' : '#0f172a' }),
    menu: (base) => ({
      ...base,
      backgroundColor: isDark ? '#151617' : '#ffffff',
      border: `1px solid ${isDark ? '#374151' : '#cbd5e1'}`,
      zIndex: 60,
    }),
    menuList: (base) => ({ ...base, maxHeight: 220 }),
    option: (base, state) => ({
      ...base,
      fontSize: 12,
      backgroundColor: state.isFocused ? (isDark ? '#1f2937' : '#f1f5f9') : 'transparent',
      color: isDark ? '#fff' : '#0f172a',
      cursor: 'pointer',
    }),
  };
}

function getStoredValue(key, fallback) {
  if (typeof window === 'undefined') return fallback;

  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function getPhpRate(value) {
  const rate = Number(value);
  return Number.isFinite(rate) && rate > 0 ? rate : 58;
}

function quoteToDisplayAmount(value, currency, phpRate) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return currency === 'PHP' ? number * phpRate : number;
}

function displayToQuoteAmount(value, currency, phpRate) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return currency === 'PHP' ? number / phpRate : number;
}

function formatDisplayMoney(value, currency, phpRate, digits = 2) {
  const amount = quoteToDisplayAmount(value, currency, phpRate);
  if (amount == null) return '---';
  return `${formatMoney(amount, digits)} ${currency}`;
}

function formatLeverage(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return '1x';
  return `${Number(number.toFixed(2))}x`;
}

function getPositiveNumber(value) {
  if (value === null || value === undefined || value === '') return null;

  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function getBacktestMetrics(account, symbol, executionPrice) {
  const positions = Array.isArray(account?.openPositions) ? account.openPositions : [];
  const price = Number(executionPrice);
  const unrealizedPnl = positions.reduce((total, position) => {
    if (!Number.isFinite(price) || position.symbol !== symbol) {
      return total + Number(position.unrealizedPnl ?? 0);
    }

    const quantity = Number(position.quantity);
    const entryPrice = Number(position.entryPrice);
    if (!Number.isFinite(quantity) || !Number.isFinite(entryPrice)) return total;

    const pnl = position.side === 'long'
      ? (price - entryPrice) * quantity
      : (entryPrice - price) * quantity;

    return total + pnl;
  }, 0);
  const lockedMargin = positions.reduce((total, position) => total + Number(position.margin ?? 0), 0);
  const cashBalance = Number(account?.cashBalance ?? 0);

  return {
    cashBalance,
    lockedMargin,
    unrealizedPnl,
    equity: cashBalance + lockedMargin + unrealizedPnl,
  };
}

function getOrderPlan({ side, entryPrice, stopLoss, takeProfit, notional, leverage, cashBalance, feeRate }) {
  const entry = Number(entryPrice);
  const stop = Number(stopLoss);
  const target = Number(takeProfit);
  const requestedMargin = Number(notional);
  let margin = requestedMargin;
  const leverageValue = Number(leverage);
  const feeRateValue = Number.isFinite(Number(feeRate)) ? Number(feeRate) : 0.0004;
  const positionNotional =
    Number.isFinite(margin) && margin > 0 && Number.isFinite(leverageValue) && leverageValue > 0
      ? margin * leverageValue
      : null;

  if (!Number.isFinite(entry) || entry <= 0) {
    return null;
  }

  let effectivePositionNotional = positionNotional;
  let entryFee = effectivePositionNotional ? effectivePositionNotional * feeRateValue : null;
  let requiredCash = margin && entryFee != null ? margin + entryFee : null;
  let adjustedForFee = false;
  const availableCash = Number(cashBalance);

  if (
    Number.isFinite(availableCash) &&
    availableCash > 0 &&
    requiredCash > availableCash &&
    requestedMargin <= availableCash
  ) {
    margin = availableCash / (1 + (leverageValue * feeRateValue));
    effectivePositionNotional = margin * leverageValue;
    entryFee = effectivePositionNotional * feeRateValue;
    requiredCash = margin + entryFee;
    adjustedForFee = true;
  }

  const riskPerUnit =
    Number.isFinite(stop) && stop > 0
      ? side === 'long'
        ? entry - stop
        : stop - entry
      : null;
  const rewardPerUnit =
    Number.isFinite(target) && target > 0
      ? side === 'long'
        ? target - entry
        : entry - target
      : null;
  const quantity = effectivePositionNotional ? effectivePositionNotional / entry : null;
  const riskAmount = quantity && riskPerUnit && riskPerUnit > 0 ? quantity * riskPerUnit : null;
  const rewardAmount = quantity && rewardPerUnit && rewardPerUnit > 0 ? quantity * rewardPerUnit : null;
  const exitFee = effectivePositionNotional ? effectivePositionNotional * feeRateValue : null;
  const totalEstimatedFees = entryFee != null && exitFee != null ? entryFee + exitFee : null;
  const estimatedProfit = rewardAmount != null && totalEstimatedFees != null
    ? rewardAmount - totalEstimatedFees
    : null;
  const estimatedLoss = riskAmount != null && totalEstimatedFees != null
    ? riskAmount + totalEstimatedFees
    : null;

  return {
    margin: Number.isFinite(margin) && margin > 0 ? margin : null,
    requestedMargin: Number.isFinite(requestedMargin) && requestedMargin > 0 ? requestedMargin : null,
    leverage: Number.isFinite(leverageValue) && leverageValue > 0 ? leverageValue : null,
    positionNotional: effectivePositionNotional,
    entryFee,
    requiredCash,
    adjustedForFee,
    quantity,
    riskAmount,
    rewardAmount,
    exitFee,
    estimatedProfit,
    estimatedLoss,
    rr: riskAmount && rewardAmount ? rewardAmount / riskAmount : null,
    isStopValid: riskPerUnit == null || riskPerUnit > 0,
    isTargetValid: rewardPerUnit == null || rewardPerUnit > 0,
  };
}

function getMaxMarginForCash(cashBalance, leverage, feeRate) {
  const cash = Number(cashBalance);
  const leverageValue = Number(leverage);
  const feeRateValue = Number.isFinite(Number(feeRate)) ? Number(feeRate) : 0.0004;

  if (!Number.isFinite(cash) || cash <= 0 || !Number.isFinite(leverageValue) || leverageValue <= 0) {
    return null;
  }

  return cash / (1 + (leverageValue * feeRateValue));
}

function LeverageModal({
  value,
  min = 1,
  max = 125,
  availableCash,
  currencyLabel,
  isDark,
  onConfirm,
  onClose,
}) {
  const [draft, setDraft] = useState(() => {
    const num = Number(value);
    return Number.isFinite(num) && num >= min && num <= max ? Math.round(num) : min;
  });

  const clamp = (num) => Math.min(max, Math.max(min, Math.round(num)));
  const ticks = Array.from({ length: 6 }, (_, i) => Math.round(min + ((max - min) * i) / 5));
  const cashValue = Number(availableCash);
  const maxPositionLabel = Number.isFinite(cashValue)
    ? `${formatMoney(cashValue * draft, 0)} ${currencyLabel ?? 'USDT'}`
    : '---';

  const surfaceClass = isDark ? 'border-gray-700 bg-[#151617] text-white' : 'border-slate-200 bg-white text-slate-900';
  const mutedClass = isDark ? 'text-gray-400' : 'text-slate-500';
  const trackFillClass = isDark ? 'bg-gray-700' : 'bg-slate-200';
  const stepperButtonClass = isDark
    ? 'border-gray-700 bg-black-table-color text-white hover:bg-skin-black-light'
    : 'border-slate-300 bg-white text-slate-900 hover:bg-slate-100';

  return (
    <div className="fixed inset-0 z-[10040] flex items-center justify-center bg-black/40 px-3" data-chart-ui>
      <section className={`w-full max-w-sm overflow-hidden rounded-lg border p-5 shadow-2xl ${surfaceClass}`} role="dialog" aria-modal="true" aria-label="Adjust leverage">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-base font-semibold">Adjust Leverage</h2>
          <button
            type="button"
            onClick={onClose}
            className={`flex h-8 w-8 items-center justify-center rounded transition ${isDark ? 'hover:bg-white/10' : 'hover:bg-slate-100'}`}
            aria-label="Close"
          >
            <X size={18} strokeWidth={1.6} />
          </button>
        </div>

        <div className={`mb-5 flex items-center justify-between rounded-md border px-2 py-2 ${isDark ? 'border-gray-700 bg-black-table-color' : 'border-slate-200 bg-slate-50'}`}>
          <button
            type="button"
            onClick={() => setDraft((current) => clamp(current - 1))}
            disabled={draft <= min}
            className={`flex h-9 w-9 items-center justify-center rounded border text-lg font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${stepperButtonClass}`}
            aria-label="Decrease leverage"
          >
            −
          </button>
          <span className="text-xl font-bold">{draft}x</span>
          <button
            type="button"
            onClick={() => setDraft((current) => clamp(current + 1))}
            disabled={draft >= max}
            className={`flex h-9 w-9 items-center justify-center rounded border text-lg font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${stepperButtonClass}`}
            aria-label="Increase leverage"
          >
            +
          </button>
        </div>

        <input
          type="range"
          min={min}
          max={max}
          step={1}
          value={draft}
          onChange={(event) => setDraft(clamp(Number(event.target.value)))}
          className="mb-1.5 h-1.5 w-full cursor-pointer appearance-none rounded-full accent-amber-400"
        />
        <div className={`mb-5 flex items-center justify-between text-[10px] ${mutedClass}`}>
          {ticks.map((tick) => (
            <span key={tick}>{tick}x</span>
          ))}
        </div>

        <ul className={`mb-5 list-disc space-y-1.5 pl-4 text-[11px] leading-relaxed ${mutedClass}`}>
          <li>Maximum position at current leverage: {maxPositionLabel}.</li>
          <li>Please note that leverage changing will also apply for open positions and open orders.</li>
          <li>
            Selecting higher leverage such as [{Math.max(max - 1, min)}x] increases your liquidation risk. Always manage your risk levels.
          </li>
        </ul>

        <button
          type="button"
          onClick={() => onConfirm(draft)}
          className="h-11 w-full rounded-md bg-[#2962ff] text-sm font-bold text-white transition hover:bg-[#1f52e0]"
        >
          Confirm
        </button>
      </section>
    </div>
  );
}

function AdvancedExitField({ label, help, value, onChange, fieldClass, mutedClass }) {
  const [enabled, setEnabled] = useState(() => Boolean(value));

  return (
    <div>
      <label className="flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => {
            const checked = event.target.checked;
            setEnabled(checked);
            if (!checked) onChange('');
          }}
          className="h-4 w-4 shrink-0 accent-emerald-500"
        />
        <span className="text-sm font-semibold">{label}</span>
      </label>
      {enabled && (
        <div className="mt-2 pl-6">
          <input
            value={value}
            onChange={(event) => onChange(event.target.value)}
            inputMode="decimal"
            autoFocus
            placeholder="e.g. 1.5"
            className={`h-9 w-full rounded border px-3 text-sm outline-none ${fieldClass}`}
          />
          <span className={`mt-1 block text-[11px] leading-4 ${mutedClass}`}>{help}</span>
        </div>
      )}
    </div>
  );
}

function ManagedExitsModal({
  side,
  trailingStopPercent,
  onTrailingStopPercentChange,
  breakEvenTriggerPercent,
  onBreakEvenTriggerPercentChange,
  partialTakeProfitPercent,
  onPartialTakeProfitPercentChange,
  isDark,
  onClose,
}) {
  const surfaceClass = isDark ? 'border-gray-700 bg-[#151617] text-white' : 'border-slate-200 bg-white text-slate-900';
  const fieldClass = isDark
    ? 'border-gray-700 bg-black-table-color text-white placeholder:text-gray-500 focus:border-gray-500'
    : 'border-slate-300 bg-white text-slate-900 placeholder:text-slate-400';
  const mutedClass = isDark ? 'text-gray-400' : 'text-slate-500';
  const segmentBorderClass = isDark ? 'border-gray-700' : 'border-slate-300';

  return (
    <div className="fixed inset-0 z-[10040] flex items-center justify-center bg-black/40 px-3" data-chart-ui>
      <section className={`w-full max-w-sm overflow-hidden rounded-lg border p-5 shadow-2xl ${surfaceClass}`} role="dialog" aria-modal="true" aria-label="Managed exit rules">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">Managed Exits</h2>
          <button
            type="button"
            onClick={onClose}
            className={`flex h-8 w-8 items-center justify-center rounded transition ${isDark ? 'hover:bg-white/10' : 'hover:bg-slate-100'}`}
            aria-label="Close"
          >
            <X size={18} strokeWidth={1.6} />
          </button>
        </div>

        {/* Read-only — reflects the side already chosen in the main order form rather than
            re-toggling it here, which would create a second, confusable source of truth. */}
        <div className={`mb-4 flex h-9 items-center overflow-hidden rounded-full border text-sm font-semibold ${segmentBorderClass}`}>
          <div className={`flex h-full flex-1 items-center justify-center ${side === 'long' ? 'bg-emerald-500 text-white' : mutedClass}`}>Buy/Long</div>
          <div className={`flex h-full flex-1 items-center justify-center ${side === 'short' ? 'bg-red-500 text-white' : mutedClass}`}>Sell/Short</div>
        </div>

        <div className="space-y-4">
          <AdvancedExitField
            label="Trailing Stop"
            value={trailingStopPercent}
            onChange={onTrailingStopPercentChange}
            fieldClass={fieldClass}
            mutedClass={mutedClass}
            help="Stop-loss follows price in your favor, staying this % behind the best price reached since entry. It only tightens, never loosens."
          />
          <AdvancedExitField
            label="Break-even"
            value={breakEvenTriggerPercent}
            onChange={onBreakEvenTriggerPercentChange}
            fieldClass={fieldClass}
            mutedClass={mutedClass}
            help="Once price moves this % in your favor, stop-loss jumps to your entry price so the trade can no longer lose money."
          />
          <AdvancedExitField
            label="Partial Close"
            value={partialTakeProfitPercent}
            onChange={onPartialTakeProfitPercentChange}
            fieldClass={fieldClass}
            mutedClass={mutedClass}
            help="Percent of your position SIZE — not price — to close the first time Take Profit is reached. The rest stays open and Take Profit is cleared."
          />
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-5 h-11 w-full rounded-md bg-[#2962ff] text-sm font-bold text-white transition hover:bg-[#1f52e0]"
        >
          Done
        </button>
      </section>
    </div>
  );
}

function estimatePriceFromPnlPercent(side, entryPrice, leverage, pnlPercent, isLoss) {
  const entry = Number(entryPrice);
  const lev = Math.max(Number(leverage) || 1, 1);
  const pct = Math.abs(Number(pnlPercent));

  if (!Number.isFinite(entry) || entry <= 0 || !Number.isFinite(pct) || pct <= 0) return null;

  const fraction = pct / (100 * lev);
  const signedFraction = isLoss ? -fraction : fraction;
  const price = side === 'long' ? entry * (1 + signedFraction) : entry * (1 - signedFraction);

  return price > 0 ? price : null;
}

function estimatePnlPercentFromPrice(side, entryPrice, leverage, price) {
  const entry = Number(entryPrice);
  const lev = Math.max(Number(leverage) || 1, 1);
  const target = Number(price);

  if (!Number.isFinite(entry) || entry <= 0 || !Number.isFinite(target) || target <= 0) return null;

  const fraction = side === 'long' ? (target - entry) / entry : (entry - target) / entry;

  return fraction * lev * 100;
}

function TpSlAdvancedField({
  label,
  accentClass,
  mode,
  onModeChange,
  priceValue,
  onPriceChange,
  pnlValue,
  onPnlChange,
  previewText,
  fieldClass,
  mutedClass,
  segmentBorderClass,
  isDark,
}) {
  const activeSegmentClass = isDark ? 'bg-white text-skin-black' : 'bg-skin-black text-white';

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className={`text-sm font-semibold ${accentClass}`}>{label}</span>
        <div className={`flex h-6 overflow-hidden rounded border text-[10px] font-semibold ${segmentBorderClass}`}>
          <button
            type="button"
            onClick={() => onModeChange('price')}
            className={`px-2 transition ${mode === 'price' ? activeSegmentClass : mutedClass}`}
          >
            Price
          </button>
          <button
            type="button"
            onClick={() => onModeChange('pnl')}
            className={`px-2 transition ${mode === 'pnl' ? activeSegmentClass : mutedClass}`}
          >
            PnL %
          </button>
        </div>
      </div>
      <input
        value={mode === 'price' ? priceValue : pnlValue}
        onChange={(event) => (mode === 'price' ? onPriceChange(event.target.value) : onPnlChange(event.target.value))}
        inputMode="decimal"
        autoFocus
        placeholder={mode === 'price' ? 'Trigger price' : 'PnL % of margin'}
        className={`h-9 w-full rounded border px-3 text-sm outline-none ${fieldClass}`}
      />
      <span className={`mt-1 block text-[11px] leading-4 ${mutedClass}`}>{previewText}</span>
    </div>
  );
}

function AdvancedTpSlModal({
  side,
  entryPrice,
  leverage,
  stopLossMode,
  onStopLossModeChange,
  stopLossPrice,
  onStopLossPriceChange,
  stopLossPnl,
  onStopLossPnlChange,
  takeProfitMode,
  onTakeProfitModeChange,
  takeProfitPrice,
  onTakeProfitPriceChange,
  takeProfitPnl,
  onTakeProfitPnlChange,
  isDark,
  onClose,
}) {
  const surfaceClass = isDark ? 'border-gray-700 bg-[#151617] text-white' : 'border-slate-200 bg-white text-slate-900';
  const fieldClass = isDark
    ? 'border-gray-700 bg-black-table-color text-white placeholder:text-gray-500 focus:border-gray-500'
    : 'border-slate-300 bg-white text-slate-900 placeholder:text-slate-400';
  const mutedClass = isDark ? 'text-gray-400' : 'text-slate-500';
  const segmentBorderClass = isDark ? 'border-gray-700' : 'border-slate-300';

  const stopLossPreview = stopLossMode === 'price'
    ? (() => {
        const pct = estimatePnlPercentFromPrice(side, entryPrice, leverage, stopLossPrice);
        return pct != null ? `≈ ${pct.toFixed(2)}% PnL at this price` : 'Enter a trigger price';
      })()
    : (() => {
        const price = estimatePriceFromPnlPercent(side, entryPrice, leverage, stopLossPnl, true);
        return price != null ? `≈ Triggers at ${price.toFixed(price < 1 ? 8 : 2)}` : 'Enter a % of margin to lose';
      })();

  const takeProfitPreview = takeProfitMode === 'price'
    ? (() => {
        const pct = estimatePnlPercentFromPrice(side, entryPrice, leverage, takeProfitPrice);
        return pct != null ? `≈ ${pct.toFixed(2)}% PnL at this price` : 'Enter a trigger price';
      })()
    : (() => {
        const price = estimatePriceFromPnlPercent(side, entryPrice, leverage, takeProfitPnl, false);
        return price != null ? `≈ Triggers at ${price.toFixed(price < 1 ? 8 : 2)}` : 'Enter a % of margin to gain';
      })();

  return (
    <div className="fixed inset-0 z-[10040] flex items-center justify-center bg-black/40 px-3" data-chart-ui>
      <section className={`w-full max-w-sm overflow-hidden rounded-lg border p-5 shadow-2xl ${surfaceClass}`} role="dialog" aria-modal="true" aria-label="Take profit and stop loss">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">Take Profit / Stop Loss</h2>
          <button
            type="button"
            onClick={onClose}
            className={`flex h-8 w-8 items-center justify-center rounded transition ${isDark ? 'hover:bg-white/10' : 'hover:bg-slate-100'}`}
            aria-label="Close"
          >
            <X size={18} strokeWidth={1.6} />
          </button>
        </div>

        <div className="space-y-4">
          <TpSlAdvancedField
            label="Take Profit"
            accentClass="text-emerald-500"
            mode={takeProfitMode}
            onModeChange={onTakeProfitModeChange}
            priceValue={takeProfitPrice}
            onPriceChange={onTakeProfitPriceChange}
            pnlValue={takeProfitPnl}
            onPnlChange={onTakeProfitPnlChange}
            previewText={takeProfitPreview}
            fieldClass={fieldClass}
            mutedClass={mutedClass}
            segmentBorderClass={segmentBorderClass}
            isDark={isDark}
          />
          <TpSlAdvancedField
            label="Stop Loss"
            accentClass="text-red-500"
            mode={stopLossMode}
            onModeChange={onStopLossModeChange}
            priceValue={stopLossPrice}
            onPriceChange={onStopLossPriceChange}
            pnlValue={stopLossPnl}
            onPnlChange={onStopLossPnlChange}
            previewText={stopLossPreview}
            fieldClass={fieldClass}
            mutedClass={mutedClass}
            segmentBorderClass={segmentBorderClass}
            isDark={isDark}
          />
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-5 h-11 w-full rounded-md bg-[#2962ff] text-sm font-bold text-white transition hover:bg-[#1f52e0]"
        >
          Done
        </button>
      </section>
    </div>
  );
}

export default function ReplayPanel({
  marketCategory,
  replayMode,
  replayAccessStatus = 'idle',
  replayAccessError = '',
  liveConnectionStatus = 'polling',
  isPlaying,
  followReplay,
  isReplayPricePickActive,
  playbackSpeed,
  replayIndex,
  candleCount,
  tool,
  drawingColor,
  drawings,
  drawingSaveStatus = 'saved',
  selectedDrawingId,
  selectedDrawing,
  toolSettings,
  onStepBackward,
  onTogglePlay,
  onStepForward,
  onResetReplay,
  onFollowReplay,
  onToggleReplayPricePick,
  onRetryReplayAccess,
  onPlaybackSpeedChange,
  onToolChange,
  onReadyToolChange,
  onDrawingColorChange,
  onDrawingWidthChange,
  onDrawingLineStyleChange,
  onDrawingLabelChange,
  onSaveSelectedToolPreset,
  onApplyToolPreset,
  onDeleteToolPreset,
  onClearDrawings,
  onDuplicateSelectedDrawing,
  onDeleteSelectedDrawing,
  allDrawingsLocked,
  onToggleLockAllDrawings,
  hiddenLayers,
  onToggleVisibility,
  onStartBacktestSession,
  onEndBacktestSession,
  symbol,
  timeframe,
  executionPrice,
  backtestAccount,
  backtestError,
  isBacktestLoading,
  onOpenBacktestPosition,
  onCloseBacktestPosition,
  onCancelBacktestPosition,
  orderLineDraftPatch,
  orderEntryRequest,
  orderDraftClearRequest,
  onBacktestOrderDraftChange,
  chartTheme,
  overlayWidth,
  fullscreenDrawingOnly = false,
  groupedWorkspaceRail = false,
  fullscreenEntryPanelOpen = false,
  onFullscreenEntryPanelOpenChange,
  className = '',
}) {
  const { auth } = usePage().props;
  const preferenceUserId = auth?.user?.id ?? 'guest';
  const displayCurrencyStorageKey = `market-backtest-display-currency:${preferenceUserId}`;
  const phpRateStorageKey = `market-backtest-php-rate:${preferenceUserId}`;
  const isSpot = marketCategory === 'spot';
  const panelRootRef = useRef(null);
  const [activeGroup, setActiveGroup] = useState(null);
  const [activeEditorMenu, setActiveEditorMenu] = useState(null);
  const [presetNameDraft, setPresetNameDraft] = useState('');
  const [orderType, setOrderType] = useState('market');
  const [orderSide, setOrderSide] = useState('long');
  const [showLeverageModal, setShowLeverageModal] = useState(false);
  const [orderNotional, setOrderNotional] = useState('');
  const [orderLeverage, setOrderLeverage] = useState('1');
  const [orderEntryPrice, setOrderEntryPrice] = useState('');
  const [orderStopLoss, setOrderStopLoss] = useState('');
  const [orderStopLossMode, setOrderStopLossMode] = useState('price');
  const [orderStopLossPnl, setOrderStopLossPnl] = useState('');
  const [orderTakeProfit, setOrderTakeProfit] = useState('');
  const [orderTakeProfitMode, setOrderTakeProfitMode] = useState('price');
  const [orderTakeProfitPnl, setOrderTakeProfitPnl] = useState('');
  const [tpSlEnabled, setTpSlEnabled] = useState(false);
  const [playbooks, setPlaybooks] = useState([]);
  const [selectedPlaybookId, setSelectedPlaybookId] = useState('');
  const [checklistAnswers, setChecklistAnswers] = useState([]);
  const [trailingStopPercent, setTrailingStopPercent] = useState('');
  const [breakEvenTriggerPercent, setBreakEvenTriggerPercent] = useState('');
  const [partialTakeProfitPercent, setPartialTakeProfitPercent] = useState('');
  const [showManagedExitsModal, setShowManagedExitsModal] = useState(false);
  const [showAdvancedTpSlModal, setShowAdvancedTpSlModal] = useState(false);
  const [showCurrencySettings, setShowCurrencySettings] = useState(false);
  const [showOrderDraft, setShowOrderDraft] = useState(false);
  const [displayCurrency, setDisplayCurrency] = useState(() => (
    getStoredValue(displayCurrencyStorageKey, 'USDT') === 'PHP' ? 'PHP' : 'USDT'
  ));
  const [phpRate, setPhpRate] = useState(() => getStoredValue(phpRateStorageKey, '58'));
  const wasFullscreenDrawingOnlyRef = React.useRef(fullscreenDrawingOnly);

  const resetTpSlDraft = () => {
    setOrderStopLoss('');
    setOrderStopLossMode('price');
    setOrderStopLossPnl('');
    setOrderTakeProfit('');
    setOrderTakeProfitMode('price');
    setOrderTakeProfitPnl('');
  };

  useEffect(() => {
    let cancelled = false;
    const loadPlaybooks = () => {
      axios.get('/market-backtest/playbooks', { headers: { Accept: 'application/json' } })
        .then((response) => {
          if (!cancelled) setPlaybooks(response.data?.playbooks ?? []);
        })
        .catch(() => {
          if (!cancelled) setPlaybooks([]);
        });
    };
    loadPlaybooks();
    const unsubscribe = subscribeToChange('backtradelab-playbooks-changed', loadPlaybooks);
    return () => { cancelled = true; unsubscribe(); };
  }, []);

  useEffect(() => {
    if (selectedPlaybookId && !playbooks.some((item) => String(item.id) === String(selectedPlaybookId))) {
      setSelectedPlaybookId('');
    }
  }, [playbooks, selectedPlaybookId]);

  useEffect(() => {
    if (isSpot) {
      setOrderSide('long');
      setOrderLeverage('1');
    }
  }, [isSpot]);

  const selectedPlaybook = playbooks.find((item) => String(item.id) === String(selectedPlaybookId)) ?? null;
  const playbookOptions = [
    { value: '', label: 'No playbook' },
    ...playbooks.map((playbook) => ({ value: String(playbook.id), label: playbook.name })),
  ];
  const selectedPlaybookOption = playbookOptions.find((option) => option.value === String(selectedPlaybookId)) ?? playbookOptions[0];

  useEffect(() => {
    setChecklistAnswers((selectedPlaybook?.checklist ?? []).map(() => false));
  }, [selectedPlaybookId]);

  // The Enter Position header button (fullscreenEntryPanelOpen, set from the
  // chart header) drives the 'backtest' group in both fullscreenDrawingOnly
  // (fullscreen) and groupedWorkspaceRail (normal) modes now — the header
  // button is the only trigger for this panel in either mode, matching the
  // rail, which no longer has its own separate Enter Position icon.
  const entryPanelControlledMode = fullscreenDrawingOnly || groupedWorkspaceRail;
  useEffect(() => {
    if (!entryPanelControlledMode) {
      if (wasFullscreenDrawingOnlyRef.current) {
        setActiveGroup((current) => current === 'backtest' ? null : current);
        setShowOrderDraft(false);
        setOrderEntryPrice('');
        resetTpSlDraft();
        setTpSlEnabled(false);
        onBacktestOrderDraftChange?.(null);
      }
      wasFullscreenDrawingOnlyRef.current = false;
      return;
    }
    wasFullscreenDrawingOnlyRef.current = true;
    setActiveGroup((current) => {
      if (fullscreenEntryPanelOpen) return 'backtest';
      return current === 'backtest' ? null : current;
    });
    if (!fullscreenEntryPanelOpen) {
      setShowOrderDraft(false);
      setOrderEntryPrice('');
      resetTpSlDraft();
      setTpSlEnabled(false);
      onBacktestOrderDraftChange?.(null);
    }
  }, [entryPanelControlledMode, fullscreenEntryPanelOpen, onBacktestOrderDraftChange]);

  const handleToolChange = (nextTool) => {
    onToolChange((currentTool) => (currentTool === nextTool ? null : nextTool));
    if (fullscreenDrawingOnly) setActiveGroup(null);
  };

  const editorType = selectedDrawing?.type ?? tool;
  const editorLabel = getToolLabel(editorType);
  const editorSettings = editorType && toolSettings?.[editorType]
    ? toolSettings[editorType]
    : {};
  const presetItems = Array.isArray(toolSettings?.presets?.[editorType])
    ? toolSettings.presets[editorType]
    : [];
  const canUsePresets = PRESET_TOOL_TYPES.includes(editorType);
  const selectedPresetName = (
    TEXT_MARKER_TYPES.includes(selectedDrawing?.type)
      ? selectedDrawing?.text
      : selectedDrawing?.labelText
  )?.trim();
  const activeColor = selectedDrawing?.color ?? editorSettings.color ?? drawingColor;
  const activeStrokeWidth = selectedDrawing?.strokeWidth ?? editorSettings.strokeWidth ?? 1;
  const activeLineStyle = selectedDrawing?.lineStyle ?? editorSettings.lineStyle ?? 'solid';
  const activeLabelText = selectedDrawing?.labelText ?? editorSettings.labelText ?? '';
  const activeText = selectedDrawing?.text ?? activeLabelText;
  const activeTextBold = Boolean(selectedDrawing?.textBold ?? editorSettings.textBold ?? false);
  const activeTextItalic = Boolean(selectedDrawing?.textItalic ?? editorSettings.textItalic ?? false);
  const activeLabelVertical = selectedDrawing?.labelVertical ?? editorSettings.labelVertical ?? 'top';
  const activeLabelHorizontal = selectedDrawing?.labelHorizontal ?? editorSettings.labelHorizontal ?? 'center';
  const canEditWidth = WIDTH_TOOL_TYPES.includes(editorType);
  const canEditLineStyle = LINE_STYLE_TOOL_TYPES.includes(editorType);
  const canEditLabel = LABEL_TOOL_TYPES.includes(editorType);
  const canEditText = TEXT_MARKER_TYPES.includes(editorType);
  const canEditColor = COLOR_TOOL_TYPES.includes(editorType);
  const hasToolEditor = Boolean(editorType);
  const activeToolIcon = useMemo(() => {
    return TOOL_BUTTONS.find((item) => item.type === tool)?.icon ?? MousePointer2;
  }, [tool]);

  useEffect(() => {
    if (selectedDrawing || tool) {
      setActiveGroup('tool-editor');
    }
  }, [selectedDrawingId, selectedDrawing, tool]);

  useEffect(() => {
    setActiveEditorMenu(null);
  }, [editorType]);

  useEffect(() => {
    setPresetNameDraft(selectedPresetName ?? '');
  }, [selectedPresetName, selectedDrawingId]);

  useEffect(() => {
    try {
      localStorage.setItem(displayCurrencyStorageKey, displayCurrency);
    } catch {}
  }, [displayCurrency, displayCurrencyStorageKey]);

  useEffect(() => {
    try {
      localStorage.setItem(phpRateStorageKey, phpRate);
    } catch {}
  }, [phpRate, phpRateStorageKey]);

  useEffect(() => {
    if (!orderLineDraftPatch) return;

    if (orderLineDraftPatch.kind === 'entry') {
      setOrderEntryPrice(orderLineDraftPatch.value);
    }

    if (orderLineDraftPatch.kind === 'sl') {
      setOrderStopLoss(orderLineDraftPatch.value);
      setOrderStopLossMode('price');
      setTpSlEnabled(true);
    }

    if (orderLineDraftPatch.kind === 'tp') {
      setOrderTakeProfit(orderLineDraftPatch.value);
      setOrderTakeProfitMode('price');
      setTpSlEnabled(true);
    }
  }, [orderLineDraftPatch]);

  useEffect(() => {
    const requestedPrice = getPositiveNumber(orderEntryRequest?.price);
    if (!orderEntryRequest?.id || requestedPrice == null) return;

    setOrderType('limit');
    setOrderEntryPrice(String(Number(requestedPrice.toFixed(8))));
    setShowOrderDraft(true);
    setActiveGroup('backtest');
    if (fullscreenDrawingOnly) onFullscreenEntryPanelOpenChange?.(true);
  }, [fullscreenDrawingOnly, onFullscreenEntryPanelOpenChange, orderEntryRequest]);

  useEffect(() => {
    if (!orderDraftClearRequest?.id) return;
    setShowOrderDraft(false);
    setOrderEntryPrice('');
    resetTpSlDraft();
    setTpSlEnabled(false);
    onBacktestOrderDraftChange?.(null);
  }, [onBacktestOrderDraftChange, orderDraftClearRequest]);

  const toggleGroup = (group) => {
    if (activeGroup === 'backtest') {
      setShowOrderDraft(false);
      setOrderEntryPrice('');
      resetTpSlDraft();
      setTpSlEnabled(false);
      onBacktestOrderDraftChange?.(null);
    }
    setActiveGroup((currentGroup) => (currentGroup === group ? null : group));
    if (fullscreenDrawingOnly && group !== 'backtest') {
      onFullscreenEntryPanelOpenChange?.(false);
    }
  };

  // Same outside-click pattern as ChartHeader.jsx's dropdowns (data-chart-ui
  // marker + a guarded document mousedown listener). Scoped only to the Tools
  // picker (the flat list and each group's own flyout, e.g. Fibonacci) — not
  // 'backtest' (Enter Position has its own "click chart to pick a price"
  // feature) or 'tool-editor' (TopToolEditorBar, a different kind of surface).
  // Picking a tool from the flyout doesn't clear `tool` itself, so closing the
  // picker here never interrupts placing a drawing — only the picker's own
  // visibility is affected.
  useEffect(() => {
    const toolsFlyoutOpen = activeGroup === 'tools' || (typeof activeGroup === 'string' && activeGroup.startsWith('tools:'));
    if (!toolsFlyoutOpen) return undefined;
    const handleOutsideClick = (event) => {
      if (event.target?.closest?.('[data-chart-ui="tools-flyout"]')) return;
      setActiveGroup(null);
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [activeGroup]);

  const handleSavePreset = () => {
    onSaveSelectedToolPreset(presetNameDraft);
    setPresetNameDraft('');
  };

  const ActiveToolIcon = activeToolIcon;
  const quoteCurrency = backtestAccount?.quoteCurrency ?? 'USDT';
  const normalizedPhpRate = getPhpRate(phpRate);
  const formatAccountMoney = (value, digits = 2) => formatDisplayMoney(
    value,
    displayCurrency,
    normalizedPhpRate,
    digits
  );
  const handleDisplayCurrencyChange = (nextCurrency) => {
    const normalizedCurrency = nextCurrency === 'PHP' ? 'PHP' : 'USDT';
    const currentQuoteNotional = displayToQuoteAmount(orderNotional, displayCurrency, normalizedPhpRate);
    const nextDisplayNotional = quoteToDisplayAmount(
      currentQuoteNotional,
      normalizedCurrency,
      normalizedPhpRate
    );

    setDisplayCurrency(normalizedCurrency);
    if (nextDisplayNotional != null) {
      setOrderNotional(String(Number(nextDisplayNotional.toFixed(2))));
    }
  };
  const backtestMetrics = getBacktestMetrics(backtestAccount, symbol, executionPrice);
  const handleMarginPercentClick = (pct) => {
    const displayAmount = quoteToDisplayAmount(backtestMetrics.cashBalance * pct, displayCurrency, normalizedPhpRate);
    if (displayAmount != null) {
      setOrderNotional(String(Number(Math.max(displayAmount, 0).toFixed(2))));
    }
  };
  const currentExecutionPrice = getPositiveNumber(executionPrice);
  const customEntryPrice = getPositiveNumber(orderEntryPrice);
  const canTrade = currentExecutionPrice != null && !isBacktestLoading;
  const hasCustomEntryPrice = customEntryPrice != null;
  const isPendingOrder = orderType === 'limit' || orderType === 'trigger' || orderType === 'conditional';
  const effectiveEntryPrice = hasCustomEntryPrice ? customEntryPrice : currentExecutionPrice;
  const quoteNotional = displayToQuoteAmount(orderNotional, displayCurrency, normalizedPhpRate);
  const leverageValue = Number(orderLeverage);
  const isLeverageValid = Number.isFinite(leverageValue) && leverageValue >= 1 && leverageValue <= 125;
  const feeRate = Number(backtestAccount?.feeRate ?? 0.0004);
  const plannedStopLossPnlPrice = orderStopLossMode === 'pnl'
    ? estimatePriceFromPnlPercent(orderSide, effectiveEntryPrice, leverageValue, orderStopLossPnl, true)
    : null;
  const plannedTakeProfitPnlPrice = orderTakeProfitMode === 'pnl'
    ? estimatePriceFromPnlPercent(orderSide, effectiveEntryPrice, leverageValue, orderTakeProfitPnl, false)
    : null;
  const plannedStopLoss = !tpSlEnabled ? null : (
    orderStopLossMode === 'pnl'
      ? plannedStopLossPnlPrice
      : getPositiveNumber(orderStopLoss) ?? (
          effectiveEntryPrice != null
            ? orderSide === 'short'
              ? effectiveEntryPrice * 1.01
              : effectiveEntryPrice * 0.99
            : null
        )
  );
  const plannedTakeProfit = !tpSlEnabled ? null : (
    orderTakeProfitMode === 'pnl'
      ? plannedTakeProfitPnlPrice
      : getPositiveNumber(orderTakeProfit) ?? (
          effectiveEntryPrice != null
            ? orderSide === 'short'
              ? effectiveEntryPrice * 0.99
              : effectiveEntryPrice * 1.01
            : null
        )
  );
  const orderPlan = getOrderPlan({
    side: orderSide,
    entryPrice: effectiveEntryPrice,
    stopLoss: plannedStopLoss,
    takeProfit: plannedTakeProfit,
    notional: quoteNotional,
    leverage: leverageValue,
    cashBalance: backtestMetrics.cashBalance,
    feeRate,
  });
  const canSubmitOrder =
    canTrade &&
    Number.isFinite(Number(quoteNotional)) &&
    Number(quoteNotional) > 0 &&
    isLeverageValid &&
    effectiveEntryPrice != null &&
    orderPlan?.margin != null &&
    orderPlan.margin >= 1 &&
    orderPlan?.requiredCash != null &&
    orderPlan.requiredCash <= backtestMetrics.cashBalance + 0.00000001 &&
    (!isPendingOrder || hasCustomEntryPrice) &&
    (orderPlan?.isStopValid ?? true) &&
    (orderPlan?.isTargetValid ?? true) &&
    (!selectedPlaybook || checklistAnswers.length === selectedPlaybook.checklist.length) &&
    (!selectedPlaybook || checklistAnswers.every(Boolean));
  const managedExitCount = [trailingStopPercent, breakEvenTriggerPercent, partialTakeProfitPercent].filter(Boolean).length;

  const submitBacktestOrder = () => {
    const notional = Number(quoteNotional);
    if (!canSubmitOrder || !Number.isFinite(notional) || notional <= 0) return;

    onOpenBacktestPosition({
      side: orderSide,
      orderType,
      notional,
      leverage: leverageValue,
      entryPrice: effectiveEntryPrice,
      stopLoss: orderStopLossMode === 'pnl' ? null : plannedStopLoss,
      stopLossPnlPercent: orderStopLossMode === 'pnl' && plannedStopLoss != null ? getPositiveNumber(orderStopLossPnl) : null,
      takeProfit: orderTakeProfitMode === 'pnl' ? null : plannedTakeProfit,
      takeProfitPnlPercent: orderTakeProfitMode === 'pnl' && plannedTakeProfit != null ? getPositiveNumber(orderTakeProfitPnl) : null,
      playbookId: selectedPlaybook?.id ?? null,
      checklistAnswers,
      trailingStopPercent,
      breakEvenTriggerPercent,
      partialTakeProfitPercent,
    });
    setChecklistAnswers((current) => current.map(() => false));
    setShowOrderDraft(false);
  };
  const removeOrderDraft = () => {
    setShowOrderDraft(false);
    setOrderEntryPrice('');
    resetTpSlDraft();
    setTpSlEnabled(false);
    onBacktestOrderDraftChange?.(null);
  };
  const isDarkTheme = chartTheme?.mode === 'dark';
  const sectionBorderClass = isDarkTheme ? 'border-gray-800' : 'border-slate-200';
  const mutedTextClass = isDarkTheme ? 'text-gray-500' : 'text-slate-500';
  const labelTextClass = isDarkTheme ? 'text-gray-400' : 'text-slate-600';
  const valueTextClass = isDarkTheme ? 'text-white' : 'text-slate-900';
  const cardSurfaceClass = isDarkTheme
    ? 'border-gray-700 bg-black-table-color'
    : 'border-slate-200 bg-slate-50';
  const fieldClass = isDarkTheme
    ? 'border-gray-700 bg-black-table-color text-white placeholder:text-gray-500 focus:border-gray-500'
    : 'border-slate-300 bg-white text-slate-900 placeholder:text-slate-400';
  const invalidFieldClass = isDarkTheme
    ? 'border-red-500 bg-black-table-color text-white placeholder:text-gray-500'
    : 'border-red-500 bg-white text-slate-900 placeholder:text-slate-400';
  const neutralToggleClass = (active) => (
    active
      ? isDarkTheme
        ? 'bg-white text-skin-black'
        : 'bg-skin-black text-white'
      : isDarkTheme
        ? 'border border-gray-700 bg-black-table-color text-gray-200 hover:bg-skin-black-light hover:text-white'
        : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
  );

  useEffect(() => {
    onBacktestOrderDraftChange?.({
      visible: activeGroup === 'backtest' && showOrderDraft,
      orderType,
      side: orderSide,
      entryPrice: orderEntryPrice,
      stopLoss: plannedStopLoss,
      takeProfit: plannedTakeProfit,
      effectiveEntryPrice,
      isPendingOrder,
      estimatedProfit: orderPlan?.estimatedProfit ?? null,
      estimatedLoss: orderPlan?.estimatedLoss ?? null,
      quoteCurrency,
    });
  }, [
    activeGroup,
    effectiveEntryPrice,
    isPendingOrder,
    onBacktestOrderDraftChange,
    orderEntryPrice,
    orderPlan?.estimatedLoss,
    orderPlan?.estimatedProfit,
    orderSide,
    orderStopLoss,
    orderStopLossMode,
    orderStopLossPnl,
    orderTakeProfit,
    orderTakeProfitMode,
    orderTakeProfitPnl,
    orderType,
    quoteCurrency,
    showOrderDraft,
    tpSlEnabled,
  ]);

  return (
    <div
      ref={panelRootRef}
      className={`pointer-events-none flex items-start ${className}`}
      style={{ '--replay-panel-content-width': `${Math.max((Number(overlayWidth) || 0) - 164, 140)}px` }}
    >
      <div
        className={`pointer-events-auto flex flex-col gap-2 border px-0.5 py-1.5 shadow-2xl backdrop-blur ${
          fullscreenDrawingOnly || groupedWorkspaceRail
            ? 'h-full rounded-none border-b-0 border-l-0 border-r-0 border-t-0'
            : 'rounded-lg'
        } ${
          fullscreenDrawingOnly || groupedWorkspaceRail ? 'overflow-y-auto overflow-x-hidden scrollbar-none' : ''
        }`}
        style={getPanelStyle(chartTheme)}
      >
        {(fullscreenDrawingOnly || groupedWorkspaceRail) && (
          <div className="flex w-12 items-center justify-center">
            <RailButton
              icon={Play}
              active={activeGroup === 'replay' || replayMode || isPlaying}
              disabled={replayAccessStatus === 'checking-access'}
              title={replayMode ? 'Replay Controls' : 'Start Replay'}
              onClick={() => toggleGroup('replay')}
              chartTheme={chartTheme}
            />
          </div>
        )}
        {(fullscreenDrawingOnly || groupedWorkspaceRail) ? TOOL_GROUPS.map((group, index) => (
          <ToolGroupRailItem
            key={group.name}
            group={group}
            tool={tool}
            toolSettings={toolSettings}
            handleToolChange={handleToolChange}
            toggleGroup={toggleGroup}
            chartTheme={chartTheme}
            isDarkTheme={isDarkTheme}
            dataTour={index === 0 ? 'drawings' : undefined}
          />
        )) : (
          <>
            <RailButton
              icon={Play}
              active={activeGroup === 'replay' || replayMode || isPlaying}
              disabled={replayAccessStatus === 'checking-access'}
              title={replayMode ? 'Replay Controls' : 'Start Replay'}
              onClick={() => toggleGroup('replay')}
              chartTheme={chartTheme}
            />
            <RailButton
              icon={ActiveToolIcon}
              active={activeGroup === 'tools' || Boolean(tool)}
              title="Drawing Tools"
              dataChartUi="tools-flyout"
              onClick={() => toggleGroup('tools')}
              chartTheme={chartTheme}
            />
            <RailButton
              icon={Wallet}
              active={activeGroup === 'backtest'}
              title="Enter Position"
              onClick={() => toggleGroup('backtest')}
              chartTheme={chartTheme}
            />
          </>
        )}
        <div className={`flex items-center ${(fullscreenDrawingOnly || groupedWorkspaceRail) ? 'w-12 justify-center' : ''}`}>
          <RailButton
            icon={Palette}
            active={activeGroup === 'tool-editor'}
            disabled={!hasToolEditor}
            title="Tool Style and Templates"
            onClick={() => toggleGroup('tool-editor')}
            chartTheme={chartTheme}
          />
        </div>
        {(fullscreenDrawingOnly || groupedWorkspaceRail) && (
          <div className="flex w-12 items-center justify-center">
            <RailButton
              icon={allDrawingsLocked ? Lock : Unlock}
              active={allDrawingsLocked}
              title={allDrawingsLocked ? 'Unlock all drawings' : 'Lock all drawings'}
              onClick={onToggleLockAllDrawings}
              chartTheme={chartTheme}
            />
          </div>
        )}
        {(fullscreenDrawingOnly || groupedWorkspaceRail) && (
          <div className="flex w-12 items-center justify-center">
            <RailButton
              icon={(hiddenLayers?.drawings || hiddenLayers?.indicators || hiddenLayers?.positions) ? EyeOff : Eye}
              active={activeGroup === 'visibility'}
              title="Show/Hide"
              onClick={() => toggleGroup('visibility')}
              chartTheme={chartTheme}
            />
          </div>
        )}
        {(fullscreenDrawingOnly || groupedWorkspaceRail) && (
          <div className="flex w-12 items-center justify-center">
            <RailButton
              icon={Trash2}
              disabled={!drawings.length}
              title="Clear Drawings"
              onClick={onClearDrawings}
              chartTheme={chartTheme}
            />
          </div>
        )}
      </div>

      {(fullscreenDrawingOnly || groupedWorkspaceRail) && TOOL_GROUPS.map((group) => (
        activeGroup === `tools:${group.name}` ? (
          <div key={group.name} className="pointer-events-auto" data-chart-ui="tools-flyout">
            <Flyout title={group.name} icon={group.groupIcon ?? TOOL_BUTTONS.find((item) => item.type === group.tools[0])?.icon} onClose={() => setActiveGroup(null)} chartTheme={chartTheme}>
              {group.sections ? (
                <div className="space-y-1">
                  {group.sections.map((section, sectionIndex) => (
                    <React.Fragment key={section.title}>
                      {sectionIndex > 0 && <div className={`my-2 border-t ${isDarkTheme ? 'border-gray-800' : 'border-slate-200'}`} />}
                      <div className={`mb-2 text-[10px] font-semibold uppercase tracking-wide ${mutedTextClass}`}>{section.title}</div>
                      <div className="grid grid-cols-1 gap-2">
                        {section.tools.map((toolType) => {
                          const item = TOOL_BUTTONS.find((candidate) => candidate.type === toolType);
                          if (!item) return null;
                          return (
                            <ControlButton
                              key={item.type}
                              icon={item.icon}
                              onClick={() => { onReadyToolChange?.(group.name, item.type); handleToolChange(item.type); }}
                              active={tool === item.type}
                              className="w-full justify-start"
                              chartTheme={chartTheme}
                            >
                              {item.label}
                            </ControlButton>
                          );
                        })}
                      </div>
                    </React.Fragment>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2">
                  {group.tools.map((toolType) => {
                    const item = TOOL_BUTTONS.find((candidate) => candidate.type === toolType);
                    if (!item) return null;
                    return (
                      <ControlButton
                        key={item.type}
                        icon={item.icon}
                        onClick={() => { onReadyToolChange?.(group.name, item.type); handleToolChange(item.type); }}
                        active={tool === item.type}
                        className="w-full justify-start"
                        chartTheme={chartTheme}
                      >
                        {item.label}
                      </ControlButton>
                    );
                  })}
                </div>
              )}
            </Flyout>
          </div>
        ) : null
      ))}

      {activeGroup === 'replay' && (
        <div className="pointer-events-auto">
          <Flyout title="Replay" icon={Play} onClose={() => setActiveGroup(null)} chartTheme={chartTheme}>
            {!replayMode && (
              <ControlButton
                icon={replayAccessStatus === 'checking-access' ? LoaderCircle : Crosshair}
                onClick={onToggleReplayPricePick}
                disabled={replayAccessStatus === 'checking-access'}
                variant={isReplayPricePickActive ? 'warning' : 'primary'}
                className="w-full"
                chartTheme={chartTheme}
              >
                {replayAccessStatus === 'checking-access'
                  ? 'Checking replay access…'
                  : isReplayPricePickActive
                    ? 'Click a candle to start'
                    : 'Start Replay'}
              </ControlButton>
            )}

            {replayAccessError && (
              <div className="rounded-md border border-red-500/40 bg-red-500/10 p-2 text-[11px] text-red-400">
                <div>{replayAccessError}</div>
                <button type="button" onClick={onRetryReplayAccess} className="mt-1 font-semibold underline">
                  Try again
                </button>
              </div>
            )}

            <div className="grid grid-cols-3 gap-2">
              <ControlButton icon={SkipBack} onClick={onStepBackward} disabled={replayAccessStatus === 'checking-access'} className="px-0" title="Back" chartTheme={chartTheme}>
                <span className="sr-only">Back</span>
              </ControlButton>
              <ControlButton
                icon={isPlaying ? Pause : Play}
                onClick={onTogglePlay}
                disabled={replayAccessStatus === 'checking-access'}
                variant="primary"
                chartTheme={chartTheme}
              >
                {isPlaying ? 'Pause' : 'Play'}
              </ControlButton>
              <ControlButton icon={SkipForward} onClick={onStepForward} disabled={replayAccessStatus === 'checking-access'} className="px-0" title="Forward" chartTheme={chartTheme}>
                <span className="sr-only">Forward</span>
              </ControlButton>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <ControlButton icon={RotateCcw} onClick={onResetReplay} variant="danger" chartTheme={chartTheme}>
                {replayMode ? 'Reset' : 'Go Latest'}
              </ControlButton>
              <ControlButton
                icon={LocateFixed}
                onClick={onFollowReplay}
                active={followReplay}
                variant={followReplay ? 'success' : 'neutral'}
                chartTheme={chartTheme}
              >
                {replayMode && followReplay ? 'Following' : 'Follow'}
              </ControlButton>
            </div>

            <ControlButton
              icon={Crosshair}
              onClick={onToggleReplayPricePick}
              disabled={replayAccessStatus === 'checking-access'}
              active={isReplayPricePickActive}
              variant={isReplayPricePickActive ? 'warning' : 'neutral'}
              className="w-full"
              chartTheme={chartTheme}
            >
              {isReplayPricePickActive ? 'Pick Price' : 'Set Replay Price'}
            </ControlButton>

            <div className={`flex h-8 items-center justify-center rounded-md border px-2 text-xs ${isDarkTheme ? 'border-gray-700 bg-black-table-color text-gray-300' : 'border-slate-300 text-slate-600'}`}>
              {replayMode
                ? `Candle ${Math.min(replayIndex + 1, candleCount)} / ${candleCount}`
                : `Live candles ${candleCount}`}
            </div>

            <div className={`space-y-2 border-t pt-3 ${sectionBorderClass}`}>
              <div className={`flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide ${labelTextClass}`}>
                <Gauge size={13} />
                <span>Speed</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {PLAYBACK_SPEEDS.map((speed) => (
                  <ControlButton
                    key={speed.value}
                    onClick={() => onPlaybackSpeedChange(speed.value)}
                    active={playbackSpeed === speed.value}
                    className="h-7 px-2 text-[11px]"
                    chartTheme={chartTheme}
                  >
                    {speed.label}
                  </ControlButton>
                ))}
              </div>
            </div>
          </Flyout>
        </div>
      )}

      {!fullscreenDrawingOnly && !groupedWorkspaceRail && activeGroup === 'tools' && (
        <div className="pointer-events-auto" data-chart-ui="tools-flyout">
          <Flyout
            title="Tools"
            icon={MousePointer2}
            onClose={() => setActiveGroup(null)}
            bodyClassName="max-h-[min(78vh,720px)] space-y-3 overflow-y-auto pr-1"
            chartTheme={chartTheme}
          >
            <div className="space-y-3">
              {TOOL_GROUPS.map((group) => {
                const groupTools = group.tools
                  .map((toolType) => TOOL_BUTTONS.find((item) => item.type === toolType))
                  .filter(Boolean);

                const GroupIcon = group.groupIcon;
                return (
                  <details key={group.name} className={`group rounded-md border p-2 ${isDarkTheme ? 'border-gray-700 bg-black-table-color' : 'border-slate-200 bg-slate-50'}`}>
                    <summary className={`flex cursor-pointer list-none items-center justify-between text-[10px] font-semibold uppercase tracking-wide ${mutedTextClass}`}>
                      <span className="flex items-center gap-1.5">{GroupIcon && <GroupIcon size={13}/>}{group.name}</span><ChevronDown size={13} className="transition group-open:rotate-180"/>
                    </summary>
                    {group.sections ? (
                      <div className="space-y-2">
                        {group.sections.map((section, sectionIndex) => (
                          <div key={section.title}>
                            {sectionIndex > 0 && <div className={`mb-2 border-t ${isDarkTheme ? 'border-gray-800' : 'border-slate-200'}`} />}
                            <div className={`mb-1.5 text-[9px] font-semibold uppercase tracking-wide ${mutedTextClass}`}>{section.title}</div>
                            <div className="grid grid-cols-2 gap-2">
                              {section.tools.map((toolType) => {
                                const item = TOOL_BUTTONS.find((candidate) => candidate.type === toolType);
                                if (!item) return null;
                                return (
                                  <ControlButton
                                    key={item.type}
                                    icon={item.icon}
                                    onClick={() => handleToolChange(item.type)}
                                    active={tool === item.type}
                                    chartTheme={chartTheme}
                                  >
                                    {item.label}
                                  </ControlButton>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        {groupTools.map(({ type, label, icon }) => (
                          <ControlButton
                            key={type}
                            icon={icon}
                            onClick={() => handleToolChange(type)}
                            active={tool === type}
                            chartTheme={chartTheme}
                          >
                            {label}
                          </ControlButton>
                        ))}
                      </div>
                    )}
                  </details>
                );
              })}
            </div>

            <div className={`space-y-2 border-t pt-3 ${sectionBorderClass}`}>
              <ControlButton
                icon={allDrawingsLocked ? Lock : Unlock}
                onClick={onToggleLockAllDrawings}
                active={allDrawingsLocked}
                className="w-full"
                chartTheme={chartTheme}
              >
                {allDrawingsLocked ? 'Unlock all drawings' : 'Lock all drawings'}
              </ControlButton>
              <div className={`rounded-md border p-2 ${isDarkTheme ? 'border-gray-700 bg-black-table-color' : 'border-slate-200 bg-slate-50'}`}>
                <div className={`mb-1.5 text-[10px] font-semibold uppercase tracking-wide ${mutedTextClass}`}>Show / Hide</div>
                {[['drawings', 'Drawings'], ['indicators', 'Indicators'], ['positions', 'Positions and orders']].map(([key, label]) => (
                  <label key={key} className="flex cursor-pointer items-center justify-between gap-3 py-1 text-xs">
                    {label}
                    <input type="checkbox" checked={Boolean(hiddenLayers?.[key])} onChange={() => onToggleVisibility?.(key)} className="h-4 w-4 accent-[#2962ff]" />
                  </label>
                ))}
              </div>
              <ControlButton
                icon={Trash2}
                onClick={onClearDrawings}
                disabled={!drawings.length}
                variant="danger"
                className="w-full"
                chartTheme={chartTheme}
              >
                Clear
              </ControlButton>
            </div>
          </Flyout>
        </div>
      )}

      {activeGroup === 'backtest' && (
        <>
        <div className={`pointer-events-auto ${
          fullscreenDrawingOnly
            ? 'fixed bottom-9 right-[88px] top-14 z-[82] w-[min(340px,calc(100vw-10rem))]'
            : ''
        }`}>
          <Flyout
            title="Enter Position"
            icon={Wallet}
            onClose={() => {
              setActiveGroup(null);
              onFullscreenEntryPanelOpenChange?.(false);
            }}
            bodyClassName={fullscreenDrawingOnly
              ? 'max-h-[calc(100dvh-8rem)] space-y-3 overflow-y-auto pr-1'
              : 'max-h-[min(78vh,720px)] space-y-3 overflow-y-auto pr-1'}
            chartTheme={chartTheme}
            className={fullscreenDrawingOnly ? 'ml-0 h-full w-full max-w-none overflow-hidden rounded-none' : ''}
          >
            <div className={`rounded-md border p-2 ${cardSurfaceClass}`}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className={`text-[10px] uppercase tracking-wide ${mutedTextClass}`}>Session</div>
                  <div className={`truncate text-xs font-semibold ${valueTextClass}`}>
                    {backtestAccount?.activeSession?.name ?? 'No active session'}
                  </div>
                  {backtestAccount?.activeSession && (
                    <div className={`mt-0.5 text-[11px] ${mutedTextClass}`}>
                      {backtestAccount.activeSession.symbol} {backtestAccount.activeSession.timeframe}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 gap-1">
                  <ControlButton
                    onClick={onStartBacktestSession}
                    disabled={isBacktestLoading}
                    className="h-7 px-2 text-[11px]"
                    chartTheme={chartTheme}
                  >
                    New
                  </ControlButton>
                  <ControlButton
                    onClick={onEndBacktestSession}
                    disabled={isBacktestLoading || !backtestAccount?.activeSession}
                    variant="primary"
                    className="h-7 px-2 text-[11px]"
                    chartTheme={chartTheme}
                  >
                    End
                  </ControlButton>
                </div>
              </div>
            </div>

            <div className={`flex items-center justify-between gap-3 rounded-md border p-2.5 ${cardSurfaceClass}`}>
              <div className="flex min-w-0 items-center gap-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#2962ff]/15 text-[#5b8cff]">
                  <Wallet size={16} />
                </span>
                <div className="min-w-0">
                  <div className={`text-[10px] uppercase tracking-wide ${mutedTextClass}`}>Available balance</div>
                  <div className={`truncate text-[11px] ${mutedTextClass}`}>
                    {backtestAccount?.name ?? 'Demo Account'}
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <div className={`text-right text-sm font-semibold ${valueTextClass}`}>
                  {backtestAccount ? formatAccountMoney(backtestMetrics.cashBalance) : '---'}
                </div>
                <div className="relative">
                  <IconTooltipButton
                    label="Display currency settings"
                    isDark={isDarkTheme}
                    onClick={() => setShowCurrencySettings((current) => !current)}
                    className={`flex h-7 w-7 items-center justify-center rounded ${mutedTextClass} ${isDarkTheme ? 'hover:bg-white/10' : 'hover:bg-slate-100'}`}
                  >
                    <Settings size={14} />
                  </IconTooltipButton>
                  {showCurrencySettings && (
                    <>
                      <button type="button" className="fixed inset-0 z-[10029] cursor-default" onClick={() => setShowCurrencySettings(false)} aria-label="Close currency settings" tabIndex={-1} />
                      <div className={`absolute right-0 top-full z-[10030] mt-2 w-52 rounded-lg border p-3 shadow-2xl ${isDarkTheme ? 'border-gray-700 bg-[#151617]' : 'border-slate-200 bg-white'}`}>
                        <label className="block">
                          <span className={`mb-1 block text-[10px] uppercase tracking-wide ${mutedTextClass}`}>
                            Display currency
                          </span>
                          <select
                            value={displayCurrency}
                            onChange={(event) => handleDisplayCurrencyChange(event.target.value)}
                            className={`h-8 w-full rounded border px-2 text-xs outline-none ${fieldClass}`}
                          >
                            <option value="USDT">{quoteCurrency}</option>
                            <option value="PHP">PHP</option>
                          </select>
                        </label>
                        <label className="mt-2 block">
                          <span className={`mb-1 block text-[10px] uppercase tracking-wide ${mutedTextClass}`}>
                            PHP / {quoteCurrency}
                          </span>
                          <input
                            value={phpRate}
                            onChange={(event) => setPhpRate(event.target.value)}
                            inputMode="decimal"
                            disabled={displayCurrency !== 'PHP'}
                            className={`h-8 w-full rounded border px-2 text-xs outline-none disabled:opacity-40 ${fieldClass}`}
                          />
                        </label>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {backtestError && (
              <div className="rounded-md border border-red-900 bg-red-950/60 px-2 py-1.5 text-[11px] text-red-200">
                {backtestError}
              </div>
            )}

            <div className={`space-y-2 border-t pt-3 ${sectionBorderClass}`}>
              <div className={`text-xs font-semibold uppercase tracking-wide ${labelTextClass}`}>Enter Position</div>
              <div className={`flex items-center gap-4 border-b ${sectionBorderClass}`}>
                {[['market', 'Market'], ['limit', 'Limit'], ['trigger', 'Trigger']].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setOrderType(value)}
                    className={`relative -mb-px h-8 border-b-2 text-xs font-semibold transition-colors ${
                      orderType === value
                        ? `border-[#2962ff] ${valueTextClass}`
                        : isDarkTheme
                          ? `border-transparent ${mutedTextClass} hover:text-gray-300`
                          : `border-transparent ${mutedTextClass} hover:text-slate-700`
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {isSpot ? (
                <div className="flex h-10 items-center justify-center rounded-md bg-emerald-600 text-sm font-bold text-white">
                  Buy
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setOrderSide('long')}
                    className={`h-10 rounded-md text-sm font-bold transition-colors ${
                      orderSide === 'long' ? 'bg-emerald-600 text-white' : neutralToggleClass(false)
                    }`}
                  >
                    Long
                  </button>
                  <button
                    type="button"
                    onClick={() => setOrderSide('short')}
                    className={`h-10 rounded-md text-sm font-bold transition-colors ${
                      orderSide === 'short' ? 'bg-red-600 text-white' : neutralToggleClass(false)
                    }`}
                  >
                    Short
                  </button>
                </div>
              )}
              <div className={`rounded-md border p-2 ${cardSurfaceClass}`}>
                <div className="block">
                  <span className={`mb-1 block text-[10px] uppercase tracking-wide ${mutedTextClass}`}>Strategy playbook</span>
                  <Select
                    value={selectedPlaybookOption}
                    onChange={(option) => setSelectedPlaybookId(option?.value ?? '')}
                    options={playbookOptions}
                    isSearchable
                    placeholder="No playbook"
                    aria-label="Strategy playbook"
                    styles={playbookSelectStyles(isDarkTheme)}
                  />
                </div>
                {selectedPlaybook && (
                  <div className="mt-2 space-y-1.5">
                    {selectedPlaybook.description && <p className={`text-[11px] ${labelTextClass}`}>{selectedPlaybook.description}</p>}
                    {selectedPlaybook.checklist.length ? selectedPlaybook.checklist.map((item, index) => (
                      <label key={`${selectedPlaybook.id}:${index}`} className={`flex items-start gap-2 text-[11px] ${valueTextClass}`}>
                        <input
                          type="checkbox"
                          checked={Boolean(checklistAnswers[index])}
                          onChange={(event) => setChecklistAnswers((current) => current.map((value, itemIndex) => itemIndex === index ? event.target.checked : value))}
                          className="mt-0.5"
                        />
                        <span>{item}</span>
                      </label>
                    )) : <p className={`text-[11px] ${mutedTextClass}`}>This playbook has no required checklist.</p>}
                  </div>
                )}
              </div>
              {!isSpot && (
                <div className="grid grid-cols-2 gap-2">
                  <IconTooltipButton
                    label="This engine simulates isolated margin only — there is no cross-margin mode."
                    isDark={isDarkTheme}
                    disabled
                    className={`h-8 w-full cursor-default rounded border px-2 text-xs font-semibold opacity-90 outline-none ${fieldClass}`}
                  >
                    Isolated
                  </IconTooltipButton>
                  <IconTooltipButton
                    label="Leverage, 1x to 125x"
                    isDark={isDarkTheme}
                    onClick={() => setShowLeverageModal(true)}
                    className={`h-8 w-full min-w-0 rounded border px-2 text-left text-xs font-semibold outline-none ${
                      isLeverageValid ? fieldClass : invalidFieldClass
                    }`}
                  >
                    {isLeverageValid ? formatLeverage(leverageValue) : (orderLeverage || 'Lev')}
                  </IconTooltipButton>
                </div>
              )}
              <input
                value={orderNotional}
                onChange={(event) => setOrderNotional(event.target.value)}
                inputMode="decimal"
                className={`h-8 w-full rounded border px-2 text-xs outline-none ${fieldClass}`}
                placeholder={isSpot ? `${displayCurrency} amount` : `${displayCurrency} margin`}
              />
              <div className="grid grid-cols-4 gap-1.5">
                {[0.25, 0.5, 0.75, 1].map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => handleMarginPercentClick(pct)}
                    className={`h-6 rounded text-[10px] font-semibold ${neutralToggleClass(false)}`}
                  >
                    {pct * 100}%
                  </button>
                ))}
              </div>
              <div className={`grid ${isSpot ? 'grid-cols-2' : 'grid-cols-3'} gap-2 text-[11px] ${labelTextClass}`}>
                <span>{isSpot ? 'Amount' : 'Margin'} {orderPlan?.margin ? formatAccountMoney(orderPlan.margin) : '---'}</span>
                <span>Value {orderPlan?.positionNotional ? formatAccountMoney(orderPlan.positionNotional) : '---'}</span>
                {!isSpot && <span>Lev {isLeverageValid ? formatLeverage(leverageValue) : '---'}</span>}
              </div>
              <div className={`rounded-md border ${cardSurfaceClass}`}>
                <div className="flex h-9 items-center justify-between px-2">
                  <label className="flex min-w-0 cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={tpSlEnabled}
                      onChange={(event) => {
                        const checked = event.target.checked;
                        setTpSlEnabled(checked);
                        if (!checked) resetTpSlDraft();
                      }}
                      className="h-4 w-4 shrink-0 accent-emerald-500"
                    />
                    <span className={`text-xs font-semibold ${valueTextClass}`}>TP / SL</span>
                  </label>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowManagedExitsModal(true)}
                      className="flex items-center gap-0.5 text-[11px] font-semibold text-[#5b8cff] hover:underline"
                    >
                      Managed Exits{managedExitCount ? ` (${managedExitCount})` : ''}
                      <ChevronRight size={12} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowAdvancedTpSlModal(true)}
                      className="flex items-center gap-0.5 text-[11px] font-semibold text-[#5b8cff] hover:underline"
                    >
                      Advanced
                      <ChevronRight size={12} />
                    </button>
                  </div>
                </div>
                {tpSlEnabled && (
                  <div className={`grid grid-cols-2 gap-2 border-t p-2 ${sectionBorderClass}`}>
                    <label className="block">
                      <span className={`mb-1 block text-[10px] uppercase tracking-wide ${mutedTextClass}`}>SL</span>
                      {orderStopLossMode === 'pnl' ? (
                        <IconTooltipButton
                          label="Set via PnL % in Advanced"
                          isDark={isDarkTheme}
                          onClick={() => setShowAdvancedTpSlModal(true)}
                          className={`flex h-8 w-full items-center rounded border px-2 text-left text-xs outline-none ${fieldClass}`}
                        >
                          {orderStopLossPnl ? `-${orderStopLossPnl}% PnL` : 'Set % in Advanced'}
                        </IconTooltipButton>
                      ) : (
                        <input
                          value={orderStopLoss}
                          onChange={(event) => setOrderStopLoss(event.target.value)}
                          inputMode="decimal"
                          className={`h-8 w-full rounded border px-2 text-xs outline-none ${
                            orderPlan?.isStopValid === false ? invalidFieldClass : fieldClass
                          }`}
                          placeholder="Stop price"
                        />
                      )}
                    </label>
                    <label className="block">
                      <span className={`mb-1 block text-[10px] uppercase tracking-wide ${mutedTextClass}`}>TP</span>
                      {orderTakeProfitMode === 'pnl' ? (
                        <IconTooltipButton
                          label="Set via PnL % in Advanced"
                          isDark={isDarkTheme}
                          onClick={() => setShowAdvancedTpSlModal(true)}
                          className={`flex h-8 w-full items-center rounded border px-2 text-left text-xs outline-none ${fieldClass}`}
                        >
                          {orderTakeProfitPnl ? `+${orderTakeProfitPnl}% PnL` : 'Set % in Advanced'}
                        </IconTooltipButton>
                      ) : (
                        <input
                          value={orderTakeProfit}
                          onChange={(event) => setOrderTakeProfit(event.target.value)}
                          inputMode="decimal"
                          className={`h-8 w-full rounded border px-2 text-xs outline-none ${
                            orderPlan?.isTargetValid === false ? invalidFieldClass : fieldClass
                          }`}
                          placeholder="Target price"
                        />
                      )}
                    </label>
                  </div>
                )}
              </div>
              <div className={`grid grid-cols-2 gap-2 text-[11px] ${labelTextClass}`}>
                <span>Entry fee {orderPlan?.entryFee ? formatAccountMoney(orderPlan.entryFee) : '---'}</span>
                <span>Need {orderPlan?.requiredCash ? formatAccountMoney(orderPlan.requiredCash) : '---'}</span>
              </div>
              {orderPlan?.adjustedForFee && (
                <div className="rounded-md border border-amber-900 bg-amber-950/50 px-2 py-1 text-[11px] text-amber-200">
                  Margin adjusted to include entry fee in available cash.
                </div>
              )}
              {orderPlan && orderPlan.requiredCash > backtestMetrics.cashBalance && (
                <div className="rounded-md border border-red-900 bg-red-950/60 px-2 py-1 text-[11px] text-red-200">
                  Reduce margin to {formatAccountMoney(getMaxMarginForCash(backtestMetrics.cashBalance, leverageValue, feeRate))} or less.
                </div>
              )}
              <div className="grid grid-cols-1 gap-2">
                <label className="block">
                  <span className={`mb-1 block text-[10px] uppercase tracking-wide ${mutedTextClass}`}>
                    {isPendingOrder ? 'Price' : 'Entry'}
                  </span>
                  <input
                    value={orderEntryPrice}
                    onChange={(event) => setOrderEntryPrice(event.target.value)}
                    inputMode="decimal"
                    className={`h-8 w-full rounded border px-2 text-xs outline-none ${fieldClass}`}
                    placeholder={isPendingOrder ? 'Required' : formatMoney(executionPrice)}
                  />
                </label>
              </div>
              <div className={`grid grid-cols-3 gap-2 text-[11px] ${labelTextClass}`}>
                <span>Risk {orderPlan?.riskAmount ? formatAccountMoney(orderPlan.riskAmount) : '---'}</span>
                <span>Reward {orderPlan?.rewardAmount ? formatAccountMoney(orderPlan.rewardAmount) : '---'}</span>
                <span>R/R {orderPlan?.rr ? orderPlan.rr.toFixed(2) : '---'}</span>
              </div>
              <div className={`grid grid-cols-2 gap-2 text-[11px] ${labelTextClass}`}>
                <span className={orderPlan?.estimatedProfit != null ? (orderPlan.estimatedProfit >= 0 ? 'text-emerald-400' : 'text-red-400') : undefined}>
                  Est profit {orderPlan?.estimatedProfit != null ? formatAccountMoney(orderPlan.estimatedProfit) : '---'}
                </span>
                <span className={orderPlan?.estimatedLoss != null ? 'text-red-400' : undefined}>
                  Est loss {orderPlan?.estimatedLoss != null ? formatAccountMoney(orderPlan.estimatedLoss) : '---'}
                </span>
              </div>
              <button
                type="button"
                onClick={submitBacktestOrder}
                disabled={!canSubmitOrder}
                className={`h-11 w-full rounded-md text-sm font-bold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                  orderSide === 'long' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-red-600 hover:bg-red-500'
                }`}
              >
                {isSpot
                  ? (isPendingOrder ? 'Place Buy Order' : 'Buy')
                  : (isPendingOrder ? `Place ${orderSide === 'long' ? 'Long' : 'Short'} Order` : `Open ${orderSide === 'long' ? 'Long' : 'Short'}`)}
              </button>
              {showOrderDraft && (
                <ControlButton icon={X} onClick={removeOrderDraft} variant="danger" className="w-full" chartTheme={chartTheme}>
                  Remove Entry / SL / TP Plan
                </ControlButton>
              )}
            </div>

            <div className={`space-y-2 border-t pt-3 ${sectionBorderClass}`}>
              <div className={`text-xs font-semibold uppercase tracking-wide ${labelTextClass}`}>Pending Entries</div>
              <div className="max-h-36 space-y-2 overflow-y-auto pr-1">
                {backtestAccount?.pendingPositions?.length ? (
                  backtestAccount.pendingPositions.map((position) => (
                    <div key={position.id} className={`rounded-md border p-2 ${cardSurfaceClass}`}>
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className={`text-xs font-semibold ${valueTextClass}`}>
                          {position.symbol} {position.side.toUpperCase()}
                        </span>
                        <span className="text-xs text-amber-300">Waiting</span>
                      </div>
                      <div className={`mb-2 grid grid-cols-2 gap-1 text-[11px] ${labelTextClass}`}>
                        <span>Trigger {formatMoney(position.entryPrice)}</span>
                        <span>Margin {formatAccountMoney(position.margin)}</span>
                        <span>Value {formatAccountMoney(position.notional ?? Number(position.margin) * Number(position.leverage ?? 1))}</span>
                        <span>Lev {formatLeverage(position.leverage)}</span>
                        <span>SL {position.stopLoss ? formatMoney(position.stopLoss) : '---'}</span>
                        <span>TP {position.takeProfit ? formatMoney(position.takeProfit) : '---'}</span>
                      </div>
                      <ControlButton
                        icon={X}
                        onClick={() => onCancelBacktestPosition(position.id)}
                        disabled={isBacktestLoading}
                        variant="primary"
                        className="w-full"
                        chartTheme={chartTheme}
                      >
                        Cancel
                      </ControlButton>
                    </div>
                  ))
                ) : (
                  <span className={`text-[11px] ${mutedTextClass}`}>No pending entries</span>
                )}
              </div>
            </div>

            <div className={`space-y-2 border-t pt-3 ${sectionBorderClass}`}>
              <div className={`text-xs font-semibold uppercase tracking-wide ${labelTextClass}`}>Open Positions</div>
              <div className="max-h-44 space-y-2 overflow-y-auto pr-1">
                {backtestAccount?.openPositions?.length ? (
                  backtestAccount.openPositions.map((position) => {
                    const livePnl = getBacktestMetrics({
                      cashBalance: 0,
                      openPositions: [position],
                    }, symbol, executionPrice).unrealizedPnl;

                    return (
                      <div key={position.id} className={`rounded-md border p-2 ${cardSurfaceClass}`}>
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <span className={`text-xs font-semibold ${valueTextClass}`}>
                            {position.symbol} {position.side.toUpperCase()}
                          </span>
                          <span className={livePnl >= 0 ? 'text-xs text-emerald-400' : 'text-xs text-red-400'}>
                            {formatAccountMoney(livePnl)}
                          </span>
                        </div>
                        <div className={`mb-2 grid grid-cols-2 gap-1 text-[11px] ${labelTextClass}`}>
                          <span>Entry {formatMoney(position.entryPrice)}</span>
                          <span>Margin {formatAccountMoney(position.margin)}</span>
                          <span>Value {formatAccountMoney(position.notional ?? Number(position.margin) * Number(position.leverage ?? 1))}</span>
                          <span>Lev {formatLeverage(position.leverage)}</span>
                          <span>SL {position.stopLoss ? formatMoney(position.stopLoss) : '---'}</span>
                          <span>TP {position.takeProfit ? formatMoney(position.takeProfit) : '---'}</span>
                          <span>Liq {position.liquidationPrice ? formatMoney(position.liquidationPrice) : '---'}</span>
                          <span>{[
                            position.trailingStopPercent ? `Trail ${position.trailingStopPercent}%` : null,
                            position.breakEvenTriggerPercent ? `BE ${position.breakEvenTriggerPercent}%` : null,
                            position.partialTakeProfitPercent && !position.partialTakeProfitExecuted ? `Partial ${position.partialTakeProfitPercent}%` : null,
                          ].filter(Boolean).join(' · ') || 'Managed exits off'}</span>
                        </div>
                        <ControlButton
                          icon={X}
                          onClick={() => onCloseBacktestPosition(position.id)}
                          disabled={!canTrade}
                          variant="primary"
                          className="w-full"
                          chartTheme={chartTheme}
                        >
                          Close
                        </ControlButton>
                      </div>
                    );
                  })
                ) : (
                  <span className={`text-[11px] ${mutedTextClass}`}>No open positions</span>
                )}
              </div>
            </div>

          </Flyout>
        </div>
        </>
      )}

      {showLeverageModal && typeof document !== 'undefined' && createPortal(
        <LeverageModal
          value={orderLeverage}
          min={1}
          max={125}
          availableCash={quoteToDisplayAmount(backtestMetrics.cashBalance, displayCurrency, normalizedPhpRate)}
          currencyLabel={displayCurrency}
          isDark={isDarkTheme}
          onClose={() => setShowLeverageModal(false)}
          onConfirm={(nextLeverage) => {
            setOrderLeverage(String(nextLeverage));
            setShowLeverageModal(false);
          }}
        />,
        document.body
      )}

      {showManagedExitsModal && typeof document !== 'undefined' && createPortal(
        <ManagedExitsModal
          side={orderSide}
          trailingStopPercent={trailingStopPercent}
          onTrailingStopPercentChange={setTrailingStopPercent}
          breakEvenTriggerPercent={breakEvenTriggerPercent}
          onBreakEvenTriggerPercentChange={setBreakEvenTriggerPercent}
          partialTakeProfitPercent={partialTakeProfitPercent}
          onPartialTakeProfitPercentChange={setPartialTakeProfitPercent}
          isDark={isDarkTheme}
          onClose={() => setShowManagedExitsModal(false)}
        />,
        document.body
      )}

      {showAdvancedTpSlModal && typeof document !== 'undefined' && createPortal(
        <AdvancedTpSlModal
          side={orderSide}
          entryPrice={effectiveEntryPrice}
          leverage={leverageValue}
          stopLossMode={orderStopLossMode}
          onStopLossModeChange={setOrderStopLossMode}
          stopLossPrice={orderStopLoss}
          onStopLossPriceChange={(value) => { setOrderStopLoss(value); setTpSlEnabled(true); }}
          stopLossPnl={orderStopLossPnl}
          onStopLossPnlChange={(value) => { setOrderStopLossPnl(value); setTpSlEnabled(true); }}
          takeProfitMode={orderTakeProfitMode}
          onTakeProfitModeChange={setOrderTakeProfitMode}
          takeProfitPrice={orderTakeProfit}
          onTakeProfitPriceChange={(value) => { setOrderTakeProfit(value); setTpSlEnabled(true); }}
          takeProfitPnl={orderTakeProfitPnl}
          onTakeProfitPnlChange={(value) => { setOrderTakeProfitPnl(value); setTpSlEnabled(true); }}
          isDark={isDarkTheme}
          onClose={() => setShowAdvancedTpSlModal(false)}
        />,
        document.body
      )}

      {activeGroup === 'tool-editor' && hasToolEditor && (
        <TopToolEditorBar
          editorLabel={editorLabel}
          editorType={editorType}
          timeframe={timeframe}
          activeColor={activeColor}
          activeStrokeWidth={activeStrokeWidth}
          activeLineStyle={activeLineStyle}
          activeLabelText={activeLabelText}
          activeText={activeText}
          activeTextBold={activeTextBold}
          activeTextItalic={activeTextItalic}
          activeLabelVertical={activeLabelVertical}
          activeLabelHorizontal={activeLabelHorizontal}
          canEditWidth={canEditWidth}
          canEditLineStyle={canEditLineStyle}
          canEditLabel={canEditLabel}
          canEditText={canEditText}
          canEditColor={canEditColor}
          canUsePresets={canUsePresets}
          presetItems={presetItems}
          presetNameDraft={presetNameDraft}
          setPresetNameDraft={setPresetNameDraft}
          selectedDrawing={selectedDrawing}
          openMenu={activeEditorMenu}
          setOpenMenu={setActiveEditorMenu}
          onDrawingColorChange={onDrawingColorChange}
          onDrawingWidthChange={onDrawingWidthChange}
          onDrawingLineStyleChange={onDrawingLineStyleChange}
          onDrawingLabelChange={onDrawingLabelChange}
          onApplyToolPreset={onApplyToolPreset}
          onDeleteToolPreset={onDeleteToolPreset}
          onDuplicateSelectedDrawing={onDuplicateSelectedDrawing}
          onDeleteSelectedDrawing={onDeleteSelectedDrawing}
          onSavePreset={handleSavePreset}
          onSaveSelectedToolPreset={onSaveSelectedToolPreset}
          chartTheme={chartTheme}
          availableWidth={Math.max((Number(overlayWidth) || 0) - 164, 140)}
          chartBoundsRef={panelRootRef}
        />
      )}

      {activeGroup === 'visibility' && (
        <div className="pointer-events-auto">
          <Flyout title="Show/Hide" icon={Eye} onClose={() => setActiveGroup(null)} chartTheme={chartTheme}>
            {[
              ['drawings', 'Hide drawings'],
              ['indicators', 'Hide indicators'],
              ['positions', 'Hide positions and orders'],
            ].map(([key, label]) => (
              <label key={key} className="flex cursor-pointer items-center justify-between gap-3 text-sm">
                {label}
                <input type="checkbox" checked={Boolean(hiddenLayers?.[key])} onChange={() => onToggleVisibility?.(key)} className="h-4 w-4 accent-[#2962ff]" />
              </label>
            ))}
            <div className={`border-t pt-3 ${sectionBorderClass}`}>
              <ControlButton
                icon={(hiddenLayers?.drawings && hiddenLayers?.indicators && hiddenLayers?.positions) ? Eye : EyeOff}
                onClick={() => onToggleVisibility?.('all')}
                className="w-full"
                chartTheme={chartTheme}
              >
                {(hiddenLayers?.drawings && hiddenLayers?.indicators && hiddenLayers?.positions) ? 'Show all' : 'Hide all'}
              </ControlButton>
            </div>
          </Flyout>
        </div>
      )}
    </div>
  );
}

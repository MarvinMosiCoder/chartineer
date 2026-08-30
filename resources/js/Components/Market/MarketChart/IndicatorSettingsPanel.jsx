import React, { useEffect, useState } from 'react';
import { Eye, EyeOff, MoreHorizontal, Settings2, Trash2, X } from 'lucide-react';

const INDICATOR_META = {
  volume: { label: 'Volume', sizeKey: 'volumeSize' },
  sma: { label: 'SMA', periodKey: 'smaPeriod', colorKey: 'smaColor', widthKey: 'smaLineWidth' },
  // EMA deliberately has no periodKey/colorKey/widthKey: unlike every other indicator
  // here it is not one line but a list of them (`indicators.emaLines`), so the generic
  // single-value Inputs/Style rows are replaced by a per-line editor. Anything reading
  // `meta.periodKey` to build a label or a draft needs an explicit EMA branch.
  ema: { label: 'EMA', linesKey: 'emaLines' },
  rsi: { label: 'RSI', periodKey: 'rsiPeriod', colorKey: 'rsiColor', widthKey: 'rsiLineWidth', sizeKey: 'rsiSize' },
  macd: { label: 'MACD', widthKey: 'macdLineWidth', sizeKey: 'macdSize' },
};

export const MIN_INDICATOR_PERIOD = 2;
export const MAX_INDICATOR_PERIOD = 500;
export const MAX_EMA_LINES = 12;

// Cycled by position when a line is added, so a fresh set of EMAs is readable without
// the user having to pick four colors by hand. Not a semantic palette — these are one
// series among several, exactly the case the rebrand notes in trading-chart.md say to
// leave alone rather than collapse onto the brand accent.
export const EMA_LINE_COLORS = ['#f59e0b', '#2dd4bf', '#a855f7', '#3b82f6', '#ef4444', '#ec4899', '#84cc16', '#06b6d4'];
const DEFAULT_EMA_PERIODS = [9, 20, 50, 200];

const clampPeriod = (value, fallback = 20) => Math.min(
  MAX_INDICATOR_PERIOD,
  Math.max(MIN_INDICATOR_PERIOD, Math.round(Number(value)) || fallback),
);

let emaLineSequence = 0;
export function createEmaLine(period = 20, index = 0) {
  emaLineSequence += 1;
  return {
    id: `ema-${Date.now().toString(36)}-${emaLineSequence.toString(36)}`,
    period: clampPeriod(period),
    color: EMA_LINE_COLORS[index % EMA_LINE_COLORS.length],
    width: 2,
    visible: true,
  };
}

/**
 * Ids here are **deterministic** (`ema-default-9`, ...), unlike `createEmaLine`'s
 * time-seeded ones. `normalizeEmaLines()` falls back to this set, and it is called from
 * effects that run on every `indicators` change — with random ids, each call would look
 * like "four different lines" and the sync effect would tear down and rebuild four series
 * on every render, forever. Deterministic ids make the fallback idempotent.
 */
export function defaultEmaLines() {
  return DEFAULT_EMA_PERIODS.map((period, index) => ({
    ...createEmaLine(period, index),
    id: `ema-default-${period}`,
  }));
}

/**
 * The one place that decides what `indicators.emaLines` means, shared by the chart and
 * this panel so a malformed or legacy value can never be interpreted two different ways.
 *
 * An **array** is authoritative even when empty — an empty list means "the user deleted
 * every EMA line", which must not silently resurrect anything. Only the *absence* of the
 * key triggers the one-time migration from the pre-multi-line scalar shape
 * (`emaPeriod`/`emaColor`/`emaLineWidth`), which is what every browser that used this
 * chart before EMA became multi-line still has sitting in localStorage.
 */
export function normalizeEmaLines(indicators) {
  const raw = indicators?.emaLines;

  if (Array.isArray(raw)) {
    return raw
      .filter((line) => line && Number.isFinite(Number(line.period)))
      .slice(0, MAX_EMA_LINES)
      .map((line, index) => ({
        id: String(line.id || `ema-${index}`),
        period: clampPeriod(line.period),
        color: line.color || EMA_LINE_COLORS[index % EMA_LINE_COLORS.length],
        width: Number(line.width) || 2,
        visible: line.visible !== false,
      }));
  }

  if (Number.isFinite(Number(indicators?.emaPeriod))) {
    return [{
      id: 'ema-migrated',
      period: clampPeriod(indicators.emaPeriod),
      color: indicators.emaColor || EMA_LINE_COLORS[0],
      width: Number(indicators.emaLineWidth) || 2,
      visible: indicators.emaVisible !== false,
    }];
  }

  return defaultEmaLines();
}

const INDICATOR_DEFAULTS = {
  volume: { volumeSize: 20 },
  sma: { smaPeriod: 20, smaColor: '#2962ff', smaLineWidth: 2 },
  ema: {},
  rsi: { rsiPeriod: 14, rsiColor: '#a855f7', rsiLineWidth: 2, rsiSize: 25 },
  macd: { macdFastPeriod: 12, macdSlowPeriod: 26, macdSignalPeriod: 9, macdColor: '#2962ff', macdSignalColor: '#f59e0b', macdUpColor: '#26a69a', macdDownColor: '#ef5350', macdLineWidth: 2, macdSize: 25 },
};

const MACD_FIELDS = ['macdFastPeriod', 'macdSlowPeriod', 'macdSignalPeriod', 'macdColor', 'macdSignalColor', 'macdUpColor', 'macdDownColor', 'macdLineWidth', 'macdSize'];

function buildDraft(key, indicators) {
  const meta = INDICATOR_META[key];
  const draft = { [`${key}Visible`]: indicators[`${key}Visible`] !== false };

  if (key === 'macd') {
    MACD_FIELDS.forEach((field) => { draft[field] = indicators[field]; });
    return draft;
  }

  if (key === 'ema') {
    // Cloned per line, not shared by reference: the draft is the local source of truth
    // until Ok, and mutating a line in place would edit the live chart mid-dialog and
    // leave Cancel with nothing to roll back to.
    draft.emaLines = normalizeEmaLines(indicators).map((line) => ({ ...line }));
    return draft;
  }

  if (meta.periodKey) draft[meta.periodKey] = indicators[meta.periodKey];
  if (meta.colorKey) draft[meta.colorKey] = indicators[meta.colorKey];
  if (meta.widthKey) draft[meta.widthKey] = indicators[meta.widthKey];
  if (meta.sizeKey) draft[meta.sizeKey] = indicators[meta.sizeKey];
  return draft;
}

/**
 * One indicator's on-chart legend entry: a compact label pill that expands into an
 * icon toolbar (visibility, settings, remove, more) either on hover, or pinned open via
 * `isExpanded` once the indicator's line (on the chart canvas) or the label itself has
 * been clicked — clicking never jumps straight to the settings dialog by itself, matching
 * TradingView's own two-step flow: click the indicator to reveal the toolbar, then click
 * the gear (or "more" → Settings...) to actually open settings. Right-clicking anywhere on
 * the row opens the same menu the "more" icon does, regardless of expanded/hover state.
 */
function IndicatorLegendRow({ label, dotColor, isVisible, isExpanded, rowClass, isDark, onAction }) {
  const iconBtn = `flex h-5 w-5 items-center justify-center rounded ${isDark ? 'hover:bg-white/15' : 'hover:bg-black/10'}`;
  const toolbarClass = `ml-0.5 items-center gap-0.5 ${isExpanded ? 'flex' : 'hidden group-hover:flex'}`;

  return (
    <div
      data-chart-ui
      className={`group pointer-events-auto flex h-6 items-center gap-1 rounded px-1.5 text-[10px] font-semibold ${rowClass}`}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onAction('menu', event);
      }}
    >
      <button type="button" onClick={(event) => onAction('expand', event)} className="flex items-center gap-1.5" aria-label={`Show ${label} toolbar`}>
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: dotColor }} />
        <span className={isVisible ? '' : 'opacity-50'}>{label}</span>
      </button>
      <span className={toolbarClass}>
        <button type="button" onClick={(event) => onAction('toggle-visible', event)} className={iconBtn} aria-label={isVisible ? `Hide ${label}` : `Show ${label}`}>
          {isVisible ? <Eye size={11} /> : <EyeOff size={11} />}
        </button>
        <button type="button" onClick={(event) => onAction('settings', event)} className={iconBtn} aria-label={`${label} settings`}>
          <Settings2 size={11} />
        </button>
        <button type="button" onClick={(event) => onAction('remove', event)} className={iconBtn} aria-label={`Remove ${label}`}>
          <Trash2 size={11} />
        </button>
        <button type="button" onClick={(event) => onAction('menu', event)} className={iconBtn} aria-label={`More ${label} options`}>
          <MoreHorizontal size={11} />
        </button>
      </span>
    </div>
  );
}

export function IndicatorClickTargets({ indicators, paneTops, expandedIndicator, onAction, chartTheme }) {
  const isDark = chartTheme?.mode === 'dark';
  const rowClass = isDark ? 'bg-[#151617]/55 text-gray-200' : 'bg-white/55 text-slate-700';
  // sma/ema overlay the main pane directly, so their pill can stay visible-but-faded while
  // hidden — unlike volume/rsi/macd, whose pane (and therefore their only anchor point)
  // disappears entirely once hidden, so those keep the original "show only while visible" rule.
  const mainIndicators = ['sma', 'ema'].filter((key) => indicators[key]);
  const paneLabel = (key) => {
    if (key === 'volume') return 'Volume';
    if (key === 'rsi') return `RSI ${indicators.rsiPeriod}`;
    return `MACD ${indicators.macdFastPeriod}, ${indicators.macdSlowPeriod}, ${indicators.macdSignalPeriod}`;
  };
  const paneDotColor = (key) => (key === 'rsi' ? indicators.rsiColor : key === 'macd' ? indicators.macdColor : '#787b86');

  return (
    <>
      {mainIndicators.length > 0 && (
        <div data-chart-ui className="pointer-events-auto absolute left-16 top-12 z-[54] flex flex-wrap gap-1">
          {mainIndicators.map((key) => {
            const meta = INDICATOR_META[key];
            // EMA is a list, so its pill names every configured period at once
            // ("EMA 9, 20, 50, 200") the same way MACD's already names its three —
            // one pill for the group rather than one per line, since every legend
            // action (hide/settings/remove) applies to the whole EMA indicator.
            const emaLines = key === 'ema' ? normalizeEmaLines(indicators) : null;
            return (
              <IndicatorLegendRow
                key={key}
                label={emaLines
                  ? `${meta.label}${emaLines.length ? ` ${emaLines.map((line) => line.period).join(', ')}` : ''}`
                  : `${meta.label}${meta.periodKey ? ` ${indicators[meta.periodKey]}` : ''}`}
                dotColor={emaLines
                  ? (emaLines.find((line) => line.visible)?.color ?? emaLines[0]?.color ?? '#787b86')
                  : (meta.colorKey ? indicators[meta.colorKey] : '#787b86')}
                isVisible={indicators[`${key}Visible`] !== false}
                isExpanded={expandedIndicator === key}
                rowClass={rowClass}
                isDark={isDark}
                onAction={(action, event) => onAction(key, action, event)}
              />
            );
          })}
        </div>
      )}
      {['volume', 'rsi', 'macd'].map((key) => indicators[key] && indicators[`${key}Visible`] !== false && Number.isFinite(Number(paneTops?.[key])) ? (
        <div key={key} data-chart-ui className="pointer-events-auto absolute left-16 z-[54]" style={{ top: Number(paneTops[key]) + 8 }}>
          <IndicatorLegendRow
            label={paneLabel(key)}
            dotColor={paneDotColor(key)}
            isVisible={indicators[`${key}Visible`] !== false}
            isExpanded={expandedIndicator === key}
            rowClass={rowClass}
            isDark={isDark}
            onAction={(action, event) => onAction(key, action, event)}
          />
        </div>
      ) : null)}
    </>
  );
}

/**
 * Right-click (or the legend row's "more" icon) context menu. Deliberately limited to
 * the three actions this app's indicator model can actually back for real — Show/Hide,
 * Settings, Remove — rather than reproducing TradingView's full menu (favorites, visual
 * order, pin to scale, move to, object tree, ...), none of which map to anything this
 * chart's single-instance, fixed-pane indicator system supports.
 */
export function IndicatorContextMenu({ indicatorKey, x, y, indicators, chartTheme, menuRef, firstItemRef, onToggleVisible, onOpenSettings, onRemove }) {
  if (!indicatorKey) return null;

  const isDark = chartTheme?.mode === 'dark';
  const meta = INDICATOR_META[indicatorKey];
  const isVisible = indicators[`${indicatorKey}Visible`] !== false;
  const itemClass = `flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-xs font-semibold outline-none ${isDark ? 'hover:bg-white/10 focus:bg-white/10' : 'hover:bg-slate-100 focus:bg-slate-100'}`;
  const dividerClass = `my-1 border-t ${isDark ? 'border-[#363a45]' : 'border-slate-200'}`;

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label={`${meta.label} indicator actions`}
      data-chart-ui
      onContextMenu={(event) => event.preventDefault()}
      className={`fixed z-[10005] w-[200px] overflow-hidden rounded-lg border p-1.5 shadow-2xl ${isDark ? 'border-[#363a45] bg-[#1e222d] text-[#d1d4dc]' : 'border-slate-200 bg-white text-slate-800'}`}
      style={{ left: x, top: y }}
    >
      <button ref={firstItemRef} type="button" role="menuitem" onClick={onToggleVisible} className={itemClass}>
        {isVisible ? <EyeOff size={15} className="text-[#787b86]" /> : <Eye size={15} className="text-[#787b86]" />}
        {isVisible ? 'Hide' : 'Show'}
      </button>
      <button type="button" role="menuitem" onClick={onOpenSettings} className={itemClass}>
        <Settings2 size={15} className="text-[#787b86]" />
        Settings...
      </button>
      <div className={dividerClass} />
      <button type="button" role="menuitem" onClick={onRemove} className={`${itemClass} text-red-500`}>
        <Trash2 size={15} />
        Remove
      </button>
    </div>
  );
}

export default function IndicatorSettingsPanel({ indicators, selectedIndicator, onChange, onClose, chartTheme }) {
  const isDark = chartTheme?.mode === 'dark';
  const meta = INDICATOR_META[selectedIndicator];
  const [activeTab, setActiveTab] = useState('inputs');
  const [draft, setDraft] = useState(null);

  useEffect(() => {
    if (!selectedIndicator || !INDICATOR_META[selectedIndicator]) {
      setDraft(null);
      return;
    }
    setActiveTab('inputs');
    setDraft(buildDraft(selectedIndicator, indicators));
    // Intentionally only re-seeds when a *different* indicator opens — while this one stays
    // open, `draft` is the local source of truth until Cancel/Ok, so it must not be
    // clobbered by `indicators` changing for an unrelated reason (e.g. another indicator's
    // toggle) while the dialog is up.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIndicator]);

  if (!selectedIndicator || !meta || !indicators[selectedIndicator] || !draft) return null;

  const shell = isDark ? 'border-gray-700 bg-[#151617] text-white' : 'border-slate-200 bg-white text-slate-900';
  const fieldClass = isDark ? 'border-gray-700 bg-[#0f1115] text-white' : 'border-slate-300 bg-slate-50 text-slate-900';
  const muted = isDark ? 'text-gray-400' : 'text-slate-500';
  const tabBorder = isDark ? 'border-gray-700' : 'border-slate-200';

  const update = (patch) => setDraft((current) => ({ ...current, ...patch }));

  const emaLines = Array.isArray(draft.emaLines) ? draft.emaLines : [];
  const updateEmaLine = (id, patch) => update({ emaLines: emaLines.map((line) => (line.id === id ? { ...line, ...patch } : line)) });
  const removeEmaLine = (id) => update({ emaLines: emaLines.filter((line) => line.id !== id) });
  const addEmaLine = () => {
    if (emaLines.length >= MAX_EMA_LINES) return;
    update({ emaLines: [...emaLines, createEmaLine(20, emaLines.length)] });
  };
  const emaRowClass = `flex items-center gap-2 rounded border p-2 ${fieldClass}`;

  const updateMacdPeriod = (key, value, fallback) => {
    const requested = Math.min(200, Math.max(2, Number(value) || fallback));
    if (key === 'macdFastPeriod') {
      update({ [key]: Math.min(requested, Math.max(2, (Number(draft.macdSlowPeriod) || 26) - 1)) });
      return;
    }
    if (key === 'macdSlowPeriod') {
      update({ [key]: Math.max(requested, (Number(draft.macdFastPeriod) || 12) + 1) });
      return;
    }
    update({ [key]: requested });
  };

  const applyDefaults = () => update(
    selectedIndicator === 'ema' ? { emaLines: defaultEmaLines() } : INDICATOR_DEFAULTS[selectedIndicator],
  );

  const commit = () => {
    onChange((current) => ({ ...current, ...draft }));
    onClose();
  };

  const tabs = [
    { key: 'inputs', label: 'Inputs' },
    { key: 'style', label: 'Style' },
    { key: 'visibility', label: 'Visibility' },
  ];

  return (
    <div className="fixed inset-0 z-[10040] flex items-center justify-center bg-black/40 px-3" data-chart-ui>
      <section className={`w-full max-w-sm overflow-hidden rounded-lg border shadow-2xl ${shell}`} role="dialog" aria-modal="true" aria-label={`${meta.label} settings`}>
        <div className="flex items-center justify-between px-5 pt-5">
          <h2 className="text-base font-semibold">{meta.label}</h2>
          <button type="button" onClick={onClose} className={`flex h-8 w-8 items-center justify-center rounded transition ${isDark ? 'hover:bg-white/10' : 'hover:bg-slate-100'}`} aria-label="Close">
            <X size={18} strokeWidth={1.6} />
          </button>
        </div>

        <div className={`mt-4 flex gap-4 border-b px-5 ${tabBorder}`}>
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`relative pb-2 text-sm font-semibold ${activeTab === tab.key ? '' : muted}`}
            >
              {tab.label}
              {activeTab === tab.key && <span className="absolute inset-x-0 -bottom-px h-0.5 bg-[#2dd4bf]" />}
            </button>
          ))}
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-5">
          {activeTab === 'inputs' && (
            <div className="grid gap-3">
              {selectedIndicator === 'macd' ? (
                <div className="grid grid-cols-3 gap-2">
                  {[
                    ['Fast', 'macdFastPeriod', 12],
                    ['Slow', 'macdSlowPeriod', 26],
                    ['Signal', 'macdSignalPeriod', 9],
                  ].map(([label, key, fallback]) => (
                    <label key={key} className={`grid gap-1 text-[10px] font-semibold uppercase tracking-wide ${muted}`}>
                      {label}
                      <input type="number" min="2" max="200" value={Number(draft[key]) || fallback} onChange={(event) => updateMacdPeriod(key, event.target.value, fallback)} className={`h-9 min-w-0 rounded border px-2 text-xs outline-none focus:border-[#2dd4bf] ${fieldClass}`} />
                    </label>
                  ))}
                </div>
              ) : selectedIndicator === 'ema' ? (
                <>
                  <p className={`text-[10px] font-semibold uppercase tracking-wide ${muted}`}>
                    Lengths ({emaLines.length}/{MAX_EMA_LINES})
                  </p>
                  {emaLines.length === 0 && (
                    <p className={`text-xs ${muted}`}>No EMA lines. Add one below.</p>
                  )}
                  {emaLines.map((line, index) => (
                    <div key={line.id} className={emaRowClass}>
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: line.color }} />
                      <input
                        type="number"
                        min={MIN_INDICATOR_PERIOD}
                        max={MAX_INDICATOR_PERIOD}
                        value={line.period}
                        onChange={(event) => updateEmaLine(line.id, { period: clampPeriod(event.target.value, line.period) })}
                        aria-label={`EMA line ${index + 1} length`}
                        className={`h-8 w-full min-w-0 rounded border px-2 text-xs outline-none focus:border-[#2dd4bf] ${fieldClass}`}
                      />
                      <button
                        type="button"
                        onClick={() => updateEmaLine(line.id, { visible: line.visible === false })}
                        aria-label={line.visible === false ? `Show EMA ${line.period}` : `Hide EMA ${line.period}`}
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded ${isDark ? 'hover:bg-white/10' : 'hover:bg-slate-200'} ${line.visible === false ? muted : ''}`}
                      >
                        {line.visible === false ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                      <button
                        type="button"
                        onClick={() => removeEmaLine(line.id)}
                        aria-label={`Remove EMA ${line.period}`}
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded text-red-500 ${isDark ? 'hover:bg-white/10' : 'hover:bg-slate-200'}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={addEmaLine}
                    disabled={emaLines.length >= MAX_EMA_LINES}
                    className="h-9 rounded-md border border-dashed border-[#2dd4bf] px-3 text-xs font-semibold text-[#2dd4bf] transition hover:bg-[#2dd4bf]/10 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    + Add EMA
                  </button>
                </>
              ) : meta.periodKey ? (
                <label className={`grid gap-1 text-[10px] font-semibold uppercase tracking-wide ${muted}`}>
                  Length
                  <input
                    type="number"
                    min="2"
                    max="200"
                    value={draft[meta.periodKey]}
                    onChange={(event) => update({ [meta.periodKey]: Math.min(200, Math.max(2, Number(event.target.value) || 2)) })}
                    className={`h-9 rounded border px-2 text-xs outline-none focus:border-[#2dd4bf] ${fieldClass}`}
                  />
                </label>
              ) : (
                <p className={`text-xs ${muted}`}>Volume has no configurable inputs.</p>
              )}
            </div>
          )}

          {activeTab === 'style' && (
            <div className="grid gap-3">
              {selectedIndicator === 'macd' && [
                ['MACD line', 'macdColor'],
                ['Signal line', 'macdSignalColor'],
                ['Positive bars', 'macdUpColor'],
                ['Negative bars', 'macdDownColor'],
              ].map(([label, key]) => (
                <label key={key} className={`flex items-center justify-between gap-3 text-[10px] font-semibold uppercase tracking-wide ${muted}`}>
                  {label}
                  <input type="color" value={draft[key]} onChange={(event) => update({ [key]: event.target.value })} className="h-8 w-12 cursor-pointer rounded border-0 bg-transparent" />
                </label>
              ))}

              {selectedIndicator === 'ema' && (emaLines.length === 0 ? (
                <p className={`text-xs ${muted}`}>No EMA lines to style. Add one on the Inputs tab.</p>
              ) : emaLines.map((line) => (
                <div key={line.id} className={emaRowClass}>
                  <span className={`w-16 shrink-0 text-[10px] font-semibold uppercase tracking-wide ${muted}`}>EMA {line.period}</span>
                  <input
                    type="color"
                    value={line.color}
                    onChange={(event) => updateEmaLine(line.id, { color: event.target.value })}
                    aria-label={`EMA ${line.period} line color`}
                    className="h-8 w-12 shrink-0 cursor-pointer rounded border-0 bg-transparent"
                  />
                  <select
                    value={line.width}
                    onChange={(event) => updateEmaLine(line.id, { width: Number(event.target.value) })}
                    aria-label={`EMA ${line.period} line width`}
                    className={`h-8 w-full min-w-0 rounded border px-2 text-xs outline-none focus:border-[#2dd4bf] ${fieldClass}`}
                  >
                    {[1, 2, 3, 4].map((width) => <option key={width} value={width}>{width}px</option>)}
                  </select>
                </div>
              )))}

              {meta.colorKey && (
                <label className={`flex items-center justify-between gap-3 text-[10px] font-semibold uppercase tracking-wide ${muted}`}>
                  Line color
                  <input type="color" value={draft[meta.colorKey]} onChange={(event) => update({ [meta.colorKey]: event.target.value })} className="h-8 w-12 cursor-pointer rounded border-0 bg-transparent" />
                </label>
              )}

              {meta.widthKey && (
                <label className={`grid gap-1 text-[10px] font-semibold uppercase tracking-wide ${muted}`}>
                  Line width
                  <select value={draft[meta.widthKey]} onChange={(event) => update({ [meta.widthKey]: Number(event.target.value) })} className={`h-9 rounded border px-2 text-xs outline-none focus:border-[#2dd4bf] ${fieldClass}`}>
                    {[1, 2, 3, 4].map((width) => <option key={width} value={width}>{width}px</option>)}
                  </select>
                </label>
              )}

              {meta.sizeKey && (
                <label className={`grid gap-1 text-[10px] font-semibold uppercase tracking-wide ${muted}`}>
                  Pane height: {Number(draft[meta.sizeKey]) || (selectedIndicator === 'volume' ? 20 : 25)}%
                  <input type="range" min="10" max="45" value={Number(draft[meta.sizeKey]) || (selectedIndicator === 'volume' ? 20 : 25)} onChange={(event) => update({ [meta.sizeKey]: Number(event.target.value) })} className="accent-[#2dd4bf]" />
                </label>
              )}
            </div>
          )}

          {activeTab === 'visibility' && (
            <label className="flex cursor-pointer items-center justify-between gap-3">
              <span className="text-sm font-semibold">Visible on chart</span>
              <input
                type="checkbox"
                checked={draft[`${selectedIndicator}Visible`] !== false}
                onChange={(event) => update({ [`${selectedIndicator}Visible`]: event.target.checked })}
                className="h-4 w-4 accent-emerald-500"
              />
            </label>
          )}
        </div>

        <div className={`flex items-center justify-between gap-2 border-t px-5 py-3 ${tabBorder}`}>
          <button type="button" onClick={applyDefaults} className={`rounded px-3 py-2 text-xs font-semibold ${isDark ? 'text-gray-300 hover:bg-white/10' : 'text-slate-600 hover:bg-slate-100'}`}>
            Defaults
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className={`h-9 rounded-md border px-4 text-xs font-semibold ${isDark ? 'border-gray-700 text-gray-200 hover:bg-white/5' : 'border-slate-300 text-slate-700 hover:bg-slate-50'}`}>
              Cancel
            </button>
            <button type="button" onClick={commit} className="h-9 rounded-md bg-[#2dd4bf] px-5 text-xs font-bold text-white hover:bg-[#14b8a6]">
              Ok
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

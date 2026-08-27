import React, { useEffect, useState } from 'react';
import { Eye, EyeOff, MoreHorizontal, Settings2, Trash2, X } from 'lucide-react';

const INDICATOR_META = {
  volume: { label: 'Volume', sizeKey: 'volumeSize' },
  sma: { label: 'SMA', periodKey: 'smaPeriod', colorKey: 'smaColor', widthKey: 'smaLineWidth' },
  ema: { label: 'EMA', periodKey: 'emaPeriod', colorKey: 'emaColor', widthKey: 'emaLineWidth' },
  rsi: { label: 'RSI', periodKey: 'rsiPeriod', colorKey: 'rsiColor', widthKey: 'rsiLineWidth', sizeKey: 'rsiSize' },
  macd: { label: 'MACD', widthKey: 'macdLineWidth', sizeKey: 'macdSize' },
};

const INDICATOR_DEFAULTS = {
  volume: { volumeSize: 20 },
  sma: { smaPeriod: 20, smaColor: '#2962ff', smaLineWidth: 2 },
  ema: { emaPeriod: 20, emaColor: '#f59e0b', emaLineWidth: 2 },
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
            return (
              <IndicatorLegendRow
                key={key}
                label={`${meta.label}${meta.periodKey ? ` ${indicators[meta.periodKey]}` : ''}`}
                dotColor={meta.colorKey ? indicators[meta.colorKey] : '#787b86'}
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

  const applyDefaults = () => update(INDICATOR_DEFAULTS[selectedIndicator]);

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

import React, { useEffect, useRef, useState } from 'react';
import { Layers, LineChart, Move, Palette, Rows3, X } from 'lucide-react';
import { useAnchoredTooltip, AnchoredTooltipPortal } from '../../Tooltip/AnchoredTooltip';

const TABS = [
  { key: 'symbol', label: 'Symbol', icon: Rows3 },
  { key: 'statusLine', label: 'Status line', icon: LineChart },
  { key: 'scales', label: 'Scales', icon: Layers },
  { key: 'canvas', label: 'Canvas', icon: Palette },
];

function CheckRow({ isDark, checked, onToggle, label, children }) {
  return (
    <label className="flex items-center gap-2 py-1.5 text-sm">
      <input type="checkbox" checked={checked} onChange={onToggle} className="h-4 w-4 shrink-0 accent-[#2962ff]" />
      <span className="min-w-0 flex-1">{label}</span>
      {children}
    </label>
  );
}

function ColorPair({ up, down, onUpChange, onDownChange, isDark }) {
  const upTooltip = useAnchoredTooltip();
  const downTooltip = useAnchoredTooltip();
  return (
    <div className="flex shrink-0 items-center gap-1">
      <input
        ref={upTooltip.anchorRef}
        type="color"
        value={up}
        onChange={(event) => onUpChange(event.target.value)}
        onMouseEnter={upTooltip.show}
        onMouseLeave={upTooltip.hide}
        onFocus={upTooltip.show}
        onBlur={upTooltip.hide}
        className="h-6 w-7 cursor-pointer rounded border-0 bg-transparent p-0"
      />
      <AnchoredTooltipPortal pos={upTooltip.pos} label="Up color" isDark={isDark} zIndexClass="z-[10031]" />
      <input
        ref={downTooltip.anchorRef}
        type="color"
        value={down}
        onChange={(event) => onDownChange(event.target.value)}
        onMouseEnter={downTooltip.show}
        onMouseLeave={downTooltip.hide}
        onFocus={downTooltip.show}
        onBlur={downTooltip.hide}
        className="h-6 w-7 cursor-pointer rounded border-0 bg-transparent p-0"
      />
      <AnchoredTooltipPortal pos={downTooltip.pos} label="Down color" isDark={isDark} zIndexClass="z-[10031]" />
    </div>
  );
}

function SectionLabel({ isDark, children }) {
  return <div className={`mb-2 text-[10px] font-bold uppercase tracking-wide ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{children}</div>;
}

function SymbolTab({ isDark, fieldClass, draftColors, setDraftColors, draftSize, setDraftSize, candles, priceLines, onCandlesChange, onPriceLinesChange }) {
  return (
    <div className="space-y-6">
      <div>
        <SectionLabel isDark={isDark}>Candles</SectionLabel>
        <div className="flex items-center gap-2 py-1.5 text-sm">
          <span className="min-w-0 flex-1">Body</span>
          <ColorPair
            isDark={isDark}
            up={draftColors.up}
            down={draftColors.down}
            onUpChange={(value) => setDraftColors((current) => ({ ...current, up: value }))}
            onDownChange={(value) => setDraftColors((current) => ({ ...current, down: value }))}
          />
        </div>
        <CheckRow isDark={isDark} checked={candles.borderEnabled} onToggle={() => onCandlesChange({ borderEnabled: !candles.borderEnabled })} label="Borders">
          <ColorPair
            isDark={isDark}
            up={candles.borderUp || draftColors.up}
            down={candles.borderDown || draftColors.down}
            onUpChange={(value) => onCandlesChange({ borderUp: value })}
            onDownChange={(value) => onCandlesChange({ borderDown: value })}
          />
        </CheckRow>
        <CheckRow isDark={isDark} checked={candles.wickEnabled} onToggle={() => onCandlesChange({ wickEnabled: !candles.wickEnabled })} label="Wick">
          <ColorPair
            isDark={isDark}
            up={candles.wickUp || draftColors.up}
            down={candles.wickDown || draftColors.down}
            onUpChange={(value) => onCandlesChange({ wickUp: value })}
            onDownChange={(value) => onCandlesChange({ wickDown: value })}
          />
        </CheckRow>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <span className="w-12 shrink-0">Size</span>
          <input type="range" min="3" max="24" step="1" value={draftSize} onChange={(event) => setDraftSize(Number(event.target.value))} className="min-w-0 flex-1 accent-[#2962ff]" />
          <span className="w-6 shrink-0 text-right text-xs tabular-nums">{draftSize}</span>
        </label>
      </div>
      <div>
        <SectionLabel isDark={isDark}>Price lines</SectionLabel>
        <CheckRow isDark={isDark} checked={priceLines.last} onToggle={() => onPriceLinesChange({ last: !priceLines.last })} label="Last" />
        <CheckRow isDark={isDark} checked={priceLines.previousClose} onToggle={() => onPriceLinesChange({ previousClose: !priceLines.previousClose })} label="Previous close" />
        <CheckRow isDark={isDark} checked={priceLines.highLow} onToggle={() => onPriceLinesChange({ highLow: !priceLines.highLow })} label="High and low (visible range)" />
        <p className={`mt-2 text-[11px] leading-4 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Previous close uses the most recently completed candle in the loaded history, not a calendar day's close.</p>
      </div>
    </div>
  );
}

function StatusLineTab({ isDark, statusLine, onChange }) {
  const items = [
    ['symbol', 'Symbol'],
    ['exchange', 'Exchange / last price label'],
    ['ohlc', 'Open, High, Low, Close values'],
    ['change', 'Change value and percentage'],
  ];

  return (
    <div>
      <SectionLabel isDark={isDark}>Status line</SectionLabel>
      {items.map(([key, label]) => (
        <CheckRow key={key} isDark={isDark} checked={statusLine[key]} onToggle={() => onChange({ [key]: !statusLine[key] })} label={label} />
      ))}
    </div>
  );
}

function ScalesTab({ isDark, fieldClass, scales, onChange }) {
  return (
    <div className="space-y-5">
      <div>
        <SectionLabel isDark={isDark}>Precision</SectionLabel>
        <select value={scales.precision} onChange={(event) => onChange({ precision: event.target.value })} className={`h-9 w-full rounded-md border px-3 text-sm outline-none ${fieldClass}`}>
          <option value="default">Default</option>
          {[0, 1, 2, 3, 4, 5, 6, 8].map((n) => <option key={n} value={String(n)}>{n} decimal{n === 1 ? '' : 's'}</option>)}
        </select>
      </div>
      <div>
        <SectionLabel isDark={isDark}>Scale</SectionLabel>
        <CheckRow isDark={isDark} checked={scales.autoScale} onToggle={() => onChange({ autoScale: !scales.autoScale })} label="Auto (fit visible candles)" />
        <CheckRow isDark={isDark} checked={scales.logScale} onToggle={() => onChange({ logScale: !scales.logScale })} label="Logarithmic scale" />
      </div>
    </div>
  );
}

function CanvasTab({ isDark, canvas, onChange }) {
  return (
    <div className="space-y-5">
      <div>
        <SectionLabel isDark={isDark}>Background</SectionLabel>
        <div className="flex items-center gap-2">
          <input type="color" value={canvas.background || (isDark ? '#0b0d10' : '#ffffff')} onChange={(event) => onChange({ background: event.target.value })} className="h-8 w-9 cursor-pointer rounded border-0 bg-transparent p-0" />
          <button type="button" onClick={() => onChange({ background: null })} className={`text-xs font-semibold ${isDark ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-900'}`}>Reset to theme default</button>
        </div>
      </div>
      <div>
        <SectionLabel isDark={isDark}>Grid lines</SectionLabel>
        <div className="flex items-center gap-2">
          <input type="color" value={canvas.gridColor || '#334155'} onChange={(event) => onChange({ gridColor: event.target.value })} className="h-8 w-9 cursor-pointer rounded border-0 bg-transparent p-0" />
          <button type="button" onClick={() => onChange({ gridColor: null })} className={`text-xs font-semibold ${isDark ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-900'}`}>Reset to theme default</button>
        </div>
      </div>
    </div>
  );
}

const DRAG_MARGIN = 32;

export default function ChartSettingsModal({ open, onClose, isDark, candleColors, candleSize, chartDisplay, onCandleColorChange, onCandleSizeChange, onChartDisplayChange }) {
  const [activeTab, setActiveTab] = useState('symbol');
  const [draftColors, setDraftColors] = useState(candleColors);
  const [draftSize, setDraftSize] = useState(candleSize);
  const [draftDisplay, setDraftDisplay] = useState(chartDisplay);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const panelRef = useRef(null);
  const dragCleanupRef = useRef(null);
  const dragHandleTooltip = useAnchoredTooltip();

  useEffect(() => {
    if (!open) return;
    setActiveTab('symbol');
    setDraftColors(candleColors);
    setDraftSize(candleSize);
    setDraftDisplay(chartDisplay);
    setDragOffset({ x: 0, y: 0 });
    // Only re-seed the draft when the modal opens, not on every parent re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => () => dragCleanupRef.current?.(), []);

  if (!open) return null;

  const patchDraft = (section, patch) => {
    setDraftDisplay((current) => ({ ...current, [section]: { ...current[section], ...patch } }));
  };

  const handleOk = () => {
    onCandleColorChange(draftColors);
    onCandleSizeChange(draftSize);
    onChartDisplayChange(draftDisplay);
    onClose();
  };

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
      const clampedLeft = Math.min(Math.max(nextLeft, DRAG_MARGIN - startRect.width), window.innerWidth - DRAG_MARGIN);
      const clampedTop = Math.min(Math.max(nextTop, 0), window.innerHeight - DRAG_MARGIN);

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

  const panelClass = isDark ? 'border-gray-700 bg-black-table-color text-white' : 'border-gray-200 bg-white text-gray-900';
  const fieldClass = isDark ? 'border-gray-700 bg-black-table-color/60 text-white' : 'border-gray-200 bg-white text-gray-900';

  return (
    <div className="fixed inset-0 z-[10030] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div
        ref={panelRef}
        className={`flex max-h-[calc(100dvh-2rem)] w-full max-w-3xl flex-col overflow-hidden rounded-xl border shadow-2xl ${panelClass}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="chart-settings-title"
        style={{ transform: `translate3d(${dragOffset.x}px, ${dragOffset.y}px, 0)`, willChange: 'transform' }}
      >
        <div
          ref={dragHandleTooltip.anchorRef}
          onPointerDown={handleDragHandlePointerDown}
          onMouseEnter={dragHandleTooltip.show}
          onMouseLeave={dragHandleTooltip.hide}
          onFocus={dragHandleTooltip.show}
          onBlur={dragHandleTooltip.hide}
          className={`flex select-none items-center justify-between border-b px-5 py-4 ${isDragging ? 'cursor-grabbing' : 'cursor-grab'} ${isDark ? 'border-gray-700' : 'border-gray-200'}`}
        >
          <h2 id="chart-settings-title" className="flex items-center gap-2 text-lg font-bold">
            <Move size={15} className={isDark ? 'text-gray-500' : 'text-gray-400'} aria-hidden="true" />
            Chart settings
          </h2>
          <button type="button" onClick={onClose} className={`rounded-md p-1.5 ${isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'}`} aria-label="Close"><X size={18} /></button>
        </div>
        <AnchoredTooltipPortal pos={dragHandleTooltip.pos} label="Drag to move" isDark={isDark} zIndexClass="z-[10031]" />
        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
          <div className={`flex shrink-0 gap-1 overflow-x-auto border-b p-2 sm:w-44 sm:flex-col sm:overflow-visible sm:border-b-0 sm:border-r ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
            {TABS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveTab(key)}
                className={`flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-semibold whitespace-nowrap ${activeTab === key ? 'bg-[#2962ff] text-white' : isDark ? 'text-gray-300 hover:bg-white/10' : 'text-gray-600 hover:bg-gray-100'}`}
              >
                <Icon size={15} />
                {label}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            {activeTab === 'symbol' && (
              <SymbolTab
                isDark={isDark}
                fieldClass={fieldClass}
                draftColors={draftColors}
                setDraftColors={setDraftColors}
                draftSize={draftSize}
                setDraftSize={setDraftSize}
                candles={draftDisplay.candles}
                priceLines={draftDisplay.priceLines}
                onCandlesChange={(patch) => patchDraft('candles', patch)}
                onPriceLinesChange={(patch) => patchDraft('priceLines', patch)}
              />
            )}
            {activeTab === 'statusLine' && (
              <StatusLineTab isDark={isDark} statusLine={draftDisplay.statusLine} onChange={(patch) => patchDraft('statusLine', patch)} />
            )}
            {activeTab === 'scales' && (
              <ScalesTab isDark={isDark} fieldClass={fieldClass} scales={draftDisplay.scales} onChange={(patch) => patchDraft('scales', patch)} />
            )}
            {activeTab === 'canvas' && (
              <CanvasTab isDark={isDark} canvas={draftDisplay.canvas} onChange={(patch) => patchDraft('canvas', patch)} />
            )}
          </div>
        </div>
        <div className={`flex justify-end gap-2 border-t px-5 py-4 ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
          <button type="button" onClick={onClose} className={`h-9 rounded-md border px-4 text-xs font-semibold ${isDark ? 'border-gray-700 hover:bg-white/5' : 'border-gray-200 hover:bg-gray-50'}`}>Cancel</button>
          <button type="button" onClick={handleOk} className="h-9 rounded-md bg-[#2962ff] px-5 text-xs font-bold text-white hover:bg-blue-600">Ok</button>
        </div>
      </div>
    </div>
  );
}

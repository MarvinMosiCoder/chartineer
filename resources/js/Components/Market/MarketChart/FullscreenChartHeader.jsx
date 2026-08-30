import React, { useEffect, useState } from 'react';
import { ListChecks, Maximize2, MessageSquarePlus, Minimize2, Wallet } from 'lucide-react';
import getAppLogo from '../../SystemSettings/ApplicationLogo';
import getAppName from '../../SystemSettings/ApplicationName';
import AppNameWordmark from '../../SystemSettings/AppNameWordmark';
import ChartHeader from './ChartHeader';
import ProductHubModal from '../../Feedback/ProductHubModal';
import WatchlistPanel from '../WatchlistPanel';
import { watchlistMarketKey } from '../../../Context/WatchlistContext';
import { useAnchoredTooltip, AnchoredTooltipPortal } from '../../Tooltip/AnchoredTooltip';

export default function FullscreenChartHeader({
  chartHeaderProps,
  isFullscreen = true,
  onToggleFullscreen,
  chartTheme,
  backtestAccount,
  isEntryPanelOpen,
  onEntryPanelOpenChange,
  showAppName = true,
  showEntryWallet = true,
}) {
  const [appLogo, setAppLogo] = useState('');
  const [appName, setAppName] = useState('BacktradeLab');
  const [isWatchlistPanelOpen, setIsWatchlistPanelOpen] = useState(false);
  const [isProductHubOpen, setIsProductHubOpen] = useState(false);
  const isDark = chartTheme?.mode === 'dark';
  // Manual wiring, not IconTooltipButton: its wrapping <span> duplicates the
  // full className onto both itself and the <button>, so a visible
  // border/background (as these four buttons have) renders as a nested
  // double box. See docs/developer/trading-chart.md.
  const watchlistsTooltip = useAnchoredTooltip('bottom');
  const productHubTooltip = useAnchoredTooltip('bottom');
  const enterPositionTooltip = useAnchoredTooltip('bottom');
  const fullscreenTooltip = useAnchoredTooltip('bottom');

  useEffect(() => {
    let cancelled = false;
    Promise.all([getAppLogo(), getAppName()]).then(([logo, name]) => {
      if (cancelled) return;
      setAppLogo(logo || '');
      setAppName(name || 'BacktradeLab');
    });
    return () => { cancelled = true; };
  }, []);

  // Same pattern as the chart legend's outside-click dismissal
  // (MarketChart.jsx's isLegendActive effect) and ChartHeader.jsx's
  // combined version of it: close the Watchlists dropdown on any click
  // outside its own trigger/panel — chart background included.
  useEffect(() => {
    if (!isWatchlistPanelOpen) return undefined;
    const handleOutsideClick = (event) => {
      // Both checks matter here: the watchlists-panel marker also covers
      // WatchlistPanel.jsx's react-select menu (a document.body portal
      // tagged with the same attribute — see its menuPortalTarget setup),
      // and data-confirm-dialog covers useConfirm()'s modal (used by both
      // this panel's saved-symbol delete flow and WatchlistContext.jsx's
      // own create/edit/delete-watchlist modals) — neither is a DOM
      // descendant of this wrapper, so without these a mousedown inside
      // either one reads as "outside" and closes this popover before the
      // click can do anything.
      if (event.target?.closest?.('[data-chart-ui="watchlists-panel"], [data-confirm-dialog]')) return;
      setIsWatchlistPanelOpen(false);
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isWatchlistPanelOpen]);

  return (
    <header
      data-chart-ui="fullscreen-navbar"
      className="relative z-[80] flex h-12 shrink-0 items-center border-b"
      style={{
        backgroundColor: chartTheme?.panel ?? (isDark ? '#131722' : '#ffffff'),
        borderColor: chartTheme?.border ?? (isDark ? '#2a2e39' : '#e2e8f0'),
      }}
    >
      <div className={`flex h-full min-w-0 shrink-0 items-center gap-2 px-2 sm:px-3 ${isFullscreen ? 'border-r' : ''}`} style={{ borderColor: chartTheme?.border }}>
        {appLogo && <img src={appLogo} alt="" className="h-7 w-7 shrink-0 object-contain" draggable="false" />}
        {showAppName && (
          <span className={`hidden max-w-32 truncate text-xs font-bold sm:block ${isDark ? 'text-white' : 'text-slate-900'}`}>
            <AppNameWordmark name={appName} />
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1 overflow-visible px-1.5">
        {/* `shadow-none` was dropped from this className: it never took effect
            (Tailwind emits `.shadow-xl` after `.shadow-none`, so ChartHeader's base
            class won regardless of order here), and that base no longer sets a
            shadow at all. */}
        <ChartHeader
          {...chartHeaderProps}
          compact
          className="h-10 flex-nowrap border-0 bg-transparent p-0"
        />
      </div>

      {/* Every button in this bar is an icon-only h-8 square: their anchored hover
          labels already name them, so text spans only ate header width the symbol
          and timeframe controls need more. Enter Position is min-w-8 rather than w-8
          because it still shows the account balance beside its icon — data, not a
          label the tooltip repeats. */}
      <button
        ref={productHubTooltip.anchorRef}
        type="button"
        aria-label="Product Hub"
        onClick={() => setIsProductHubOpen(true)}
        onMouseEnter={productHubTooltip.show}
        onMouseLeave={productHubTooltip.hide}
        onFocus={productHubTooltip.show}
        onBlur={productHubTooltip.hide}
        className={`mx-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border transition ${
          isProductHubOpen
            ? 'border-[#2dd4bf] bg-[#2dd4bf] text-white'
            : isDark
              ? 'border-gray-700 bg-black-table-color text-white hover:bg-skin-black-light'
              : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-100'
        }`}
      >
        <MessageSquarePlus size={14} />
      </button>
      <AnchoredTooltipPortal pos={productHubTooltip.pos} label="Suggestions and changelog" isDark={isDark} />
      <ProductHubModal
        open={isProductHubOpen}
        onClose={() => setIsProductHubOpen(false)}
        chartTheme={chartTheme}
        context={{
          symbol: chartHeaderProps?.symbol,
          exchange: chartHeaderProps?.exchange,
          category: chartHeaderProps?.marketCategory,
          timeframe: chartHeaderProps?.timeframe,
          replayMode: Boolean(chartHeaderProps?.replayMode),
        }}
      />

      <div data-chart-ui="watchlists-panel" className="relative mx-1 shrink-0">
        <button
          ref={watchlistsTooltip.anchorRef}
          type="button"
          aria-label="Watchlists"
          onClick={() => setIsWatchlistPanelOpen((current) => !current)}
          onMouseEnter={watchlistsTooltip.show}
          onMouseLeave={watchlistsTooltip.hide}
          onFocus={watchlistsTooltip.show}
          onBlur={watchlistsTooltip.hide}
          aria-expanded={isWatchlistPanelOpen}
          className={`flex h-8 w-8 items-center justify-center rounded-md border transition ${
            isWatchlistPanelOpen
              ? 'border-[#2dd4bf] bg-[#2dd4bf] text-white'
              : isDark
                ? 'border-gray-700 bg-black-table-color text-white hover:bg-skin-black-light'
                : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-100'
          }`}
        >
          <ListChecks size={14} />
        </button>
        <AnchoredTooltipPortal pos={watchlistsTooltip.pos} label="Watchlists" isDark={isDark} />
        {isWatchlistPanelOpen && (
          <div className="absolute right-0 top-11 z-[130]">
            <WatchlistPanel
              isFullscreen
              compact
              activeSymbolKey={chartHeaderProps?.symbol ? watchlistMarketKey(chartHeaderProps.exchange, chartHeaderProps.marketCategory, chartHeaderProps.symbol) : null}
              onSelectSymbol={(market) => chartHeaderProps?.onSymbolChange?.(`${market.exchange ?? 'bybit'}:${market.category ?? 'spot'}:${market.symbol}`)}
            />
          </div>
        )}
      </div>

      {/* min-w-9 rather than w-9: collapses to the same square as its neighbours,
          but still grows for the balance readout below, which is data (the account's
          cash) rather than a label the hover tooltip already repeats. */}
      {showEntryWallet && <button
        ref={enterPositionTooltip.anchorRef}
        type="button"
        data-tour="position"
        aria-label="Enter Position"
        onClick={() => onEntryPanelOpenChange?.(!isEntryPanelOpen)}
        onMouseEnter={enterPositionTooltip.show}
        onMouseLeave={enterPositionTooltip.hide}
        onFocus={enterPositionTooltip.show}
        onBlur={enterPositionTooltip.hide}
        aria-expanded={isEntryPanelOpen}
        className={`mx-1 flex h-8 min-w-8 shrink-0 items-center justify-center gap-1.5 rounded-md border px-2 transition ${
          isEntryPanelOpen
            ? 'border-[#2dd4bf] bg-[#2dd4bf] text-white'
            : isDark
              ? 'border-gray-700 bg-black-table-color text-white hover:bg-skin-black-light'
              : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-100'
        }`}
      >
        <Wallet size={14} />
        {backtestAccount && (
          <span className="hidden text-[10px] tabular-nums opacity-75 xl:inline">
            {Number(backtestAccount.cashBalance ?? backtestAccount.cash_balance ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </span>
        )}
      </button>}
      {showEntryWallet && <AnchoredTooltipPortal pos={enterPositionTooltip.pos} label="Enter Position" isDark={isDark} />}

      <button
        ref={fullscreenTooltip.anchorRef}
        type="button"
        aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        onClick={onToggleFullscreen}
        onMouseEnter={fullscreenTooltip.show}
        onMouseLeave={fullscreenTooltip.hide}
        onFocus={fullscreenTooltip.show}
        onBlur={fullscreenTooltip.hide}
        className={`mx-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border transition sm:mx-2 ${
          isDark
            ? 'border-gray-700 bg-black-table-color text-white hover:bg-white hover:text-black'
            : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-900 hover:text-white'
        }`}
      >
        {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
      </button>
      <AnchoredTooltipPortal pos={fullscreenTooltip.pos} label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'} isDark={isDark} />
    </header>
  );
}

import React, { useEffect, useState } from 'react';
import { ListChecks, Maximize2, Minimize2, Wallet } from 'lucide-react';
import getAppLogo from '../../SystemSettings/ApplicationLogo';
import getAppName from '../../SystemSettings/ApplicationName';
import ChartHeader from './ChartHeader';
import WatchlistPanel from '../WatchlistPanel';
import { watchlistMarketKey } from '../../../Context/WatchlistContext';

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
  const isDark = chartTheme?.mode === 'dark';

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
            {appName}
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1 overflow-visible px-1.5">
        <ChartHeader
          {...chartHeaderProps}
          compact
          className="h-10 flex-nowrap border-0 bg-transparent p-0 shadow-none"
        />
      </div>

      <div data-chart-ui="watchlists-panel" className="relative mx-1 shrink-0">
        <button
          type="button"
          onClick={() => setIsWatchlistPanelOpen((current) => !current)}
          className={`flex h-9 items-center gap-2 rounded-md border px-2 transition ${
            isWatchlistPanelOpen
              ? 'border-[#2962ff] bg-[#2962ff] text-white'
              : isDark
                ? 'border-gray-700 bg-black-table-color text-white hover:bg-skin-black-light'
                : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-100'
          }`}
          title="Watchlists"
          aria-label="Watchlists"
          aria-expanded={isWatchlistPanelOpen}
        >
          <ListChecks size={15} />
          <span className="hidden text-[11px] font-semibold lg:inline">Watchlists</span>
        </button>
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

      {showEntryWallet && <button
        type="button"
        onClick={() => onEntryPanelOpenChange?.(!isEntryPanelOpen)}
        className={`mx-1 flex h-9 shrink-0 items-center gap-2 rounded-md border px-2 transition ${
          isEntryPanelOpen
            ? 'border-[#2962ff] bg-[#2962ff] text-white'
            : isDark
              ? 'border-gray-700 bg-black-table-color text-white hover:bg-skin-black-light'
              : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-100'
        }`}
        title="Enter Position"
        aria-label="Enter Position"
        aria-expanded={isEntryPanelOpen}
      >
        <Wallet size={15} />
        <span className="hidden text-[11px] font-semibold lg:inline">Enter Position</span>
        {backtestAccount && (
          <span className="hidden text-[10px] tabular-nums opacity-75 xl:inline">
            {Number(backtestAccount.cashBalance ?? backtestAccount.cash_balance ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </span>
        )}
      </button>}

      <button
        type="button"
        onClick={onToggleFullscreen}
        className={`mx-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border transition sm:mx-2 ${
          isDark
            ? 'border-gray-700 bg-black-table-color text-white hover:bg-white hover:text-black'
            : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-900 hover:text-white'
        }`}
        title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
      >
        {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
      </button>
    </header>
  );
}

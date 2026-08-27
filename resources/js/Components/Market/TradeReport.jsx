import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { usePage } from '@inertiajs/react';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Lightbulb,
  Pencil,
  RefreshCcw,
  Save,
  Search,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react';
import { useTheme } from '../../Context/ThemeContext';
import StatCard from './StatCard';

const DEFAULT_TRADES_PER_PAGE = 10;

function formatMoney(value, digits = 2) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '---';

  return number.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
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

function formatDisplayMoney(value, currency, phpRate, digits = 2) {
  const amount = quoteToDisplayAmount(value, currency, phpRate);
  if (amount == null) return '---';
  return `${formatMoney(amount, digits)} ${currency}`;
}

function formatPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '---';
  return `${number.toFixed(2)}%`;
}

function formatLeverage(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return '1x';
  return `${Number(number.toFixed(2))}x`;
}

function getTradeDate(trade) {
  if (Number.isFinite(Number(trade?.closedAtTime))) {
    return new Date(Number(trade.closedAtTime) * 1000);
  }

  if (trade?.updatedAt) {
    return new Date(trade.updatedAt);
  }

  if (trade?.createdAt) {
    return new Date(trade.createdAt);
  }

  return null;
}

function formatTradeDate(trade) {
  const date = getTradeDate(trade);
  if (!date || Number.isNaN(date.getTime())) return '---';

  return date.toLocaleString(undefined, {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getResultClass(result, isDark) {
  if (result === 'win') {
    return isDark
      ? 'bg-emerald-500/15 text-emerald-300 ring-emerald-400/30'
      : 'bg-emerald-50 text-emerald-700 ring-emerald-200';
  }
  if (result === 'loss') {
    return isDark
      ? 'bg-red-500/15 text-red-300 ring-red-400/30'
      : 'bg-red-50 text-red-700 ring-red-200';
  }
  return isDark
    ? 'bg-gray-500/15 text-gray-300 ring-gray-400/30'
    : 'bg-slate-100 text-slate-600 ring-slate-300';
}

function getPnlClass(value, isDark) {
  const number = Number(value);
  if (number > 0) return isDark ? 'text-emerald-300' : 'text-emerald-700';
  if (number < 0) return isDark ? 'text-red-300' : 'text-red-700';
  return isDark ? 'text-gray-300' : 'text-slate-600';
}

function InsightCard({ insight, isDark }) {
  const toneClass =
    insight.tone === 'positive'
      ? 'border-emerald-500/30 bg-emerald-500/10'
      : insight.tone === 'warning'
        ? 'border-amber-500/30 bg-amber-500/10'
        : isDark
          ? 'border-gray-700 bg-black-table-color'
          : 'border-slate-200 bg-slate-50';
  const titleClass =
    insight.tone === 'positive'
      ? isDark ? 'text-emerald-300' : 'text-emerald-700'
      : insight.tone === 'warning'
        ? isDark ? 'text-amber-300' : 'text-amber-700'
        : isDark ? 'text-white' : 'text-slate-900';

  return (
    <div className={`rounded-md border p-3 ${toneClass}`}>
      <div className={`mb-1 text-xs font-semibold ${titleClass}`}>{insight.title}</div>
      <div className={`text-xs leading-relaxed ${isDark ? 'text-gray-300' : 'text-slate-600'}`}>{insight.message}</div>
    </div>
  );
}

function normalizeTagText(value) {
  return String(value ?? '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 12)
    .join(', ');
}

export default function TradeReport({ refreshKey = 0 }) {
  const { theme: adminTheme } = useTheme();
  const { auth } = usePage().props;
  const preferenceUserId = auth?.user?.id ?? 'guest';
  const displayCurrencyStorageKey = `market-backtest-display-currency:${preferenceUserId}`;
  const phpRateStorageKey = `market-backtest-php-rate:${preferenceUserId}`;
  const isDark = adminTheme === 'bg-skin-black';
  const [report, setReport] = useState({ summary: {}, trades: [], insights: null, playbookPerformance: [], advanced: {}, monteCarlo: {} });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [displayCurrency, setDisplayCurrency] = useState(() => (
    getStoredValue(displayCurrencyStorageKey, 'USDT') === 'PHP' ? 'PHP' : 'USDT'
  ));
  const [phpRate, setPhpRate] = useState(() => getStoredValue(phpRateStorageKey, '58'));
  const [editingTradeId, setEditingTradeId] = useState(null);
  const [journalDraft, setJournalDraft] = useState({});
  const [journalSaving, setJournalSaving] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [exportingFormat, setExportingFormat] = useState(null);
  const [exportNotice, setExportNotice] = useState('');
  const [symbolFilter, setSymbolFilter] = useState('all');
  const [sideFilter, setSideFilter] = useState('all');
  const [resultFilter, setResultFilter] = useState('all');
  const [journalFilter, setJournalFilter] = useState('all');
  const [tradesPerPage, setTradesPerPage] = useState(DEFAULT_TRADES_PER_PAGE);

  const loadReport = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await axios.get('/market-backtest/report', {
        params: { limit: 500 },
        headers: { Accept: 'application/json' },
      });

      setReport({
        account: response.data?.account ?? null,
        summary: response.data?.summary ?? {},
        trades: Array.isArray(response.data?.trades) ? response.data.trades : [],
        insights: response.data?.insights ?? null,
        playbookPerformance: response.data?.playbookPerformance ?? [],
        advanced: response.data?.advanced ?? {},
        monteCarlo: response.data?.monteCarlo ?? {},
      });
    } catch (err) {
      setError(err.response?.data?.message ?? err.message ?? 'Failed to load trade report');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReport();
  }, [refreshKey]);

  useEffect(() => {
    setCurrentPage(1);
  }, [refreshKey]);

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

  const summary = report.summary ?? {};
  const insights = report.insights ?? null;
  const playbookPerformance = report.playbookPerformance ?? [];
  const advanced = report.advanced ?? {};
  const monteCarlo = report.monteCarlo ?? {};
  // Sorted by real creation time (when the trade was actually entered in the
  // browser), not `closedAtTime` (the simulated backtest/candle date) — a user
  // can replay old historical dates today and recent ones tomorrow, so the
  // simulated date doesn't reflect the order trades were actually made in.
  const sortedTrades = useMemo(() => {
    return [...report.trades].sort((a, b) => {
      const aCreated = new Date(a.createdAt ?? 0).getTime();
      const bCreated = new Date(b.createdAt ?? 0).getTime();

      if (aCreated !== bCreated) return bCreated - aCreated;

      return Number(b.id ?? 0) - Number(a.id ?? 0);
    });
  }, [report.trades]);
  const availableSymbols = useMemo(() => (
    [...new Set(sortedTrades.map((trade) => String(trade.symbol ?? '').trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b))
  ), [sortedTrades]);
  const filteredTrades = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return sortedTrades.filter((trade) => {
      const hasJournal = Boolean(
        trade.setupTag
        || trade.emotion
        || trade.entryReason
        || trade.exitReason
        || trade.mistake
        || trade.journalNotes
        || (trade.tags ?? []).length
      );
      const searchableText = [
        trade.symbol,
        trade.side,
        trade.result,
        trade.setupTag,
        ...(trade.tags ?? []),
        trade.emotion,
        trade.entryReason,
        trade.exitReason,
        trade.mistake,
        trade.journalNotes,
      ].filter(Boolean).join(' ').toLowerCase();

      return (!query || searchableText.includes(query))
        && (symbolFilter === 'all' || trade.symbol === symbolFilter)
        && (sideFilter === 'all' || trade.side === sideFilter)
        && (resultFilter === 'all' || trade.result === resultFilter)
        && (journalFilter === 'all' || (journalFilter === 'journaled' ? hasJournal : !hasJournal));
    });
  }, [journalFilter, resultFilter, searchQuery, sideFilter, sortedTrades, symbolFilter]);
  const allTradesCount = sortedTrades.length;
  const totalTrades = filteredTrades.length;
  const totalPages = Math.max(Math.ceil(totalTrades / tradesPerPage), 1);
  const safeCurrentPage = Math.min(Math.max(currentPage, 1), totalPages);
  const pageStart = totalTrades ? (safeCurrentPage - 1) * tradesPerPage : 0;
  const pageEnd = Math.min(pageStart + tradesPerPage, totalTrades);
  const paginatedTrades = filteredTrades.slice(pageStart, pageEnd);
  const editingTrade = sortedTrades.find((trade) => trade.id === editingTradeId) ?? null;
  const visiblePageNumbers = useMemo(() => {
    const windowSize = 5;
    let start = Math.max(safeCurrentPage - 2, 1);
    const end = Math.min(start + windowSize - 1, totalPages);
    start = Math.max(end - windowSize + 1, 1);
    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  }, [safeCurrentPage, totalPages]);
  const quoteCurrency = report.account?.quoteCurrency ?? 'USDT';
  const normalizedPhpRate = getPhpRate(phpRate);
  const formatReportMoney = (value, digits = 2) => formatDisplayMoney(
    value,
    displayCurrency,
    normalizedPhpRate,
    digits
  );

  useEffect(() => {
    if (currentPage !== safeCurrentPage) {
      setCurrentPage(safeCurrentPage);
    }
  }, [currentPage, safeCurrentPage]);

  useEffect(() => {
    setCurrentPage(1);
    cancelJournalEdit();
  }, [journalFilter, resultFilter, searchQuery, sideFilter, symbolFilter, tradesPerPage]);

  const startJournalEdit = (trade) => {
    setEditingTradeId(trade.id);
    setJournalDraft({
      setupTag: trade.setupTag ?? '',
      tags: normalizeTagText((trade.tags ?? []).join(', ')),
      entryReason: trade.entryReason ?? '',
      exitReason: trade.exitReason ?? '',
      mistake: trade.mistake ?? '',
      emotion: trade.emotion ?? '',
      journalNotes: trade.journalNotes ?? '',
    });
  };

  const cancelJournalEdit = () => {
    setEditingTradeId(null);
    setJournalDraft({});
  };

  const updateJournalDraft = (field, value) => {
    setJournalDraft((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const saveJournal = async (tradeId) => {
    setJournalSaving(true);
    setError('');

    try {
      const response = await axios.put(`/market-backtest/trades/${tradeId}/journal`, {
        setup_tag: journalDraft.setupTag,
        tags: String(journalDraft.tags ?? '')
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
        entry_reason: journalDraft.entryReason,
        exit_reason: journalDraft.exitReason,
        mistake: journalDraft.mistake,
        emotion: journalDraft.emotion,
        journal_notes: journalDraft.journalNotes,
      });
      const updatedTrade = response.data?.trade;

      if (updatedTrade) {
        setReport((current) => ({
          ...current,
          trades: current.trades.map((trade) => (
            trade.id === updatedTrade.id ? updatedTrade : trade
          )),
        }));
      }

      cancelJournalEdit();
    } catch (err) {
      setError(err.response?.data?.message ?? err.message ?? 'Failed to save journal');
    } finally {
      setJournalSaving(false);
    }
  };

  const goToPage = (page) => {
    setCurrentPage(Math.min(Math.max(page, 1), totalPages));
    cancelJournalEdit();
  };

  const exportReport = async (format) => {
    setExportingFormat(format);
    setExportNotice('');
    try {
      await axios.post('/market-backtest/report/export', { format, limit: 5000 });
      setExportNotice("Export started — you'll get a notification with a download link when it's ready.");
    } catch (err) {
      setError(err.response?.data?.message ?? err.message ?? 'Failed to start export');
    } finally {
      setExportingFormat(null);
    }
  };

  const shellClass = isDark
    ? 'border-gray-800 bg-skin-black text-white shadow-xl'
    : 'border-slate-200 bg-white text-slate-900 shadow-sm';
  const borderClass = isDark ? 'border-gray-800' : 'border-slate-200';
  const mutedTextClass = isDark ? 'text-gray-400' : 'text-slate-500';
  const faintTextClass = isDark ? 'text-gray-500' : 'text-slate-400';
  const valueTextClass = isDark ? 'text-white' : 'text-slate-900';
  const bodyTextClass = isDark ? 'text-gray-300' : 'text-slate-600';
  const sectionClass = isDark
    ? 'border-gray-800 bg-black-table-color/70'
    : 'border-slate-200 bg-slate-50';
  const buttonClass = isDark
    ? 'bg-black-table-color text-white hover:bg-skin-black-light'
    : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-100';
  const fieldClass = isDark
    ? 'border-gray-700 bg-black-table-color text-white placeholder:text-gray-500'
    : 'border-slate-300 bg-white text-slate-900 placeholder:text-slate-400';
  const tableDivideClass = isDark ? 'divide-gray-800' : 'divide-slate-200';
  const tableHeadClass = isDark
    ? 'bg-skin-black text-gray-400'
    : 'bg-white text-slate-500';
  const rowHoverClass = isDark ? 'hover:bg-skin-black-light/60' : 'hover:bg-white';
  const inactivePillClass = isDark
    ? 'bg-black-table-color text-gray-600'
    : 'bg-slate-100 text-slate-400';
  const longTextClass = isDark ? 'text-emerald-300' : 'text-emerald-700';
  const shortTextClass = isDark ? 'text-red-300' : 'text-red-700';

  const renderBreakdownPanel = (title, buckets) => {
    const rows = Array.isArray(buckets) ? buckets : [];
    const maxAbsPnl = Math.max(1e-9, ...rows.map((bucket) => Math.abs(Number(bucket.netPnl ?? 0))));

    return (
      <div key={title} className={`rounded-md border p-3 ${sectionClass}`}>
        <div className={`mb-2 text-xs font-semibold uppercase tracking-wide ${mutedTextClass}`}>{title}</div>
        {rows.length ? (
          <div className="space-y-2">
            {rows.map((bucket) => {
              const netPnl = Number(bucket.netPnl ?? 0);
              const barWidthPercent = Math.max(2, (Math.abs(netPnl) / maxAbsPnl) * 100);
              const isPositive = netPnl >= 0;

              return (
                <div key={bucket.label}>
                  <div className={`flex items-center justify-between gap-2 text-[11px] ${valueTextClass}`}>
                    <span className="font-semibold">{bucket.label}</span>
                    <span className={mutedTextClass}>{bucket.trades} trades · {formatPercent(bucket.winRate)} wins</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <div className={`h-1.5 flex-1 overflow-hidden rounded-full ${isDark ? 'bg-white/10' : 'bg-slate-200'}`}>
                      <div
                        className={`h-full rounded-full ${isPositive ? 'bg-emerald-500 bg-opacity-60' : 'bg-red-500 bg-opacity-60'}`}
                        style={{ width: `${barWidthPercent}%` }}
                      />
                    </div>
                    <span className={`w-20 shrink-0 text-right text-[11px] font-semibold ${isPositive ? longTextClass : shortTextClass}`}>
                      {formatReportMoney(netPnl)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className={`text-[11px] ${mutedTextClass}`}>No closed trades yet.</div>
        )}
      </div>
    );
  };

  return (
    <div className={`rounded-lg border ${shellClass}`}>
      <div className={`flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 ${borderClass}`}>
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <span>Trade Win/Loss Report</span>
          </div>
          <p className={`mt-1 text-xs ${mutedTextClass}`}>Closed replay trades, grouped like exchange history.</p>
        </div>
        <div className="flex flex-wrap gap-2" data-tour="journal-export">
          <button
            type="button"
            onClick={() => exportReport('csv')}
            disabled={exportingFormat !== null}
            className={`inline-flex h-8 items-center gap-2 rounded-md px-3 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${buttonClass}`}
          >
            <Download size={14} className={exportingFormat === 'csv' ? 'animate-pulse' : ''} />
            CSV
          </button>
          <button
            type="button"
            onClick={() => exportReport('json')}
            disabled={exportingFormat !== null}
            className={`inline-flex h-8 items-center gap-2 rounded-md px-3 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${buttonClass}`}
          >
            <Download size={14} className={exportingFormat === 'json' ? 'animate-pulse' : ''} />
            JSON
          </button>
          <button
            type="button"
            onClick={loadReport}
            disabled={loading}
            className={`inline-flex h-8 items-center gap-2 rounded-md px-3 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${buttonClass}`}
          >
            <RefreshCcw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="block">
            <span className={`mb-1 block text-[10px] uppercase tracking-wide ${faintTextClass}`}>Currency</span>
            <select
              value={displayCurrency}
              onChange={(event) => setDisplayCurrency(event.target.value === 'PHP' ? 'PHP' : 'USDT')}
              className={`h-8 rounded-md border px-2 text-xs outline-none ${fieldClass}`}
            >
              <option value="USDT">{quoteCurrency}</option>
              <option value="PHP">PHP</option>
            </select>
          </label>
          <label className="block">
            <span className={`mb-1 block text-[10px] uppercase tracking-wide ${faintTextClass}`}>PHP / {quoteCurrency}</span>
            <input
              value={phpRate}
              onChange={(event) => setPhpRate(event.target.value)}
              inputMode="decimal"
              disabled={displayCurrency !== 'PHP'}
              className={`h-8 w-24 rounded-md border px-2 text-xs outline-none disabled:opacity-40 ${fieldClass}`}
            />
          </label>
        </div>
      </div>

      {error && (
        <div className="mx-4 mt-4 rounded-md border border-red-900 bg-red-950/60 px-3 py-2 text-xs text-red-200">
          {error}
        </div>
      )}

      {exportNotice && (
        <div className="mx-4 mt-4 rounded-md border border-teal-900 bg-teal-950/60 px-3 py-2 text-xs text-teal-200">
          {exportNotice}
        </div>
      )}

      <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-6" data-tour="journal-summary">
        <StatCard
          label="Net PnL"
          value={formatReportMoney(summary.netPnl)}
          tone={Number(summary.netPnl) >= 0 ? 'win' : 'loss'}
          icon={Number(summary.netPnl) >= 0 ? TrendingUp : TrendingDown}
          isDark={isDark}
        />
        <StatCard
          label="Loss Net PnL"
          value={formatReportMoney(summary.lossNetPnl ?? summary.grossLoss ?? 0)}
          tone="loss"
          icon={TrendingDown}
          isDark={isDark}
        />
        <StatCard label="Win Rate" value={formatPercent(summary.winRate)} isDark={isDark} />
        <StatCard label="Wins" value={summary.wins ?? 0} tone="win" isDark={isDark} />
        <StatCard label="Losses" value={summary.losses ?? 0} tone="loss" isDark={isDark} />
        <StatCard label="Fees" value={formatReportMoney(summary.fees)} isDark={isDark} />
      </div>

      {insights && insights.eligible && insights.items.length > 0 && (
        <div className="px-4 pb-4">
          <div className={`mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide ${mutedTextClass}`}>
            <Lightbulb size={14} />
            <span>Coaching Insights</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {insights.items.map((insight) => (
              <InsightCard key={insight.type} insight={insight} isDark={isDark} />
            ))}
          </div>
        </div>
      )}

      {insights && !insights.eligible && (
        <div className="px-4 pb-4">
          <div className={`rounded-md border px-3 py-2 text-xs ${sectionClass} ${mutedTextClass}`}>
            Close {Math.max(insights.requiredTrades - insights.currentTrades, 0)} more trades ({insights.currentTrades}/{insights.requiredTrades}) to unlock coaching insights.
          </div>
        </div>
      )}

      {playbookPerformance.length > 0 && (
        <div className="px-4 pb-4">
          <div className={`mb-2 text-xs font-semibold uppercase tracking-wide ${mutedTextClass}`}>Playbook Performance</div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {playbookPerformance.map((item) => (
              <div key={item.name} className={`rounded-md border p-3 ${sectionClass}`}>
                <div className="text-sm font-semibold">{item.name}</div>
                <div className={`mt-2 grid grid-cols-2 gap-1 text-xs ${mutedTextClass}`}>
                  <span>{item.trades} trades</span>
                  <span>{formatPercent(item.winRate)} wins</span>
                  <span className={Number(item.netPnl) >= 0 ? longTextClass : shortTextClass}>{formatReportMoney(item.netPnl)}</span>
                  <span>Avg {formatReportMoney(item.averagePnl)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {Number(summary.totalTrades ?? 0) > 0 && (
        <div className="px-4 pb-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Expectancy" value={formatReportMoney(advanced.expectancy)} tone={Number(advanced.expectancy) >= 0 ? 'win' : 'loss'} isDark={isDark} />
            <StatCard label="Profit Factor" value={advanced.profitFactor == null ? '∞' : Number(advanced.profitFactor).toFixed(2)} isDark={isDark} />
            <StatCard label="Max Drawdown" value={`${formatReportMoney(advanced.maxDrawdown)} (${formatPercent(advanced.maxDrawdownPercent)})`} tone="loss" isDark={isDark} />
            <StatCard label="Win / Loss Streak" value={`${advanced.maxWinStreak ?? 0} / ${advanced.maxLossStreak ?? 0}`} isDark={isDark} />
            {advanced.maeMfe?.eligible && (
              <>
                <StatCard label="Avg MFE %" value={formatPercent(advanced.maeMfe.avgMfePercent)} tone="win" isDark={isDark} />
                <StatCard label="Avg MAE %" value={formatPercent(advanced.maeMfe.avgMaePercent)} tone="loss" isDark={isDark} />
                <StatCard label="Edge Ratio" value={advanced.maeMfe.edgeRatio == null ? '—' : Number(advanced.maeMfe.edgeRatio).toFixed(2)} tone="neutral" isDark={isDark} />
              </>
            )}
          </div>
          {advanced.maeMfe?.eligible && Number(advanced.maeMfe.sampledTrades) < Number(summary.totalTrades ?? 0) && (
            <p className={`mt-2 text-[11px] ${mutedTextClass}`}>
              MAE/MFE based on {advanced.maeMfe.sampledTrades} of {summary.totalTrades} trades (excludes trades opened before this feature).
            </p>
          )}
        </div>
      )}

      {monteCarlo.eligible && (
        <div className="px-4 pb-4">
          <div className={`rounded-lg border p-3 ${sectionClass}`}>
            <div className="text-xs font-semibold uppercase tracking-wide">Monte Carlo Risk · {monteCarlo.iterations} runs</div>
            <div className={`mt-3 grid gap-2 text-xs sm:grid-cols-3 lg:grid-cols-6 ${mutedTextClass}`}>
              <span>P10 balance<br/><b className={valueTextClass}>{formatReportMoney(monteCarlo.endingBalanceP10)}</b></span>
              <span>Median balance<br/><b className={valueTextClass}>{formatReportMoney(monteCarlo.endingBalanceMedian)}</b></span>
              <span>P90 balance<br/><b className={valueTextClass}>{formatReportMoney(monteCarlo.endingBalanceP90)}</b></span>
              <span>Median drawdown<br/><b className={valueTextClass}>{formatPercent(monteCarlo.drawdownMedianPercent)}</b></span>
              <span>P90 drawdown<br/><b className={valueTextClass}>{formatPercent(monteCarlo.drawdownP90Percent)}</b></span>
              <span>Half-balance risk<br/><b className={Number(monteCarlo.riskOfHalfBalancePercent) > 0 ? shortTextClass : valueTextClass}>{formatPercent(monteCarlo.riskOfHalfBalancePercent)}</b></span>
            </div>
          </div>
        </div>
      )}

      {Number(summary.totalTrades ?? 0) > 0 && (
        <div className="px-4 pb-4">
          <div className={`mb-2 text-xs font-semibold uppercase tracking-wide ${mutedTextClass}`}>Performance Breakdown</div>
          <div className="grid gap-3 sm:grid-cols-1 lg:grid-cols-3">
            {renderBreakdownPanel('By Weekday', advanced.byWeekday)}
            {renderBreakdownPanel('By Hour (UTC)', advanced.byHourUtc)}
            {renderBreakdownPanel('By Trading Session', advanced.byTradingSession)}
          </div>
        </div>
      )}

      <div className="px-4 pb-4">
        <section data-tour="journal-table" className={`overflow-hidden rounded-lg border ${sectionClass}`}>
          <div className={`flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2 ${borderClass}`}>
            <div className="text-sm font-semibold">Closed Trades</div>
            <div className={`text-xs ${mutedTextClass}`}>
              {totalTrades ? `${pageStart + 1}-${pageEnd} of ${totalTrades}` : '0 trades'}
              {totalTrades !== allTradesCount ? ` filtered from ${allTradesCount}` : ''}
            </div>
          </div>

          <div className={`grid gap-2 border-b p-3 sm:grid-cols-2 lg:grid-cols-[minmax(220px,1fr)_repeat(4,minmax(120px,auto))] ${borderClass}`}>
            <label className="relative block">
              <Search size={15} className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 ${faintTextClass}`} />
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search symbol, setup, tags, notes…"
                className={`h-9 w-full rounded-md border py-2 pl-9 pr-8 text-xs outline-none ${fieldClass}`}
              />
              {searchQuery && (
                <button type="button" onClick={() => setSearchQuery('')} className={`absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded ${isDark ? 'hover:bg-white/10' : 'hover:bg-slate-100'}`} aria-label="Clear search"><X size={13} /></button>
              )}
            </label>
            <select value={symbolFilter} onChange={(event) => setSymbolFilter(event.target.value)} className={`h-9 rounded-md border px-2 text-xs outline-none ${fieldClass}`} aria-label="Filter by symbol">
              <option value="all">All symbols</option>
              {availableSymbols.map((symbolOption) => <option key={symbolOption} value={symbolOption}>{symbolOption}</option>)}
            </select>
            <select value={sideFilter} onChange={(event) => setSideFilter(event.target.value)} className={`h-9 rounded-md border px-2 text-xs outline-none ${fieldClass}`} aria-label="Filter by side">
              <option value="all">All sides</option>
              <option value="long">Long</option>
              <option value="short">Short</option>
            </select>
            <select value={resultFilter} onChange={(event) => setResultFilter(event.target.value)} className={`h-9 rounded-md border px-2 text-xs outline-none ${fieldClass}`} aria-label="Filter by result">
              <option value="all">All results</option>
              <option value="win">Wins</option>
              <option value="loss">Losses</option>
              <option value="breakeven">Breakeven</option>
            </select>
            <select value={journalFilter} onChange={(event) => setJournalFilter(event.target.value)} className={`h-9 rounded-md border px-2 text-xs outline-none ${fieldClass}`} aria-label="Filter by journal status">
              <option value="all">All journals</option>
              <option value="journaled">Journaled</option>
              <option value="empty">Not journaled</option>
            </select>
          </div>

          <div className="max-h-[560px] overflow-auto">
            <table className={`min-w-full divide-y text-left text-xs ${tableDivideClass}`}>
              <thead className={`sticky top-0 z-10 text-[10px] uppercase tracking-wide ${tableHeadClass}`}>
                <tr>
                  <th className="px-3 py-2">Closed</th>
                  <th className="px-3 py-2">Symbol</th>
                  <th className="px-3 py-2">Mode</th>
                  <th className="px-3 py-2">Side</th>
                  <th className="px-3 py-2 text-right">Entry</th>
                  <th className="px-3 py-2 text-right">Exit</th>
                  <th className="px-3 py-2 text-right">Lev</th>
                  <th className="px-3 py-2 text-right">Margin</th>
                  <th className="px-3 py-2 text-right">Value</th>
                  <th className="px-3 py-2 text-right">Fee</th>
                  <th className="px-3 py-2 text-right">PnL</th>
                  <th className="px-3 py-2">Snapshots</th>
                  <th className="px-3 py-2">Journal</th>
                  <th className="px-3 py-2 text-right">Result</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${tableDivideClass}`}>
                {paginatedTrades.length ? (
                  paginatedTrades.map((trade) => {
                    const pnl = Number(trade.pnl ?? 0);

                    return (
                      <React.Fragment key={trade.id}>
                        <tr className={rowHoverClass}>
                          <td className={`whitespace-nowrap px-3 py-2 ${bodyTextClass}`}>{formatTradeDate(trade)}</td>
                          <td className={`whitespace-nowrap px-3 py-2 font-semibold ${valueTextClass}`}>{trade.symbol}</td>
                          <td className="whitespace-nowrap px-3 py-2">
                            {trade.marginMode === 'cross' ? (
                              <span className="rounded bg-[#5eead4]/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#5eead4]">Cross</span>
                            ) : (
                              <span className={`rounded px-1.5 py-0.5 text-[10px] ${isDark ? 'bg-white/10 text-gray-300' : 'bg-slate-100 text-slate-600'}`}>Isolated</span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2">
                            <span className={trade.side === 'long' ? longTextClass : shortTextClass}>
                              {trade.category === 'spot' ? 'BUY' : String(trade.side ?? '').toUpperCase()}
                            </span>
                          </td>
                          <td className={`whitespace-nowrap px-3 py-2 text-right ${bodyTextClass}`}>{formatMoney(trade.entryPrice)}</td>
                          <td className={`whitespace-nowrap px-3 py-2 text-right ${bodyTextClass}`}>{formatMoney(trade.exitPrice)}</td>
                          <td className={`whitespace-nowrap px-3 py-2 text-right ${bodyTextClass}`}>{formatLeverage(trade.leverage)}</td>
                          <td className={`whitespace-nowrap px-3 py-2 text-right ${bodyTextClass}`}>{formatReportMoney(trade.margin)}</td>
                          <td className={`whitespace-nowrap px-3 py-2 text-right ${bodyTextClass}`}>{formatReportMoney(trade.notional)}</td>
                          <td className={`whitespace-nowrap px-3 py-2 text-right ${mutedTextClass}`}>{formatReportMoney(trade.fee)}</td>
                          <td className={`whitespace-nowrap px-3 py-2 text-right font-semibold ${getPnlClass(pnl, isDark)}`}>
                            {pnl > 0 ? '+' : ''}{formatReportMoney(pnl)}
                            <span className={`ml-1 text-[10px] ${mutedTextClass}`}>({formatPercent(trade.pnlPercent)})</span>
                          </td>
                          <td className="whitespace-nowrap px-3 py-2">
                            <div className="flex gap-1">
                              {trade.entrySnapshotUrl ? (
                                <a
                                  href={trade.entrySnapshotUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className={`rounded px-2 py-1 text-[10px] font-semibold ${isDark ? 'bg-black-table-color text-blue-200 hover:bg-skin-black-light' : 'border border-slate-300 bg-white text-blue-700 hover:bg-slate-100'}`}
                                >
                                  Entry
                                </a>
                              ) : (
                                <span className={`rounded px-2 py-1 text-[10px] ${inactivePillClass}`}>Entry</span>
                              )}
                              {trade.exitSnapshotUrl ? (
                                <a
                                  href={trade.exitSnapshotUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className={`rounded px-2 py-1 text-[10px] font-semibold ${isDark ? 'bg-black-table-color text-blue-200 hover:bg-skin-black-light' : 'border border-slate-300 bg-white text-blue-700 hover:bg-slate-100'}`}
                                >
                                  Exit
                                </a>
                              ) : (
                                <span className={`rounded px-2 py-1 text-[10px] ${inactivePillClass}`}>Exit</span>
                              )}
                            </div>
                          </td>
                          <td className="min-w-48 px-3 py-2">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => editingTradeId === trade.id ? cancelJournalEdit() : startJournalEdit(trade)}
                                className={`inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] font-semibold ${buttonClass}`}
                              >
                                {editingTradeId === trade.id ? <X size={13} /> : <Pencil size={13} />}
                                {editingTradeId === trade.id ? 'Close' : 'Edit'}
                              </button>
                              <div className="min-w-0">
                                <div className={`truncate text-[11px] font-semibold ${valueTextClass}`}>
                                  {trade.setupTag || 'No setup'}
                                </div>
                                <div className={`truncate text-[10px] ${faintTextClass}`}>
                                  {(trade.tags ?? []).length ? trade.tags.join(', ') : 'No tags'}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-right">
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ring-1 ${getResultClass(trade.result, isDark)}`}>
                              {trade.result}
                            </span>
                          </td>
                        </tr>
                      </React.Fragment>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={13} className={`px-3 py-10 text-center text-sm ${faintTextClass}`}>
                      {allTradesCount
                        ? 'No trades match your search and filters.'
                        : 'No closed trades yet. Close a replay position to populate the report.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className={`flex flex-wrap items-center justify-between gap-2 border-t px-3 py-2 ${borderClass}`}>
            <div className="flex items-center gap-2">
              <span className={`text-xs ${mutedTextClass}`}>Rows per page</span>
              <select
                value={tradesPerPage}
                onChange={(event) => setTradesPerPage(Number(event.target.value))}
                className={`h-8 rounded-md border px-2 text-xs outline-none ${fieldClass}`}
                aria-label="Rows per page"
              >
                {[10, 25, 50].map((size) => <option key={size} value={size}>{size}</option>)}
              </select>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-1">
              <button
                type="button"
                onClick={() => goToPage(safeCurrentPage - 1)}
                disabled={safeCurrentPage <= 1}
                className={`flex h-8 w-8 items-center justify-center rounded-md text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${buttonClass}`}
                aria-label="Previous page"
              >
                <ChevronLeft size={15} />
              </button>
              {visiblePageNumbers[0] > 1 && (
                <>
                  <button type="button" onClick={() => goToPage(1)} className={`h-8 min-w-8 rounded-md px-2 text-xs font-semibold ${buttonClass}`}>1</button>
                  {visiblePageNumbers[0] > 2 && <span className={`px-1 text-xs ${mutedTextClass}`}>…</span>}
                </>
              )}
              {visiblePageNumbers.map((page) => (
                <button
                  key={page}
                  type="button"
                  onClick={() => goToPage(page)}
                  aria-current={page === safeCurrentPage ? 'page' : undefined}
                  className={`h-8 min-w-8 rounded-md px-2 text-xs font-semibold ${
                    page === safeCurrentPage
                      ? 'bg-teal-600 text-white'
                      : buttonClass
                  }`}
                >
                  {page}
                </button>
              ))}
              {visiblePageNumbers.at(-1) < totalPages && (
                <>
                  {visiblePageNumbers.at(-1) < totalPages - 1 && <span className={`px-1 text-xs ${mutedTextClass}`}>…</span>}
                  <button type="button" onClick={() => goToPage(totalPages)} className={`h-8 min-w-8 rounded-md px-2 text-xs font-semibold ${buttonClass}`}>{totalPages}</button>
                </>
              )}
              <button
                type="button"
                onClick={() => goToPage(safeCurrentPage + 1)}
                disabled={safeCurrentPage >= totalPages}
                className={`flex h-8 w-8 items-center justify-center rounded-md text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${buttonClass}`}
                aria-label="Next page"
              >
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        </section>

        {editingTrade && (
          <div
            className="fixed inset-0 z-[10010] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
            onMouseDown={(event) => event.target === event.currentTarget && cancelJournalEdit()}
          >
            <div
              className={`flex max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-xl border shadow-2xl ${shellClass}`}
              role="dialog"
              aria-modal="true"
              aria-labelledby="journal-modal-title"
            >
              <div className={`flex items-center justify-between border-b px-5 py-4 ${borderClass}`}>
                <div className="min-w-0">
                  <h2 id="journal-modal-title" className="text-sm font-bold">Journal · {editingTrade.symbol}</h2>
                  <p className={`mt-0.5 text-xs ${mutedTextClass}`}>
                    <span className={editingTrade.side === 'long' ? longTextClass : shortTextClass}>
                      {editingTrade.category === 'spot' ? 'BUY' : String(editingTrade.side ?? '').toUpperCase()}
                    </span>
                    {' · '}{formatTradeDate(editingTrade)}
                    {' · '}
                    <span className={`font-semibold ${getPnlClass(Number(editingTrade.pnl ?? 0), isDark)}`}>
                      {Number(editingTrade.pnl ?? 0) > 0 ? '+' : ''}{formatReportMoney(editingTrade.pnl)}
                    </span>
                  </p>
                </div>
                <button type="button" onClick={cancelJournalEdit} className={`rounded-md p-1.5 ${isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'}`} aria-label="Close">
                  <X size={18} />
                </button>
              </div>

              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-5">
                <div className="grid gap-3 md:grid-cols-3">
                  <input
                    value={journalDraft.setupTag ?? ''}
                    onChange={(event) => updateJournalDraft('setupTag', event.target.value)}
                    className={`h-9 rounded-md border px-3 text-xs outline-none ${fieldClass}`}
                    placeholder="Setup tag"
                  />
                  <input
                    value={journalDraft.tags ?? ''}
                    onChange={(event) => updateJournalDraft('tags', event.target.value)}
                    className={`h-9 rounded-md border px-3 text-xs outline-none ${fieldClass}`}
                    placeholder="Tags, comma separated"
                  />
                  <input
                    value={journalDraft.emotion ?? ''}
                    onChange={(event) => updateJournalDraft('emotion', event.target.value)}
                    className={`h-9 rounded-md border px-3 text-xs outline-none ${fieldClass}`}
                    placeholder="Emotion"
                  />
                  <textarea
                    value={journalDraft.entryReason ?? ''}
                    onChange={(event) => updateJournalDraft('entryReason', event.target.value)}
                    className={`min-h-20 rounded-md border px-3 py-2 text-xs outline-none ${fieldClass}`}
                    placeholder="Entry reason"
                  />
                  <textarea
                    value={journalDraft.exitReason ?? ''}
                    onChange={(event) => updateJournalDraft('exitReason', event.target.value)}
                    className={`min-h-20 rounded-md border px-3 py-2 text-xs outline-none ${fieldClass}`}
                    placeholder="Exit reason"
                  />
                  <textarea
                    value={journalDraft.mistake ?? ''}
                    onChange={(event) => updateJournalDraft('mistake', event.target.value)}
                    className={`min-h-20 rounded-md border px-3 py-2 text-xs outline-none ${fieldClass}`}
                    placeholder="Mistake / improvement"
                  />
                </div>
                <textarea
                  value={journalDraft.journalNotes ?? ''}
                  onChange={(event) => updateJournalDraft('journalNotes', event.target.value)}
                  className={`min-h-24 w-full rounded-md border px-3 py-2 text-xs outline-none ${fieldClass}`}
                  placeholder="Journal notes"
                />
              </div>

              <div className={`flex justify-end gap-2 border-t px-5 py-4 ${borderClass}`}>
                <button
                  type="button"
                  onClick={cancelJournalEdit}
                  className={`inline-flex h-9 items-center gap-2 rounded-md px-4 text-xs font-semibold ${buttonClass}`}
                >
                  <X size={14} />
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => saveJournal(editingTrade.id)}
                  disabled={journalSaving}
                  className="inline-flex h-9 items-center gap-2 rounded-md bg-teal-600 px-4 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
                >
                  <Save size={14} />
                  {journalSaving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

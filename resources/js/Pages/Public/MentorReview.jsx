import React, { useEffect, useMemo, useState } from 'react';
import { Head } from '@inertiajs/react';
import {
  Activity,
  BookOpen,
  Calendar,
  Camera,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import StatCard from '../../Components/Market/StatCard';
import getAppName from '../../Components/SystemSettings/ApplicationName';

// PUBLIC page — no login, no ThemeProvider (see resources/js/app.jsx: any page whose
// component name starts with "Public/" is rendered with no layout/theme wrapper at all).
// Do NOT import or call useTheme()/ThemeContext here. Keep a fixed, self-contained light
// palette instead, matching the simplicity of Public/PrivacyPolicy.jsx.
const IS_DARK = false;

function formatNumber(value, digits = 2) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return number.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function formatSignedNumber(value, digits = 2) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return `${number > 0 ? '+' : ''}${formatNumber(number, digits)}`;
}

function formatPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return `${number.toFixed(2)}%`;
}

function formatDate(value) {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleString(undefined, {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatTradeTime(unixSeconds) {
  const number = Number(unixSeconds);
  if (!Number.isFinite(number) || number <= 0) return '—';
  return new Date(number * 1000).toLocaleString(undefined, {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function hasJournalContent(trade) {
  return Boolean(
    trade.setupTag
    || trade.emotion
    || trade.entryReason
    || trade.exitReason
    || trade.mistake
    || trade.journalNotes
    || (trade.tags ?? []).length
  );
}

export default function MentorReview({ shareLink = {}, trades = [], analytics = null }) {
  const summary = useMemo(() => {
    const totalTrades = trades.length;
    const wins = trades.filter((trade) => Number(trade.pnl) > 0).length;
    const losses = trades.filter((trade) => Number(trade.pnl) < 0).length;
    const netPnl = trades.reduce((sum, trade) => sum + Number(trade.pnl ?? 0), 0);
    const winRate = totalTrades ? (wins / totalTrades) * 100 : 0;

    return { totalTrades, wins, losses, netPnl, winRate };
  }, [trades]);

  const advanced = analytics?.advanced ?? null;
  const monteCarlo = analytics?.monteCarlo ?? null;
  const title = shareLink?.label || 'Shared Trade Review';
  const [appName, setAppName] = useState('BacktradeLab');
  useEffect(() => { getAppName().then(setAppName).catch(() => {}); }, []);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <Head title={title} />

      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-blue-700">
                <ShieldCheck size={13} />
                Read-only — shared by a {appName} trader
              </div>
              <h1 className="mt-3 text-2xl font-bold text-slate-950">{title}</h1>
            </div>
            <div className="flex flex-col items-start gap-1 text-xs text-slate-500 sm:items-end">
              <span className="inline-flex items-center gap-1.5"><Calendar size={13} /> Shared {formatDate(shareLink?.createdAt)}</span>
              <span className="inline-flex items-center gap-1.5"><Calendar size={13} /> {shareLink?.expiresAt ? `Expires ${formatDate(shareLink.expiresAt)}` : 'No expiry set'}</span>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
        <section className="grid gap-3 sm:grid-cols-3">
          <StatCard
            label="Net PnL"
            value={formatSignedNumber(summary.netPnl)}
            tone={summary.netPnl >= 0 ? 'win' : 'loss'}
            icon={summary.netPnl >= 0 ? TrendingUp : TrendingDown}
            isDark={IS_DARK}
          />
          <StatCard label="Win Rate" value={formatPercent(summary.winRate)} icon={Activity} isDark={IS_DARK} />
          <StatCard label="Total Trades" value={summary.totalTrades} isDark={IS_DARK} />
        </section>

        {advanced && (
          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-slate-900">Cumulative PnL Path (relative)</h2>
            <p className="mt-1 text-xs text-slate-500">
              These figures track cumulative trade-by-trade PnL starting from zero, not the trader's real account
              balance — they are relative performance figures, not account balances.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Expectancy / trade" value={formatSignedNumber(advanced.expectancy)} tone={Number(advanced.expectancy) >= 0 ? 'win' : 'loss'} isDark={IS_DARK} />
              <StatCard label="Profit Factor" value={advanced.profitFactor == null ? '∞' : Number(advanced.profitFactor).toFixed(2)} isDark={IS_DARK} />
              <StatCard label="Max Drawdown (relative)" value={`${formatNumber(advanced.maxDrawdown)} (${formatPercent(advanced.maxDrawdownPercent)})`} tone="loss" isDark={IS_DARK} />
              <StatCard label="Win / Loss Streak" value={`${advanced.maxWinStreak ?? 0} / ${advanced.maxLossStreak ?? 0}`} isDark={IS_DARK} />
            </div>

            {monteCarlo?.eligible && (
              <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Monte Carlo Risk (relative) · {monteCarlo.iterations} runs
                </div>
                <div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-3 lg:grid-cols-5">
                  <span>P10 cumulative PnL<br /><b className="text-slate-900">{formatSignedNumber(monteCarlo.endingBalanceP10)}</b></span>
                  <span>Median cumulative PnL<br /><b className="text-slate-900">{formatSignedNumber(monteCarlo.endingBalanceMedian)}</b></span>
                  <span>P90 cumulative PnL<br /><b className="text-slate-900">{formatSignedNumber(monteCarlo.endingBalanceP90)}</b></span>
                  <span>Median drawdown<br /><b className="text-slate-900">{formatPercent(monteCarlo.drawdownMedianPercent)}</b></span>
                  <span>P90 drawdown<br /><b className="text-slate-900">{formatPercent(monteCarlo.drawdownP90Percent)}</b></span>
                </div>
              </div>
            )}
          </section>
        )}

        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-900">Closed Trades</h2>
            <p className="mt-1 text-xs text-slate-500">{trades.length} trade{trades.length === 1 ? '' : 's'} in this shared view.</p>
          </div>
          <div className="max-h-[600px] overflow-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
              <thead className="sticky top-0 bg-white text-[10px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Symbol</th>
                  <th className="px-3 py-2">Mode</th>
                  <th className="px-3 py-2">Side</th>
                  <th className="px-3 py-2 text-right">Entry</th>
                  <th className="px-3 py-2 text-right">Exit</th>
                  <th className="px-3 py-2 text-right">PnL</th>
                  <th className="px-3 py-2">Opened</th>
                  <th className="px-3 py-2">Closed</th>
                  <th className="px-3 py-2">Journal</th>
                  <th className="px-3 py-2">Snapshots</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {trades.length ? trades.map((trade) => {
                  const pnl = Number(trade.pnl ?? 0);
                  const journaled = hasJournalContent(trade);

                  return (
                    <tr key={trade.id} className="hover:bg-slate-50">
                      <td className="whitespace-nowrap px-3 py-2 font-semibold text-slate-900">{trade.symbol}</td>
                      <td className="whitespace-nowrap px-3 py-2">
                        {trade.marginMode === 'cross' ? (
                          <span className="rounded bg-[#5eead4]/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#5eead4]">Cross</span>
                        ) : (
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">Isolated</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">
                        <span className={trade.side === 'long' ? 'text-emerald-700' : 'text-red-700'}>
                          {String(trade.side ?? '').toUpperCase()}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right text-slate-600">{formatNumber(trade.entryPrice)}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right text-slate-600">{formatNumber(trade.exitPrice)}</td>
                      <td className={`whitespace-nowrap px-3 py-2 text-right font-semibold ${pnl > 0 ? 'text-emerald-700' : pnl < 0 ? 'text-red-700' : 'text-slate-600'}`}>
                        {formatSignedNumber(pnl)}
                        <span className="ml-1 text-[10px] text-slate-400">({formatPercent(trade.pnlPercent)})</span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-slate-600">{formatTradeTime(trade.openedAtTime)}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-slate-600">{formatTradeTime(trade.closedAtTime)}</td>
                      <td className="min-w-40 px-3 py-2">
                        {journaled ? (
                          <div className="flex items-start gap-1.5">
                            <BookOpen size={13} className="mt-0.5 shrink-0 text-blue-600" />
                            <div className="min-w-0">
                              {trade.setupTag && <div className="truncate text-[11px] font-semibold text-slate-900">{trade.setupTag}</div>}
                              {(trade.tags ?? []).length > 0 && <div className="truncate text-[10px] text-slate-500">{trade.tags.join(', ')}</div>}
                              {trade.journalNotes && <div className="mt-0.5 line-clamp-2 text-[10px] text-slate-500">{trade.journalNotes}</div>}
                            </div>
                          </div>
                        ) : (
                          <span className="text-[10px] text-slate-300">Not shared</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1">
                          {trade.entrySnapshotUrl && (
                            <a href={trade.entrySnapshotUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-[10px] font-semibold text-blue-700 hover:bg-slate-50">
                              <Camera size={11} /> Entry
                            </a>
                          )}
                          {trade.exitSnapshotUrl && (
                            <a href={trade.exitSnapshotUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-[10px] font-semibold text-blue-700 hover:bg-slate-50">
                              <Camera size={11} /> Exit
                            </a>
                          )}
                          {!trade.entrySnapshotUrl && !trade.exitSnapshotUrl && <span className="text-[10px] text-slate-300">Not shared</span>}
                        </div>
                      </td>
                    </tr>
                  );
                }) : (
                  <tr>
                    <td colSpan={9} className="px-3 py-10 text-center text-sm text-slate-400">No trades are visible in this shared view.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white px-4 py-6 text-center text-xs text-slate-500">
        This is a shared, read-only view. The trader who shared it may revoke access at any time.
      </footer>
    </div>
  );
}

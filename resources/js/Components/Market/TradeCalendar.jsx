import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { usePage } from '@inertiajs/react';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  RefreshCcw,
} from 'lucide-react';
import { useTheme } from '../../Context/ThemeContext';
import { IconTooltipButton } from '../Tooltip/AnchoredTooltip';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_LABELS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

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

function getDateKey(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function buildCalendarDays(monthDate) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const start = new Date(year, month, 1 - firstDay.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);

    return {
      date,
      key: getDateKey(date),
      isCurrentMonth: date.getMonth() === month,
    };
  });
}

function getPnlClass(value, isDark) {
  const number = Number(value);
  if (number > 0) return isDark ? 'text-emerald-300' : 'text-emerald-700';
  if (number < 0) return isDark ? 'text-red-300' : 'text-red-700';
  return isDark ? 'text-gray-300' : 'text-slate-600';
}

export default function TradeCalendar() {
  const { theme: adminTheme } = useTheme();
  const { auth } = usePage().props;
  const preferenceUserId = auth?.user?.id ?? 'guest';
  const displayCurrencyStorageKey = `market-backtest-display-currency:${preferenceUserId}`;
  const phpRateStorageKey = `market-backtest-php-rate:${preferenceUserId}`;
  const isDark = adminTheme === 'bg-skin-black';
  const [report, setReport] = useState({ account: null, trades: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [monthDate, setMonthDate] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [showCalendarPicker, setShowCalendarPicker] = useState(false);
  const [displayCurrency, setDisplayCurrency] = useState(() => (
    getStoredValue(displayCurrencyStorageKey, 'USDT') === 'PHP' ? 'PHP' : 'USDT'
  ));
  const [phpRate, setPhpRate] = useState(() => getStoredValue(phpRateStorageKey, '58'));

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
        trades: Array.isArray(response.data?.trades) ? response.data.trades : [],
      });
    } catch (err) {
      setError(err.response?.data?.message ?? err.message ?? 'Failed to load trade calendar');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReport();
  }, []);

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

  const dailyStats = useMemo(() => {
    const stats = {};

    report.trades.forEach((trade) => {
      const key = getDateKey(getTradeDate(trade));
      if (!key) return;

      if (!stats[key]) {
        stats[key] = {
          pnl: 0,
          wins: 0,
          losses: 0,
          breakeven: 0,
          trades: 0,
        };
      }

      const day = stats[key];
      const pnl = Number(trade.pnl ?? 0);

      day.pnl += Number.isFinite(pnl) ? pnl : 0;
      day.trades += 1;

      if (pnl > 0) day.wins += 1;
      else if (pnl < 0) day.losses += 1;
      else day.breakeven += 1;
    });

    return stats;
  }, [report.trades]);

  const calendarDays = useMemo(() => buildCalendarDays(monthDate), [monthDate]);
  const maxDailyAbsPnl = useMemo(() => {
    return Math.max(
      1,
      ...Object.values(dailyStats).map((day) => Math.abs(Number(day.pnl ?? 0)))
    );
  }, [dailyStats]);
  const selectableYears = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const years = new Set([currentYear, monthDate.getFullYear()]);

    report.trades.forEach((trade) => {
      const date = getTradeDate(trade);
      if (date && !Number.isNaN(date.getTime())) {
        years.add(date.getFullYear());
      }
    });

    const minYear = Math.min(currentYear - 5, ...years);
    const maxYear = Math.max(currentYear + 1, ...years);

    return Array.from({ length: maxYear - minYear + 1 }, (_, index) => maxYear - index);
  }, [monthDate, report.trades]);

  const monthLabel = monthDate.toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
  const quoteCurrency = report.account?.quoteCurrency ?? 'USDT';
  const normalizedPhpRate = getPhpRate(phpRate);
  const formatReportMoney = (value, digits = 2) => formatDisplayMoney(
    value,
    displayCurrency,
    normalizedPhpRate,
    digits
  );

  const moveMonth = (amount) => {
    setMonthDate((current) => new Date(current.getFullYear(), current.getMonth() + amount, 1));
  };

  const goToCurrentMonth = () => {
    const today = new Date();
    setMonthDate(new Date(today.getFullYear(), today.getMonth(), 1));
    setShowCalendarPicker(false);
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
  const iconButtonClass = isDark
    ? 'text-gray-300 hover:bg-skin-black-light hover:text-white'
    : 'text-slate-600 hover:bg-white hover:text-slate-900';
  const fieldClass = isDark
    ? 'border-gray-700 bg-black-table-color text-white'
    : 'border-slate-300 bg-white text-slate-900';
  const calendarDividerClass = isDark ? 'border-gray-800 bg-gray-800' : 'border-slate-200 bg-slate-200';
  const dayHeaderClass = isDark ? 'bg-black-table-color text-gray-400' : 'bg-white text-slate-500';
  const dayCellClass = isDark ? 'bg-skin-black' : 'bg-white';

  return (
    <section data-tour="journal-calendar" className={`rounded-lg border ${shellClass}`}>
      <div className={`flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 ${borderClass}`}>
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <CalendarDays size={16} />
            <span>Trade Calendar</span>
          </div>
          <p className={`mt-1 text-xs ${mutedTextClass}`}>Daily PnL grouped by close date.</p>
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
      </div>

      {error && (
        <div className="mx-4 mt-4 rounded-md border border-red-900 bg-red-950/60 px-3 py-2 text-xs text-red-200">
          {error}
        </div>
      )}

      <div className="p-4">
        <div className={`rounded-lg border ${sectionClass}`}>
          <div className={`flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2 ${borderClass}`}>
            <IconTooltipButton
              label="Previous month"
              isDark={isDark}
              placement="bottom"
              onClick={() => moveMonth(-1)}
              className={`flex h-8 w-8 items-center justify-center rounded-md ${iconButtonClass}`}
            >
              <ChevronLeft size={16} />
            </IconTooltipButton>
            <IconTooltipButton
              label="Select month and year"
              isDark={isDark}
              placement="bottom"
              onClick={() => setShowCalendarPicker((current) => !current)}
              className={`rounded-md px-2 py-1 text-sm font-semibold ${valueTextClass} ${isDark ? 'hover:bg-skin-black-light' : 'hover:bg-white'}`}
            >
              {monthLabel}
            </IconTooltipButton>
            <IconTooltipButton
              label="Next month"
              isDark={isDark}
              placement="left"
              onClick={() => moveMonth(1)}
              className={`flex h-8 w-8 items-center justify-center rounded-md ${iconButtonClass}`}
            >
              <ChevronRight size={16} />
            </IconTooltipButton>
            {showCalendarPicker && (
              <div className="grid w-full grid-cols-[minmax(0,1fr)_96px_auto] gap-2 pt-2">
                <select
                  value={monthDate.getMonth()}
                  onChange={(event) => setMonthDate((current) => new Date(current.getFullYear(), Number(event.target.value), 1))}
                  className={`h-8 rounded-md border px-2 text-xs outline-none ${fieldClass}`}
                >
                  {MONTH_LABELS.map((month, index) => (
                    <option key={month} value={index}>{month}</option>
                  ))}
                </select>
                <select
                  value={monthDate.getFullYear()}
                  onChange={(event) => setMonthDate((current) => new Date(Number(event.target.value), current.getMonth(), 1))}
                  className={`h-8 rounded-md border px-2 text-xs outline-none ${fieldClass}`}
                >
                  {selectableYears.map((year) => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={goToCurrentMonth}
                  className={`h-8 rounded-md px-3 text-xs font-semibold ${buttonClass}`}
                >
                  Today
                </button>
              </div>
            )}
          </div>

          <div className={`grid grid-cols-7 gap-px border-b text-center text-[10px] font-semibold uppercase tracking-wide ${calendarDividerClass} ${mutedTextClass}`}>
            {DAY_LABELS.map((day) => (
              <div key={day} className={`px-1 py-2 ${dayHeaderClass}`}>{day}</div>
            ))}
          </div>

          <div className={`grid grid-cols-7 gap-px ${calendarDividerClass}`}>
            {calendarDays.map((item) => {
              const day = dailyStats[item.key];
              const pnl = Number(day?.pnl ?? 0);
              const alpha = day ? Math.min(0.16 + (Math.abs(pnl) / maxDailyAbsPnl) * 0.42, 0.58) : 0;
              const backgroundColor = !day
                ? undefined
                : pnl >= 0
                  ? `rgba(16, 185, 129, ${alpha})`
                  : `rgba(239, 68, 68, ${alpha})`;

              return (
                <div
                  key={item.key}
                  className={`min-h-[82px] p-2 ${dayCellClass} ${item.isCurrentMonth ? '' : 'opacity-40'}`}
                  style={{ backgroundColor }}
                >
                  <div className="mb-1 flex items-center justify-between gap-1">
                    <span className={`text-xs font-semibold ${bodyTextClass}`}>{item.date.getDate()}</span>
                    {day && <span className={`text-[10px] ${bodyTextClass}`}>{day.trades}T</span>}
                  </div>
                  {day && (
                    <div className="space-y-1">
                      <div className={`text-xs font-semibold ${getPnlClass(pnl, isDark)}`}>
                        {pnl > 0 ? '+' : ''}{formatReportMoney(pnl)}
                      </div>
                      <div className={`text-[10px] ${bodyTextClass}`}>
                        W {day.wins} / L {day.losses}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

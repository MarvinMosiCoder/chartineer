import React, { useEffect, useState } from 'react';
import { Link } from '@inertiajs/react';
import axios from 'axios';
import { Lightbulb, X } from 'lucide-react';
import { useTheme } from '../../Context/ThemeContext';

export default function TradeInsightsWidget() {
  const { theme } = useTheme();
  const isDark = theme === 'bg-skin-black';
  const [insight, setInsight] = useState(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    axios.get('/market-backtest/report/insights', { headers: { Accept: 'application/json' } })
      .then((response) => {
        if (cancelled) return;
        const data = response.data?.insights;
        const top = data?.eligible ? data.items?.[0] : null;
        setInsight(top ?? null);
      })
      .catch(() => {
        if (!cancelled) setInsight(null);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!insight || dismissed) return null;

  const toneClass =
    insight.tone === 'positive'
      ? 'border-emerald-500/30 bg-emerald-500/10'
      : insight.tone === 'warning'
        ? 'border-amber-500/30 bg-amber-500/10'
        : isDark ? 'border-[#2a2e39] bg-[#131722]' : 'border-slate-200 bg-white';
  const titleClass =
    insight.tone === 'positive'
      ? isDark ? 'text-emerald-300' : 'text-emerald-700'
      : insight.tone === 'warning'
        ? isDark ? 'text-amber-300' : 'text-amber-700'
        : isDark ? 'text-slate-200' : 'text-slate-900';

  return (
    <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 ${toneClass}`}>
      <Lightbulb size={14} className={`mt-0.5 shrink-0 ${titleClass}`} />
      <div className="min-w-0 flex-1">
        <div className={`text-xs font-semibold ${titleClass}`}>{insight.title}</div>
        <div className={`mt-0.5 truncate text-[11px] ${isDark ? 'text-gray-400' : 'text-slate-500'}`}>{insight.message}</div>
      </div>
      <Link
        href="/trade-report"
        className={`shrink-0 text-[10px] font-semibold hover:underline ${isDark ? 'text-[#5eead4]' : 'text-[#2dd4bf]'}`}
      >
        View report
      </Link>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className={`shrink-0 rounded p-0.5 ${isDark ? 'text-gray-500 hover:text-gray-300' : 'text-slate-400 hover:text-slate-600'}`}
        aria-label="Dismiss insight"
      >
        <X size={12} />
      </button>
    </div>
  );
}

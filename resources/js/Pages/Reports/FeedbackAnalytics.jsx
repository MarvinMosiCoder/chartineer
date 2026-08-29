import React, { useEffect, useMemo, useState } from 'react';
import { Head } from '@inertiajs/react';
import axios from 'axios';
import Chart from 'react-apexcharts';
import { AlertTriangle, Download, ListChecks, MessageSquare } from 'lucide-react';
import { useTheme } from '../../Context/ThemeContext';

const CATEGORY_LABELS = {
    // Keep in sync with UserFeedbackController::CATEGORIES — a missing key renders
    // the raw slug instead of a label.
    payment: 'Payment', subscription: 'Subscription', account: 'Account', enhancement: 'Enhancement',
    feature: 'Feature request', bug: 'Bug', usability: 'User Experience', performance: 'Performance', other: 'Other',
    chart: 'Chart', trading: 'Trading', replay: 'Replay & Backtest',
};
const PRIORITY_TONES = { urgent: 'text-red-400', high: 'text-amber-400', normal: '', low: '' };
const STATUS_TONES = {
    submitted: 'text-[#787b86]', reviewing: 'text-[#5eead4]', planned: 'text-[#5eead4]', in_progress: 'text-amber-400',
    completed: 'text-emerald-500', declined: 'text-[#787b86]',
};
const ACCENT = '#2dd4bf';

function weekLabel(period) {
    const date = new Date(`${period}T00:00:00`);
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function FeedbackAnalytics() {
    const { theme } = useTheme();
    const isDark = theme === 'bg-skin-black';

    const [range, setRange] = useState({ from: '', to: '' });
    const [report, setReport] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const load = async () => {
        setLoading(true); setError('');
        try {
            const params = { ...(range.from ? { from: range.from } : {}), ...(range.to ? { to: range.to } : {}) };
            const { data } = await axios.get('/admin/reports/feedback/items', { params });
            setReport(data);
            setRange(current => ({ from: current.from || data.from, to: current.to || data.to }));
        } catch (e) {
            setError(e.response?.data?.message || 'Unable to load the feedback report.');
        } finally {
            setLoading(false);
        }
    };
    useEffect(() => { load(); }, []);

    const exportHref = useMemo(() => {
        const params = new URLSearchParams({ ...(range.from ? { from: range.from } : {}), ...(range.to ? { to: range.to } : {}) });
        return `/admin/reports/feedback/export?${params.toString()}`;
    }, [range.from, range.to]);

    const categories = report?.categoryBreakdown ?? [];
    const priorities = report?.priorityBreakdown ?? [];
    const statusBreakdown = report?.statusBreakdown ?? { byStatus: [], open: 0, resolved: 0 };
    const responseTime = report?.responseTime ?? { medianResponseHours: null, awaitingResponsePercent: 0 };
    const volumeTrend = report?.volumeTrend ?? [];
    const topCategory = categories[0];

    const panel = isDark ? 'border-[#2a2e39] bg-[#131722]' : 'border-slate-200 bg-white';
    const field = isDark ? 'border-[#2a2e39] bg-[#0b0e14] text-white' : 'border-slate-200 bg-slate-50';
    const muted = 'text-[#787b86]';

    const categoryOptions = {
        chart: { toolbar: { show: false }, background: 'transparent', foreColor: '#787b86' },
        plotOptions: { bar: { horizontal: true, borderRadius: 4, barHeight: '65%' } },
        colors: [ACCENT],
        dataLabels: {
            enabled: true,
            formatter: (val, opts) => {
                const row = categories[opts.dataPointIndex];
                return row ? `${val} (${row.percent}%)` : val;
            },
            style: { colors: [isDark ? '#d1d4dc' : '#0b0e14'], fontSize: '11px', fontWeight: 600 },
            offsetX: 6,
        },
        grid: { borderColor: isDark ? '#2a2e39' : '#e1e0d9' },
        xaxis: {
            categories: categories.map(row => CATEGORY_LABELS[row.category] || row.category),
            labels: { style: { colors: '#787b86', fontSize: '11px' } },
            axisBorder: { color: isDark ? '#2a2e39' : '#e1e0d9' },
        },
        yaxis: { labels: { style: { colors: '#787b86', fontSize: '11px' } } },
        tooltip: {
            theme: isDark ? 'dark' : 'light',
            y: { formatter: (val, opts) => `${val} submission${val === 1 ? '' : 's'}` },
        },
    };
    const categorySeries = [{ name: 'Submissions', data: categories.map(row => row.count) }];

    const trendOptions = {
        chart: { toolbar: { show: false }, background: 'transparent', foreColor: '#787b86' },
        stroke: { curve: 'smooth', width: 2 },
        fill: { type: 'gradient', gradient: { opacityFrom: 0.25, opacityTo: 0.02 } },
        colors: [ACCENT],
        dataLabels: { enabled: false },
        grid: { borderColor: isDark ? '#2a2e39' : '#e1e0d9' },
        xaxis: {
            categories: volumeTrend.map(row => weekLabel(row.period)),
            labels: { style: { colors: '#787b86', fontSize: '11px' } },
            axisBorder: { color: isDark ? '#2a2e39' : '#e1e0d9' },
        },
        yaxis: { labels: { formatter: value => Number(value).toLocaleString(), style: { colors: '#787b86', fontSize: '11px' } } },
        tooltip: { theme: isDark ? 'dark' : 'light', y: { formatter: val => `${val} new submission${val === 1 ? '' : 's'}` } },
    };
    const trendSeries = [{ name: 'New submissions', data: volumeTrend.map(row => row.count) }];

    return <>
        <Head title="Feedback Analytics" />
        <div className={`space-y-4 ${isDark ? 'text-[#d1d4dc]' : 'text-slate-900'}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <div className="text-xs font-bold uppercase tracking-[.18em] text-[#2dd4bf]">Reports</div>
                    <h1 className={`mt-1 text-2xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>Feedback analytics</h1>
                    <p className={`mt-1 text-sm ${muted}`}>What users complain about most, and how fast the team responds.</p>
                </div>
                <a href={exportHref} className="flex h-10 items-center gap-2 rounded-lg bg-[#2dd4bf] px-4 text-xs font-bold text-white">
                    <Download size={14} />Export CSV
                </a>
            </div>

            <div className={`flex flex-wrap items-center gap-2 rounded-xl border p-3 ${panel}`}>
                <input type="date" value={range.from} onChange={e => setRange(c => ({ ...c, from: e.target.value }))} className={`h-9 rounded-lg border px-3 text-xs outline-none ${field}`} />
                <span className={`text-xs ${muted}`}>to</span>
                <input type="date" value={range.to} onChange={e => setRange(c => ({ ...c, to: e.target.value }))} className={`h-9 rounded-lg border px-3 text-xs outline-none ${field}`} />
                <button onClick={load} className={`h-9 rounded-lg border px-3 text-xs font-semibold ${field}`}>Apply</button>
            </div>

            {error && <div className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</div>}

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StatTile panel={panel} muted={muted} label="Total submissions" value={String(report?.totalCount ?? 0)} />
                <StatTile panel={panel} muted={muted} label="Top category" value={topCategory ? `${CATEGORY_LABELS[topCategory.category] || topCategory.category} (${topCategory.count})` : '—'} />
                <StatTile panel={panel} muted={muted} label="Median response time" value={responseTime.medianResponseHours == null ? 'N/A' : `${responseTime.medianResponseHours}h`} />
                <StatTile panel={panel} muted={muted} label="Awaiting response" value={`${responseTime.awaitingResponsePercent}%`} tone={responseTime.awaitingResponsePercent > 25 ? '#ef4444' : undefined} />
            </div>

            <div className={`rounded-xl border p-4 ${panel}`}>
                <div className="mb-3 flex items-center gap-2 text-sm font-bold"><MessageSquare size={16} />Submissions by category</div>
                {loading ? <p className={`p-10 text-center text-xs ${muted}`}>Loading…</p>
                    : !categories.length ? <p className={`p-10 text-center text-xs ${muted}`}>No feedback in this range.</p>
                        : <Chart options={categoryOptions} series={categorySeries} type="bar" height={Math.max(220, categories.length * 42)} />}

                {!!categories.length && <div className="mt-4 overflow-x-auto">
                    <table className="w-full text-left text-xs">
                        <thead>
                            <tr className={muted}>
                                <th className="px-2 py-2 font-semibold">Category</th>
                                <th className="px-2 py-2 font-semibold">Count</th>
                                <th className="px-2 py-2 font-semibold">Share</th>
                                <th className="px-2 py-2 font-semibold">Urgent / high</th>
                            </tr>
                        </thead>
                        <tbody>
                            {categories.map(row => (
                                <tr key={row.category} className={`border-t ${isDark ? 'border-[#2a2e39]' : 'border-slate-200'}`}>
                                    <td className="px-2 py-2 font-semibold">{CATEGORY_LABELS[row.category] || row.category}</td>
                                    <td className="px-2 py-2">{row.count}</td>
                                    <td className="px-2 py-2">{row.percent}%</td>
                                    <td className={`px-2 py-2 ${row.urgentHighCount > 0 ? 'font-semibold text-red-400' : ''}`}>{row.urgentHighCount}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>}
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
                <div className={`rounded-xl border p-4 ${panel}`}>
                    <div className="mb-3 flex items-center gap-2 text-sm font-bold"><AlertTriangle size={16} />Priority breakdown</div>
                    <div className="grid grid-cols-2 gap-3">
                        {priorities.map(row => (
                            <div key={row.value} className={`rounded-lg border p-3 ${field}`}>
                                <div className={`text-[11px] font-semibold uppercase tracking-wide ${muted}`}>{row.value}</div>
                                <div className={`mt-1 text-lg font-bold ${PRIORITY_TONES[row.value] || ''}`}>{row.count}</div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className={`rounded-xl border p-4 ${panel}`}>
                    <div className="mb-3 flex items-center gap-2 text-sm font-bold"><ListChecks size={16} />Status pipeline</div>
                    <div className="mb-3 flex gap-4 text-xs">
                        <span><strong className="text-base">{statusBreakdown.open}</strong> <span className={muted}>open</span></span>
                        <span><strong className="text-base">{statusBreakdown.resolved}</strong> <span className={muted}>resolved</span></span>
                    </div>
                    <div className="space-y-1.5 text-xs">
                        {statusBreakdown.byStatus.map(row => (
                            <div key={row.value} className="flex items-center justify-between">
                                <span className={`capitalize ${STATUS_TONES[row.value] || muted}`}>{row.value.replace('_', ' ')}</span>
                                <span className="font-semibold">{row.count}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className={`rounded-xl border p-4 ${panel}`}>
                <div className="mb-3 text-sm font-bold">Volume trend (weekly)</div>
                {loading ? <p className={`p-10 text-center text-xs ${muted}`}>Loading…</p>
                    : !volumeTrend.length ? <p className={`p-10 text-center text-xs ${muted}`}>No feedback in this range.</p>
                        : <Chart options={trendOptions} series={trendSeries} type="area" height={260} />}
            </div>
        </div>
    </>;
}

function StatTile({ panel, muted, label, value, tone }) {
    return (
        <div className={`rounded-xl border p-4 ${panel}`}>
            <div className={`text-[11px] font-semibold uppercase tracking-wide ${muted}`}>{label}</div>
            <div className="mt-1.5 text-lg font-bold" style={{ color: tone }}>{value}</div>
        </div>
    );
}

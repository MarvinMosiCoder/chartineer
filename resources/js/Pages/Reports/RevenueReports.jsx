import React, { useEffect, useMemo, useState } from 'react';
import { Head } from '@inertiajs/react';
import axios from 'axios';
import Chart from 'react-apexcharts';
import { ArrowDownRight, ArrowUpRight, Download, TrendingUp } from 'lucide-react';
import { useTheme } from '../../Context/ThemeContext';

const GRANULARITIES = [
    { value: 'day', label: 'Daily' },
    { value: 'week', label: 'Weekly' },
    { value: 'month', label: 'Monthly' },
    { value: 'year', label: 'Yearly' },
];

// Validated against both surfaces with scripts/validate_palette.js (dataviz skill):
// light passes with a contrast WARN on the green (relief satisfied by the stat
// tiles/table below, which carry every value as text, not color alone); dark
// needed a darker emerald step to clear the categorical lightness band.
const STATUS = {
    good: { light: '#10b981', dark: '#059669' },
    critical: { light: '#ef4444', dark: '#ef4444' },
};

const money = value => `PHP ${Number(value ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function periodLabel(period, granularity) {
    if (granularity === 'year') return period;
    if (granularity === 'month') {
        const [y, m] = period.split('-');
        return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
    }
    const date = new Date(`${period}T00:00:00`);
    return granularity === 'week'
        ? `Wk of ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
        : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function RevenueReports() {
    const { theme } = useTheme();
    const isDark = theme === 'bg-skin-black';
    const status = isDark
        ? { good: STATUS.good.dark, critical: STATUS.critical.dark }
        : { good: STATUS.good.light, critical: STATUS.critical.light };

    const [granularity, setGranularity] = useState('month');
    const [range, setRange] = useState({ from: '', to: '' });
    const [report, setReport] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const load = async () => {
        setLoading(true); setError('');
        try {
            const params = { granularity, ...(range.from ? { from: range.from } : {}), ...(range.to ? { to: range.to } : {}) };
            const { data } = await axios.get('/admin/reports/revenue/items', { params });
            setReport(data);
            setRange(current => ({ from: current.from || data.from, to: current.to || data.to }));
        } catch (e) {
            setError(e.response?.data?.message || 'Unable to load the revenue report.');
        } finally {
            setLoading(false);
        }
    };
    useEffect(() => { load(); }, [granularity]);

    const applyRange = () => load();

    const exportHref = useMemo(() => {
        const params = new URLSearchParams({ granularity, ...(range.from ? { from: range.from } : {}), ...(range.to ? { to: range.to } : {}) });
        return `/admin/reports/revenue/export?${params.toString()}`;
    }, [granularity, range.from, range.to]);

    const series = report?.series ?? [];
    const comparison = report?.comparison ?? { currentNetRevenue: 0, previousNetRevenue: 0, percentChange: null };
    const planBreakdown = report?.planBreakdown ?? [];
    const grossPaidTotal = series.reduce((sum, row) => sum + row.grossPaid, 0);
    const refundsTotal = series.reduce((sum, row) => sum + row.refunds, 0);

    const panel = isDark ? 'border-[#2a2e39] bg-[#131722]' : 'border-slate-200 bg-white';
    const field = isDark ? 'border-[#2a2e39] bg-[#0b0e14] text-white' : 'border-slate-200 bg-slate-50';
    const muted = 'text-[#787b86]';

    const chartOptions = {
        chart: { toolbar: { show: false }, background: 'transparent', foreColor: '#787b86' },
        plotOptions: { bar: { distributed: true, borderRadius: 4, columnWidth: '55%' } },
        colors: series.map(row => (row.netRevenue >= 0 ? status.good : status.critical)),
        dataLabels: { enabled: false },
        legend: { show: false },
        grid: { borderColor: isDark ? '#2a2e39' : '#e1e0d9', strokeDashArray: 0 },
        xaxis: {
            categories: series.map(row => periodLabel(row.period, granularity)),
            labels: { style: { colors: '#787b86', fontSize: '11px' } },
            axisBorder: { color: isDark ? '#2a2e39' : '#e1e0d9' },
            axisTicks: { show: false },
        },
        yaxis: { labels: { formatter: value => Number(value).toLocaleString(), style: { colors: '#787b86', fontSize: '11px' } } },
        tooltip: {
            theme: isDark ? 'dark' : 'light',
            custom: ({ dataPointIndex }) => {
                const row = series[dataPointIndex];
                if (!row) return '';
                const label = periodLabel(row.period, granularity);
                return `<div style="padding:10px 12px;font-size:11px;line-height:1.6;min-width:170px">
                    <div style="font-weight:700;margin-bottom:4px">${label}</div>
                    <div>Gross paid: <strong>${money(row.grossPaid)}</strong></div>
                    <div>Refunds: <strong>${money(row.refunds)}</strong></div>
                    <div>Net revenue: <strong>${money(row.netRevenue)}</strong></div>
                    <div>Transactions: <strong>${row.transactionCount}</strong></div>
                </div>`;
            },
        },
    };
    const chartSeries = [{ name: 'Net revenue', data: series.map(row => row.netRevenue) }];

    const netTone = comparison.currentNetRevenue >= 0 ? status.good : status.critical;
    const changeUp = (comparison.percentChange ?? 0) >= 0;

    return <>
        <Head title="Revenue Reports" />
        <div className={`space-y-4 ${isDark ? 'text-[#d1d4dc]' : 'text-slate-900'}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <div className="text-xs font-bold uppercase tracking-[.18em] text-[#2962ff]">Reports</div>
                    <h1 className={`mt-1 text-2xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>Revenue reports</h1>
                    <p className={`mt-1 text-sm ${muted}`}>Net revenue from subscription checkouts, by day, week, month, or year.</p>
                </div>
                <a href={exportHref} className="flex h-10 items-center gap-2 rounded-lg bg-[#2962ff] px-4 text-xs font-bold text-white">
                    <Download size={14} />Export CSV
                </a>
            </div>

            <div className={`flex flex-wrap items-center gap-2 rounded-xl border p-3 ${panel}`}>
                <div className={`flex rounded-lg border p-1 ${field}`}>
                    {GRANULARITIES.map(g => (
                        <button
                            key={g.value}
                            onClick={() => setGranularity(g.value)}
                            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${granularity === g.value ? 'bg-[#2962ff] text-white' : muted}`}
                        >
                            {g.label}
                        </button>
                    ))}
                </div>
                <input type="date" value={range.from} onChange={e => setRange(c => ({ ...c, from: e.target.value }))} className={`h-9 rounded-lg border px-3 text-xs outline-none ${field}`} />
                <span className={`text-xs ${muted}`}>to</span>
                <input type="date" value={range.to} onChange={e => setRange(c => ({ ...c, to: e.target.value }))} className={`h-9 rounded-lg border px-3 text-xs outline-none ${field}`} />
                <button onClick={applyRange} className={`h-9 rounded-lg border px-3 text-xs font-semibold ${field}`}>Apply</button>
            </div>

            {error && <div className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</div>}

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StatTile panel={panel} muted={muted} label="Net revenue" value={money(comparison.currentNetRevenue)} tone={netTone} />
                <StatTile panel={panel} muted={muted} label="Gross paid" value={money(grossPaidTotal)} tone="#2962ff" />
                <StatTile panel={panel} muted={muted} label="Refunds" value={money(refundsTotal)} tone={status.critical} />
                <StatTile panel={panel} muted={muted} label="Vs. previous period">
                    {comparison.percentChange == null
                        ? <span className={`text-lg font-bold ${muted}`}>N/A</span>
                        : <span className="flex items-center gap-1 text-lg font-bold" style={{ color: changeUp ? status.good : status.critical }}>
                            {changeUp ? <ArrowUpRight size={18} /> : <ArrowDownRight size={18} />}
                            {Math.abs(comparison.percentChange).toFixed(1)}%
                        </span>}
                </StatTile>
            </div>

            <div className={`rounded-xl border p-4 ${panel}`}>
                <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-bold"><TrendingUp size={16} />Net revenue trend</div>
                    <div className="flex items-center gap-3 text-[11px]">
                        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: status.good }} />Net gain</span>
                        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: status.critical }} />Net loss</span>
                    </div>
                </div>
                {loading ? <p className={`p-10 text-center text-xs ${muted}`}>Loading…</p>
                    : !series.length ? <p className={`p-10 text-center text-xs ${muted}`}>No revenue in this range.</p>
                        : <Chart options={chartOptions} series={chartSeries} type="bar" height={320} />}
            </div>

            <div className={`overflow-hidden rounded-xl border ${panel}`}>
                <div className="border-b border-[#2a2e39] p-4 text-sm font-bold">Breakdown by plan</div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                        <thead>
                            <tr className={muted}>
                                <th className="px-4 py-2 font-semibold">Plan</th>
                                <th className="px-4 py-2 font-semibold">Gross paid</th>
                                <th className="px-4 py-2 font-semibold">Refunds</th>
                                <th className="px-4 py-2 font-semibold">Net revenue</th>
                                <th className="px-4 py-2 font-semibold">Transactions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {!planBreakdown.length
                                ? <tr><td colSpan={5} className={`px-4 py-6 text-center ${muted}`}>No plan data in this range.</td></tr>
                                : planBreakdown.map(row => (
                                    <tr key={row.plan} className={`border-t ${isDark ? 'border-[#2a2e39]' : 'border-slate-200'}`}>
                                        <td className="px-4 py-2 font-semibold capitalize">{row.planName}</td>
                                        <td className="px-4 py-2">{money(row.grossPaid)}</td>
                                        <td className="px-4 py-2">{money(row.refunds)}</td>
                                        <td className="px-4 py-2 font-semibold" style={{ color: row.netRevenue >= 0 ? status.good : status.critical }}>{money(row.netRevenue)}</td>
                                        <td className="px-4 py-2">{row.transactionCount}</td>
                                    </tr>
                                ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    </>;
}

function StatTile({ panel, muted, label, value, tone, children }) {
    return (
        <div className={`rounded-xl border p-4 ${panel}`}>
            <div className={`text-[11px] font-semibold uppercase tracking-wide ${muted}`}>{label}</div>
            <div className="mt-1.5">
                {children ?? <span className="text-lg font-bold" style={{ color: typeof tone === 'string' ? tone : undefined }}>{value}</span>}
            </div>
        </div>
    );
}

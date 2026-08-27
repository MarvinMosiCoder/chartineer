import React, { useEffect, useState } from 'react';
import { Head } from '@inertiajs/react';
import axios from 'axios';
import { AlertTriangle, ChevronLeft, ChevronRight, CircleCheck, RotateCcw, Search } from 'lucide-react';
import { useTheme } from '../../Context/ThemeContext';

const AREAS = ['payments', 'backtest', 'general'];

const areaTones = {
    payments: 'border-amber-500/30 bg-amber-500/10 text-amber-500',
    backtest: 'border-violet-500/30 bg-violet-500/10 text-violet-400',
    general: 'border-slate-400/30 bg-slate-400/10 text-slate-400',
};

export default function SystemErrorLogAdminIndex() {
    const { theme } = useTheme();
    const isDark = theme === 'bg-skin-black';
    const [items, setItems] = useState([]);
    const [selected, setSelected] = useState(null);
    const [filters, setFilters] = useState({ search: '', area: '', resolved: '' });
    const [page, setPage] = useState(1);
    const [meta, setMeta] = useState({ current_page: 1, last_page: 1, total: 0 });
    const [loading, setLoading] = useState(true);
    const [resolving, setResolving] = useState(null);
    const [error, setError] = useState('');

    const load = async () => {
        setLoading(true); setError('');
        try {
            const { data } = await axios.get('/admin/system-errors/items', { params: { ...filters, page } });
            setItems(data.data ?? []);
            setMeta({ current_page: data.current_page, last_page: data.last_page, total: data.total });
        } catch (e) { setError(e.response?.data?.message || 'Unable to load system error logs.'); }
        finally { setLoading(false); }
    };
    useEffect(() => { const timer = setTimeout(load, 250); return () => clearTimeout(timer); }, [filters.search, filters.area, filters.resolved, page]);
    useEffect(() => { setPage(1); }, [filters.search, filters.area, filters.resolved]);

    const resolve = async item => {
        setResolving(item.id);
        try {
            const { data } = await axios.post(`/admin/system-errors/${item.id}/resolve`);
            setItems(current => current.map(row => row.id === item.id ? data.log : row));
            setSelected(current => current?.id === item.id ? data.log : current);
        } catch (e) { setError(e.response?.data?.message || 'Unable to update this log.'); }
        finally { setResolving(null); }
    };

    const panel = isDark ? 'border-[#2a2e39] bg-[#131722]' : 'border-slate-200 bg-white';
    const field = isDark ? 'border-[#2a2e39] bg-[#0b0e14] text-white' : 'border-slate-200 bg-slate-50';
    const muted = 'text-[#787b86]';

    return <><Head title="System Error Logs"/>
        <div className={`space-y-4 ${isDark ? 'text-[#d1d4dc]' : 'text-slate-900'}`}>
            <div>
                <div className="text-xs font-bold uppercase tracking-[.18em] text-[#2dd4bf]">System health</div>
                <h1 className={`mt-1 text-2xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>System error logs</h1>
                <p className={`mt-1 text-sm ${muted}`}>Every reported exception app-wide, tagged by area, for checking payment, backtest, and other failures.</p>
            </div>

            <div className={`grid gap-2 rounded-xl border p-3 sm:grid-cols-4 ${panel}`}>
                <label className={`flex h-10 items-center gap-2 rounded-lg border px-3 ${field}`}><Search size={14}/><input value={filters.search} onChange={e => setFilters(c => ({ ...c, search: e.target.value }))} placeholder="Search message, class, file, URL" className="min-w-0 flex-1 bg-transparent text-xs outline-none"/></label>
                <select value={filters.area} onChange={e => setFilters(c => ({ ...c, area: e.target.value }))} className={`h-10 rounded-lg border px-3 text-xs capitalize outline-none ${field}`}><option value="">All areas</option>{AREAS.map(value => <option key={value} value={value}>{value}</option>)}</select>
                <select value={filters.resolved} onChange={e => setFilters(c => ({ ...c, resolved: e.target.value }))} className={`h-10 rounded-lg border px-3 text-xs outline-none ${field}`}><option value="">All statuses</option><option value="0">Unresolved</option><option value="1">Resolved</option></select>
                <div className={`flex h-10 items-center justify-end gap-2 text-xs ${muted}`}>{meta.total} total</div>
            </div>

            {error && <div className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</div>}

            <div className="grid min-h-[600px] gap-4 lg:grid-cols-[.9fr_1.1fr]">
                <section className={`overflow-hidden rounded-xl border ${panel}`}>
                    <div className="flex items-center justify-between border-b border-[#2a2e39] p-4"><div className="flex items-center gap-2 text-sm font-bold"><AlertTriangle size={16}/>Errors</div><div className="flex items-center gap-1 text-[10px] text-[#787b86]"><button disabled={meta.current_page <= 1} onClick={() => setPage(p => p - 1)} className="rounded p-1 disabled:opacity-30"><ChevronLeft size={14}/></button>Page {meta.current_page}/{meta.last_page || 1}<button disabled={meta.current_page >= meta.last_page} onClick={() => setPage(p => p + 1)} className="rounded p-1 disabled:opacity-30"><ChevronRight size={14}/></button></div></div>
                    <div className="max-h-[650px] overflow-y-auto">
                        {loading ? <p className="p-5 text-xs text-[#787b86]">Loading…</p> : !items.length ? <p className="p-12 text-center text-xs text-[#787b86]">No errors match these filters.</p> : items.map(item => <button key={item.id} onClick={() => setSelected(item)} className={`block w-full border-b p-4 text-left ${isDark ? 'border-[#2a2e39]' : 'border-slate-200'} ${selected?.id === item.id ? 'bg-[#2dd4bf]/10' : 'hover:bg-[#2dd4bf]/5'}`}>
                            <div className="flex items-start gap-2">
                                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase ${areaTones[item.area] || areaTones.general}`}>{item.area}</span>
                                {item.resolvedAt && <span className="flex shrink-0 items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-bold uppercase text-emerald-500"><CircleCheck size={10}/>Resolved</span>}
                                {item.occurrences > 1 && <span className="ml-auto shrink-0 rounded-full bg-red-500/15 px-2 py-0.5 text-[9px] font-bold text-red-400">×{item.occurrences}</span>}
                            </div>
                            <div className="mt-1.5 truncate text-xs font-bold">{item.exceptionClass}</div>
                            <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-[#9598a1]">{item.message}</p>
                            <div className="mt-1.5 truncate text-[10px] text-[#787b86]">{new Date(item.lastSeenAt || item.createdAt).toLocaleString()}{item.user?.email ? ` · ${item.user.email}` : ''}</div>
                        </button>)}
                    </div>
                </section>
                <section className={`rounded-xl border p-5 ${panel}`}>
                    {!selected ? <div className="flex h-full items-center justify-center text-xs text-[#787b86]">Select an error to inspect.</div> : <div>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                                <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase ${areaTones[selected.area] || areaTones.general}`}>{selected.area}</span>
                                <h2 className="mt-2 break-all text-lg font-bold">{selected.exceptionClass}</h2>
                                <div className="mt-1 text-xs text-[#787b86]">First / last seen: {new Date(selected.createdAt).toLocaleString()} → {new Date(selected.lastSeenAt || selected.createdAt).toLocaleString()} ({selected.occurrences} occurrence{selected.occurrences === 1 ? '' : 's'})</div>
                            </div>
                            <button disabled={resolving === selected.id} onClick={() => resolve(selected)} className={`flex h-9 shrink-0 items-center gap-2 rounded-lg px-3 text-xs font-bold text-white disabled:opacity-50 ${selected.resolvedAt ? 'bg-slate-500' : 'bg-emerald-600'}`}>{selected.resolvedAt ? <RotateCcw size={14}/> : <CircleCheck size={14}/>}{selected.resolvedAt ? 'Reopen' : 'Mark resolved'}</button>
                        </div>
                        <div className={`mt-4 rounded-lg border p-4 text-sm leading-6 ${field}`}>{selected.message}</div>
                        <div className="mt-4 grid gap-2 text-xs sm:grid-cols-2">
                            <div><span className={muted}>File:</span> <span className="break-all">{selected.file}{selected.line ? `:${selected.line}` : ''}</span></div>
                            <div><span className={muted}>User:</span> {selected.user ? `${selected.user.name} (${selected.user.email})` : '—'}</div>
                            <div><span className={muted}>Method / URL:</span> <span className="break-all">{selected.method} {selected.url || '—'}</span></div>
                            <div><span className={muted}>IP:</span> {selected.ip || '—'}</div>
                        </div>
                        {selected.trace && <details className="mt-4"><summary className="cursor-pointer text-xs font-semibold text-[#5eead4]">Stack trace</summary><pre className={`mt-2 max-h-80 overflow-auto rounded-lg border p-3 text-[10px] leading-5 ${field}`}>{selected.trace}</pre></details>}
                    </div>}
                </section>
            </div>
        </div>
    </>;
}

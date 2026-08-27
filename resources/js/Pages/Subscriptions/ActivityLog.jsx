import React, { useEffect, useState } from 'react';
import { Head, usePage } from '@inertiajs/react';
import axios from 'axios';
import { ChevronLeft, ChevronRight, History, Search, X } from 'lucide-react';
import { useTheme } from '../../Context/ThemeContext';

const ACTIONS = ['checkout_created', 'checkout_failed', 'checkout_expired', 'payment_activated', 'access_revoked', 'access_restored', 'trial_activated'];

const actionTones = {
    checkout_created: 'border-[#2dd4bf]/30 bg-[#2dd4bf]/10 text-[#5eead4]',
    payment_activated: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500',
    access_restored: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500',
    trial_activated: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500',
    checkout_failed: 'border-red-500/30 bg-red-500/10 text-red-500',
    checkout_expired: 'border-amber-500/30 bg-amber-500/10 text-amber-500',
    access_revoked: 'border-red-500/30 bg-red-500/10 text-red-500',
};

const money = item => item?.amount ? `${item.currency || 'PHP'} ${Number(item.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : null;

export default function PaymentActivityLog() {
    const { theme } = useTheme();
    const isDark = theme === 'bg-skin-black';
    const { url } = usePage();
    const initialSubscriptionRequestId = new URL(url, window.location.origin).searchParams.get('subscription_request_id') || '';

    const [items, setItems] = useState([]);
    const [filters, setFilters] = useState({ search: '', action: '', subscription_request_id: initialSubscriptionRequestId });
    const [page, setPage] = useState(1);
    const [meta, setMeta] = useState({ current_page: 1, last_page: 1, total: 0 });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const load = async () => {
        setLoading(true); setError('');
        try {
            const { data } = await axios.get('/admin/payment-activity/items', { params: { ...filters, page } });
            setItems(data.data ?? []);
            setMeta({ current_page: data.current_page, last_page: data.last_page, total: data.total });
        } catch (e) { setError(e.response?.data?.message || 'Unable to load payment activity.'); }
        finally { setLoading(false); }
    };
    useEffect(() => { const timer = setTimeout(load, 250); return () => clearTimeout(timer); }, [filters.search, filters.action, filters.subscription_request_id, page]);
    useEffect(() => { setPage(1); }, [filters.search, filters.action, filters.subscription_request_id]);

    const panel = isDark ? 'border-[#2a2e39] bg-[#131722]' : 'border-slate-200 bg-white';
    const field = isDark ? 'border-[#2a2e39] bg-[#0b0e14] text-white' : 'border-slate-200 bg-slate-50';
    const muted = 'text-[#787b86]';

    return <><Head title="Payment Activity"/>
        <div className={`space-y-4 ${isDark ? 'text-[#d1d4dc]' : 'text-slate-900'}`}>
            <div>
                <div className="text-xs font-bold uppercase tracking-[.18em] text-[#2dd4bf]">Payment operations</div>
                <h1 className={`mt-1 text-2xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>Payment activity history</h1>
                <p className={`mt-1 text-sm ${muted}`}>Every checkout, activation, refund, and restoration event, for validating a customer's payment story.</p>
            </div>

            <div className={`grid gap-2 rounded-xl border p-3 sm:grid-cols-4 ${panel}`}>
                <label className={`flex h-10 items-center gap-2 rounded-lg border px-3 ${field}`}><Search size={14}/><input value={filters.search} onChange={e => setFilters(c => ({ ...c, search: e.target.value }))} placeholder="Search by description or user" className="min-w-0 flex-1 bg-transparent text-xs outline-none"/></label>
                <select value={filters.action} onChange={e => setFilters(c => ({ ...c, action: e.target.value }))} className={`h-10 rounded-lg border px-3 text-xs outline-none ${field}`}><option value="">All actions</option>{ACTIONS.map(value => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</select>
                {filters.subscription_request_id ? <div className={`flex h-10 items-center justify-between gap-2 rounded-lg border px-3 text-xs ${field}`}><span>Transaction #{filters.subscription_request_id}</span><button onClick={() => setFilters(c => ({ ...c, subscription_request_id: '' }))} aria-label="Clear transaction filter"><X size={14}/></button></div> : <div/>}
                <div className={`flex h-10 items-center justify-end gap-2 text-xs ${muted}`}>{meta.total} total</div>
            </div>

            {error && <div className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</div>}

            <div className={`overflow-hidden rounded-xl border ${panel}`}>
                <div className="flex items-center justify-between border-b border-[#2a2e39] p-4"><div className="flex items-center gap-2 text-sm font-bold"><History size={16}/>Activity</div><div className="flex items-center gap-1 text-[10px] text-[#787b86]"><button disabled={meta.current_page <= 1} onClick={() => setPage(p => p - 1)} className="rounded p-1 disabled:opacity-30"><ChevronLeft size={14}/></button>Page {meta.current_page}/{meta.last_page || 1}<button disabled={meta.current_page >= meta.last_page} onClick={() => setPage(p => p + 1)} className="rounded p-1 disabled:opacity-30"><ChevronRight size={14}/></button></div></div>
                <div className="max-h-[650px] overflow-y-auto">
                    {loading ? <p className="p-5 text-xs text-[#787b86]">Loading…</p> : !items.length ? <p className="p-12 text-center text-xs text-[#787b86]">No activity matches these filters.</p> : items.map(item => <article key={item.id} className={`border-b p-4 transition-colors ${isDark ? 'border-[#2a2e39] hover:bg-white/[0.03]' : 'border-slate-200 hover:bg-slate-50'}`}>
                        <div className="flex flex-wrap items-center gap-2">
                            <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase ${actionTones[item.action] || 'border-slate-400/30 bg-slate-400/10 text-slate-400'}`}>{item.action.replaceAll('_', ' ')}</span>
                            <span className={`text-[10px] ${muted}`}>{item.actor}</span>
                            {item.subscriptionRequest && <span className={`ml-auto text-[10px] ${muted}`}>#{item.subscriptionRequest.id} · {item.subscriptionRequest.plan} · {money(item.subscriptionRequest) || item.subscriptionRequest.status}</span>}
                        </div>
                        <p className="mt-2 text-sm leading-6">{item.description}</p>
                        <div className={`mt-1.5 text-[10px] ${muted}`}>{item.user ? `${item.user.name} (${item.user.email}) · ` : ''}{new Date(item.createdAt).toLocaleString()}</div>
                    </article>)}
                </div>
            </div>
        </div>
    </>;
}

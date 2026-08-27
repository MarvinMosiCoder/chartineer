import React, { useEffect, useMemo, useState } from 'react';
import { Head, Link, router, usePage } from '@inertiajs/react';
import axios from 'axios';
import { ArrowRight, BookOpen, CandlestickChart, CircleDollarSign, CreditCard, FileChartColumn, Lightbulb, Megaphone, Search, Sparkles } from 'lucide-react';
import { useTheme } from '../../Context/ThemeContext';
import { marketCategoryLabel } from '../../utils/marketLabels';

const marketKey = item => `${String(item.exchange).toLowerCase()}:${String(item.category).toLowerCase()}:${String(item.symbol).toUpperCase()}`;

export default function MarketSummary() {
    const { auth } = usePage().props;
    const { theme } = useTheme();
    const dark = theme === 'bg-skin-black';
    const [symbols, setSymbols] = useState([]);
    const [symbolsLoaded, setSymbolsLoaded] = useState(false);
    const [overview, setOverview] = useState({ featured_markets: [], announcements: [], tips: [] });
    const [overviewLoaded, setOverviewLoaded] = useState(false);
    const [overviewError, setOverviewError] = useState('');
    const [metadata, setMetadata] = useState({});
    const [metadataLoading, setMetadataLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [expandedAnnouncement, setExpandedAnnouncement] = useState(null);

    useEffect(() => {
        let cancelled = false;
        fetch('/market-symbols', { headers: { Accept: 'application/json' } })
            .then(response => response.json())
            .then(data => { if (!cancelled) setSymbols(data.symbols ?? []); })
            .catch(() => { if (!cancelled) setSymbols([]); })
            .finally(() => { if (!cancelled) setSymbolsLoaded(true); });
        return () => { cancelled = true; };
    }, []);

    useEffect(() => {
        let cancelled = false;
        axios.get('/market-overview')
            .then(response => { if (!cancelled) setOverview(response.data ?? { featured_markets: [], announcements: [], tips: [] }); })
            .catch(() => { if (!cancelled) setOverviewError('Updates are temporarily unavailable. Your watchlist is still ready.'); })
            .finally(() => { if (!cancelled) setOverviewLoaded(true); });
        return () => { cancelled = true; };
    }, []);

    useEffect(() => {
        if (!symbolsLoaded || !overviewLoaded) return undefined;
        const unique = new Map();
        [...(overview.featured_markets ?? []), ...symbols].forEach(item => unique.set(marketKey(item), { exchange: item.exchange, category: item.category, symbol: item.symbol }));
        const markets = [...unique.values()].slice(0, 50);
        if (!markets.length) { setMetadata({}); return undefined; }
        let cancelled = false;
        setMetadataLoading(true);
        axios.post('/market-metadata/batch', { markets })
            .then(response => {
                if (cancelled) return;
                const next = {};
                (response.data?.items ?? []).forEach(item => { next[marketKey(item.market)] = item; });
                setMetadata(next);
            })
            .catch(() => { if (!cancelled) setMetadata({}); })
            .finally(() => { if (!cancelled) setMetadataLoading(false); });
        return () => { cancelled = true; };
    }, [overview.featured_markets, overviewLoaded, symbols, symbolsLoaded]);

    const filtered = useMemo(
        () => symbols.filter(item => `${item.symbol} ${item.exchange} ${item.category} ${marketCategoryLabel(item.category)}`.toLowerCase().includes(search.toLowerCase())),
        [search, symbols],
    );
    const featured = overview.featured_markets ?? [];
    const featuredChanges = featured.map(item => Number(metadata[marketKey(item)]?.stats?.change_24h_percent)).filter(Number.isFinite);
    const marketStatus = metadataLoading || !overviewLoaded
        ? 'Refreshing live market highlights…'
        : featuredChanges.length
            ? `${featuredChanges.filter(value => value >= 0).length} of ${featuredChanges.length} featured markets are positive over 24 hours.`
            : 'Market highlights will appear when exchange data is available.';
    const tip = useMemo(() => {
        const tips = overview.tips ?? [];
        if (!tips.length) return null;
        return tips[Math.floor(Date.now() / 86400000) % tips.length];
    }, [overview.tips]);
    const welcomeIdentity = auth?.user?.username || auth?.user?.name;
    const welcomeName = welcomeIdentity ? String(welcomeIdentity).split(' ')[0] : '';

    const open = item => {
        const selected = { symbol: item.symbol, exchange: item.exchange, category: item.category };
        localStorage.setItem(`backtradelab-active-symbol:${auth?.user?.id ?? 'guest'}`, JSON.stringify(selected));
        router.visit('/workspace');
    };

    const toggleAnnouncement = async item => {
        setExpandedAnnouncement(current => current === item.id ? null : item.id);
        if (item.is_read) return;
        setOverview(current => ({ ...current, announcements: current.announcements.map(entry => entry.id === item.id ? { ...entry, is_read: true } : entry) }));
        try { await axios.post('/read-announcement', { announcement_id: item.id }); } catch {
            setOverview(current => ({ ...current, announcements: current.announcements.map(entry => entry.id === item.id ? { ...entry, is_read: false } : entry) }));
        }
    };

    const panel = dark ? 'border-[#2a2e39] bg-[#131722]' : 'border-slate-200 bg-white';
    const soft = dark ? 'border-[#2a2e39] bg-[#0b0e14]' : 'border-slate-200 bg-slate-50';
    const muted = dark ? 'text-[#a6a9b2]' : 'text-slate-600';

    return <>
        <Head title="Market Summary" />
        <div className={`mx-auto max-w-7xl space-y-5 ${dark ? 'text-white' : 'text-slate-900'}`}>
            <section className={`overflow-hidden rounded-2xl border ${panel}`}>
                <div className={`grid gap-4 p-4 sm:p-5 lg:grid-cols-[1fr_auto] lg:items-center ${dark ? 'bg-gradient-to-r from-[#172554] via-[#131722] to-[#0b0e14]' : 'bg-gradient-to-r from-blue-50 via-white to-slate-50'}`}>
                    <div><div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.18em] text-[#5eead4]"><Sparkles size={13}/>Market overview</div><h1 className="mt-1 text-2xl font-bold">Welcome back{welcomeName ? `, ${welcomeName}` : ''}</h1><p className={`mt-1 text-sm ${muted}`}>{marketStatus}</p></div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:flex">
                        <QuickAction href="/workspace" icon={CandlestickChart} label="Workspace" dark={dark}/><QuickAction href="/trade-report" icon={FileChartColumn} label="Trade Report" dark={dark}/><QuickAction href="/subscription" icon={CreditCard} label="Subscription" dark={dark}/><QuickAction href="/help" icon={BookOpen} label="Help" dark={dark}/>
                    </div>
                </div>
            </section>

            <section><SectionTitle title="Market highlights" subtitle="Live 24-hour snapshots from the configured featured markets."/>
                <div className="grid gap-3 sm:grid-cols-3">{!overviewLoaded ? [0,1,2].map(item => <SkeletonCard key={item} panel={panel}/>) : featured.map(item => <FeaturedMarket key={marketKey(item)} item={item} info={metadata[marketKey(item)]} loading={metadataLoading} panel={panel} onOpen={open}/>)}</div>
            </section>

            <div className="grid gap-4 lg:grid-cols-[1.35fr_.65fr]">
                <section className={`rounded-xl border p-4 ${panel}`}><div className="flex items-center justify-between gap-3"><div><h2 className="flex items-center gap-2 font-bold"><Megaphone size={16} className="text-violet-400"/>News & updates</h2><p className={`text-xs ${muted}`}>Trusted updates published by BacktradeLab administrators.</p></div><Link href="/updates" className="text-xs font-semibold text-[#5eead4] transition hover:text-[#82a3ff] hover:underline">View all</Link></div>
                    {overviewError && <div className="mt-3 rounded-lg bg-amber-500/10 p-2 text-xs text-amber-500">{overviewError}</div>}
                    {!overviewLoaded ? <div className="mt-3 grid gap-2">{[0,1].map(item => <div key={item} className={`h-14 animate-pulse rounded-lg border ${soft}`}/>)}</div> : overview.announcements?.length ? <div className={`mt-3 divide-y ${dark ? 'divide-[#2a2e39]' : 'divide-slate-200'}`}>{overview.announcements.map(item => <button key={item.id} type="button" onClick={() => toggleAnnouncement(item)} className={`-mx-2 flex w-[calc(100%+1rem)] items-start gap-3 rounded-lg px-2 py-2.5 text-left transition-colors ${dark ? 'hover:bg-white/[.06]' : 'hover:bg-slate-100'}`}><span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${item.is_read ? 'bg-slate-500' : 'bg-[#2dd4bf]'}`}/><span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-3"><span className="truncate text-sm font-semibold">{item.title}</span><span className="shrink-0 text-[9px] text-[#787b86]">{formatDate(item.created_at)}</span></span><span className={`mt-0.5 block text-xs leading-5 ${muted} ${expandedAnnouncement === item.id ? '' : 'line-clamp-1'}`}>{item.excerpt || 'Open this update for more information.'}</span></span></button>)}</div> : <div className={`mt-3 rounded-lg border p-4 text-center text-xs ${soft} ${muted}`}>No system updates have been published yet.</div>}
                </section>
                <section className={`rounded-xl border p-4 ${panel}`}><div className="flex items-center gap-2 font-bold"><Lightbulb size={16} className="text-amber-400"/>Practice tip</div>{tip ? <><h3 className="mt-3 text-sm font-bold">{tip.title}</h3><p className={`mt-1 text-xs leading-5 ${muted}`}>{tip.content}</p>{tip.action_url && <Link href={tip.action_url} className="group mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[#5eead4] transition hover:text-[#82a3ff]">{tip.action_label || 'Learn more'}<ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5"/></Link>}</> : <p className={`mt-3 text-xs ${muted}`}>Helpful practice guidance will appear here.</p>}</section>
            </div>

            <section><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><SectionTitle title="Your watchlist" subtitle="Saved Spot and Futures markets. Manage the list inside Workspace."/><label className={`flex h-10 w-full items-center gap-2 rounded-xl border px-3 sm:w-72 ${panel}`}><Search size={15}/><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search saved markets" className="min-w-0 flex-1 bg-transparent text-xs outline-none"/></label></div>
                {!symbolsLoaded ? <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{[0,1,2].map(item => <SkeletonCard key={item} panel={panel}/>)}</div> : filtered.length ? <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{filtered.map(item => <SavedMarket key={marketKey(item)} item={item} info={metadata[marketKey(item)]} panel={panel} onOpen={open}/>)}</div> : symbols.length ? <div className={`mt-3 rounded-xl border p-8 text-center ${panel}`}><Search size={22} className="mx-auto text-[#787b86]"/><p className={`mt-2 text-sm ${muted}`}>No saved markets match “{search}”.</p></div> : <div className={`mt-3 flex flex-col items-center rounded-xl border p-8 text-center ${panel}`}><CircleDollarSign size={28} className="text-[#5eead4]"/><h3 className="mt-3 font-bold">Build your first watchlist</h3><p className={`mt-1 max-w-md text-sm ${muted}`}>Open Workspace, browse supported exchanges, and save the markets you want to follow.</p><Link href="/workspace" className="mt-4 inline-flex h-10 items-center gap-2 rounded-lg bg-[#2dd4bf] px-4 text-xs font-bold text-white">Open Workspace<ArrowRight size={14}/></Link></div>}
            </section>
        </div>
    </>;
}

function SectionTitle({ title, subtitle }) { return <div><h2 className="text-lg font-bold">{title}</h2><p className="text-xs text-[#787b86]">{subtitle}</p></div>; }
function QuickAction({ href, icon: Icon, label, dark }) { return <Link href={href} className={`flex h-9 items-center justify-center gap-1.5 rounded-lg border px-2 text-[11px] font-semibold transition hover:-translate-y-0.5 hover:border-[#2dd4bf] hover:shadow-md ${dark ? 'border-[#2a2e39] bg-[#0b0e14]/70 hover:bg-white/10' : 'border-slate-200 bg-white/80 hover:bg-slate-100'}`}><Icon size={14}/>{label}</Link>; }
function SkeletonCard({ panel }) { return <div className={`h-36 animate-pulse rounded-xl border p-4 ${panel}`}><div className="h-9 w-9 rounded-lg bg-slate-500/20"/><div className="mt-4 h-3 w-24 rounded bg-slate-500/20"/><div className="mt-2 h-3 w-40 rounded bg-slate-500/20"/></div>; }
function FeaturedMarket({ item, info, loading, panel, onOpen }) { const change = Number(info?.stats?.change_24h_percent), positive = change >= 0; return <button type="button" onClick={() => onOpen(item)} className={`rounded-xl border p-4 text-left transition hover:-translate-y-0.5 hover:border-[#2dd4bf] hover:shadow-lg ${panel}`}><div className="flex items-start justify-between"><span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg bg-[#2dd4bf]/15 text-[#5eead4]">{info?.fundamentals?.logo_url ? <img src={info.fundamentals.logo_url} alt="" className="h-7 w-7 object-contain"/> : <CandlestickChart size={18}/>}</span>{Number.isFinite(change) && <span className={`text-xs font-bold ${positive ? 'text-emerald-500' : 'text-red-500'}`}>{positive ? '+' : ''}{change.toFixed(2)}%</span>}</div><div className="mt-3 flex items-end justify-between gap-2"><div><div className="font-bold">{info?.fundamentals?.name || item.symbol}</div><div className="text-[9px] uppercase text-[#787b86]">{item.symbol} · {item.exchange}</div></div><div className="text-right text-sm font-bold tabular-nums">{loading && !info ? '…' : formatValue(info?.stats?.last_price)}</div></div></button>; }
function SavedMarket({ item, info, panel, onOpen }) { const change = Number(info?.stats?.change_24h_percent); return <article className={`rounded-xl border p-4 transition hover:-translate-y-0.5 hover:border-[#2dd4bf] hover:shadow-lg ${panel}`}><div className="flex items-start justify-between gap-3"><span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl bg-[#2dd4bf]/15 text-[#5eead4]">{info?.fundamentals?.logo_url ? <img src={info.fundamentals.logo_url} alt="" className="h-8 w-8 object-contain"/> : <CandlestickChart size={20}/>}</span>{Number.isFinite(change) && <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${change >= 0 ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>{change >= 0 ? '+' : ''}{change.toFixed(2)}%</span>}</div><h3 className="mt-3 text-lg font-bold">{info?.fundamentals?.name || item.coin_name || item.symbol}</h3><div className="text-[10px] uppercase text-[#787b86]">{item.symbol} · {item.exchange} · {marketCategoryLabel(item.category)}{info?.fundamentals?.market_cap_rank ? ` · Rank #${info.fundamentals.market_cap_rank}` : ''}</div>{info && <div className="mt-3 grid grid-cols-2 gap-2 text-xs"><SummaryMetric label="Price" value={formatValue(info.stats?.last_price)}/><SummaryMetric label="24h volume" value={formatCompact(info.stats?.turnover_24h ?? info.stats?.volume_24h)}/><SummaryMetric label="Market cap" value={formatCompact(info.fundamentals?.market_cap)}/><SummaryMetric label="High / Low" value={info.stats?.high_24h != null || info.stats?.low_24h != null ? `${formatValue(info.stats?.high_24h)} / ${formatValue(info.stats?.low_24h)}` : '—'}/></div>}<button type="button" onClick={() => onOpen(item)} className="mt-4 h-9 w-full rounded-lg bg-[#2dd4bf] text-xs font-bold text-white transition hover:bg-[#14b8a6] hover:shadow-md">Open in Workspace</button></article>; }

const formatCompact = value => Number.isFinite(Number(value)) ? new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 2 }).format(Number(value)) : '—';
const formatValue = value => Number.isFinite(Number(value)) ? Number(value).toLocaleString(undefined, { maximumFractionDigits: 8 }) : '—';
const formatDate = value => value ? new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(value)) : '';
function SummaryMetric({ label, value }) { return value === '—' ? null : <div className="min-w-0"><div className="text-[9px] uppercase text-[#787b86]">{label}</div><div className="truncate font-semibold tabular-nums">{value}</div></div>; }

import React, { useEffect, useMemo, useState } from "react";
import { Head, Link, usePage } from "@inertiajs/react";
import MarketChart from "../../Components/Market/MarketChart";
import TradeInsightsWidget from "../../Components/Market/TradeInsightsWidget";
import { useTheme } from "../../Context/ThemeContext";
import { WatchlistProvider } from "../../Context/WatchlistContext";
import { Activity, AlertCircle, ArrowRight, CircleDollarSign, Clock3, CreditCard, Inbox, MessageSquareText, UserCheck, UserMinus, UserX, Users } from 'lucide-react';

const Dashboard = ({ userMetrics = {}, subscriptionMetrics = {}, subscriptionStatusMetrics = {}, feedbackMetrics = {}, recentSubscriptions = [], recentFeedback = [], workspaceMode = false }) => {
    const { auth } = usePage().props;
    const { theme } = useTheme();
    const isDark = theme === 'bg-skin-black';
    const isSuperAdmin = Boolean(auth?.role?.isSuperadmin);
    const [activeSymbol, setActiveSymbol] = useState(() => {
        if (typeof window === "undefined") {
            return null;
        }

        try {
            const storedSymbol = JSON.parse(
                localStorage.getItem(`backtradelab-active-symbol:${auth?.user?.id ?? "guest"}`) || "null"
            );
            return storedSymbol?.symbol ? storedSymbol : null;
        } catch {
            return null;
        }
    });
    const chartKey = useMemo(() => {
        if (!activeSymbol?.symbol) return "default-chart";

        return `${activeSymbol.exchange ?? "bingx"}:${activeSymbol.category ?? "linear"}:${activeSymbol.symbol}`;
    }, [activeSymbol]);
    const [chartTourCompleted, setChartTourCompleted] = useState(Boolean(auth?.user?.chart_tour_completed_at));

    useEffect(() => {
        if (activeSymbol?.symbol) localStorage.setItem(`backtradelab-active-symbol:${auth?.user?.id ?? 'guest'}`, JSON.stringify(activeSymbol));
    }, [activeSymbol, auth?.user?.id]);

    useEffect(() => {
        const handleSymbolChange = (event) => {
            if (event.detail?.symbol) {
                setActiveSymbol(event.detail);
            }
        };

        window.addEventListener(
            "backtradelab-active-symbol-change",
            handleSymbolChange
        );

        return () => {
            window.removeEventListener(
                "backtradelab-active-symbol-change",
                handleSymbolChange
            );
        };
    }, []);

    return (
        <>
            <Head title={workspaceMode ? "Workspace Chart" : "Dashboard"} />
            {workspaceMode || !isSuperAdmin ? (
                <WatchlistProvider userId={auth?.user?.id}>
                    <div className="space-y-2">
                        <div className="flex items-center justify-between px-1">
                            <div>
                                <h1 className={`text-sm font-bold ${isDark ? 'text-slate-200' : 'text-slate-900'}`}>Trading workspace</h1>
                                <p className="text-[10px] uppercase tracking-[0.16em] text-[#787b86]">Analyze · Replay · Execute · Review</p>
                            </div>
                            <div className="hidden items-center gap-2 text-[10px] text-[#787b86] sm:flex">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Market data connected
                            </div>
                        </div>
                        <TradeInsightsWidget />
                        <div className={`overflow-hidden rounded-lg border p-2 shadow-2xl shadow-black/20 sm:p-3 ${isDark ? 'border-[#2a2e39] bg-[#131722]' : 'border-slate-200 bg-white'}`}>
                            <MarketChart
                                key={chartKey}
                                initialSymbol={activeSymbol?.symbol ?? "BTCUSDT"}
                                initialExchange={activeSymbol?.exchange ?? "bingx"}
                                initialMarketCategory={activeSymbol?.category ?? "linear"}
                                tourCompleted={chartTourCompleted}
                                onTourComplete={() => setChartTourCompleted(true)}
                            />
                        </div>
                    </div>
                </WatchlistProvider>
            ) : (
                <div className={`space-y-5 ${isDark ? 'text-[#d1d4dc]' : 'text-slate-900'}`}>
                    <div className={`overflow-hidden rounded-2xl border p-6 ${isDark ? 'border-[#2a2e39] bg-[#131722]' : 'border-slate-200 bg-white'}`}>
                        <div className="flex flex-wrap items-center justify-between gap-4"><div><div className="text-xs font-bold uppercase tracking-[.2em] text-[#2962ff]">Administration</div><h1 className="mt-2 text-3xl font-bold">System overview</h1><p className="mt-1 text-sm text-[#787b86]">Monitor user access and platform activity from one workspace.</p></div><div className="flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-400"><Activity size={15}/><span className="h-2 w-2 rounded-full bg-emerald-400"/>System online</div></div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[
                        ['All users', userMetrics.total ?? 0, Users, '#2962ff'],
                        ['Active users', userMetrics.active ?? 0, UserCheck, '#10b981'],
                        ['Inactive users', userMetrics.inactive ?? 0, UserMinus, '#ef4444'],
                        ['New this month', userMetrics.newThisMonth ?? 0, Activity, '#8b5cf6'],
                    ].map(([label,value,Icon,color])=><div key={label} className={`rounded-xl border p-5 shadow-sm ${isDark ? 'border-[#2a2e39] bg-[#131722]' : 'border-slate-200 bg-white'}`}><div className="flex items-center justify-between"><span className="text-xs font-semibold text-[#787b86]">{label}</span><span className="flex h-9 w-9 items-center justify-center rounded-lg" style={{backgroundColor:`${color}1f`,color}}><Icon size={18}/></span></div><div className="mt-4 text-3xl font-bold tabular-nums">{Number(value).toLocaleString()}</div></div>)}</div>
                    <div className={`rounded-xl border p-5 ${isDark ? 'border-[#2a2e39] bg-[#131722]' : 'border-slate-200 bg-white'}`}><h2 className="text-sm font-bold">User health</h2><div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-500/10"><div className="h-full rounded-full bg-emerald-500" style={{width:`${userMetrics.total ? Math.round((userMetrics.active/userMetrics.total)*100) : 0}%`}}/></div><div className="mt-2 flex justify-between text-xs text-[#787b86]"><span>{userMetrics.active ?? 0} active accounts</span><span>{userMetrics.total ? Math.round((userMetrics.active/userMetrics.total)*100) : 0}% active</span></div></div>

                    <AdminSection title="Subscriptions" subtitle="Verified revenue and provider transaction health." links={[['Payments','/admin/subscriptions'],['Pricing','/admin/subscription-plans']]} isDark={isDark}>
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                            <MetricCard label="Lifetime PHP revenue" value={formatMoney(subscriptionMetrics.revenueLifetimePhp)} detail={`${formatCount(subscriptionMetrics.paidLifetime)} paid transactions`} icon={CircleDollarSign} color="#10b981" isDark={isDark}/>
                            <MetricCard label="Last 30 days" value={formatMoney(subscriptionMetrics.revenueLast30DaysPhp)} detail={`${formatCount(subscriptionMetrics.paidLast30Days)} verified payments`} icon={CreditCard} color="#2962ff" isDark={isDark}/>
                            <MetricCard label="Pending review" value={formatCount(subscriptionMetrics.pending)} detail="Creating or pending" icon={Clock3} color="#f59e0b" isDark={isDark}/>
                            <MetricCard label="Failed / expired" value={formatCount(subscriptionMetrics.failedOrExpired)} detail="Provider sessions needing attention" icon={AlertCircle} color="#ef4444" isDark={isDark}/>
                        </div>
                    </AdminSection>

                    <AdminSection title="Subscriber status" subtitle="Live count of users by current access status — renewing an expired user moves them back to Active automatically." links={[['Renew access','/admin/subscriptions']]} isDark={isDark}>
                        <div className="grid gap-3 sm:grid-cols-3">
                            <MetricCard label="Active subscription" value={formatCount(subscriptionStatusMetrics.active)} detail="Access currently valid" icon={UserCheck} color="#10b981" isDark={isDark}/>
                            <MetricCard label="Expired subscription" value={formatCount(subscriptionStatusMetrics.expired)} detail="Access period has lapsed — needs renewal" icon={AlertCircle} color="#ef4444" isDark={isDark}/>
                            <MetricCard label="Not yet subscribed" value={formatCount(subscriptionStatusMetrics.notSubscribed)} detail="Never completed a paid subscription" icon={UserX} color="#f59e0b" isDark={isDark}/>
                        </div>
                    </AdminSection>

                    <AdminSection title="Customer feedback & support" subtitle="Current workload across customer and product requests." links={[['Open support inbox','/admin/feedback']]} isDark={isDark}>
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                            <MetricCard label="All requests" value={formatCount(feedbackMetrics.total)} detail="Lifetime" icon={MessageSquareText} color="#2962ff" isDark={isDark}/>
                            <MetricCard label="New in 30 days" value={formatCount(feedbackMetrics.newLast30Days)} detail="Rolling period" icon={Inbox} color="#8b5cf6" isDark={isDark}/>
                            <MetricCard label="Open queue" value={formatCount(feedbackMetrics.open)} detail="Not completed or declined" icon={Clock3} color="#f59e0b" isDark={isDark}/>
                            <MetricCard label="High priority" value={formatCount(feedbackMetrics.highPriority)} detail="Open urgent or high" icon={AlertCircle} color="#ef4444" isDark={isDark}/>
                            <MetricCard label="Awaiting response" value={formatCount(feedbackMetrics.awaitingResponse)} detail="Open without admin reply" icon={UserCheck} color="#10b981" isDark={isDark}/>
                        </div>
                    </AdminSection>

                    <div className="grid gap-4 xl:grid-cols-2">
                        <RecentPanel title="Recent subscription activity" empty="No subscription transactions yet." href="/admin/subscriptions" isDark={isDark}>
                            {recentSubscriptions.map((item)=><RecentRow key={item.id} title={item.user?.name || 'Unknown user'} meta={`${item.plan || 'Unknown plan'} · ${item.currency || 'PHP'} ${Number(item.amount || 0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`} badge={item.status} date={item.paidAt || item.createdAt} isDark={isDark}/>) }
                        </RecentPanel>
                        <RecentPanel title="Recent customer requests" empty="No customer feedback yet." href="/admin/feedback" isDark={isDark}>
                            {recentFeedback.map((item)=><RecentRow key={item.id} title={item.title} meta={`${item.user?.name || 'Unknown user'} · ${(item.category || 'other').replaceAll('_',' ')}`} badge={`${item.priority} · ${item.status}`} date={item.createdAt} isDark={isDark}/>) }
                        </RecentPanel>
                    </div>
                </div>
            )}
        </>
    );
};

const formatCount = value => Number(value || 0).toLocaleString();
const formatMoney = value => `PHP ${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const formatDate = value => value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—';

function AdminSection({ title, subtitle, links, isDark, children }) {
    return <section className={`rounded-xl border p-5 ${isDark ? 'border-[#2a2e39] bg-[#131722]' : 'border-slate-200 bg-white'}`}><div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><h2 className="text-base font-bold">{title}</h2><p className="mt-1 text-xs text-[#787b86]">{subtitle}</p></div><div className="flex flex-wrap gap-2">{links.map(([label,href])=><Link key={href} href={href} className={`flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold ${isDark?'border-[#2a2e39] hover:bg-white/5':'border-slate-200 hover:bg-slate-50'}`}>{label}<ArrowRight size={13}/></Link>)}</div></div>{children}</section>;
}

function MetricCard({ label, value, detail, icon: Icon, color, isDark }) {
    return <div className={`rounded-xl border p-4 ${isDark?'border-[#2a2e39] bg-[#0b0e14]':'border-slate-200 bg-slate-50'}`}><div className="flex items-center justify-between gap-2"><span className="text-[11px] font-semibold text-[#787b86]">{label}</span><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{backgroundColor:`${color}1f`,color}}><Icon size={16}/></span></div><div className="mt-3 text-xl font-bold tabular-nums">{value}</div><div className="mt-1 text-[10px] text-[#787b86]">{detail}</div></div>;
}

function RecentPanel({ title, empty, href, isDark, children }) {
    const rows = React.Children.toArray(children);
    return <section className={`overflow-hidden rounded-xl border ${isDark?'border-[#2a2e39] bg-[#131722]':'border-slate-200 bg-white'}`}><div className={`flex items-center justify-between border-b px-5 py-4 ${isDark?'border-[#2a2e39]':'border-slate-200'}`}><h2 className="text-sm font-bold">{title}</h2><Link href={href} className="text-[10px] font-bold text-[#5b8cff] hover:text-[#2962ff]">View all</Link></div>{rows.length ? <div>{rows}</div> : <p className="p-8 text-center text-xs text-[#787b86]">{empty}</p>}</section>;
}

function RecentRow({ title, meta, badge, date, isDark }) {
    return <div className={`flex items-center justify-between gap-3 border-b px-5 py-3 last:border-b-0 ${isDark?'border-[#2a2e39]':'border-slate-200'}`}><div className="min-w-0"><div className="truncate text-xs font-bold">{title}</div><div className="mt-1 truncate text-[10px] capitalize text-[#787b86]">{meta}</div></div><div className="shrink-0 text-right"><div className="text-[9px] font-bold uppercase text-[#5b8cff]">{String(badge || 'unknown').replaceAll('_',' ')}</div><div className="mt-1 text-[9px] text-[#787b86]">{formatDate(date)}</div></div></div>;
}

export default Dashboard;

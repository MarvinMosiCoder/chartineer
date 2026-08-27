import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Head, router, usePage } from '@inertiajs/react';
import { CalendarClock, Check, ChevronDown, Clock3, CreditCard, FileImage, MessageCircle, RefreshCw, ShieldCheck, X } from 'lucide-react';
import SubscriptionModal from '../../Components/Market/MarketChart/SubscriptionModal';
import PaymentChat from '../../Components/Subscriptions/PaymentChat';
import { tones } from '../../Components/Subscriptions/statusTones';
import { useTheme } from '../../Context/ThemeContext';

const formatDate = value => value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—';
const money = item => item.amount ? `${item.currency || 'PHP'} ${Number(item.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '—';
const COMPLETED_STATUSES = ['paid', 'refunded'];
const MAX_POLL_ATTEMPTS = 15;

export default function UserIndex({ subscription }) {
  const { theme } = useTheme();
  const { url } = usePage();
  const dark = theme === 'bg-skin-black';
  const [showPlans, setShowPlans] = useState(false), [chatRequest, setChatRequest] = useState(null);
  const [checking, setChecking] = useState(null), [notice, setNotice] = useState('');
  const [showAllHistory, setShowAllHistory] = useState(false);
  const card = dark ? 'border-[#2a2e39] bg-[#131722] text-white' : 'border-slate-200 bg-white text-slate-900';
  const border = dark ? 'border-[#2a2e39]' : 'border-slate-200';
  const muted = dark ? 'text-[#787b86]' : 'text-slate-500';
  const secondary = dark ? 'text-[#b2b5be]' : 'text-slate-700';
  const searchParams = new URL(url, window.location.origin).searchParams;
  const paymentResult = searchParams.get('payment');
  const refId = searchParams.get('ref');
  const [liveStatus, setLiveStatus] = useState(paymentResult);
  const [polling, setPolling] = useState(false);
  const statusLabel = subscription.status === 'active' ? 'Active membership' : subscription.status === 'trial' ? 'Free trial' : subscription.status === 'available' ? 'Free trial available' : 'Replay expired';

  useEffect(() => {
    if (paymentResult !== 'pending' || !refId) return;
    let attempts = 0, cancelled = false;
    setPolling(true);
    const interval = setInterval(async () => {
      attempts += 1;
      try {
        const { data } = await axios.get(`/subscription-checkouts/${refId}/status`);
        const status = data?.payment?.status;
        if (cancelled) return;
        if (status && status !== 'pending') {
          setLiveStatus(status);
          setPolling(false);
          clearInterval(interval);
          router.reload({ only: ['subscription'] });
          return;
        }
      } catch { /* keep polling */ }
      if (attempts >= MAX_POLL_ATTEMPTS) { setPolling(false); clearInterval(interval); }
    }, 4000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [paymentResult, refId]);

  const checkStatus = async item => {
    setChecking(item.id); setNotice('');
    try {
      const response = await axios.get(`/subscription-checkouts/${item.id}/status`);
      setNotice(response.data?.payment?.status === 'paid' ? 'Payment verified and replay access activated.' : `Current payment status: ${response.data?.payment?.status || 'pending'}.`);
      router.reload({ only: ['subscription'] });
    } catch (error) { setNotice(error.response?.data?.message || 'Unable to check this payment right now.'); }
    finally { setChecking(null); }
  };

  const completedRequests = subscription.requests.filter(item => COMPLETED_STATUSES.includes(item.status));
  const visibleRequests = showAllHistory ? subscription.requests : completedRequests;
  const hiddenCount = subscription.requests.length - completedRequests.length;

  return <><Head title="Subscription"/>
    {showPlans && <SubscriptionModal onClose={() => setShowPlans(false)} onTrialActivated={() => { setShowPlans(false); router.reload({ only: ['subscription'] }); }}/>}
    {chatRequest && <PaymentChat request={chatRequest} onClose={() => setChatRequest(null)}/>}
    <div className={`mx-auto max-w-6xl space-y-5 ${dark ? 'text-white' : 'text-slate-900'}`}>
      {paymentResult && <div className={`rounded-xl border p-4 sm:p-5 ${card}`}>
        <PaymentStepper status={liveStatus} polling={polling} dark={dark}/>
        <p className={`mt-3 text-sm ${secondary}`}>{liveStatus === 'paid' ? 'Payment verified. Your replay access is active.' : liveStatus === 'pending' ? (polling ? 'Confirming your payment with the provider — this can take a moment.' : 'Still awaiting confirmation. You can check its status below.') : liveStatus === 'cancelled' ? 'Checkout was cancelled. No access was granted.' : 'This payment did not complete. No access was granted.'}</p>
      </div>}
      {notice && <div role="status" className={`rounded-xl border p-4 text-sm ${tones.paid}`}>{notice}</div>}
      <section className={`overflow-hidden rounded-2xl border ${card}`}>
        <div className={`p-5 sm:p-7 ${dark ? 'bg-gradient-to-r from-[#172554] via-[#131722] to-[#0b0e14]' : 'bg-gradient-to-r from-blue-50 via-white to-slate-50'}`}><div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center"><div><div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-bold ${tones[subscription.status]}`}><span className="h-1.5 w-1.5 rounded-full bg-current"/>{statusLabel}</div><h1 className="mt-4 text-2xl font-bold">Your replay subscription</h1><p className={`mt-2 max-w-xl text-sm ${secondary}`}>Manage replay access and review one-time secure payment transactions.</p></div><button onClick={() => setShowPlans(true)} className="h-11 rounded-lg bg-[#2dd4bf] px-5 text-sm font-bold text-white hover:bg-teal-600">{subscription.trialAvailable ? 'Activate free trial' : subscription.allowed ? 'View plans' : 'Renew replay access'}</button></div></div>
        <div className={`grid border-t sm:grid-cols-3 ${border}`}><Metric icon={CalendarClock} label="Trial ends" value={subscription.trialAvailable ? 'Not activated' : formatDate(subscription.trialEndsAt)} dark={dark}/><Metric icon={ShieldCheck} label="Paid access ends" value={formatDate(subscription.accessEndsAt)} dark={dark}/><Metric icon={Clock3} label="Time remaining" value={subscription.allowed ? `${subscription.daysRemaining} day${subscription.daysRemaining === 1 ? '' : 's'}` : subscription.trialAvailable ? '7 free days available' : 'No active access'} dark={dark}/></div>
      </section>
      <section><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-lg font-bold">Payment history</h2><p className={`text-sm ${muted}`}>Completed payments and preserved read-only manual records.</p></div>{hiddenCount > 0 && <button onClick={() => setShowAllHistory(v => !v)} className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold ${border} ${muted}`}><ChevronDown size={14} className={showAllHistory ? 'rotate-180' : ''}/>{showAllHistory ? 'Hide incomplete attempts' : `Show ${hiddenCount} incomplete attempt${hiddenCount === 1 ? '' : 's'}`}</button>}</div><div className={`overflow-hidden rounded-xl border ${card}`}>
        {visibleRequests.length ? <div className={`divide-y ${dark ? 'divide-[#2a2e39]' : 'divide-slate-200'}`}>{visibleRequests.map(item => <article key={item.id} className="grid gap-4 p-4 lg:grid-cols-[1fr_auto] lg:items-center sm:p-5"><div><div className="flex flex-wrap items-center gap-2"><span className="font-bold capitalize">{item.plan} plan</span><span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${tones[item.status] || tones.pending}`}>{item.status}</span><span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${border} ${muted}`}>{item.legacy ? 'manual · archived' : `online · ${item.mode}`}</span></div><div className={`mt-2 grid gap-1 text-xs sm:grid-cols-2 xl:grid-cols-3 ${muted}`}><span>Amount: <b className={secondary}>{money(item)}</b></span><span>Reference: <b className={secondary}>{item.payment_reference || item.provider_checkout_id || '—'}</b></span><span>Submitted: {formatDate(item.created_at)}</span><span>Paid: {formatDate(item.paid_at)}</span>{item.refunded_at && <span>Refunded: {formatDate(item.refunded_at)}</span>}<span>Duration: {item.duration_days ? `${item.duration_days} days` : 'Legacy plan record'}</span><span>Method: <span className="capitalize">{(item.payment_method || item.provider || 'manual').replaceAll('_', ' ')}</span></span></div>{(item.provider_status_message || item.admin_notes) && <div className={`mt-3 rounded-lg border p-3 text-xs ${border} ${secondary}`}>{item.provider_status_message || item.admin_notes}</div>}</div><div className="flex flex-wrap gap-2">{item.payment_proof_url && <a href={item.payment_proof_url} target="_blank" rel="noreferrer" className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold ${border}`}><FileImage size={15}/>View proof</a>}{item.legacy && item.messages_count > 0 && <button onClick={() => setChatRequest(item)} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold ${border}`}><MessageCircle size={15}/>Archived chat ({item.messages_count})</button>}{item.provider === 'paymongo' && item.status === 'pending' && <button disabled={checking === item.id} onClick={() => checkStatus(item)} className="flex items-center gap-2 rounded-lg bg-[#2dd4bf] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"><RefreshCw size={15} className={checking === item.id ? 'animate-spin' : ''}/>Check status</button>}</div></article>)}</div> : <div className="p-10 text-center"><CreditCard className={`mx-auto ${dark ? 'text-[#434955]' : 'text-slate-300'}`}/><h3 className="mt-3 font-semibold">{subscription.requests.length ? 'No completed transactions yet' : 'No transactions yet'}</h3><p className={`mt-1 text-sm ${muted}`}>{subscription.requests.length ? 'Your completed and refunded payments will appear here.' : 'Completed and pending checkouts will appear here.'}</p></div>}
      </div></section>
    </div>
  </>;
}

function Metric({ icon: Icon, label, value, dark }) {
  return <div className={`flex items-center gap-3 border-b p-4 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0 ${dark ? 'border-[#2a2e39]' : 'border-slate-200'}`}><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#2dd4bf]/10 text-[#2dd4bf]"><Icon size={18}/></span><div className="min-w-0"><div className={`text-[10px] font-bold uppercase tracking-wider ${dark ? 'text-[#787b86]' : 'text-slate-500'}`}>{label}</div><div className="mt-1 truncate text-sm font-semibold">{value}</div></div></div>;
}

function PaymentStepper({ status, polling, dark }) {
  const steps = [
    { label: 'Payment', sub: 'Checkout started' },
    { label: 'Processing', sub: status === 'pending' ? (polling ? 'Confirming with provider…' : 'Awaiting confirmation') : 'Verified' },
    { label: 'Complete', sub: status === 'paid' ? 'Access activated' : status === 'pending' ? 'Not yet' : 'Not completed' },
  ];
  const stateFor = index => {
    if (index === 0) return 'done';
    if (index === 1) return status === 'pending' ? 'active' : 'done';
    if (status === 'pending') return 'upcoming';
    return status === 'paid' ? 'success' : 'failed';
  };
  const circleClass = state => {
    if (state === 'success') return 'bg-emerald-500 text-white';
    if (state === 'failed') return 'bg-red-500 text-white';
    if (state === 'done') return 'bg-[#2dd4bf] text-white';
    if (state === 'active') return 'border-2 border-[#2dd4bf] text-[#2dd4bf] animate-pulse';
    return dark ? 'border border-[#2a2e39] text-[#787b86]' : 'border border-slate-300 text-slate-400';
  };
  return <div className="flex items-center">
    {steps.map((step, index) => { const state = stateFor(index); return <React.Fragment key={step.label}>
      <div className="flex items-center gap-2">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${circleClass(state)}`}>{state === 'success' ? <Check size={16}/> : state === 'failed' ? <X size={16}/> : index + 1}</span>
        <div className="hidden sm:block"><div className="text-xs font-bold">{step.label}</div><div className="text-[10px] text-[#787b86]">{step.sub}</div></div>
      </div>
      {index < steps.length - 1 && <div className={`mx-2 h-0.5 w-6 sm:w-12 ${state === 'done' || state === 'success' ? 'bg-[#2dd4bf]' : dark ? 'bg-[#2a2e39]' : 'bg-slate-200'}`}/>}
    </React.Fragment>; })}
  </div>;
}

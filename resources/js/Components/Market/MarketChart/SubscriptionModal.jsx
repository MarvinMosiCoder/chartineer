import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Check, ChevronRight, Crown, ExternalLink, Lock, ShieldCheck, Sparkles, X } from 'lucide-react';
import { useTheme } from '../../../Context/ThemeContext';
import { useToast } from '../../../Context/ToastContext';

const token = () => {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16); globalThis.crypto?.getRandomValues?.(bytes);
  bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
};

export default function SubscriptionModal({ onClose, onTrialActivated }) {
  const { theme } = useTheme();
  const { handleToast } = useToast();
  const dark = theme === 'bg-skin-black';
  const [plans, setPlans] = useState([]), [selectedCode, setSelectedCode] = useState('');
  const [checkout, setCheckout] = useState({}), [trialAvailable, setTrialAvailable] = useState(false);
  const [activeAccess, setActiveAccess] = useState(null), [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false), [status, setStatus] = useState('');
  const [submissionToken] = useState(token);
  const selected = plans.find(plan => plan.code === selectedCode) ?? plans[0];
  const readOnly = Boolean(activeAccess);
  const weeklyTrialEligible = selected?.code === 'weekly' && trialAvailable && !readOnly;

  useEffect(() => {
    let cancelled = false;
    Promise.all([axios.get('/subscription-plans'), axios.get('/replay-access')]).then(([p, a]) => {
      if (cancelled) return;
      const items = p.data?.plans ?? [];
      setPlans(items); setCheckout(p.data?.checkout ?? a.data?.checkout ?? {});
      setTrialAvailable(a.data?.trialAvailable === true); setActiveAccess(a.data?.activeAccess ?? null);
      setSelectedCode((items.find(item => item.is_featured) ?? items[0])?.code ?? '');
    }).catch(() => setStatus('Unable to load subscription information.')).finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, []);

  const activateTrial = async () => {
    setSaving(true); setStatus('');
    try {
      const response = await axios.post('/replay-trial/activate');
      handleToast(response.data?.message || 'Your free 7-day trial is now active.', 'success');
      onTrialActivated?.(response.data);
    } catch (error) {
      const message = error.response?.data?.message ?? 'Unable to activate your trial.';
      setStatus(message);
      handleToast(message, 'error');
    }
    finally { setSaving(false); }
  };
  const startCheckout = async () => {
    if (!selected || readOnly) return;
    setSaving(true); setStatus('');
    try {
      const response = await axios.post('/subscription-checkouts', { plan: selected.code, submission_token: submissionToken });
      if (!response.data?.checkout_url) throw new Error('Checkout URL missing');
      window.location.assign(response.data.checkout_url);
    } catch (error) { setStatus(error.response?.data?.message ?? 'Unable to start secure checkout.'); setSaving(false); }
  };
  const shell = dark ? 'border-[#2a2e39] bg-[#0b0e14] text-white' : 'border-slate-200 bg-white text-slate-900';
  const surface = dark ? 'border-[#2a2e39] bg-[#131722]' : 'border-slate-200 bg-slate-50';

  return <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 p-2 backdrop-blur-sm sm:p-3">
    <section className={`flex max-h-[calc(100dvh-1rem)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border shadow-2xl sm:max-h-[calc(100dvh-1.5rem)] ${shell}`}>
      <header className={`flex shrink-0 items-start justify-between border-b px-4 py-3 sm:px-5 ${surface}`}>
        <div><div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.18em] text-[#5eead4]"><Sparkles size={13}/>Replay access</div><h2 className="mt-0.5 text-xl font-bold">Build your trading practice</h2><p className="mt-0.5 text-xs text-[#787b86]">Activate your free week or purchase one-time access through our secure payment provider.</p></div>
        <button type="button" onClick={onClose} aria-label="Close"><X size={19}/></button>
      </header>
      {!loading && !readOnly && <div className="flex shrink-0 items-center gap-1.5 px-4 pt-3 text-[10px] font-bold uppercase tracking-wider text-[#787b86] sm:px-5">
        <span className={!saving ? 'text-[#2dd4bf]' : ''}>1. Choose plan</span><ChevronRight size={11}/><span className={saving ? 'text-[#2dd4bf]' : ''}>2. {weeklyTrialEligible ? 'Activating' : 'Redirecting to checkout'}</span>
      </div>}
      {(trialAvailable || activeAccess?.kind === 'trial') && <div className="mx-4 mt-3 flex shrink-0 flex-col justify-between gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2.5 sm:mx-5 sm:flex-row sm:items-center">
        <div><div className="text-[10px] font-bold uppercase text-emerald-500">{activeAccess ? 'Active free trial' : 'Free trial'}</div><div className="flex flex-wrap items-baseline gap-x-2"><h3 className="font-bold">7 days free</h3><p className="text-xs text-[#787b86]">{activeAccess ? `Active until ${new Date(activeAccess.endsAt).toLocaleString()}.` : 'Starts only after activation and can be used once.'}</p></div></div>
        {!readOnly && <button disabled={saving} onClick={activateTrial} className="h-9 shrink-0 rounded-lg bg-emerald-500 px-4 text-xs font-bold text-white disabled:opacity-50">Activate free week</button>}
      </div>}
      <div className="min-h-0 overflow-y-auto p-4 sm:p-5">
        {loading ? <div className="py-12 text-center text-[#787b86]">Loading plans…</div> : <div className="grid gap-2.5 md:grid-cols-3">{plans.map(plan => {
          const configured = plan.price !== null && Number(plan.price) > 0;
          const chosen = activeAccess?.kind === 'paid' ? activeAccess.plan === plan.code : selectedCode === plan.code;
          const Icon = plan.is_featured ? Crown : Sparkles;
          return <button key={plan.id} type="button" disabled={!configured || readOnly} onClick={() => setSelectedCode(plan.code)} className={`relative rounded-xl border p-3 text-left disabled:opacity-70 ${chosen ? 'border-[#2dd4bf] bg-[#2dd4bf]/10 shadow-[0_0_0_1px_#2dd4bf]' : surface}`}>
            {chosen && readOnly && <span className="absolute right-2 top-2 rounded-full bg-emerald-500 px-1.5 py-0.5 text-[8px] font-bold text-white">ACTIVE</span>}
            <div className="flex items-start gap-2"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#2dd4bf]/10 text-[#5eead4]"><Icon size={15}/></span><div className="min-w-0"><h3 className="font-bold">{plan.name}</h3><p className="text-xl font-bold leading-tight">{configured ? `${plan.currency} ${Number(plan.price).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : 'Price pending'}</p></div></div><p className="mt-1 text-[11px] text-[#787b86]">{plan.duration_days} days · one-time payment</p><p className="mt-1 line-clamp-2 text-[11px] text-[#787b86]">{plan.description}</p><div className="mt-2 grid gap-1">{(plan.features ?? []).map(feature => <div key={feature} className="flex items-start gap-1.5 text-[11px]"><Check size={11} className="mt-0.5 shrink-0 text-emerald-500"/><span>{feature}</span></div>)}</div><div className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-[#5eead4]"><Check size={12}/>{chosen ? (readOnly ? 'Active plan' : 'Selected') : 'Select plan'}</div>
          </button>;
        })}</div>}
        {readOnly && <div className="mt-2.5 rounded-lg bg-emerald-500/10 p-2 text-xs text-emerald-500">Your {activeAccess.kind} access is active until {new Date(activeAccess.endsAt).toLocaleString()}. You can choose another plan after it expires.</div>}
        {status && <div className="mt-2.5 rounded-lg bg-red-500/10 p-2 text-xs text-red-500">{status}</div>}
        {!readOnly && <div className="mt-2.5 flex flex-col gap-2 rounded-xl border p-3 text-xs text-[#787b86] sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">{weeklyTrialEligible ? <><div className="flex items-center gap-2 font-bold text-current"><ShieldCheck size={15}/>Free, one-time trial</div><p className="mt-0.5 truncate">No payment required for your first 7 days.</p></> : <><div className="flex items-center gap-2 font-bold text-current"><ShieldCheck size={15}/>Secure checkout</div><p className="mt-0.5 truncate">Methods: <span className="capitalize">{checkout.payment_methods?.join(' · ') || 'None'}</span></p></>}</div>
          <button disabled={weeklyTrialEligible ? saving : (!selected?.price || !checkout.enabled || saving)} onClick={weeklyTrialEligible ? activateTrial : startCheckout} className="flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg bg-[#2dd4bf] px-4 font-bold text-white disabled:opacity-50">{!weeklyTrialEligible && <Lock size={13}/>}{weeklyTrialEligible ? (saving ? 'Activating…' : 'Activate free trial') : (saving ? 'Opening secure checkout…' : `Continue securely with ${selected?.name ?? 'plan'}`)}{!weeklyTrialEligible && <ExternalLink size={14}/>}</button>
        </div>}
      </div>
    </section>
  </div>;
}

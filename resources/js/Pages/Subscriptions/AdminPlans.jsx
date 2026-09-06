import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Head, Link } from '@inertiajs/react';
import { ArrowDown, ArrowUp, Check, Crown, Lock, Plus, Sparkles, Trash2 } from 'lucide-react';
import { useTheme } from '../../Context/ThemeContext';
import { capabilityLabel } from '../../Components/Subscriptions/tierCapabilities';

const TIER_OPTIONS = [
  { value: 1, label: 'Starter' },
  { value: 2, label: 'Pro' },
  { value: 3, label: 'Elite' },
];

const QUOTA_LABELS = { alerts: 'Price alerts', playbooks: 'Strategy playbooks', share_links: 'Mentor share links' };

export default function AdminPlans() {
  const { theme } = useTheme();
  const dark = theme === 'bg-skin-black';
  const [plans, setPlans] = useState([]), [loading, setLoading] = useState(true), [saving, setSaving] = useState(false), [status, setStatus] = useState('');

  useEffect(() => {
    let cancelled = false;
    axios.get('/subscription-plans')
      .then(response => !cancelled && setPlans(response.data?.plans || []))
      .catch(() => !cancelled && setStatus('Unable to load plans.'))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, []);

  const update = (id, key, value) => setPlans(current => current.map(plan => plan.id === id ? { ...plan, [key]: value } : plan));
  const updateFeature = (planId, index, value) => setPlans(current => current.map(plan => plan.id === planId ? { ...plan, features: (plan.features ?? []).map((feature, featureIndex) => featureIndex === index ? value : feature) } : plan));
  const addFeature = planId => setPlans(current => current.map(plan => plan.id === planId && (plan.features ?? []).length < 8 ? { ...plan, features: [...(plan.features ?? []), ''] } : plan));
  const removeFeature = (planId, index) => setPlans(current => current.map(plan => plan.id === planId ? { ...plan, features: (plan.features ?? []).filter((_, featureIndex) => featureIndex !== index) } : plan));
  const moveFeature = (planId, index, direction) => setPlans(current => current.map(plan => {
    if (plan.id !== planId) return plan;
    const features = [...(plan.features ?? [])], next = index + direction;
    if (next < 0 || next >= features.length) return plan;
    [features[index], features[next]] = [features[next], features[index]];
    return { ...plan, features };
  }));

  const save = async () => {
    setSaving(true); setStatus('');
    try {
      const response = await axios.put('/admin/subscription-plans', {
        plans: plans.map(({ id, price, duration_days, tier_level, description, features, is_featured, is_active }) => ({
          id,
          price: price === '' ? null : price,
          duration_days,
          tier_level: Number(tier_level ?? 1),
          description,
          features: (features ?? []).map(item => item.trim()).filter(Boolean),
          is_featured,
          is_active,
        })),
      });
      // The save response carries the recomputed capability lists, so changing a
      // plan's tier updates its "What this plan unlocks" column immediately
      // rather than needing a page reload to see what was actually granted.
      setPlans(response.data.plans);
      setStatus('Subscription pricing saved successfully.');
    } catch (error) { setStatus(error.response?.data?.message || 'Unable to save plans.'); }
    finally { setSaving(false); }
  };

  const panel = dark ? 'border-[#2a2e39] bg-[#131722] text-white' : 'border-slate-200 bg-white text-slate-900';
  const field = dark ? 'border-[#2a2e39] bg-[#0b0e14] text-white placeholder:text-[#5f636d]' : 'border-slate-300 bg-slate-50 text-slate-900 placeholder:text-slate-400';
  const muted = dark ? 'text-[#9598a1]' : 'text-slate-500';
  const iconButton = dark ? 'text-[#9598a1] hover:bg-white/10 hover:text-white' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900';
  const inset = dark ? 'border-[#2a2e39] bg-[#0b0e14]' : 'border-slate-200 bg-slate-50';

  return <><Head title="Subscription pricing"/><div className={`space-y-5 ${dark ? 'text-white' : 'text-slate-900'}`}>
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
      <div>
        <h1 className="text-xl font-bold">Subscription pricing</h1>
        <p className={`mt-1 text-sm ${muted}`}>Set each plan's price, duration, and tier. The tier decides what the plan actually unlocks.</p>
      </div>
      <div className="flex gap-2">
        <Link href="/admin/subscriptions" className={`flex h-10 items-center rounded-lg border px-4 text-sm font-semibold transition ${dark ? 'border-[#2a2e39] hover:bg-white/5' : 'border-slate-300 bg-white hover:bg-slate-50'}`}>Transactions</Link>
        <button onClick={save} disabled={saving || loading} className="h-10 rounded-lg bg-[#2dd4bf] px-4 text-sm font-bold text-white transition hover:bg-teal-600 disabled:cursor-not-allowed disabled:opacity-50">{saving ? 'Saving…' : 'Save pricing'}</button>
      </div>
    </div>

    <div className={`rounded-lg border p-3 text-xs ${inset} ${muted}`}>
      <span className="font-semibold">Capabilities are not edited here.</span> Each plan unlocks whatever its tier is configured to unlock in <code className="font-mono">config/subscription_tiers.php</code>, and the same map is what the server enforces. The feature list below each plan is extra marketing copy shown underneath those capabilities — it grants nothing on its own.
    </div>

    <div className="grid gap-3 lg:grid-cols-3">{plans.map(plan => {
      const tier = Number(plan.tier_level ?? 1);
      const Icon = plan.is_featured ? Crown : Sparkles;
      const shown = (plan.added_capabilities?.length ? plan.added_capabilities : plan.capabilities) ?? [];
      const quotas = Object.entries(plan.limits ?? {});

      return <article key={plan.id} className={`flex flex-col rounded-xl border p-4 shadow-sm ${panel} ${plan.is_active ? '' : 'opacity-60'}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#2dd4bf]/10 text-[#5eead4]"><Icon size={15}/></span>
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#5eead4]">{plan.code}</div>
              <h2 className="text-lg font-bold leading-tight">{plan.name}</h2>
            </div>
          </div>
          <label className={`flex shrink-0 items-center gap-2 text-xs ${muted}`}>
            <input className="accent-[#2dd4bf]" type="checkbox" checked={plan.is_active} onChange={event => update(plan.id, 'is_active', event.target.checked)}/>Active
          </label>
        </div>

        <div className="mt-3 grid gap-3">
          <Field label="Price (PHP)" inputClass={field} muted={muted}>
            <input type="number" min="0.01" step="0.01" value={plan.price ?? ''} onChange={event => update(plan.id, 'price', event.target.value)} placeholder="Set a price"/>
          </Field>
          <Field label="Replay access days" inputClass={field} muted={muted}>
            <input type="number" min="1" max="3650" value={plan.duration_days} onChange={event => update(plan.id, 'duration_days', Number(event.target.value))}/>
          </Field>
          <Field label="Tier — decides what this plan unlocks" inputClass={field} muted={muted}>
            <select value={tier} onChange={event => update(plan.id, 'tier_level', Number(event.target.value))}>
              {TIER_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.value} · {option.label}</option>)}
            </select>
          </Field>
          <Field label="Plan description" inputClass={field} muted={muted}>
            <input maxLength="160" value={plan.description ?? ''} onChange={event => update(plan.id, 'description', event.target.value)}/>
          </Field>
        </div>

        {/* Mirrors the customer's plan card: same check rows, same "everything
            below, plus" framing, so an admin reads the ladder the way a buyer
            does instead of guessing what a tier number means. */}
        <div className={`mt-3 rounded-lg border p-3 ${inset}`}>
          <div className="flex items-center justify-between gap-2">
            <span className={`text-[10px] font-bold uppercase tracking-wider ${muted}`}>What this plan unlocks</span>
            <span className="rounded-full bg-[#2dd4bf]/15 px-2 py-0.5 text-[10px] font-bold text-[#5eead4]">{plan.tier_name ?? TIER_OPTIONS.find(option => option.value === tier)?.label}</span>
          </div>
          {plan.added_capabilities?.length > 0 && tier > 1 && <p className={`mt-2 text-[10px] font-bold uppercase tracking-wide ${muted}`}>Everything below, plus</p>}
          <div className="mt-2 grid gap-1">
            {shown.map(capability => <div key={capability} className="flex items-start gap-1.5 text-[11px]">
              <Check size={11} className="mt-0.5 shrink-0 text-emerald-500"/><span>{capabilityLabel(capability)}</span>
            </div>)}
            {shown.length === 0 && <span className={`text-[11px] ${muted}`}>Save to see this tier's capabilities.</span>}
          </div>
          {quotas.length > 0 && <div className={`mt-2.5 border-t pt-2 text-[11px] ${dark ? 'border-[#2a2e39]' : 'border-slate-200'} ${muted}`}>
            {quotas.map(([key, value]) => <div key={key} className="flex items-center justify-between gap-2">
              <span>{QUOTA_LABELS[key] ?? capabilityLabel(key)}</span>
              <span className={value === 0 ? 'font-semibold text-red-400' : 'font-semibold'}>{value === null ? 'Unlimited' : value}</span>
            </div>)}
          </div>}
        </div>

        <div className="mt-3">
          <div className={`mb-1.5 flex items-center justify-between text-xs font-semibold ${muted}`}>
            <span className="flex items-center gap-1"><Lock size={11}/>Extra copy ({(plan.features ?? []).length}/8)</span>
            <button type="button" onClick={() => addFeature(plan.id)} disabled={(plan.features ?? []).length >= 8} className="flex items-center gap-1 text-[#5eead4] disabled:opacity-40"><Plus size={13}/>Add</button>
          </div>
          <div className="grid gap-1.5">{(plan.features ?? []).map((feature, index) => <div key={`${plan.id}:${index}`} className="flex items-center gap-1">
            <input maxLength="80" value={feature} onChange={event => updateFeature(plan.id, index, event.target.value)} className={`h-9 min-w-0 flex-1 rounded-lg border px-2 text-xs outline-none focus:border-[#2dd4bf] ${field}`}/>
            <button type="button" disabled={index === 0} onClick={() => moveFeature(plan.id, index, -1)} className={`rounded p-1 disabled:opacity-30 ${iconButton}`} aria-label="Move feature up"><ArrowUp size={13}/></button>
            <button type="button" disabled={index === (plan.features ?? []).length - 1} onClick={() => moveFeature(plan.id, index, 1)} className={`rounded p-1 disabled:opacity-30 ${iconButton}`} aria-label="Move feature down"><ArrowDown size={13}/></button>
            <button type="button" onClick={() => removeFeature(plan.id, index)} className="rounded p-1 text-red-400 hover:bg-red-500/10" aria-label="Remove feature"><Trash2 size={13}/></button>
          </div>)}</div>
        </div>

        <label className={`mt-3 flex items-center gap-2 text-xs ${muted}`}>
          <input className="accent-[#2dd4bf]" type="checkbox" checked={plan.is_featured} onChange={event => update(plan.id, 'is_featured', event.target.checked)}/>Highlight as popular
        </label>
      </article>;
    })}</div>

    {loading && <div className={`py-8 text-center ${muted}`}>Loading plan settings…</div>}
    {status && <div className={`rounded-lg border p-3 text-sm ${dark ? 'border-[#2a2e39] bg-[#131722] text-blue-300' : 'border-blue-200 bg-blue-50 text-blue-700'}`} role="status">{status}</div>}
  </div></>;
}

function Field({ label, children, inputClass, muted }) {
  return <label className={`grid gap-1.5 text-xs font-semibold ${muted}`}>{label}{React.cloneElement(children, { className: `h-10 rounded-lg border px-3 text-sm outline-none focus:border-[#2dd4bf] ${inputClass}` })}</label>;
}

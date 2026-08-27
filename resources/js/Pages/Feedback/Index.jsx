import React, { useEffect, useState } from 'react';
import { Head } from '@inertiajs/react';
import axios from 'axios';
import { ArrowLeft, Bug, CheckCircle2, ChevronRight, CreditCard, Gauge, Lightbulb, MessageCircle, MessageSquarePlus, Send, Sparkles, UserRound, WandSparkles } from 'lucide-react';
import { useTheme } from '../../Context/ThemeContext';
import FeedbackChat from '../../Components/Feedback/FeedbackChat';

const categories = [
    ['payment', 'Payment issue', CreditCard, 'Failed, missing, or incorrect payment'],
    ['subscription', 'Subscription', CreditCard, 'Plan access, renewal, or cancellation'],
    ['account', 'Account access', UserRound, 'Sign-in, profile, or account help'],
    ['enhancement', 'Enhancement', WandSparkles, 'Improve an existing workflow'],
    ['feature', 'Additional feature', Sparkles, 'Suggest a new capability'],
    ['bug', 'Bug report', Bug, 'Something is not working'],
    ['usability', 'Usability', Lightbulb, 'Make the interface easier'],
    ['performance', 'Performance', Gauge, 'Report slowness or delay'],
    ['other', 'Other', MessageSquarePlus, 'Share another observation'],
];

const PAYMENT_REASONS = [
    ['duplicate', 'Charged twice for the same purchase'],
    ['payment_error', 'Wrong amount or failed payment'],
    ['access_not_reflected', "Paid but access wasn't activated"],
    ['other', 'Something else'],
];
const paymentReasonLabels = Object.fromEntries(PAYMENT_REASONS);

const statusStyles = {
    submitted: 'bg-slate-500/15 text-slate-400', reviewing: 'bg-blue-500/15 text-blue-400', planned: 'bg-violet-500/15 text-violet-400',
    in_progress: 'bg-amber-500/15 text-amber-400', completed: 'bg-emerald-500/15 text-emerald-400', declined: 'bg-red-500/15 text-red-400',
};

const emptyForm = { category: '', title: '', description: '', subscription_request_id: '', payment_reason_code: '' };
const money = item => item?.amount != null ? `${item.currency || 'PHP'} ${Number(item.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : null;

export default function FeedbackIndex() {
    const { theme } = useTheme();
    const isDark = theme === 'bg-skin-black';
    const [items, setItems] = useState([]);
    const [step, setStep] = useState(1);
    const [form, setForm] = useState(emptyForm);
    const [payments, setPayments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadingPayments, setLoadingPayments] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [chatTicket, setChatTicket] = useState(null);

    const loadItems = () => axios.get('/feedback/items').then(({ data }) => setItems(data.feedback ?? [])).catch(() => setError('Unable to load your feedback history.')).finally(() => setLoading(false));
    useEffect(() => { loadItems(); }, []);

    const chooseCategory = value => {
        setForm({ ...emptyForm, category: value });
        setError(''); setMessage('');
        setStep(2);
        if (value === 'payment') {
            setLoadingPayments(true);
            axios.get('/subscription-requests/mine').then(({ data }) => setPayments(data.requests ?? [])).catch(() => {}).finally(() => setLoadingPayments(false));
        }
    };
    const backToCategories = () => { setStep(1); setError(''); };

    const submit = async (event) => {
        event.preventDefault();
        setSubmitting(true); setError(''); setMessage('');
        try {
            const { data } = await axios.post('/feedback/items', { ...form, page_url: window.location.href });
            setItems((current) => [data.feedback, ...current]);
            setForm(emptyForm);
            setStep(1);
            setMessage(data.message);
        } catch (requestError) {
            setError(requestError.response?.data?.message || 'Unable to submit feedback.');
        } finally { setSubmitting(false); }
    };

    const panel = isDark ? 'border-[#2a2e39] bg-[#131722]' : 'border-slate-200 bg-white';
    const field = isDark ? 'border-[#2a2e39] bg-[#0b0e14] text-white' : 'border-slate-200 bg-slate-50 text-slate-900';
    const selectedCategory = categories.find(([value]) => value === form.category);
    const CategoryIcon = selectedCategory?.[2];

    return <><Head title="Customer Support" /><div className={`mx-auto max-w-6xl space-y-4 py-2 ${isDark ? 'text-[#d1d4dc]' : 'text-slate-900'}`}>
        <div><div className="text-xs font-bold uppercase tracking-[.18em] text-[#2dd4bf]">Customer care</div><h1 className={`mt-1 text-2xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>Customer support</h1><p className="mt-1 text-sm text-[#787b86]">Get help with payments, subscriptions, account access, or product issues.</p></div>
        {message && <div className="rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-400"><CheckCircle2 size={14} className="mr-2 inline"/>{message}</div>}
        {error && <div className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</div>}
        <div className="grid gap-4 lg:grid-cols-[1.05fr_.95fr]">
            <div className={`rounded-xl border p-5 ${panel}`}>
                <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[#787b86]">
                    <span className={step === 1 ? 'text-[#2dd4bf]' : ''}>1. Category</span>
                    <ChevronRight size={12}/>
                    <span className={step === 2 ? 'text-[#2dd4bf]' : ''}>2. Details</span>
                </div>

                {step === 1 ? <>
                    <h2 className={`mt-3 text-sm font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>How can we help?</h2>
                    <div className="mt-4 grid gap-2 sm:grid-cols-2">{categories.map(([value, label, Icon, copy]) => <button key={value} type="button" onClick={() => chooseCategory(value)} className={`flex items-center gap-3 rounded-lg border p-3 text-left ${isDark ? 'border-[#2a2e39] hover:bg-white/5' : 'border-slate-200 hover:bg-slate-50'}`}><Icon size={17} className="shrink-0 text-[#5eead4]"/><span><span className="block text-xs font-bold">{label}</span><span className="mt-0.5 block text-[10px] text-[#787b86]">{copy}</span></span></button>)}</div>
                </> : <form onSubmit={submit}>
                    <button type="button" onClick={backToCategories} className="flex items-center gap-1.5 text-xs font-semibold text-[#5eead4]"><ArrowLeft size={14}/>Change category</button>
                    <div className="mt-3 flex items-center gap-2">{CategoryIcon && <CategoryIcon size={16} className="text-[#5eead4]"/>}<h2 className={`text-sm font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{selectedCategory?.[1]}</h2></div>

                    {form.category === 'payment' && <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <label className="text-xs font-semibold">Which payment is this about?
                            <select value={form.subscription_request_id} onChange={(e) => setForm((c) => ({ ...c, subscription_request_id: e.target.value }))} className={`mt-1.5 h-11 w-full rounded-lg border px-3 text-sm outline-none focus:border-[#2dd4bf] ${field}`}>
                                <option value="">{loadingPayments ? 'Loading your payments…' : "Not sure / not listed"}</option>
                                {payments.map((p) => <option key={p.id} value={p.id}>#{p.id} · {p.plan} · {money(p) || p.status} · {p.status}</option>)}
                            </select>
                        </label>
                        <label className="text-xs font-semibold">What happened?
                            <select value={form.payment_reason_code} onChange={(e) => setForm((c) => ({ ...c, payment_reason_code: e.target.value }))} className={`mt-1.5 h-11 w-full rounded-lg border px-3 text-sm outline-none focus:border-[#2dd4bf] ${field}`}>
                                <option value="">Select a reason</option>
                                {PAYMENT_REASONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                            </select>
                        </label>
                    </div>}

                    <label className="mt-4 block text-xs font-semibold">Title<input value={form.title} onChange={(e) => setForm((c) => ({ ...c, title: e.target.value }))} maxLength="160" required className={`mt-1.5 h-11 w-full rounded-lg border px-3 text-sm outline-none focus:border-[#2dd4bf] ${field}`} placeholder="Briefly describe your idea or issue"/></label>
                    <label className="mt-4 block text-xs font-semibold">Details<textarea value={form.description} onChange={(e) => setForm((c) => ({ ...c, description: e.target.value }))} minLength="10" maxLength="5000" required rows="6" className={`mt-1.5 w-full resize-y rounded-lg border p-3 text-sm outline-none focus:border-[#2dd4bf] ${field}`} placeholder="What happened, what did you expect, and how would this help?"/></label>
                    <button disabled={submitting} className="mt-4 flex h-10 items-center gap-2 rounded-lg bg-[#2dd4bf] px-4 text-xs font-bold text-white hover:bg-[#14b8a6] disabled:opacity-50"><Send size={14}/>{submitting ? 'Submitting…' : 'Submit support request'}</button>
                </form>}
            </div>
            <section className={`rounded-xl border p-5 ${panel}`}><div className="flex items-center justify-between"><h2 className={`text-sm font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>Your submissions</h2><span className="text-[10px] text-[#787b86]">{items.length} total</span></div><div className="mt-4 max-h-[620px] space-y-3 overflow-y-auto pr-1">{loading ? <p className="text-xs text-[#787b86]">Loading feedback…</p> : !items.length ? <div className="py-16 text-center text-xs text-[#787b86]">Your submitted feedback will appear here.</div> : items.map((item) => <article key={item.id} className={`rounded-lg border p-4 ${isDark ? 'border-[#2a2e39] bg-[#0b0e14]' : 'border-slate-200 bg-slate-50'}`}><div className="flex items-start gap-2"><div className="min-w-0 flex-1"><div className={`truncate text-xs font-bold ${isDark ? 'text-[#d1d4dc]' : 'text-slate-900'}`}>{item.title}</div><div className="mt-1 text-[10px] uppercase tracking-wider text-[#787b86]">{item.category.replace('_',' ')} · {new Date(item.createdAt).toLocaleDateString()}</div></div><span className={`rounded-full px-2 py-1 text-[9px] font-bold uppercase ${statusStyles[item.status]}`}>{item.status.replace('_',' ')}</span></div>{(item.subscriptionRequest || item.paymentReasonCode) && <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] text-[#787b86]">{item.subscriptionRequest && <span className="rounded-full border border-[#2a2e39] px-2 py-0.5">#{item.subscriptionRequest.id} · {item.subscriptionRequest.plan} · {money(item.subscriptionRequest) || item.subscriptionRequest.status}</span>}{item.paymentReasonCode && <span className="rounded-full border border-[#2a2e39] px-2 py-0.5">{paymentReasonLabels[item.paymentReasonCode] || item.paymentReasonCode}</span>}</div>}<p className="mt-3 line-clamp-3 text-xs leading-5 text-[#9598a1]">{item.description}</p>{item.adminResponse && <div className="mt-3 rounded-md border border-[#2dd4bf]/25 bg-[#2dd4bf]/5 p-3"><div className="text-[9px] font-bold uppercase tracking-wider text-[#5eead4]">Legacy team response</div><p className={`mt-1 text-xs leading-5 ${isDark ? 'text-[#d1d4dc]' : 'text-slate-700'}`}>{item.adminResponse}</p></div>}{item.chatEnabled&&<button type="button" onClick={()=>setChatTicket(item)} className="mt-3 flex items-center gap-2 rounded-lg border border-[#2dd4bf]/40 px-3 py-2 text-xs font-semibold text-[#5eead4]"><MessageCircle size={14}/>Open conversation{item.unreadMessagesCount>0&&<span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[9px] text-white">{item.unreadMessagesCount}</span>}</button>}</article>)}</div></section>
        </div>
        {chatTicket&&<FeedbackChat ticket={chatTicket} onClose={()=>setChatTicket(null)} onRead={()=>setItems(c=>c.map(i=>i.id===chatTicket.id?{...i,unreadMessagesCount:0}:i))} onSent={()=>setItems(c=>c.map(i=>i.id===chatTicket.id?{...i,messagesCount:(i.messagesCount||0)+1}:i))}/>}
    </div></>;
}

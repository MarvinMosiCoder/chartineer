import React, { useMemo, useState } from 'react';
import { Head } from '@inertiajs/react';
import axios from 'axios';
import { Bell, Download, ExternalLink, Megaphone, Trash2, Volume2, VolumeX, X } from 'lucide-react';
import { useTheme } from '../../Context/ThemeContext';

const playPreview = () => {
    try { const ctx = new AudioContext(); const oscillator = ctx.createOscillator(); oscillator.connect(ctx.destination); oscillator.frequency.value = 880; oscillator.start(); oscillator.stop(ctx.currentTime + .18); } catch {}
};

// Announcement bodies are rich text; the server strips executable markup and the
// list row already carries a plain-text excerpt, so only the modal renders HTML.
const richText = 'space-y-2 [&_p]:my-0 [&_a]:text-[#2dd4bf] [&_a]:underline [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_strong]:font-semibold [&_img]:max-w-full [&_h1]:text-base [&_h1]:font-bold [&_h2]:text-sm [&_h2]:font-bold';

export default function NotificationsViewAll({ notifications: initial = [], activeAlerts: initialAlerts = [], alertSoundEnabled = true }) {
    const { theme } = useTheme();
    const isDark = theme === 'bg-skin-black';
    const [items, setItems] = useState(initial), [alerts, setAlerts] = useState(initialAlerts);
    const [filter, setFilter] = useState('all'), [sound, setSound] = useState(alertSoundEnabled);
    const [selected, setSelected] = useState(null);
    const [confirm, setConfirm] = useState(null), [working, setWorking] = useState(false);
    const visible = useMemo(() => items.filter(item => filter === 'all' || (filter === 'alerts' ? item.type === 'price alert' : item.type === 'announcement')), [filter, items]);
    const markRead = async item => {
        if (item.is_read) return;
        await axios.post('/notifications/read', { notification_id: item.id, source_type: item.source_type });
        setItems(current => current.map(value => value.key === item.key ? { ...value, is_read: true } : value));
    };
    const markAll = async () => { await axios.post('/notifications/read-all'); setItems(current => current.map(item => ({ ...item, is_read: true }))); };
    const toggleSound = async () => { const next = !sound; setSound(next); await axios.patch('/notification-preferences', { alert_sound_enabled: next }); if (next) playPreview(); };
    const removeAlert = async id => { await axios.delete(`/market-price-alerts/${id}`); setAlerts(current => current.filter(item => item.id !== id)); };

    // Deleting is permanent (announcements are only hidden for this account), so
    // both the single row and the clear-all go through one confirmation step.
    const runConfirm = async () => {
        setWorking(true);
        try {
            if (confirm.mode === 'all') {
                await axios.delete('/notifications/all');
                setItems([]); setSelected(null);
            } else {
                const item = confirm.item;
                await axios.delete(`/notifications/${item.source_type}/${item.id}`);
                setItems(current => current.filter(value => value.key !== item.key));
                setSelected(current => current && current.key === item.key ? null : current);
            }
            setConfirm(null);
        } catch {
            // Keep the dialog open so the user can retry the failed delete.
        } finally { setWorking(false); }
    };

    const panel = isDark ? 'border-[#2a2e39] bg-[#131722]' : 'border-slate-200 bg-white';
    const secondary = isDark ? 'border-[#2a2e39] bg-[#0b0e14] hover:bg-white/5' : 'border-slate-200 bg-slate-50 hover:bg-slate-100';

    return <div className={`mx-auto max-w-5xl space-y-5 ${isDark ? 'text-[#d1d4dc]' : 'text-slate-900'}`}>
        <Head title="Notifications" />
        <header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>Notifications</h1><p className="text-sm text-[#787b86]">Price-alert history and BacktradeLab announcements.</p></div><div className="flex flex-wrap gap-2"><button onClick={toggleSound} className={`flex h-10 items-center gap-2 rounded-lg border px-3 text-sm font-semibold transition ${secondary}`}>{sound ? <Volume2 size={16}/> : <VolumeX size={16}/>} Alert sound {sound ? 'on' : 'off'}</button><button onClick={markAll} className="h-10 rounded-lg bg-[#2dd4bf] px-4 text-sm font-semibold text-white hover:bg-[#14b8a6]">Mark all read</button><button onClick={() => setConfirm({ mode: 'all' })} disabled={!items.length} className={`flex h-10 items-center gap-2 rounded-lg border border-red-500/40 px-4 text-sm font-semibold text-red-400 transition hover:bg-red-500/10 disabled:pointer-events-none disabled:opacity-40 ${isDark ? '' : 'bg-white'}`}><Trash2 size={15}/>Delete all</button></div></header>
        {alerts.length > 0 && <section className={`rounded-xl border border-amber-500/30 p-4 ${isDark ? 'bg-amber-500/5' : 'bg-amber-50'}`}><h2 className={isDark ? 'font-bold text-white' : 'font-bold text-slate-900'}>Active live-market alerts</h2><div className="mt-3 grid gap-2 sm:grid-cols-2">{alerts.map(alert => <div key={alert.id} className={`flex items-center justify-between rounded-lg border p-3 text-sm ${secondary}`}><span><b>{alert.symbol}</b> {alert.direction} {Number(alert.target_price).toLocaleString()}</span><button onClick={() => removeAlert(alert.id)} className="rounded-md p-1.5 text-red-400 hover:bg-red-500/10" aria-label="Cancel alert"><Trash2 size={15}/></button></div>)}</div></section>}
        <div className="flex flex-wrap gap-2">{[['all','All'],['alerts','Alerts'],['announcements','Announcements']].map(([key,label]) => <button key={key} onClick={() => setFilter(key)} className={`rounded-full border px-4 py-2 text-xs font-bold transition ${filter === key ? 'border-[#2dd4bf] bg-[#2dd4bf] text-white' : secondary}`}>{label}</button>)}</div>
        <section className={`overflow-hidden rounded-xl border ${panel}`}>{visible.length ? visible.map(item => <div key={item.key} className={`group flex w-full items-start border-b pr-2 transition last:border-0 ${isDark ? 'border-[#2a2e39] hover:bg-white/5' : 'border-slate-200 hover:bg-slate-50'} ${item.is_read ? 'opacity-70' : 'bg-[#2dd4bf]/5'}`}>
            <button type="button" onClick={() => { markRead(item); setSelected(item); }} className="flex min-w-0 flex-1 gap-3 p-4 text-left"><span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${item.type === 'announcement' ? 'bg-violet-500/15 text-violet-400' : 'bg-amber-500/15 text-amber-400'}`}>{item.type === 'announcement' ? <Megaphone size={18}/> : <Bell size={18}/>}</span><span className="min-w-0"><span className="block text-xs font-bold uppercase text-[#787b86]">{item.type}</span><span className={`mt-1 block text-sm ${isDark ? 'text-[#d1d4dc]' : 'text-slate-800'}`}>{item.content}</span><span className="mt-1 block text-xs text-[#787b86]">{new Date(item.created_at).toLocaleString()}</span></span></button>
            <button type="button" onClick={() => setConfirm({ mode: 'one', item })} className="mt-4 shrink-0 rounded-md p-2 text-[#787b86] transition hover:bg-red-500/10 hover:text-red-400 focus:opacity-100 sm:opacity-0 sm:group-hover:opacity-100" aria-label="Delete notification" title="Delete"><Trash2 size={15}/></button>
        </div>) : <div className="p-12 text-center text-sm text-[#787b86]">No notifications in this category.</div>}</section>

        {selected && <div className="fixed inset-0 z-[10020] flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center" onMouseDown={(event) => event.target === event.currentTarget && setSelected(null)}>
            <div className={`w-full max-w-md rounded-2xl border p-5 shadow-2xl ${isDark ? 'border-[#2a2e39] bg-[#131722] text-white' : 'border-slate-200 bg-white text-slate-900'}`}>
                <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${selected.type === 'announcement' ? 'bg-violet-500/15 text-violet-400' : 'bg-amber-500/15 text-amber-400'}`}>{selected.type === 'announcement' ? <Megaphone size={18}/> : <Bell size={18}/>}</span>
                        <div><div className="text-[10px] font-bold uppercase tracking-wider text-[#787b86]">{selected.type}</div><div className="text-xs text-[#787b86]">{new Date(selected.created_at).toLocaleString()}</div></div>
                    </div>
                    <button type="button" onClick={() => setSelected(null)} className={`rounded-lg p-2 text-[#787b86] ${isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'}`} aria-label="Close"><X size={17}/></button>
                </div>
                {selected.title && <h2 className="mt-4 text-sm font-bold">{selected.title}</h2>}
                {selected.content_html
                    ? <div className={`mt-2 max-h-[55vh] overflow-y-auto text-sm leading-6 ${richText}`} dangerouslySetInnerHTML={{ __html: selected.content_html }} />
                    : <p className="mt-4 text-sm leading-6">{selected.content}</p>}
                <div className="mt-5 flex justify-end gap-2">
                    <button type="button" onClick={() => setConfirm({ mode: 'one', item: selected })} className="flex h-10 items-center gap-2 rounded-lg border border-red-500/40 px-4 text-xs font-semibold text-red-400 hover:bg-red-500/10"><Trash2 size={14}/>Delete</button>
                    <button type="button" onClick={() => setSelected(null)} className={`h-10 rounded-lg border px-4 text-xs font-semibold ${isDark ? 'border-[#2a2e39] hover:bg-white/5' : 'border-slate-200 hover:bg-slate-50'}`}>Close</button>
                    {selected.url && <a href={selected.url} onClick={() => setSelected(null)} className="flex h-10 items-center gap-2 rounded-lg bg-[#2dd4bf] px-4 text-xs font-bold text-white hover:bg-teal-600">{selected.url.includes('/download') ? <><Download size={14}/>Download file</> : <><ExternalLink size={14}/>Open</>}</a>}
                </div>
            </div>
        </div>}

        {confirm && <div className="fixed inset-0 z-[10030] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onMouseDown={(event) => event.target === event.currentTarget && !working && setConfirm(null)}>
            <div className={`w-full max-w-sm rounded-2xl border p-5 shadow-2xl ${isDark ? 'border-[#2a2e39] bg-[#131722] text-white' : 'border-slate-200 bg-white text-slate-900'}`}>
                <div className="flex items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-500/15 text-red-400"><Trash2 size={18}/></span><h2 className="text-sm font-bold">{confirm.mode === 'all' ? 'Delete all notifications?' : 'Delete this notification?'}</h2></div>
                <p className="mt-3 text-sm leading-6 text-[#787b86]">{confirm.mode === 'all' ? 'Your entire notification history is removed from this account. Announcements stay published for everyone else but disappear from your list. This cannot be undone.' : 'This is removed from your notification history and cannot be restored.'}</p>
                <div className="mt-5 flex justify-end gap-2">
                    <button type="button" onClick={() => setConfirm(null)} disabled={working} className={`h-10 rounded-lg border px-4 text-xs font-semibold disabled:opacity-50 ${isDark ? 'border-[#2a2e39] hover:bg-white/5' : 'border-slate-200 hover:bg-slate-50'}`}>Cancel</button>
                    <button type="button" onClick={runConfirm} disabled={working} className="h-10 rounded-lg bg-red-500 px-4 text-xs font-bold text-white hover:bg-red-600 disabled:opacity-60">{working ? 'Deleting…' : 'Delete'}</button>
                </div>
            </div>
        </div>}
    </div>;
}

import React, { useState } from 'react';
import { Head, Link } from '@inertiajs/react';
import axios from 'axios';
import { ArrowLeft, Megaphone } from 'lucide-react';
import { useTheme } from '../../Context/ThemeContext';
import Pagination from '../../Components/Table/Pagination';

export default function AnnouncementsIndex({ announcements }) {
    const { theme } = useTheme();
    const isDark = theme === 'bg-skin-black';
    const [items, setItems] = useState(announcements.data);
    const [expanded, setExpanded] = useState(null);

    const panel = isDark ? 'border-[#2a2e39] bg-[#131722]' : 'border-slate-200 bg-white';
    const muted = isDark ? 'text-[#a6a9b2]' : 'text-slate-600';

    const toggle = async (item) => {
        setExpanded((current) => (current === item.id ? null : item.id));
        if (item.is_read) return;
        setItems((current) => current.map((entry) => (entry.id === item.id ? { ...entry, is_read: true } : entry)));
        try {
            await axios.post('/read-announcement', { announcement_id: item.id });
        } catch {
            setItems((current) => current.map((entry) => (entry.id === item.id ? { ...entry, is_read: false } : entry)));
        }
    };

    return (
        <>
            <Head title="News & updates" />
            <div className={`mx-auto max-w-3xl space-y-4 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                <div>
                    <Link href="/market" className={`inline-flex items-center gap-1.5 text-xs font-semibold transition ${isDark ? 'text-[#787b86] hover:text-white' : 'text-slate-500 hover:text-slate-900'}`}>
                        <ArrowLeft size={14} />
                        Back to Market Summary
                    </Link>
                    <h1 className="mt-2 flex items-center gap-2 text-xl font-bold">
                        <Megaphone size={19} className="text-violet-400" />
                        News & updates
                    </h1>
                    <p className={`mt-1 text-sm ${muted}`}>Every update published by BacktradeLab administrators, newest first.</p>
                </div>

                <section className={`rounded-xl border p-2 sm:p-3 ${panel}`}>
                    {items.length ? (
                        <div className={`divide-y ${isDark ? 'divide-[#2a2e39]' : 'divide-slate-200'}`}>
                            {items.map((item) => {
                                const isOpen = expanded === item.id;
                                return (
                                    <div key={item.id} className="px-2 py-1">
                                        <button
                                            type="button"
                                            onClick={() => toggle(item)}
                                            className={`flex w-full items-start gap-3 rounded-lg px-2 py-3 text-left transition-colors ${isDark ? 'hover:bg-white/[.06]' : 'hover:bg-slate-100'}`}
                                        >
                                            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${item.is_read ? 'bg-slate-500' : 'bg-[#2dd4bf]'}`} />
                                            <span className="min-w-0 flex-1">
                                                <span className="flex items-center justify-between gap-3">
                                                    <span className="text-sm font-semibold">{item.title}</span>
                                                    <span className="shrink-0 text-[10px] text-[#787b86]">{formatDate(item.created_at)}</span>
                                                </span>
                                                {!isOpen && <span className={`mt-0.5 block truncate text-xs ${muted}`}>Tap to read the full update.</span>}
                                            </span>
                                        </button>
                                        {isOpen && (
                                            <div
                                                className={`mb-3 ml-5 rounded-lg border px-4 py-3 text-sm leading-6 ${isDark ? 'border-[#2a2e39] bg-[#0b0e14] text-[#d1d4dc]' : 'border-slate-200 bg-slate-50 text-slate-700'}`}
                                                dangerouslySetInnerHTML={{ __html: item.message }}
                                            />
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className={`p-8 text-center text-sm ${muted}`}>No system updates have been published yet.</div>
                    )}
                </section>

                {items.length > 0 && <Pagination paginate={announcements} extendClass={theme} />}
            </div>
        </>
    );
}

const formatDate = (value) => (value ? new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value)) : '');

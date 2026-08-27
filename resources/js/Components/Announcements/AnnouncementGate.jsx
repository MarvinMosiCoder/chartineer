import React, { useEffect, useState } from 'react';
import { usePage } from '@inertiajs/react';
import axios from 'axios';
import { Megaphone, X } from 'lucide-react';
import { useTheme } from '../../Context/ThemeContext';

export default function AnnouncementGate() {
    const { auth } = usePage().props;
    const { theme } = useTheme();
    const isDark = theme === 'bg-skin-black';
    const [announcements, setAnnouncements] = useState([]);
    const [index, setIndex] = useState(0);
    const [dismissed, setDismissed] = useState(false);
    const [loading, setLoading] = useState(false);
    const [fetched, setFetched] = useState(false);

    useEffect(() => {
        if (!auth?.announcement || fetched) return;
        setFetched(true);
        axios.get('/unread-announcement')
            .then(({ data }) => setAnnouncements(data?.unreadAnnouncements ?? []))
            .catch(() => {});
    }, [auth?.announcement, fetched]);

    if (dismissed || !announcements.length || index >= announcements.length) {
        return null;
    }

    const current = announcements[index];
    const isLast = index === announcements.length - 1;

    const acknowledge = async () => {
        setLoading(true);
        try {
            await axios.post('/read-announcement', { announcement_id: current.id });
            setIndex((value) => value + 1);
        } catch {
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="announcement-title">
            <div className={`w-full max-w-lg animate-fadeInUp overflow-hidden rounded-xl border shadow-2xl ${isDark ? 'border-[#2a2e39] bg-[#131722] text-[#d1d4dc]' : 'border-slate-200 bg-white text-slate-900'}`}>
                <div className={`flex items-center justify-between gap-3 border-b px-5 py-4 ${isDark ? 'border-[#2a2e39]' : 'border-slate-200'}`}>
                    <div className="flex min-w-0 items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#2dd4bf]/15 text-[#5eead4]">
                            <Megaphone size={18} />
                        </span>
                        <div className="min-w-0">
                            <div className="text-[10px] font-bold uppercase tracking-wider text-[#5eead4]">
                                What's new{announcements.length > 1 ? ` · ${index + 1}/${announcements.length}` : ''}
                            </div>
                            <h2 id="announcement-title" className="mt-0.5 truncate text-sm font-bold">{current.title}</h2>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => setDismissed(true)}
                        className={`shrink-0 rounded-md p-1.5 transition ${isDark ? 'text-[#787b86] hover:bg-white/10 hover:text-white' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700'}`}
                        aria-label="Close"
                    >
                        <X size={17} />
                    </button>
                </div>

                <div
                    className={`max-h-[55vh] overflow-y-auto px-5 py-4 text-sm leading-6 ${isDark ? 'text-[#d1d4dc]' : 'text-slate-700'}`}
                    dangerouslySetInnerHTML={{ __html: current.message }}
                />

                {announcements.length > 1 && (
                    <div className="flex items-center justify-center gap-1.5 pb-3" aria-hidden="true">
                        {announcements.map((item, i) => (
                            <span
                                key={item.id}
                                className={`h-1.5 rounded-full transition-all ${i === index ? 'w-5 bg-[#2dd4bf]' : `w-1.5 ${isDark ? 'bg-[#2a2e39]' : 'bg-slate-200'}`}`}
                            />
                        ))}
                    </div>
                )}

                <div className={`flex justify-end border-t px-5 py-4 ${isDark ? 'border-[#2a2e39]' : 'border-slate-200'}`}>
                    <button
                        type="button"
                        onClick={acknowledge}
                        disabled={loading}
                        className="rounded-lg bg-[#2dd4bf] px-5 py-2.5 text-xs font-bold text-white transition hover:-translate-y-0.5 hover:bg-[#14b8a6] hover:shadow-lg hover:shadow-teal-950/30 disabled:pointer-events-none disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none"
                    >
                        {loading ? 'Please wait…' : isLast ? 'Got it' : 'Next'}
                    </button>
                </div>
            </div>
        </div>
    );
}

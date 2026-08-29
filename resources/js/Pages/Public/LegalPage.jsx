import React, { useEffect, useState } from 'react';
import { Head, Link } from '@inertiajs/react';
import { ArrowLeft, Scale, ShieldCheck } from 'lucide-react';
import getAppLogo from '../../Components/SystemSettings/ApplicationLogo';
import getAppName from '../../Components/SystemSettings/ApplicationName';
import AppNameWordmark from '../../Components/SystemSettings/AppNameWordmark';

export const LegalSection = ({ title, children }) => (
    <section className="scroll-mt-24">
        <h2 className="font-poppins text-xl font-bold text-current">{title}</h2>
        <div className="mt-3 space-y-3 text-sm leading-7 text-slate-400">{children}</div>
    </section>
);

export const LegalList = ({ children }) => (
    <ul className="list-disc space-y-2 pl-5 marker:text-[#5eead4]">{children}</ul>
);

export default function LegalPage({ title, description, effectiveDate, icon = 'privacy', children }) {
    const [applogo, setApplogo] = useState('');
    const [appName, setAppName] = useState('BacktradeLab');
    const [theme, setTheme] = useState('dark');
    const isDark = theme === 'dark';
    const Icon = icon === 'terms' ? Scale : ShieldCheck;

    useEffect(() => {
        getAppLogo().then((appLogo) => setApplogo(appLogo));
        getAppName().then(setAppName).catch(() => {});

        try {
            const storedTheme = localStorage.getItem('backtradelab-theme');
            if (storedTheme === 'dark' || storedTheme === 'white') setTheme(storedTheme);
        } catch {}
    }, []);

    return (
        <div className={`min-h-screen ${isDark ? 'bg-black-screen-color text-white' : 'bg-slate-50 text-slate-950'}`}>
            <Head title={title} />
            <header className={`sticky top-0 z-20 border-b px-4 py-3 backdrop-blur ${isDark ? 'border-gray-800 bg-skin-black/95' : 'border-slate-200 bg-white/95'}`}>
                <div className="mx-auto flex max-w-4xl items-center justify-between gap-4">
                    <Link href="/" className={`inline-flex items-center gap-2 text-sm font-semibold ${isDark ? 'text-slate-300 hover:text-white' : 'text-slate-600 hover:text-slate-950'}`}>
                        <ArrowLeft size={16} />
                        Back to home
                    </Link>
                    <Link href="/" className="flex items-center gap-2">
                        <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-md">
                            {applogo ? <img src={applogo} className="h-full w-full object-contain" alt={`${appName} logo`} /> : <span className="text-xs font-bold">BT</span>}
                        </div>
                        <span className="font-poppins text-sm font-bold"><AppNameWordmark name={appName} /></span>
                    </Link>
                </div>
            </header>

            <main className="mx-auto max-w-4xl px-4 py-10 sm:py-14">
                <div className={`rounded-xl border p-6 shadow-2xl sm:p-10 ${isDark ? 'border-[#2a2e39] bg-[#131722]' : 'border-slate-200 bg-white'}`}>
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#2dd4bf]/15 text-[#5eead4]">
                        <Icon size={24} />
                    </div>
                    <h1 className="mt-5 font-poppins text-3xl font-bold sm:text-4xl">{title}</h1>
                    <p className={`mt-3 max-w-2xl text-sm leading-7 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>{description}</p>
                    <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-[#5eead4]">Effective {effectiveDate}</p>

                    <article className={`mt-10 space-y-10 [&_a]:font-semibold [&_a]:text-[#5eead4] [&_a]:hover:underline ${isDark ? '[&_div]:text-slate-400' : '[&_div]:text-slate-600'}`}>
                        {children}
                    </article>
                </div>

                <footer className={`flex flex-wrap justify-center gap-x-5 gap-y-2 py-8 text-xs ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                    <Link href="/privacy-policy" className="hover:text-[#5eead4]">Privacy Policy</Link>
                    <Link href="/terms-of-service" className="hover:text-[#5eead4]">Terms of Service</Link>
                    <span>&copy; {new Date().getFullYear()} {appName}</span>
                </footer>
            </main>
        </div>
    );
}

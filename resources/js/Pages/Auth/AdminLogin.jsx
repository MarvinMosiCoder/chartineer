import React, { useEffect, useState } from 'react';
import { Head, Link, router, usePage } from '@inertiajs/react';
import { ArrowLeft, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck } from 'lucide-react';
import getAppLogo from '../../Components/SystemSettings/ApplicationLogo';
import getAppName from '../../Components/SystemSettings/ApplicationName';
import AppNameWordmark from '../../Components/SystemSettings/AppNameWordmark';

export default function AdminLogin() {
    const { errors = {} } = usePage().props;
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [processing, setProcessing] = useState(false);
    const [logo, setLogo] = useState('');
    const [appName, setAppName] = useState('BacktradeLab');
    const [theme, setTheme] = useState('dark');
    const isDark = theme === 'dark';

    useEffect(() => {
        getAppLogo().then(setLogo).catch(() => {});
        getAppName().then(setAppName).catch(() => {});
        try {
            const storedTheme = localStorage.getItem('backtradelab-theme');
            if (storedTheme === 'dark' || storedTheme === 'white') {
                setTheme(storedTheme);
            }
        } catch {}
        const stopStart = router.on('start', () => setProcessing(true));
        const stopFinish = router.on('finish', () => setProcessing(false));
        return () => { stopStart(); stopFinish(); };
    }, []);

    const submit = (event) => {
        event.preventDefault();
        router.post('/admin/login', { email: email.trim(), password }, {
            preserveScroll: true,
            onFinish: () => setPassword(''),
        });
    };

    return (
        <div className={`relative min-h-screen overflow-hidden px-4 py-6 ${isDark ? 'bg-black-screen-color text-white' : 'bg-slate-50 text-slate-950'}`}>
            <Head title="Administrator sign in" />

            <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
                <div className="absolute -left-24 top-0 h-72 w-72 animate-floatY rounded-full bg-[#2dd4bf]/10 blur-3xl [animation-duration:10s]" />
                <div className="absolute -right-24 bottom-0 h-72 w-72 animate-floatY rounded-full bg-emerald-400/10 blur-3xl [animation-duration:12s]" />
            </div>

            <div className="mx-auto flex max-w-6xl animate-fadeInUp items-center justify-between">
                <Link href="/" className={`group inline-flex items-center gap-2 text-sm font-semibold transition-colors ${isDark ? 'text-slate-300 hover:text-white' : 'text-slate-600 hover:text-slate-950'}`}>
                    <ArrowLeft size={16} className="transition-transform duration-200 group-hover:-translate-x-1" />
                    Back to home
                </Link>
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-md">
                        {logo ? (
                            <img src={logo} className="h-full w-full object-contain" alt={`${appName} logo`} />
                        ) : (
                            <span className={`text-xs font-bold ${isDark ? 'text-gray-200' : 'text-slate-800'}`}>BT</span>
                        )}
                    </div>
                    <span className="font-poppins text-sm font-bold"><AppNameWordmark name={appName} /></span>
                </div>
            </div>

            <main className="mx-auto flex min-h-[calc(100vh-84px)] max-w-md items-center justify-center py-8">
                <section className={`w-full animate-fadeInUp rounded-xl border p-6 shadow-2xl sm:p-8 ${isDark ? 'border-[#2a2e39] bg-[#131722] shadow-teal-950/10' : 'border-slate-200 bg-white shadow-slate-200/60'}`} style={{ animationDelay: '80ms' }}>
                    <div className="mb-6 text-center">
                        <div className="mx-auto flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl">
                            {logo ? <img src={logo} alt="" className="h-full w-full object-contain" /> : <ShieldCheck className="h-7 w-7 text-[#5eead4]" />}
                        </div>
                        <h1 className={`mt-4 font-poppins text-2xl font-bold ${isDark ? 'text-white' : 'text-slate-950'}`}>Administrator sign in</h1>
                        <p className={`mt-2 text-sm leading-6 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Authorized {appName} staff accounts only</p>
                    </div>

                    {errors.message && (
                        <div role="alert" className={`mb-5 rounded-lg border px-4 py-3 text-sm ${isDark ? 'border-red-500/30 bg-red-500/10 text-red-200' : 'border-red-200 bg-red-50 text-red-700'}`}>
                            {errors.message}
                        </div>
                    )}

                    <form onSubmit={submit} className="space-y-4">
                        <div className="block">
                            <span className={`mb-1 block text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>Email address</span>
                            <div className={`group flex h-11 items-center rounded-md border transition-colors focus-within:border-[#2dd4bf] focus-within:ring-1 focus-within:ring-[#2dd4bf]/30 ${isDark ? 'border-gray-700 bg-black-table-color' : 'border-slate-200 bg-slate-50'}`}>
                                <div className={`flex h-full w-11 items-center justify-center border-r transition-colors group-focus-within:border-[#2dd4bf]/40 group-focus-within:text-[#2dd4bf] ${isDark ? 'border-gray-700 text-gray-400' : 'border-slate-200 text-slate-500'}`}>
                                    <Mail size={17} />
                                </div>
                                <input
                                    type="email"
                                    autoComplete="username"
                                    autoFocus
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className={`min-w-0 flex-1 border-0 bg-transparent px-3 text-sm outline-none ring-0 placeholder:text-slate-500 focus:border-0 focus:outline-none focus:ring-0 ${isDark ? 'text-white' : 'text-slate-950'}`}
                                />
                            </div>
                            {errors.email && <span className={`mt-1 block text-sm ${isDark ? 'text-red-400' : 'text-red-600'}`}>{errors.email}</span>}
                        </div>

                        <div className="block">
                            <span className={`mb-1 block text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>Password</span>
                            <div className={`group flex h-11 items-center rounded-md border transition-colors focus-within:border-[#2dd4bf] focus-within:ring-1 focus-within:ring-[#2dd4bf]/30 ${isDark ? 'border-gray-700 bg-black-table-color' : 'border-slate-200 bg-slate-50'}`}>
                                <div className={`flex h-full w-11 items-center justify-center border-r transition-colors group-focus-within:border-[#2dd4bf]/40 group-focus-within:text-[#2dd4bf] ${isDark ? 'border-gray-700 text-gray-400' : 'border-slate-200 text-slate-500'}`}>
                                    <LockKeyhole size={17} />
                                </div>
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    autoComplete="current-password"
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className={`min-w-0 flex-1 border-0 bg-transparent px-3 text-sm outline-none ring-0 placeholder:text-slate-500 focus:border-0 focus:outline-none focus:ring-0 ${isDark ? 'text-white' : 'text-slate-950'}`}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword((value) => !value)}
                                    className={`flex h-full w-11 items-center justify-center transition-colors ${isDark ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-950'}`}
                                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                                >
                                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                                </button>
                            </div>
                            {errors.password && <span className={`mt-1 block text-sm ${isDark ? 'text-red-400' : 'text-red-600'}`}>{errors.password}</span>}
                        </div>

                        <div className="flex justify-end">
                            <Link href="/reset_password" className="text-sm font-semibold text-[#5eead4] transition-colors hover:text-[#2dd4bf] hover:underline">
                                Forgot password?
                            </Link>
                        </div>

                        <button
                            type="submit"
                            disabled={processing}
                            className={`mt-1 h-11 w-full rounded-md px-4 font-poppins text-sm font-bold transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-teal-950/30 disabled:pointer-events-none disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none ${isDark ? 'bg-white text-skin-black hover:bg-gray-200' : 'bg-skin-black text-white hover:bg-skin-black-light'}`}
                        >
                            {processing ? 'Signing in…' : 'Sign in to administration'}
                        </button>
                    </form>

                    <p className={`mt-5 text-center text-xs leading-5 ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                        Not an administrator? <Link href="/login" className="font-semibold text-[#5eead4] hover:underline">Trader sign in</Link>
                    </p>
                </section>
            </main>
        </div>
    );
}

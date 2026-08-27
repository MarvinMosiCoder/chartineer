import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Head, Link, router, usePage } from '@inertiajs/react';
import axios from 'axios';
import { ArrowLeft, Check, CheckCircle2, Eye, EyeOff, KeyRound, LockKeyhole, ShieldCheck, X } from 'lucide-react';
import { useTheme } from '../../Context/ThemeContext';

function PasswordField({ label, name, value, onChange, autoComplete, error }) {
    const [visible, setVisible] = useState(false);

    return (
        <label className="block">
            <span className="mb-1.5 block text-xs font-semibold">{label}</span>
            <div className={`flex h-11 items-center rounded-lg border bg-transparent transition focus-within:border-[#2dd4bf] ${error ? 'border-red-500' : 'border-[#2a2e39]'}`}>
                <LockKeyhole size={16} className="ml-3 shrink-0 text-[#787b86]" />
                <input
                    type={visible ? 'text' : 'password'}
                    name={name}
                    value={value}
                    onChange={onChange}
                    autoComplete={autoComplete}
                    className="min-w-0 flex-1 bg-transparent px-3 text-sm outline-none"
                />
                <button type="button" onClick={() => setVisible((current) => !current)} className="mr-2 rounded-md p-2 text-[#787b86] hover:bg-white/10" aria-label={visible ? `Hide ${label}` : `Show ${label}`}>
                    {visible ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
            </div>
            {error && <span className="mt-1 block text-xs text-red-400">{error}</span>}
        </label>
    );
}

export default function ChangePassword() {
    const { auth } = usePage().props;
    const { theme } = useTheme();
    const isDark = theme === 'bg-skin-black';
    const [form, setForm] = useState({ current_password: '', new_password: '', confirm_password: '' });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [showSuccess, setShowSuccess] = useState(false);
    const [countdown, setCountdown] = useState(3);
    const signingOut = useRef(false);

    const signOut = useCallback(() => {
        if (signingOut.current) return;
        signingOut.current = true;
        router.post('/logout');
    }, []);

    const checks = useMemo(() => ({
        length: form.new_password.length >= 8,
        uppercase: /[A-Z]/.test(form.new_password),
        lowercase: /[a-z]/.test(form.new_password),
        number: /\d/.test(form.new_password),
        special: /[!@#$%^&*(),.?":{}|<>;]/.test(form.new_password),
    }), [form.new_password]);
    const isStrong = Object.values(checks).every(Boolean);
    const matches = form.confirm_password !== '' && form.new_password === form.confirm_password;
    const needsCurrentPassword = auth?.user?.password_login_enabled !== false;
    const canSubmit = (!needsCurrentPassword || form.current_password) && isStrong && matches && !loading;

    useEffect(() => {
        if (!showSuccess) return undefined;

        if (countdown <= 0) {
            signOut();
            return undefined;
        }

        const timer = window.setTimeout(() => setCountdown((current) => current - 1), 1000);
        return () => window.clearTimeout(timer);
    }, [countdown, showSuccess, signOut]);

    const handleChange = (event) => {
        setError('');
        setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        if (!canSubmit) return;

        setLoading(true);
        setError('');
        try {
            const response = await axios.post('/save-change-password', form);
            if (response.data?.status !== 'success') {
                setError(response.data?.message || 'Unable to change your password.');
                return;
            }

            setCountdown(3);
            setShowSuccess(true);
        } catch (requestError) {
            setError(requestError.response?.data?.message || 'Unable to change your password. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const criteria = [
        ['length', 'At least 8 characters'],
        ['uppercase', 'One uppercase letter'],
        ['lowercase', 'One lowercase letter'],
        ['number', 'One number'],
        ['special', 'One special character'],
    ];

    return (
        <>
            <Head title="Change Password" />
            <div className="mx-auto max-w-5xl py-2 sm:py-6">
                <Link href="/workspace" className="mb-4 inline-flex items-center gap-2 text-xs font-semibold text-[#787b86] hover:text-[#2dd4bf]"><ArrowLeft size={15} /> Back to workspace</Link>
                <div className={`grid overflow-hidden rounded-xl border shadow-2xl lg:grid-cols-[0.85fr_1.15fr] ${isDark ? 'border-[#2a2e39] bg-[#131722] text-[#d1d4dc]' : 'border-slate-200 bg-white text-slate-900'}`}>
                    <aside className="relative overflow-hidden bg-[#2dd4bf] p-7 text-white sm:p-10">
                        <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-white/10" />
                        <div className="relative">
                            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15"><ShieldCheck size={22} /></span>
                            <h1 className="mt-8 text-3xl font-bold">Protect your trading workspace.</h1>
                            <p className="mt-4 text-sm leading-7 text-blue-100">A strong, unique password protects your replay history, journal notes, account settings, and saved analysis.</p>
                            <div className="mt-8 space-y-3 text-xs text-blue-50">
                                {['Use a password you do not use elsewhere', 'Never share your password with another trader', 'You will be signed out after a successful change'].map((item) => <div key={item} className="flex gap-2"><Check size={15} className="shrink-0" /> {item}</div>)}
                            </div>
                        </div>
                    </aside>

                    <form onSubmit={handleSubmit} className="p-6 sm:p-10">
                        <div className="mb-7"><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-[#2dd4bf]"><KeyRound size={15} /> Account security</div><h2 className="mt-2 text-2xl font-bold">Change password</h2><p className="mt-2 text-xs text-[#787b86]">Enter your current password and choose a strong replacement.</p></div>
                        <div className="space-y-4">
                            {needsCurrentPassword && <PasswordField label="Current password" name="current_password" value={form.current_password} onChange={handleChange} autoComplete="current-password" />}
                            <PasswordField label="New password" name="new_password" value={form.new_password} onChange={handleChange} autoComplete="new-password" />
                            <div className={`grid gap-2 rounded-lg border p-3 sm:grid-cols-2 ${isDark ? 'border-[#2a2e39] bg-[#0b0e14]' : 'border-slate-200 bg-slate-50'}`}>
                                {criteria.map(([key, label]) => <div key={key} className={`flex items-center gap-2 text-[11px] ${checks[key] ? 'text-emerald-400' : 'text-[#787b86]'}`}><span className={`flex h-4 w-4 items-center justify-center rounded-full ${checks[key] ? 'bg-emerald-500/15' : 'bg-slate-500/10'}`}>{checks[key] ? <Check size={11} /> : <X size={10} />}</span>{label}</div>)}
                            </div>
                            <PasswordField label="Confirm new password" name="confirm_password" value={form.confirm_password} onChange={handleChange} autoComplete="new-password" error={form.confirm_password && !matches ? 'Passwords do not match.' : ''} />
                        </div>
                        {error && <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</div>}
                        <button type="submit" disabled={!canSubmit} className="mt-6 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#2dd4bf] text-sm font-bold text-white transition hover:bg-[#14b8a6] disabled:cursor-not-allowed disabled:opacity-40"><KeyRound size={16} /> {loading ? 'Updating password…' : 'Update password'}</button>
                    </form>
                </div>
            </div>

            {showSuccess && (
                <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
                    <div className={`w-full max-w-sm rounded-xl border p-7 text-center shadow-2xl ${isDark ? 'border-[#2a2e39] bg-[#131722] text-white' : 'border-slate-200 bg-white text-slate-900'}`} role="dialog" aria-modal="true" aria-labelledby="password-success-title">
                        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400"><CheckCircle2 size={28} /></span>
                        <h2 id="password-success-title" className="mt-5 text-xl font-bold">Password updated</h2>
                        <p className="mt-2 text-sm text-[#787b86]">For your security, you will be signed out in</p>
                        <div className="mx-auto mt-4 flex h-16 w-16 items-center justify-center rounded-full border-4 border-[#2dd4bf]/25 text-2xl font-bold text-[#5eead4]">{countdown}</div>
                        <button type="button" onClick={signOut} className="mt-5 text-xs font-semibold text-[#2dd4bf] hover:underline">Sign out now</button>
                    </div>
                </div>
            )}
        </>
    );
}

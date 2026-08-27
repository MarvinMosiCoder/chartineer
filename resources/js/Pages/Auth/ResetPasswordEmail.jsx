import React, { useEffect, useState } from 'react';
import { Head, Link, router } from '@inertiajs/react';
import axios from 'axios';
import { ArrowLeft, Check, Eye, EyeOff, Lock, ShieldCheck, X } from 'lucide-react';
import getAppLogo from '../../Components/SystemSettings/ApplicationLogo';
import getAppName from '../../Components/SystemSettings/ApplicationName';
import AppNameWordmark from '../../Components/SystemSettings/AppNameWordmark';

const ResetPasswordEmail = ({ email }) => {
    const [loading, setLoading] = useState(false);
    const [isDisabled, setIsDisabled] = useState(true);
    const [passwordMismatch, setPasswordMismatch] = useState(false);
    const [strength, setStrength] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [forms, setForms] = useState({
        email: email || '',
        new_password: '',
        confirm_password: '',
    });
    const [logo, setLogo] = useState('');
    const [appName, setAppName] = useState('BacktradeLab');
    const [theme, setTheme] = useState('dark');
    const isDark = theme === 'dark';

    const [activeText, setActiveText] = useState({
        Uppercase: false,
        Length: false,
        Number: false,
        Character: false,
    });

    useEffect(() => {
        getAppLogo().then(setLogo).catch(() => {});
        getAppName().then(setAppName).catch(() => {});
        try {
            const storedTheme = localStorage.getItem('backtradelab-theme');
            if (storedTheme === 'dark' || storedTheme === 'white') {
                setTheme(storedTheme);
            }
        } catch {}
    }, []);

    useEffect(() => {
        validateInputs();
    }, [forms]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setForms((prevForms) => ({
            ...prevForms,
            [name]: value,
        }));
    };

    const validateInputs = () => {
        let isValid = true;

        const textActive = checkPasswordTextActive(forms.new_password);
        setActiveText({
            Uppercase: textActive.includes('Uppercase'),
            Length: textActive.includes('Length'),
            Number: textActive.includes('Number'),
            Character: textActive.includes('Character'),
        });

        let level = '';
        if (forms.new_password) {
            const hasLowerCase = /[a-z]/.test(forms.new_password);
            const hasUpperCase = /[A-Z]/.test(forms.new_password);
            const hasNumber = /\d/.test(forms.new_password);
            const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>;]/.test(forms.new_password);

            level = 'Weak';
            if (forms.new_password.length >= 6 && hasLowerCase && hasNumber) {
                level = 'Strong';
            }
            if (forms.new_password.length >= 8 && hasUpperCase && hasLowerCase && hasNumber && hasSpecialChar) {
                level = 'Excellent';
            }
        }
        setStrength(level);

        if (level !== 'Excellent') {
            isValid = false;
        }

        if (forms.new_password !== forms.confirm_password) {
            setPasswordMismatch(true);
            isValid = false;
        } else {
            setPasswordMismatch(false);
        }

        Object.values(forms).forEach((val) => {
            if (!val) {
                isValid = false;
            }
        });

        setIsDisabled(!isValid);
    };

    const checkPasswordTextActive = (password) => {
        const hasUpperCase = /[A-Z]/.test(password);
        const hasLowerCase = /[a-z]/.test(password);
        const hasNumber = /\d/.test(password);
        const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>;]/.test(password);

        const allCharacters = [];
        if (hasUpperCase) allCharacters.push('Uppercase');
        if (password.length >= 8) allCharacters.push('Length');
        if (hasNumber) allCharacters.push('Number');
        if (hasSpecialChar) allCharacters.push('Character');

        return allCharacters;
    };

    const fireToast = (icon, title) => {
        const Toast = Swal.mixin({
            toast: true,
            position: 'top-end',
            showConfirmButton: false,
            timer: 3000,
            timerProgressBar: true,
            didOpen: (toast) => {
                toast.onmouseenter = Swal.stopTimer;
                toast.onmouseleave = Swal.resumeTimer;
            },
        });
        return Toast.fire({ icon, title });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const response = await axios.post('/send_resetpass_email/reset', forms);
            if (response.data.status === 'success') {
                fireToast('success', 'Password reset successful!').then(() => {
                    router.visit('/login');
                });
            } else {
                fireToast('error', 'Request expired, please request another one');
            }
        } catch (error) {
            fireToast('error', 'An error occurred. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const strengthMeta = {
        Weak: { color: 'bg-red-500', text: isDark ? 'text-red-400' : 'text-red-600' },
        Strong: { color: 'bg-orange-500', text: isDark ? 'text-orange-400' : 'text-orange-600' },
        Excellent: { color: 'bg-emerald-500', text: isDark ? 'text-emerald-400' : 'text-emerald-600' },
    };

    const criteria = [
        { key: 'Uppercase', label: 'An uppercase letter' },
        { key: 'Length', label: 'At least 8 characters' },
        { key: 'Number', label: 'A number' },
        { key: 'Character', label: 'A special character' },
    ];

    return (
        <div className={`relative min-h-screen overflow-hidden px-4 py-6 ${isDark ? 'bg-black-screen-color text-white' : 'bg-slate-50 text-slate-950'}`}>
            <Head title="Reset password" />

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
                    <div className={`flex h-9 w-9 items-center justify-center overflow-hidden rounded-md border ${isDark ? 'border-gray-700 bg-black-table-color' : 'border-gray-300 bg-white'}`}>
                        {logo ? (
                            <img src={logo} className="h-full w-full object-contain p-1" alt={`${appName} logo`} />
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
                        <div className="mx-auto flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl border border-[#5eead4]/30 bg-[#2dd4bf]/10 shadow-[0_0_30px_rgba(45,212,191,.18)]">
                            <ShieldCheck className="h-7 w-7 text-[#5eead4]" />
                        </div>
                        <h1 className={`mt-4 font-poppins text-2xl font-bold ${isDark ? 'text-white' : 'text-slate-950'}`}>Reset your password</h1>
                        <p className={`mt-2 truncate text-sm leading-6 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>{forms.email}</p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="block">
                            <span className={`mb-1 block text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>New password</span>
                            <div className={`group flex h-11 items-center rounded-md border transition-colors focus-within:border-[#2dd4bf] focus-within:ring-1 focus-within:ring-[#2dd4bf]/30 ${isDark ? 'border-gray-700 bg-black-table-color' : 'border-slate-200 bg-slate-50'}`}>
                                <div className={`flex h-full w-11 items-center justify-center border-r transition-colors group-focus-within:border-[#2dd4bf]/40 group-focus-within:text-[#2dd4bf] ${isDark ? 'border-gray-700 text-gray-400' : 'border-slate-200 text-slate-500'}`}>
                                    <Lock size={17} />
                                </div>
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    name="new_password"
                                    autoComplete="new-password"
                                    autoFocus
                                    value={forms.new_password}
                                    onChange={handleChange}
                                    placeholder="Enter new password"
                                    className={`min-w-0 flex-1 border-0 bg-transparent px-3 text-sm outline-none ring-0 placeholder:text-slate-500 focus:border-0 focus:outline-none focus:ring-0 ${isDark ? 'text-white' : 'text-slate-950'}`}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword((v) => !v)}
                                    className={`flex h-full w-11 items-center justify-center transition-colors ${isDark ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-950'}`}
                                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                                >
                                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                                </button>
                            </div>

                            {forms.new_password && (
                                <div className="mt-2 flex items-center gap-1.5" aria-hidden="true">
                                    {['Weak', 'Strong', 'Excellent'].map((level, index) => {
                                        const reached = strength === 'Excellent' || (strength === 'Strong' && index < 2) || (strength === 'Weak' && index < 1);
                                        return (
                                            <span
                                                key={level}
                                                className={`h-1 flex-1 rounded-full transition-colors ${reached ? strengthMeta[strength].color : isDark ? 'bg-gray-700' : 'bg-slate-200'}`}
                                            />
                                        );
                                    })}
                                    {strength && <span className={`ml-1 text-xs font-semibold ${strengthMeta[strength].text}`}>{strength}</span>}
                                </div>
                            )}

                            <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5">
                                {criteria.map(({ key, label }) => (
                                    <div key={key} className={`flex items-center gap-1.5 text-xs ${activeText[key] ? (isDark ? 'text-emerald-400' : 'text-emerald-600') : isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                                        {activeText[key] ? <Check size={12} /> : <X size={12} />}
                                        {label}
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="block">
                            <span className={`mb-1 block text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>Confirm new password</span>
                            <div className={`group flex h-11 items-center rounded-md border transition-colors focus-within:border-[#2dd4bf] focus-within:ring-1 focus-within:ring-[#2dd4bf]/30 ${isDark ? 'border-gray-700 bg-black-table-color' : 'border-slate-200 bg-slate-50'}`}>
                                <div className={`flex h-full w-11 items-center justify-center border-r transition-colors group-focus-within:border-[#2dd4bf]/40 group-focus-within:text-[#2dd4bf] ${isDark ? 'border-gray-700 text-gray-400' : 'border-slate-200 text-slate-500'}`}>
                                    <Lock size={17} />
                                </div>
                                <input
                                    type={showConfirm ? 'text' : 'password'}
                                    name="confirm_password"
                                    autoComplete="new-password"
                                    value={forms.confirm_password}
                                    onChange={handleChange}
                                    placeholder="Confirm new password"
                                    className={`min-w-0 flex-1 border-0 bg-transparent px-3 text-sm outline-none ring-0 placeholder:text-slate-500 focus:border-0 focus:outline-none focus:ring-0 ${isDark ? 'text-white' : 'text-slate-950'}`}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowConfirm((v) => !v)}
                                    className={`flex h-full w-11 items-center justify-center transition-colors ${isDark ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-950'}`}
                                    aria-label={showConfirm ? 'Hide password' : 'Show password'}
                                >
                                    {showConfirm ? <EyeOff size={17} /> : <Eye size={17} />}
                                </button>
                            </div>
                            {passwordMismatch && (
                                <span className={`mt-1 block text-sm ${isDark ? 'text-red-400' : 'text-red-600'}`}>Passwords do not match.</span>
                            )}
                        </div>

                        <button
                            type="submit"
                            disabled={isDisabled || loading}
                            className={`mt-1 h-11 w-full rounded-md px-4 font-poppins text-sm font-bold transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-teal-950/30 disabled:pointer-events-none disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none ${isDark ? 'bg-white text-skin-black hover:bg-gray-200' : 'bg-skin-black text-white hover:bg-skin-black-light'}`}
                        >
                            {loading ? 'Changing password…' : 'Change password'}
                        </button>
                    </form>

                    <p className={`mt-5 text-center text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                        <Link href="/login" className="font-semibold text-[#5eead4] hover:underline">Back to sign in</Link>
                    </p>
                </section>
            </main>
        </div>
    );
};

export default ResetPasswordEmail;

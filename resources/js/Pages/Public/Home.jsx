import React, { useEffect, useRef, useState } from 'react';
import { Link } from '@inertiajs/react';
import {
    Activity,
    ArrowRight,
    BarChart3,
    BookOpen,
    ChevronDown,
    CircleDollarSign,
    ClipboardCheck,
    History,
    LineChart,
    LogIn,
    Moon,
    PenTool,
    Search,
    ShieldCheck,
    Sparkles,
    Sun,
    TrendingUp,
    UserCircle,
} from 'lucide-react';
import getAppLogo from '../../Components/SystemSettings/ApplicationLogo';
import getAppName from '../../Components/SystemSettings/ApplicationName';
import AppNameWordmark from '../../Components/SystemSettings/AppNameWordmark';
import LoginDetails from '../../Components/SystemSettings/LoginDetails';

const navItems = [
    ['Workspace', '#workspace'],
    ['Coins', '#coins'],
    ['Replay', '#features'],
    ['Journal', '#features'],
    ['Process', '#process'],
];

const coinDescriptions = {
    BTC: 'Bitcoin is the largest crypto asset by market value and is often used as the market benchmark.',
    ETH: 'Ether powers Ethereum, a network for smart contracts, applications, and tokenized assets.',
    SOL: 'Solana is a high-throughput smart-contract network designed for fast, low-cost transactions.',
};

const featureItems = [
    { icon: History, title: 'Try your strategy', description: 'Turn an idea into a repeatable paper-trading session before risking real capital.' },
    { icon: LineChart, title: 'Replay Chart', description: 'Step through candles, pick prices, and practice entries without leaving the chart.' },
    { icon: PenTool, title: 'Drawing Tools', description: 'Mark structure with lines, boxes, Fibonacci, text notes, and duplicated setups.' },
    { icon: ClipboardCheck, title: 'Trade Review', description: 'Capture entry and exit snapshots, then review closed trades in reports.' },
];

const processSteps = ['Choose a market', 'Replay the setup', 'Execute the plan', 'Journal the result'];

const number = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
};

const formatPrice = (value) => {
    const parsed = number(value);
    if (parsed === null) return 'Unavailable';
    const digits = parsed >= 1000 ? 2 : parsed >= 1 ? 2 : 6;
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: digits }).format(parsed);
};

const formatCompact = (value) => {
    const parsed = number(value);
    return parsed === null ? '—' : new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(parsed);
};

function useScrollReveal(threshold = 0.15) {
    const ref = useRef(null);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const node = ref.current;
        if (!node) return undefined;

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setVisible(true);
                    observer.disconnect();
                }
            },
            { threshold }
        );

        observer.observe(node);
        return () => observer.disconnect();
    }, [threshold]);

    return [ref, visible];
}

function Reveal({ children, delay = 0, className = '' }) {
    const [ref, visible] = useScrollReveal();

    return (
        <div
            ref={ref}
            className={`transition-all duration-700 ease-out ${visible ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'} ${className}`}
            style={{ transitionDelay: `${delay}ms` }}
        >
            {children}
        </div>
    );
}

function useCountUp(target, active, duration = 900) {
    const [value, setValue] = useState(0);

    useEffect(() => {
        if (!active || target === null || !Number.isFinite(target)) return undefined;

        let frame;
        let start;

        const step = (timestamp) => {
            if (!start) start = timestamp;
            const progress = Math.min((timestamp - start) / duration, 1);
            const eased = 1 - (1 - progress) ** 3;
            setValue(target * eased);
            if (progress < 1) frame = requestAnimationFrame(step);
        };

        frame = requestAnimationFrame(step);
        return () => cancelAnimationFrame(frame);
    }, [target, active, duration]);

    return value;
}

function FeaturedCoinCard({ coin, isDark, delay }) {
    const [ref, visible] = useScrollReveal();
    const base = coin.market?.base_coin || coin.market?.symbol?.replace(/USDT$/, '') || 'Coin';
    const change = number(coin.stats?.change_24h_percent);
    const rawPrice = number(coin.stats?.last_price);
    const unavailable = rawPrice === null;
    const animatedPrice = useCountUp(rawPrice, visible);
    const priceLabel = unavailable ? 'Unavailable' : formatPrice(animatedPrice);

    return (
        <div
            ref={ref}
            className={`transition-all duration-700 ease-out ${visible ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'}`}
            style={{ transitionDelay: `${delay}ms` }}
        >
            <article
                className={`group relative overflow-hidden rounded-xl border p-5 transition-all duration-300 hover:-translate-y-1 ${
                    isDark
                        ? 'border-[#2a2e39] bg-[#131722] hover:border-[#2dd4bf]/60 hover:shadow-xl hover:shadow-teal-950/30'
                        : 'border-slate-200 bg-slate-50 hover:border-[#2dd4bf]/40 hover:shadow-xl hover:shadow-teal-100'
                }`}
            >
                <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-[#2dd4bf]/10 opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-100" />
                <div className="relative flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                        {coin.fundamentals?.logo_url ? (
                            <img src={coin.fundamentals.logo_url} alt="" className="h-10 w-10 rounded-full object-contain" />
                        ) : (
                            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#2dd4bf]/15 text-xs font-bold text-[#5eead4]">{base}</span>
                        )}
                        <div className="min-w-0">
                            <h3 className="truncate text-base font-bold">{coin.fundamentals?.name || base}</h3>
                            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{base}/USDT · Bybit spot</div>
                        </div>
                    </div>
                    {coin.fundamentals?.market_cap_rank && (
                        <span className="rounded bg-[#2dd4bf]/10 px-2 py-1 text-[10px] font-bold text-[#5eead4]">Rank #{coin.fundamentals.market_cap_rank}</span>
                    )}
                </div>
                <div className="relative mt-5 flex items-end justify-between gap-3">
                    <div>
                        <div className="text-[10px] uppercase tracking-wider text-slate-500">Current price</div>
                        <div className="mt-1 text-2xl font-bold tabular-nums">{priceLabel}</div>
                    </div>
                    {change !== null && (
                        <div className={`text-sm font-bold tabular-nums ${change >= 0 ? (isDark ? 'text-emerald-400' : 'text-emerald-600') : (isDark ? 'text-red-400' : 'text-red-600')}`}>
                            {change >= 0 ? '+' : ''}{change.toFixed(2)}%
                        </div>
                    )}
                </div>
                <dl className={`relative mt-5 grid grid-cols-2 gap-3 border-y py-3 ${isDark ? 'border-[#2a2e39]' : 'border-slate-200'}`}>
                    {[
                        ['24h high', formatPrice(coin.stats?.high_24h)],
                        ['24h low', formatPrice(coin.stats?.low_24h)],
                        ['24h volume', formatCompact(coin.stats?.volume_24h)],
                        ['Market cap', formatCompact(coin.fundamentals?.market_cap)],
                    ].map(([label, value]) => (
                        <div key={label} className="min-w-0">
                            <dt className="text-[9px] uppercase tracking-wide text-slate-500">{label}</dt>
                            <dd className="mt-1 truncate text-xs font-semibold tabular-nums">{value}</dd>
                        </div>
                    ))}
                </dl>
                <p className={`relative mt-4 text-xs leading-5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                    {coinDescriptions[base] || 'Review the market structure and risk before starting a simulated trade.'}
                </p>
                {(unavailable || coin.warnings?.length > 0) && (
                    <p className="relative mt-3 text-[10px] text-amber-500">
                        {unavailable ? 'Live exchange statistics are currently unavailable.' : 'Some fundamentals are currently unavailable.'}
                    </p>
                )}
            </article>
        </div>
    );
}

export default function Home() {
    const [applogo, setApplogo] = useState('');
    const [appName, setAppName] = useState('BacktradeLab');
    const [heroImage, setHeroImage] = useState('');
    const [isLoginMenuOpen, setIsLoginMenuOpen] = useState(false);
    const [theme, setTheme] = useState('dark');
    const [featuredCoins, setFeaturedCoins] = useState([]);
    const [coinStatus, setCoinStatus] = useState('loading');
    const [scrolled, setScrolled] = useState(false);
    const [scrollProgress, setScrollProgress] = useState(0);
    const [glow, setGlow] = useState({ x: 30, y: 30 });
    const [chartDrawn, setChartDrawn] = useState(false);
    const [chartLength, setChartLength] = useState(0);
    const isDark = theme === 'dark';

    const heroRef = useRef(null);
    const loginMenuRef = useRef(null);
    const chartPathRef = useRef(null);

    useEffect(() => {
        getAppLogo().then((appLogo) => setApplogo(appLogo));
        getAppName().then(setAppName).catch(() => {});
        LoginDetails().then((detail) => setHeroImage(detail.login_bg_image));

        try {
            const storedTheme = localStorage.getItem('backtradelab-theme');
            if (storedTheme === 'dark' || storedTheme === 'white') {
                setTheme(storedTheme);
            }
        } catch {}
    }, []);

    useEffect(() => {
        const controller = new AbortController();
        setCoinStatus('loading');

        fetch('/api/featured-coins', { headers: { Accept: 'application/json' }, signal: controller.signal })
            .then(async (response) => {
                if (!response.ok) throw new Error('Unable to load featured coins.');
                return response.json();
            })
            .then((payload) => {
                setFeaturedCoins(Array.isArray(payload?.items) ? payload.items : []);
                setCoinStatus(Array.isArray(payload?.items) && payload.items.length ? 'ready' : 'empty');
            })
            .catch((error) => {
                if (error.name !== 'AbortError') setCoinStatus('error');
            });

        return () => controller.abort();
    }, []);

    useEffect(() => {
        const handleScroll = () => {
            const doc = document.documentElement;
            const max = doc.scrollHeight - doc.clientHeight;
            setScrolled(doc.scrollTop > 8);
            setScrollProgress(max > 0 ? (doc.scrollTop / max) * 100 : 0);
        };

        handleScroll();
        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    useEffect(() => {
        if (!isLoginMenuOpen) return undefined;

        const handleClickOutside = (event) => {
            if (loginMenuRef.current && !loginMenuRef.current.contains(event.target)) {
                setIsLoginMenuOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isLoginMenuOpen]);

    useEffect(() => {
        if (chartPathRef.current) {
            setChartLength(chartPathRef.current.getTotalLength());
        }
    }, []);

    useEffect(() => {
        if (!chartLength) return undefined;
        const timeout = setTimeout(() => setChartDrawn(true), 200);
        return () => clearTimeout(timeout);
    }, [chartLength]);

    const handleHeroPointerMove = (event) => {
        const rect = heroRef.current?.getBoundingClientRect();
        if (!rect) return;
        setGlow({
            x: ((event.clientX - rect.left) / rect.width) * 100,
            y: ((event.clientY - rect.top) / rect.height) * 100,
        });
    };

    const toggleTheme = () => {
        setTheme((currentTheme) => {
            const nextTheme = currentTheme === 'dark' ? 'white' : 'dark';

            try {
                localStorage.setItem('backtradelab-theme', nextTheme);
            } catch {}

            return nextTheme;
        });
    };

    return (
        <div className={`min-h-screen ${isDark ? 'bg-black-screen-color text-white' : 'bg-slate-50 text-slate-950'}`}>
            <div className="fixed inset-x-0 top-0 z-[60] h-[2px] bg-transparent">
                <div
                    className="h-full bg-gradient-to-r from-[#2dd4bf] to-[#5eead4] transition-[width] duration-150"
                    style={{ width: `${scrollProgress}%` }}
                />
            </div>

            <nav
                className={`sticky top-0 z-50 border-b px-4 py-3 backdrop-blur transition-shadow duration-300 ${
                    isDark ? 'border-gray-800 bg-skin-black/95' : 'border-slate-200 bg-white/95'
                } ${scrolled ? (isDark ? 'shadow-lg shadow-black/40' : 'shadow-lg shadow-slate-200/70') : ''}`}
            >
                <div className="mx-auto flex max-w-7xl items-center gap-3">
                    <Link href="/" className="flex min-w-0 flex-1 items-center gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-md">
                            {applogo ? (
                                <img src={applogo} className="h-full w-full object-contain" alt={`${appName} logo`} />
                            ) : (
                                <span className={`text-sm font-bold ${isDark ? 'text-gray-200' : 'text-slate-800'}`}>BT</span>
                            )}
                        </div>
                        <div className="min-w-0">
                            <div className={`truncate font-poppins text-lg font-bold leading-tight ${isDark ? 'text-white' : 'text-slate-950'}`}>
                                <AppNameWordmark name={appName} />
                            </div>
                            <div className="hidden text-[11px] font-medium uppercase tracking-wide text-slate-500 sm:block">
                                Trading replay lab
                            </div>
                        </div>
                    </Link>

                    <div className="hidden flex-[1.7] items-center justify-center gap-2 lg:flex">
                        <div className={`flex h-10 w-[min(320px,30vw)] items-center gap-2 rounded-md border px-3 transition-colors focus-within:border-[#2dd4bf]/60 ${isDark ? 'border-gray-700 bg-black-table-color text-gray-400' : 'border-slate-200 bg-slate-100 text-slate-500'}`}>
                            <Search size={16} className="shrink-0" />
                            <input
                                type="search"
                                placeholder="Search"
                                className={`min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-gray-500 ${isDark ? 'text-white' : 'text-slate-950'}`}
                            />
                        </div>
                        {navItems.map(([item, href]) => (
                            <a
                                key={item}
                                href={href}
                                className={`group relative h-10 rounded-md px-3 text-sm font-semibold transition ${isDark ? 'text-gray-300 hover:bg-skin-black-light hover:text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'}`}
                            >
                                <span className="relative flex h-full items-center">
                                    {item}
                                    <span className="absolute -bottom-1 left-0 h-[2px] w-0 rounded-full bg-[#2dd4bf] transition-all duration-300 group-hover:w-full" />
                                </span>
                            </a>
                        ))}
                    </div>

                    <div className="relative flex shrink-0 justify-end" ref={loginMenuRef}>
                        <button
                            type="button"
                            onClick={() => setIsLoginMenuOpen((current) => !current)}
                            className={`inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-semibold transition-all duration-200 hover:-translate-y-0.5 ${isDark ? 'border-gray-700 bg-black-table-color text-white hover:bg-skin-black-light' : 'border-slate-200 bg-white text-slate-900 hover:bg-slate-100'}`}
                            aria-haspopup="menu"
                            aria-expanded={isLoginMenuOpen}
                        >
                            <UserCircle size={18} />
                            <span className="hidden sm:inline">Login</span>
                            <ChevronDown size={14} className={`transition-transform duration-200 ${isLoginMenuOpen ? 'rotate-180' : ''}`} />
                        </button>

                        <div
                            className={`absolute right-0 top-12 w-56 origin-top-right rounded-md border p-2 shadow-2xl transition-all duration-200 ${
                                isLoginMenuOpen ? 'scale-100 opacity-100' : 'pointer-events-none scale-95 opacity-0'
                            } ${isDark ? 'border-gray-700 bg-skin-black' : 'border-slate-200 bg-white'}`}
                            role="menu"
                            aria-hidden={!isLoginMenuOpen}
                        >
                            <Link
                                href="/login"
                                className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-semibold transition-colors ${isDark ? 'text-white hover:bg-skin-black-light' : 'text-slate-900 hover:bg-slate-100'}`}
                            >
                                <LogIn size={16} />
                                Sign in
                            </Link>
                            <button
                                type="button"
                                onClick={toggleTheme}
                                className={`mt-1 flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors ${isDark ? 'text-gray-300 hover:bg-skin-black-light' : 'text-slate-700 hover:bg-slate-100'}`}
                            >
                                {isDark ? <Sun size={16} /> : <Moon size={16} />}
                                {isDark ? 'White theme' : 'Dark theme'}
                            </button>
                        </div>
                    </div>
                </div>
            </nav>

            <main>
                <section
                    id="workspace"
                    ref={heroRef}
                    onMouseMove={handleHeroPointerMove}
                    className="relative mx-auto grid min-h-[calc(100vh-65px)] max-w-7xl grid-cols-1 gap-10 overflow-hidden px-4 py-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(520px,1.1fr)] lg:items-center"
                >
                    <div
                        className="pointer-events-none absolute inset-0 -z-10 transition-[background] duration-300"
                        style={{
                            background: `radial-gradient(600px circle at ${glow.x}% ${glow.y}%, rgba(45,212,191,${isDark ? 0.16 : 0.1}), transparent 45%)`,
                        }}
                    />

                    <div className="max-w-2xl">
                        <div className={`mb-5 inline-flex animate-floatY items-center gap-2 rounded-md border px-3 py-2 text-xs font-semibold uppercase tracking-wide ${isDark ? 'border-gray-700 bg-black-table-color text-gray-200' : 'border-gray-300 bg-white text-slate-700'}`}>
                            <Sparkles size={15} className="text-[#5eead4]" />
                            <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,.8)]" />
                            Built for deliberate practice
                        </div>
                        <h1 className={`font-poppins text-4xl font-bold leading-tight sm:text-6xl ${isDark ? 'text-white' : 'text-slate-950'}`}>
                            Train your trading process, not just your entries.
                        </h1>
                        <p className={`mt-5 max-w-xl text-base leading-7 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                            A chart-first replay terminal for practicing execution, documenting decisions, and turning every simulated trade into useful feedback.
                        </p>
                        <div className="mt-8 flex flex-wrap gap-3">
                            <Link
                                href="/login"
                                className={`group inline-flex h-11 items-center gap-2 rounded-md px-4 text-sm font-bold transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-teal-950/30 ${isDark ? 'bg-white text-skin-black hover:bg-gray-200' : 'bg-skin-black text-white hover:bg-skin-black-light'}`}
                            >
                                Sign in
                                <ArrowRight size={16} className="transition-transform duration-200 group-hover:translate-x-1" />
                            </Link>
                            <a
                                href="#features"
                                className={`inline-flex h-11 items-center rounded-md border px-4 text-sm font-semibold transition-all duration-200 hover:-translate-y-0.5 ${isDark ? 'border-gray-700 bg-black-table-color text-gray-200 hover:bg-skin-black-light hover:text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100 hover:text-slate-950'}`}
                            >
                                Explore features
                            </a>
                        </div>
                        <div className={`mt-8 grid max-w-xl grid-cols-3 gap-3 border-t pt-5 ${isDark ? 'border-slate-700/40' : 'border-slate-200'}`}>
                            {[
                                ['Replay', 'Candle by candle'],
                                ['Execute', 'Risk planned'],
                                ['Review', 'Journal backed'],
                            ].map(([value, label]) => (
                                <div key={value}>
                                    <div className={`text-sm font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{value}</div>
                                    <div className="mt-1 text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className={`animate-floatY overflow-hidden rounded-xl border shadow-2xl shadow-teal-950/20 [animation-duration:9s] ${isDark ? 'border-[#2a2e39] bg-[#131722]' : 'border-slate-200 bg-white'}`}>
                        <div className={`flex h-12 items-center border-b px-4 ${isDark ? 'border-[#2a2e39]' : 'border-slate-200'}`}>
                            <div className="flex items-center gap-2 text-xs font-bold"><span className="flex h-7 w-7 items-center justify-center rounded bg-[#2dd4bf] text-white"><TrendingUp size={14} /></span> BTCUSDT</div>
                            <div className="ml-3 text-[10px] text-slate-500">Perpetual · 15m</div>
                            <div className={`ml-auto flex items-center gap-2 text-[10px] ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}><span className={`h-1.5 w-1.5 animate-pulse rounded-full ${isDark ? 'bg-emerald-400' : 'bg-emerald-600'}`} /> Replay ready</div>
                        </div>
                        <div className="relative h-[330px] overflow-hidden bg-[linear-gradient(rgba(120,123,134,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(120,123,134,.08)_1px,transparent_1px)] bg-[size:48px_48px] sm:h-[420px]">
                            {heroImage && <img src={heroImage} alt="" className="absolute inset-0 h-full w-full object-cover opacity-[0.07]" />}
                            <svg viewBox="0 0 700 380" className="absolute inset-0 h-full w-full" preserveAspectRatio="none" aria-label="Trading replay preview">
                                <defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2dd4bf" stopOpacity=".22"/><stop offset="1" stopColor="#2dd4bf" stopOpacity="0"/></linearGradient></defs>
                                <path
                                    d="M0 300 C70 270 95 290 140 240 S220 260 260 205 S335 235 385 165 S465 195 510 120 S610 150 700 72 L700 380 L0 380Z"
                                    fill="url(#area)"
                                    className="transition-opacity duration-1000"
                                    style={{ opacity: chartDrawn ? 1 : 0 }}
                                />
                                <path
                                    ref={chartPathRef}
                                    d="M0 300 C70 270 95 290 140 240 S220 260 260 205 S335 235 385 165 S465 195 510 120 S610 150 700 72"
                                    fill="none"
                                    stroke="#2dd4bf"
                                    strokeWidth="3"
                                    strokeDasharray={chartLength}
                                    strokeDashoffset={chartDrawn ? 0 : chartLength}
                                    style={{ transition: 'stroke-dashoffset 1.8s ease-out' }}
                                />
                                <circle cx="700" cy="72" r="5" fill="#2dd4bf" className="transition-opacity duration-500" style={{ opacity: chartDrawn ? 1 : 0 }}>
                                    <animate attributeName="r" values="5;8;5" dur="2s" repeatCount="indefinite" />
                                </circle>
                                <line x1="510" y1="0" x2="510" y2="380" stroke="#5eead4" strokeDasharray="7 6" strokeWidth="2" />
                                <rect x="512" y="0" width="188" height="380" fill="#070a10" opacity=".67" />
                            </svg>
                            <div className="absolute left-[64%] top-4 rounded bg-[#2dd4bf] px-2 py-1 text-[10px] font-bold text-white">Replay start</div>
                            <div className={`absolute bottom-4 left-4 right-4 grid grid-cols-3 gap-2 rounded-lg border p-2 backdrop-blur ${isDark ? 'border-[#2a2e39] bg-[#0b0e14]/90' : 'border-slate-200 bg-white/90'}`}>
                                {[[Activity, 'Replay', 'Step through price'], [ShieldCheck, 'Risk', 'Plan before entry'], [BookOpen, 'Journal', 'Review the process']].map(([Icon, title, copy]) => (
                                    <div key={title} className="group flex items-center gap-2 rounded-md p-2 transition-colors hover:bg-[#2dd4bf]/10"><Icon size={16} className="shrink-0 text-[#2dd4bf] transition-transform duration-200 group-hover:scale-110" /><div><div className="text-[11px] font-bold">{title}</div><div className="hidden text-[9px] text-slate-500 sm:block">{copy}</div></div></div>
                                ))}
                            </div>
                        </div>
                    </div>
                </section>

                <section id="coins" className={`border-t px-4 py-14 ${isDark ? 'border-gray-800 bg-skin-black' : 'border-slate-200 bg-white'}`}>
                    <div className="mx-auto max-w-7xl">
                        <Reveal className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                            <div className="max-w-2xl">
                                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[#2dd4bf]"><CircleDollarSign size={16} />Featured markets</div>
                                <h2 className="mt-2 text-3xl font-bold">Know the assets before you practice.</h2>
                                <p className={`mt-2 text-sm leading-6 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>A quick view of three widely followed crypto assets, using Bybit spot-market data and available fundamentals.</p>
                            </div>
                            <div className="text-xs text-slate-500">Informational data may be delayed. Not investment advice.</div>
                        </Reveal>

                        {coinStatus === 'loading' && (
                            <div className="mt-7 grid gap-4 md:grid-cols-3" aria-label="Loading featured coin information">
                                {[0, 1, 2].map((item) => (
                                    <div key={item} className={`relative h-72 overflow-hidden rounded-xl border ${isDark ? 'border-[#2a2e39] bg-[#131722]' : 'border-slate-200 bg-slate-50'}`}>
                                        <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                                    </div>
                                ))}
                            </div>
                        )}

                        {(coinStatus === 'error' || coinStatus === 'empty') && (
                            <div className={`mt-7 rounded-xl border p-6 text-sm ${isDark ? 'border-[#2a2e39] bg-[#131722] text-slate-300' : 'border-slate-200 bg-slate-50 text-slate-700'}`} role="status">
                                Live market details are temporarily unavailable. You can still sign in and use the replay workspace.
                            </div>
                        )}

                        {coinStatus === 'ready' && (
                            <div className="mt-7 grid gap-4 md:grid-cols-3">
                                {featuredCoins.map((coin, index) => (
                                    <FeaturedCoinCard key={coin.market?.symbol || index} coin={coin} isDark={isDark} delay={index * 100} />
                                ))}
                            </div>
                        )}
                    </div>
                </section>

                <section id="features" className={`border-t px-4 py-10 ${isDark ? 'border-gray-800 bg-skin-black' : 'border-slate-200 bg-white'}`}>
                    <div className="mx-auto grid max-w-7xl grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                        {featureItems.map(({ icon: Icon, title, description }, index) => (
                            <Reveal key={title} delay={index * 80}>
                                <div className={`group h-full rounded-md border p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg ${isDark ? 'border-gray-700 bg-black-table-color hover:border-[#2dd4bf]/50 hover:shadow-teal-950/20' : 'border-slate-200 bg-slate-50 hover:border-[#2dd4bf]/40 hover:shadow-teal-100'}`}>
                                    <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-md bg-[#2dd4bf]/10 text-[#5eead4] transition-transform duration-300 group-hover:scale-110`}>
                                        <Icon size={20} />
                                    </div>
                                    <h2 className={`font-poppins text-lg font-bold ${isDark ? 'text-white' : 'text-slate-950'}`}>{title}</h2>
                                    <p className={`mt-2 text-sm leading-6 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>{description}</p>
                                </div>
                            </Reveal>
                        ))}
                    </div>
                </section>

                <section id="process" className={`border-t px-4 py-14 ${isDark ? 'border-gray-800 bg-black-screen-color' : 'border-slate-200 bg-slate-50'}`}>
                    <div className="mx-auto max-w-7xl">
                        <Reveal className="mb-8 max-w-xl"><div className="text-xs font-bold uppercase tracking-[0.2em] text-[#2dd4bf]">One repeatable loop</div><h2 className="mt-2 text-3xl font-bold">A workspace designed around improvement.</h2></Reveal>
                        <div className="relative grid gap-3 md:grid-cols-4">
                            <div className={`pointer-events-none absolute left-0 right-0 top-9 hidden h-px md:block ${isDark ? 'bg-gradient-to-r from-transparent via-[#2dd4bf]/40 to-transparent' : 'bg-gradient-to-r from-transparent via-[#2dd4bf]/25 to-transparent'}`} />
                            {processSteps.map((item, index) => (
                                <Reveal key={item} delay={index * 100}>
                                    <div className={`group relative rounded-lg border p-5 transition-all duration-300 hover:-translate-y-1 hover:border-[#2dd4bf]/50 hover:shadow-lg ${isDark ? 'border-[#2a2e39] bg-[#131722] hover:shadow-teal-950/20' : 'border-slate-200 bg-white hover:shadow-teal-100'}`}>
                                        <div className="mb-5 flex h-8 w-8 items-center justify-center rounded-full bg-[#2dd4bf]/15 text-xs font-bold text-[#5eead4] transition-transform duration-300 group-hover:scale-110">0{index + 1}</div>
                                        <div className="text-sm font-bold">{item}</div>
                                    </div>
                                </Reveal>
                            ))}
                        </div>
                    </div>
                </section>
            </main>

            <footer className={`border-t px-4 py-6 ${isDark ? 'border-gray-800 bg-skin-black text-slate-500' : 'border-slate-200 bg-white text-slate-500'}`}>
                <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 text-xs sm:flex-row">
                    <span>&copy; {new Date().getFullYear()} {appName}. Educational simulation only.</span>
                    <div className="flex gap-5">
                        <Link href="/privacy-policy" className="transition-colors hover:text-[#5eead4]">Privacy Policy</Link>
                        <Link href="/terms-of-service" className="transition-colors hover:text-[#5eead4]">Terms of Service</Link>
                    </div>
                </div>
            </footer>
        </div>
    );
}

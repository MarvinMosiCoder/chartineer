import React from 'react';
import { Head, Link } from '@inertiajs/react';
import {
    AlarmClock,
    BookOpen,
    CandlestickChart,
    Clock,
    HelpCircle,
    LineChart,
    MessageSquarePlus,
    PenTool,
    RotateCcw,
    SlidersHorizontal,
    Wallet,
} from 'lucide-react';
import { useTheme } from '../../Context/ThemeContext';

const steps = [
    {
        icon: CandlestickChart,
        title: '1. Choose a market',
        summary: 'Pick what you want to practice trading.',
        detail: "Go to Market, choose Spot (own the asset) or Futures (trade with leverage), then search for a symbol such as BTC/USDT. This loads that symbol's chart in your Workspace.",
        cta: { label: 'Open Market', href: '/market' },
    },
    {
        icon: Clock,
        title: '2. Set the timeframe',
        summary: 'Decide how much time each candle represents.',
        detail: 'Use the timeframe control above the chart (e.g. 1m, 15m, 1h, 1D) to zoom in for short-term setups or out for the bigger trend. The countdown in the lower-right shows when the current live candle closes.',
        cta: { label: 'Open Workspace', href: '/workspace' },
    },
    {
        icon: SlidersHorizontal,
        title: '3. Add indicators',
        summary: 'Turn on the tools that help you read price action.',
        detail: 'Open Indicators (the sliders icon above the chart) to enable Volume, SMA, EMA, RSI, or MACD. Each indicator has its own settings you can edit — for example, a 50 EMA vs. a 200 EMA — plus volume bar height.',
        cta: { label: 'Open Workspace', href: '/workspace' },
    },
    {
        icon: RotateCcw,
        title: '4. Start Replay',
        summary: 'Rewind the chart to any past moment and play it forward candle by candle.',
        detail: "Select Start Replay to begin — this activates your free seven-day trial the first time you use it. Choose a historical starting candle, then use Play or Step to move forward one candle at a time, just like the market is happening live. This is how you practice reading setups without waiting for real time to pass.",
        cta: { label: 'Start Replay', href: '/workspace' },
    },
    {
        icon: Wallet,
        title: '5. Practice execution',
        summary: 'Place a simulated (paper) trade with real risk math, no real money.',
        detail: "Select Enter Position to open your demo account panel — start a new session there if you don't have one active yet, then check your available balance. Below that, plan your trade: margin (how much of your balance you commit), leverage (how much your position size is multiplied), entry price, stop loss (where you exit if wrong), and take profit (where you exit if right). Confirm to place the paper order — it fills against the replayed price, not real money.",
        cta: { label: 'Open Workspace', href: '/workspace' },
    },
    {
        icon: PenTool,
        title: '6. Draw and annotate',
        summary: 'Mark up the chart the way you would on a real setup.',
        detail: 'Use the drawing rail on the left of the chart for trend lines, Fibonacci retracement tools, position/risk boxes, price forecasts, and text notes. These stay attached to the chart so you can review your reasoning later.',
        cta: { label: 'Open Workspace', href: '/workspace' },
    },
    {
        icon: AlarmClock,
        title: '7. Set price alerts',
        summary: 'Get notified when price reaches a level you care about, without watching the chart.',
        detail: 'Select the bell (Create alert) icon above the chart, or click a price on the chart itself, then confirm a target price — the direction (above or below) is set automatically from where that price sits relative to the current one. You will get an in-app notification and, if allowed, a browser notification the moment the live price reaches that target. Alerts only fire on the live market, not while you are in Replay.',
        cta: { label: 'Open Workspace', href: '/workspace' },
    },
    {
        icon: BookOpen,
        title: '8. Review and improve',
        summary: 'Turn every practice trade into a lesson.',
        detail: 'Open Trade journal after closing a position to see your PnL (profit and loss) and a chart snapshot of the trade. Tag the setup type, your entry reason, the emotion you felt, and any mistake you noticed, then add notes. Reviewing these over time is what actually improves your trading.',
        cta: { label: 'Open Trade journal', href: '/trade-report' },
    },
];

const glossary = [
    { term: 'Replay', meaning: 'Rewinding the chart to a past candle and stepping through history at your own pace, so you can practice without waiting for real time to pass.' },
    { term: 'Paper trade / simulated order', meaning: 'A practice trade placed with virtual balance. It behaves like a real order (it can win or lose) but never touches real money.' },
    { term: 'Margin', meaning: 'The portion of your wallet balance you commit to a single position.' },
    { term: 'Leverage', meaning: 'A multiplier on your position size relative to your margin (e.g. 10x). Higher leverage means larger swings in PnL, both up and down.' },
    { term: 'Stop loss / take profit', meaning: 'Price levels you set in advance to automatically close a losing trade (stop loss) or a winning trade (take profit).' },
    { term: 'PnL', meaning: 'Profit and Loss — how much a closed position made or lost.' },
    { term: 'Snapshot', meaning: 'An image of the chart saved automatically with a trade journal entry, so you can see exactly what the setup looked like later.' },
];

export default function HelpIndex() {
    const { theme } = useTheme();
    const isDark = theme === 'bg-skin-black';

    return (
        <>
            <Head title="How to use BacktradeLab" />
            <div className="mx-auto max-w-4xl space-y-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h1 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-slate-950'}`}>How to use BacktradeLab</h1>
                        <p className={`mt-1 text-sm ${isDark ? 'text-[#787b86]' : 'text-slate-500'}`}>
                            A step-by-step walkthrough from opening a chart to reviewing your results — no trading experience assumed.
                        </p>
                    </div>
                    <Link href="/workspace?tour=1" className="rounded-lg bg-[#2dd4bf] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#14b8a6]">
                        Restart workspace tour
                    </Link>
                </div>

                <div className={`flex items-start gap-3 rounded-lg border p-4 ${isDark ? 'border-[#2a2e39] bg-[#0b0e14]' : 'border-blue-100 bg-blue-50'}`}>
                    <LineChart className="mt-0.5 h-5 w-5 shrink-0 text-[#5eead4]" />
                    <p className={`text-sm leading-6 ${isDark ? 'text-[#b2b5be]' : 'text-slate-600'}`}>
                        Everything here uses <strong>Replay</strong>: historical price data played back candle by candle, and <strong>paper trades</strong> placed with virtual balance. Nothing you do on BacktradeLab risks or moves real money.
                    </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                    {steps.map(({ icon: Icon, title, summary, detail, cta }) => (
                        <section
                            key={title}
                            className={`flex flex-col rounded-lg border p-4 transition hover:-translate-y-0.5 hover:shadow-lg ${isDark ? 'border-[#2a2e39] bg-[#131722] hover:shadow-teal-950/20' : 'border-slate-200 bg-white hover:shadow-slate-200'}`}
                        >
                            <div className="flex items-center gap-2.5">
                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#2dd4bf]/15 text-[#5eead4]">
                                    <Icon size={16} />
                                </span>
                                <h2 className={`font-semibold ${isDark ? 'text-white' : 'text-slate-950'}`}>{title}</h2>
                            </div>
                            <p className={`mt-3 text-sm font-medium leading-5 ${isDark ? 'text-[#d1d4dc]' : 'text-slate-700'}`}>{summary}</p>
                            <p className={`mt-2 flex-1 text-sm leading-6 ${isDark ? 'text-[#b2b5be]' : 'text-slate-500'}`}>{detail}</p>
                            {cta && (
                                <Link href={cta.href} className="mt-3 inline-flex w-fit text-xs font-semibold text-[#5eead4] hover:underline">
                                    {cta.label} →
                                </Link>
                            )}
                        </section>
                    ))}
                </div>

                <section className={`rounded-lg border p-4 ${isDark ? 'border-[#2a2e39] bg-[#131722]' : 'border-slate-200 bg-white'}`}>
                    <div className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#2dd4bf]/15 text-[#5eead4]">
                            <HelpCircle size={16} />
                        </span>
                        <h2 className={`font-semibold ${isDark ? 'text-white' : 'text-slate-950'}`}>Key terms</h2>
                    </div>
                    <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                        {glossary.map(({ term, meaning }) => (
                            <div key={term}>
                                <dt className={`text-sm font-semibold ${isDark ? 'text-[#d1d4dc]' : 'text-slate-800'}`}>{term}</dt>
                                <dd className={`mt-0.5 text-sm leading-6 ${isDark ? 'text-[#b2b5be]' : 'text-slate-500'}`}>{meaning}</dd>
                            </div>
                        ))}
                    </dl>
                </section>

                <div className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4 ${isDark ? 'border-[#2a2e39] bg-[#0b0e14]' : 'border-slate-200 bg-slate-50'}`}>
                    <p className={`text-sm leading-6 ${isDark ? 'text-[#b2b5be]' : 'text-slate-600'}`}>
                        Still stuck, or ran into something that doesn't look right?
                    </p>
                    <Link href="/feedback" className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-xs font-semibold transition ${isDark ? 'border-[#2a2e39] text-white hover:bg-white/5' : 'border-slate-300 text-slate-800 hover:bg-slate-100'}`}>
                        <MessageSquarePlus size={14} />
                        Contact support
                    </Link>
                </div>
            </div>
        </>
    );
}

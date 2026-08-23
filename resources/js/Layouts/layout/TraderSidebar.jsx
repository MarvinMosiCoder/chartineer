import React from 'react';
import { Link, usePage } from '@inertiajs/react';
import { BarChart3, BookOpen, CandlestickChart, ChevronLeft, CircleHelp, CreditCard, KeyRound, LayoutDashboard, MessageSquarePlus, Share2, Target, UserRound } from 'lucide-react';
import { useSidebar } from '../../Context/SidebarContext';
import { useTheme } from '../../Context/ThemeContext';
import { useAnchoredTooltip, AnchoredTooltipPortal, IconTooltipButton } from '../../Components/Tooltip/AnchoredTooltip';

const items = [
    { label: 'Market Summary', href: '/market', icon: CandlestickChart },
    { label: 'Workspace', href: '/workspace', icon: LayoutDashboard },
    { label: 'Trade journal', href: '/trade-report', icon: BookOpen },
    { label: 'Mentor review', href: '/mentor-review', icon: Share2 },
    { label: 'Training challenges', href: '/training-challenges', icon: Target },
    { label: 'Subscription', href: '/subscription', icon: CreditCard },
    { label: 'Feedback & Customer Support', href: '/feedback', icon: MessageSquarePlus },
    { label: 'Profile', href: '/profile', icon: UserRound },
    { label: 'Change password', href: '/change_password', icon: KeyRound },
    { label: 'How to use', href: '/help', icon: CircleHelp },
];

// Nav items need their own anchored-tooltip instance each (hooks can't be
// called from inside the .map() callback in the parent), so this mirrors the
// shared pattern's non-button "manual wiring" case for the Inertia <Link>.
function SidebarNavLink({ href, label, Icon, active, isDark, isSidebarOpen, onNavigate }) {
    const { anchorRef, pos, show, hide } = useAnchoredTooltip('right');
    return (
        <span className="relative flex" onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
            <Link
                ref={anchorRef}
                href={href}
                onClick={onNavigate}
                className={`flex h-10 w-full items-center gap-3 rounded-md px-3 text-xs font-semibold transition ${
                    active
                        ? 'bg-[#2962ff] text-white shadow-[0_6px_20px_rgba(41,98,255,.22)]'
                        : isDark ? 'text-[#b2b5be] hover:bg-[#2a2e39] hover:text-white' : 'hover:bg-slate-100'
                }`}
            >
                <Icon size={17} className="shrink-0" />
                <span className={!isSidebarOpen ? 'lg:hidden' : ''}>{label}</span>
            </Link>
            <AnchoredTooltipPortal pos={pos} label={label} isDark={isDark} />
        </span>
    );
}

export default function TraderSidebar() {
    const { url } = usePage();
    const { isSidebarOpen, toggleSidebar } = useSidebar();
    const { theme } = useTheme();
    const isDark = theme === 'bg-skin-black';

    return (
        <>
        {isSidebarOpen && (
            <div
                className="fixed inset-0 top-14 z-[90] bg-black/50 lg:hidden"
                onClick={() => toggleSidebar(false)}
                aria-hidden="true"
            />
        )}
        <aside className={`${isSidebarOpen ? 'w-56' : 'w-0 lg:w-16'} fixed bottom-0 left-0 top-14 z-[100] shrink-0 overflow-hidden border-r transition-[width] duration-200 lg:relative lg:top-0 ${isDark ? 'border-[#2a2e39] bg-[#131722] text-[#d1d4dc]' : 'border-slate-200 bg-white text-slate-700'}`}>
            <div className="flex h-full w-56 flex-col p-2 lg:w-auto">
                <div className={`mb-2 flex items-center gap-2 rounded-md border px-3 py-2 ${isDark ? 'border-[#2a2e39] bg-[#0b0e14]' : 'border-slate-200 bg-slate-50'}`}>
                    <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,.7)]" />
                    <span className={`${!isSidebarOpen ? 'lg:hidden' : ''} text-[10px] font-semibold uppercase tracking-[0.16em] text-[#787b86]`}>Replay ready</span>
                </div>

                <nav className="space-y-1">
                    {items.map(({ label, href, icon: Icon }) => {
                        const active = url === href || (href === '/workspace' && url.startsWith('/workspace'));
                        return (
                            <SidebarNavLink
                                key={href}
                                href={href}
                                label={label}
                                Icon={Icon}
                                active={active}
                                isDark={isDark}
                                isSidebarOpen={isSidebarOpen}
                                onNavigate={() => window.innerWidth < 1024 && toggleSidebar(false)}
                            />
                        );
                    })}
                </nav>

                <div className={`mt-auto rounded-md border p-3 ${!isSidebarOpen ? 'lg:hidden' : ''} ${isDark ? 'border-[#2a2e39] bg-[#0b0e14]' : 'border-slate-200 bg-slate-50'}`}>
                    <div className="flex items-center gap-2 text-xs font-semibold"><BarChart3 size={15} className="text-[#2962ff]" /> Practice mode</div>
                    <p className="mt-1 text-[10px] leading-4 text-[#787b86]">Replay, execute, journal, and improve your process.</p>
                </div>

                <IconTooltipButton
                    label="Collapse navigation"
                    isDark={isDark}
                    onClick={() => toggleSidebar()}
                    className="mt-2 hidden h-8 items-center justify-center rounded-md text-[#787b86] hover:bg-white/10 lg:flex"
                >
                    <ChevronLeft size={16} className={!isSidebarOpen ? 'rotate-180' : ''} />
                </IconTooltipButton>
            </div>
        </aside>
        </>
    );
}

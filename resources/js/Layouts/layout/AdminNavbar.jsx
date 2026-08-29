import React, { useEffect, useState } from 'react';
import { Link, router, usePage } from '@inertiajs/react';
import axios from 'axios';
import { AlertTriangle, Bell, KeyRound, LayoutDashboard, LogOut, Menu, Moon, ShieldCheck, Sun, UserRound, Users, X } from 'lucide-react';
import getAppLogo from '../../Components/SystemSettings/ApplicationLogo';
import getAppName from '../../Components/SystemSettings/ApplicationName';
import AppNameWordmark from '../../Components/SystemSettings/AppNameWordmark';
import { useSidebar } from '../../Context/SidebarContext';
import { useProfile, useTheme } from '../../Context/ThemeContext';
import AvatarBadge from '../../Components/Profile/AvatarBadge';
import { getAvatarFromFileName } from '../../Components/Profile/avatarCatalog';
import getInitials from '../../utils/getInitials';
import colorMap from '../../Components/Notification/ColorMap';

export default function AdminNavbar() {
    const { auth } = usePage().props;
    const { toggleSidebar } = useSidebar();
    const { theme, setTheme } = useTheme();
    const { profile } = useProfile();
    const isDark = theme === 'bg-skin-black';
    const [logo, setLogo] = useState('');
    const [appName, setAppName] = useState('BacktradeLab');
    const [showLogoutModal, setShowLogoutModal] = useState(false);
    const [showModuleMenu, setShowModuleMenu] = useState(false);
    const [showNotifications, setShowNotifications] = useState(false);
    const [showProfileMenu, setShowProfileMenu] = useState(false);
    const [notifications, setNotifications] = useState([]);
    const [unreadNotifications, setUnreadNotifications] = useState(Number(auth?.unread_notifications) || 0);
    const displayIdentity = auth?.user?.username || auth?.user?.name || '';
    const navFileName = profile ?? auth?.profile?.file_name;
    const navAvatar = getAvatarFromFileName(navFileName);
    const navInitials = getInitials(displayIdentity);
    const navBackground = colorMap[navInitials.charAt(0)] || 'bg-slate-300';

    useEffect(() => { getAppLogo().then(setLogo); getAppName().then(setAppName); }, []);
    useEffect(() => {
        let stopped = false;
        const poll = async () => {
            try {
                const { data } = await axios.get('/notifications/feed');
                if (stopped) return;
                setUnreadNotifications(Number(data.unread_notifications) || 0);
                setNotifications(data.notifications ?? []);
            } catch {}
        };
        poll();
        const timer = window.setInterval(poll, 15000);
        return () => { stopped = true; window.clearInterval(timer); };
    }, []);
    const markNotificationRead = async (item) => {
        setShowNotifications(false);
        if (item.is_read) return;
        try {
            await axios.post('/notifications/read', { notification_id: item.id, source_type: 'notification' });
            setNotifications((current) => current.map((value) => value.id === item.id ? { ...value, is_read: true } : value));
            setUnreadNotifications((count) => Math.max(count - 1, 0));
        } catch {}
    };
    const dismissNotification = async (item) => {
        setNotifications((current) => current.filter((value) => value.id !== item.id));
        if (!item.is_read) setUnreadNotifications((count) => Math.max(count - 1, 0));
        try {
            await axios.post('/notifications/dismiss', { notification_id: item.id });
        } catch {}
    };
    const toggleTheme = () => {
        const nextTheme = isDark ? 'bg-skin-white' : 'bg-skin-black';
        setTheme(nextTheme);
        axios.post('/update-theme', { theme: nextTheme.replace('bg-', '') }).catch(() => {});
    };
    const logout = () => { setShowLogoutModal(false); router.post('/logout'); };
    const navLink = `flex h-8 items-center gap-2 rounded-md px-3 text-xs font-semibold transition ${isDark ? 'text-[#b2b5be] hover:bg-[#2a2e39] hover:text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`;

    return <header className={`flex h-14 items-center border-b px-3 sm:px-4 ${isDark ? 'border-[#2a2e39] bg-[#131722] text-[#d1d4dc]' : 'border-slate-200 bg-white text-slate-800'}`}>
        <button type="button" onClick={()=>toggleSidebar()} className={`mr-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${isDark?'text-[#b2b5be] hover:bg-[#2a2e39] hover:text-white':'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`} aria-label="Toggle admin sidebar" title="Toggle sidebar"><Menu size={20}/></button>
        <Link href="/dashboard" className="flex shrink-0 items-center gap-2 pr-4"><span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-md">{logo?<img src={logo} alt={appName} className="h-full w-full object-contain"/>:<ShieldCheck size={22} className="text-[#2dd4bf]"/>}</span><span className="hidden sm:block"><span className="block text-sm font-bold leading-none"><AppNameWordmark name={appName} /></span><span className="mt-1 block text-[9px] font-semibold uppercase tracking-[.2em] text-[#787b86]">Admin console</span></span></Link>
        <nav className="hidden items-center gap-1 lg:flex"><Link href="/dashboard" className={navLink}><LayoutDashboard size={14}/>Overview</Link><Link href="/users" className={navLink}><Users size={14}/>Users</Link></nav>
        <button type="button" onClick={()=>setShowModuleMenu((visible)=>!visible)} className={`ml-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-md border lg:hidden ${isDark?'border-[#434955] bg-[#2a2e39] text-white':'border-slate-300 bg-slate-100 text-slate-900'}`} aria-label={showModuleMenu ? 'Close admin module menu' : 'Open admin module menu'} aria-expanded={showModuleMenu}><Menu size={20}/></button>
        {showModuleMenu && <><button type="button" className="fixed inset-0 top-14 z-[190] bg-black/40 lg:hidden" onClick={()=>setShowModuleMenu(false)} aria-label="Close module menu"/><nav className={`fixed inset-x-2 top-16 z-[220] grid max-h-[calc(100dvh-5rem)] gap-1 overflow-y-auto rounded-xl border p-3 shadow-2xl sm:left-auto sm:right-3 sm:w-80 lg:hidden ${isDark?'border-[#2a2e39] bg-[#131722]':'border-slate-200 bg-white'}`} aria-label="Admin modules">{[["/dashboard",LayoutDashboard,"Overview"],["/users",Users,"Users"]].map(([href,Icon,label])=><Link key={href} href={href} onClick={()=>setShowModuleMenu(false)} className={`${navLink} h-11 text-sm`}><Icon size={17}/>{label}</Link>)}</nav></>}
        <div className={`ml-0 flex shrink-0 items-center gap-0.5 border-l pl-1 sm:gap-1 sm:pl-2 lg:ml-auto ${isDark?'border-[#2a2e39]':'border-slate-200'}`}><div className="relative"><button type="button" onClick={()=>setShowNotifications((current)=>!current)} className={`relative rounded-md p-2 transition ${showNotifications ? 'bg-[#2dd4bf]/15 text-[#5eead4]' : 'text-[#787b86] hover:bg-white/10'}`} title="Notifications" aria-label="Notifications" aria-expanded={showNotifications}><Bell size={16}/>{unreadNotifications>0&&<span className="absolute right-0 top-0 flex min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">{unreadNotifications>99?'99+':unreadNotifications}</span>}</button>{showNotifications && <div className={`absolute right-0 top-11 z-[230] w-[min(92vw,380px)] overflow-hidden rounded-xl border shadow-2xl ${isDark?'border-[#2a2e39] bg-[#131722]':'border-slate-200 bg-white'}`}><div className={`flex items-center justify-between border-b px-4 py-3 ${isDark?'border-[#2a2e39]':'border-slate-200'}`}><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/15 text-amber-400"><Bell size={18}/></span><div><div className="text-sm font-bold">Notifications</div><div className="text-[10px] uppercase tracking-wider text-[#787b86]">{unreadNotifications} unread</div></div></div><button type="button" onClick={()=>setShowNotifications(false)} className="rounded-md p-2 text-[#787b86] hover:bg-white/10 hover:text-current" aria-label="Close notifications"><X size={16}/></button></div><div className="max-h-[min(72vh,480px)] overflow-y-auto">{notifications.length ? notifications.map((item)=>{const rowWrapClass=`group flex w-full items-start gap-1 border-b pl-4 pr-2 transition last:border-0 ${isDark?'border-[#2a2e39] hover:bg-white/5':'border-slate-200 hover:bg-slate-50'} ${item.is_read?'opacity-70':'bg-[#2dd4bf]/5'}`;const rowContent=<><span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-400"><Bell size={14}/></span><span className="min-w-0 flex-1"><span className="block text-[10px] font-bold uppercase tracking-wider text-[#787b86]">{item.type}</span><span className={`mt-0.5 block text-xs leading-5 ${isDark?'text-[#d1d4dc]':'text-slate-700'}`}>{item.content}</span><span className="mt-1 block text-[10px] text-[#787b86]">{new Date(item.created_at).toLocaleString()}</span></span></>;const inner=item.url?<a href={item.url} onClick={()=>markNotificationRead(item)} className="flex flex-1 items-start gap-3 py-3 text-left">{rowContent}</a>:<button type="button" onClick={()=>markNotificationRead(item)} className="flex flex-1 items-start gap-3 py-3 text-left">{rowContent}</button>;return <div key={item.id} className={rowWrapClass}>{inner}<button type="button" onClick={(event)=>{event.preventDefault();event.stopPropagation();dismissNotification(item);}} className="mt-2.5 shrink-0 rounded-md p-1.5 text-[#787b86] opacity-0 transition hover:bg-white/10 hover:text-current group-hover:opacity-100" aria-label="Dismiss notification" title="Dismiss from this list"><X size={14}/></button></div>;}) : <div className="p-8 text-center text-xs text-[#787b86]">No notifications yet.</div>}</div><Link href="/notifications/view-all-notifications" onClick={()=>setShowNotifications(false)} className={`block border-t px-4 py-3 text-center text-xs font-semibold text-[#5eead4] hover:bg-white/5 ${isDark?'border-[#2a2e39]':'border-slate-200'}`}>View all notifications</Link></div>}</div><button type="button" onClick={toggleTheme} className="rounded-md p-2 text-[#787b86] hover:bg-white/10" aria-label="Toggle theme">{isDark?<Sun size={16}/>:<Moon size={16}/>}</button><div className="relative"><button type="button" onClick={()=>setShowProfileMenu((current)=>!current)} title="Account menu" aria-label="Account menu" aria-expanded={showProfileMenu} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-white/5"><span className={`h-8 w-8 shrink-0 overflow-hidden rounded-full border shadow-sm ${isDark ? 'border-[#2a2e39]' : 'border-slate-200'}`}>{navAvatar ? <AvatarBadge avatar={navAvatar} sizeClassName="text-sm"/> : <div className={`flex h-full w-full items-center justify-center ${navBackground} text-[10px] font-bold text-slate-800`}>{navInitials}</div>}</span><span className="hidden text-right sm:block"><span className="block max-w-32 truncate text-xs font-semibold">{displayIdentity}</span><span className="block text-[9px] uppercase tracking-wider text-[#787b86]">Superadmin</span></span></button>{showProfileMenu && <div className={`absolute right-0 top-11 z-[230] w-48 overflow-hidden rounded-xl border shadow-2xl ${isDark?'border-[#2a2e39] bg-[#131722]':'border-slate-200 bg-white'}`}><Link href="/profile" onClick={()=>setShowProfileMenu(false)} className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold transition-colors duration-200 ${isDark?'text-[#d1d4dc] hover:bg-white/5':'text-slate-700 hover:bg-slate-50'}`}><UserRound size={14}/>View profile</Link><Link href="/change_password" onClick={()=>setShowProfileMenu(false)} className={`flex items-center gap-2 border-t px-4 py-2.5 text-xs font-semibold transition-colors duration-200 ${isDark?'border-[#2a2e39] text-[#d1d4dc] hover:bg-white/5':'border-slate-200 text-slate-700 hover:bg-slate-50'}`}><KeyRound size={14}/>Change password</Link></div>}</div><button type="button" onClick={()=>setShowLogoutModal(true)} className="rounded-md p-2 text-[#787b86] hover:bg-red-500/10 hover:text-red-400" aria-label="Sign out"><LogOut size={16}/></button></div>
        {showLogoutModal&&<div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onMouseDown={(event)=>event.target===event.currentTarget&&setShowLogoutModal(false)}><div className={`w-full max-w-sm overflow-hidden rounded-xl border shadow-2xl ${isDark?'border-[#2a2e39] bg-[#131722] text-[#d1d4dc]':'border-slate-200 bg-white text-slate-900'}`} role="dialog" aria-modal="true" aria-labelledby="admin-logout-title"><div className={`flex items-center justify-between border-b px-5 py-4 ${isDark?'border-[#2a2e39]':'border-slate-200'}`}><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400"><AlertTriangle size={18}/></span><div><h2 id="admin-logout-title" className="text-sm font-bold">Sign out of admin console?</h2><p className="mt-0.5 text-[11px] text-[#787b86]">Your administrative session will end.</p></div></div><button type="button" onClick={()=>setShowLogoutModal(false)} className="rounded-md p-1.5 text-[#787b86] hover:bg-white/10" aria-label="Close"><X size={17}/></button></div><div className="px-5 py-4 text-xs leading-5 text-[#787b86]">You will need to authenticate again before managing users, feedback, settings, or system access.</div><div className={`flex justify-end gap-2 border-t px-5 py-4 ${isDark?'border-[#2a2e39]':'border-slate-200'}`}><button type="button" onClick={()=>setShowLogoutModal(false)} className={`h-9 rounded-md border px-4 text-xs font-semibold ${isDark?'border-[#2a2e39] hover:bg-white/5':'border-slate-200 hover:bg-slate-50'}`}>Stay signed in</button><button type="button" onClick={logout} className="flex h-9 items-center gap-2 rounded-md bg-red-500 px-4 text-xs font-bold text-white hover:bg-red-600"><LogOut size={14}/>Sign out</button></div></div></div>}
    </header>;
}

import React, { useEffect, useState } from 'react';
import { Link, router, usePage } from '@inertiajs/react';
import axios from 'axios';
import { AlertTriangle, Bell, ChevronDown, KeyRound, LogOut, Menu, Moon, ShieldCheck, Sun, UserRound, X } from 'lucide-react';
import getAppLogo from '../../Components/SystemSettings/ApplicationLogo';
import getAppName from '../../Components/SystemSettings/ApplicationName';
import AppNameWordmark from '../../Components/SystemSettings/AppNameWordmark';
import { useProfile, useTheme } from '../../Context/ThemeContext';
import AvatarBadge from '../../Components/Profile/AvatarBadge';
import { getAvatarFromFileName } from '../../Components/Profile/avatarCatalog';
import getInitials from '../../utils/getInitials';
import colorMap from '../../Components/Notification/ColorMap';

// The admin sidebar's own hardcoded first entry; it is not an adm_admin_menuses
// row, so it has to be carried across explicitly rather than coming from session
// data with the rest.
const SUPPORT_ITEM = { name: 'Customer Support', slug: 'admin/feedback', type: 'Route', icon: 'fa-solid fa-comments' };

const menuHref = (item) => '/' + String(item.slug ?? '').replace(/^\/+/, '');

export default function AdminNavbar() {
    const { auth, url } = usePage();
    const { theme, setTheme } = useTheme();
    const { profile } = useProfile();
    const isDark = theme === 'bg-skin-black';
    const [logo, setLogo] = useState('');
    const [appName, setAppName] = useState('BacktradeLab');
    const [showLogoutModal, setShowLogoutModal] = useState(false);
    const [showModuleMenu, setShowModuleMenu] = useState(false);
    const [openGroup, setOpenGroup] = useState(null);
    const [showMoreMenu, setShowMoreMenu] = useState(false);
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

    // Navigation is data-driven from the same session menus the sidebar read, so
    // an adm_menuses/adm_admin_menuses row still controls what appears here —
    // nothing about the menu tables changed, only where the tree is rendered.
    //
    // The tree is at most two levels deep in practice (a handful of `URL` group
    // parents with `Route` children), which is why a bar can hold it: flat MENU
    // entries stay inline, group parents become dropdowns, and the leftover
    // single admin routes collapse into "More".
    const userMenus = auth?.sessions?.user_menus ?? [];
    const adminMenus = auth?.sessions?.admin_menus ?? [];
    const isSuperadmin = Number(auth?.sessions?.admin_privileges) === 1;
    const adminEntries = isSuperadmin ? [SUPPORT_ITEM, ...adminMenus] : [];
    const groupEntries = adminEntries.filter((item) => item.type !== 'Route' && (item.children ?? []).length > 0);
    const singleEntries = adminEntries.filter((item) => item.type === 'Route');
    const overflowEntries = singleEntries;
    const isActive = (item) => url === menuHref(item) || url.startsWith(menuHref(item) + '/');
    const groupIsActive = (group) => (group.children ?? []).some(isActive);

    const closeMenus = () => { setOpenGroup(null); setShowMoreMenu(false); setShowModuleMenu(false); };

    // Same guarded-mousedown dismissal TraderNavbar and the chart header use:
    // ignore clicks that land inside a menu, close on everything else.
    useEffect(() => {
        if (openGroup === null && !showMoreMenu) return undefined;
        const handleOutsideClick = (event) => {
            if (event.target?.closest?.('[data-nav-menu]')) return;
            setOpenGroup(null);
            setShowMoreMenu(false);
        };
        document.addEventListener('mousedown', handleOutsideClick);
        return () => document.removeEventListener('mousedown', handleOutsideClick);
    }, [openGroup, showMoreMenu]);

    // A route change means the click already navigated; a menu left open over the
    // new page reads as a stuck overlay.
    useEffect(() => { closeMenus(); }, [url]);

    // Bar entries must never shrink or wrap: at lg the row holds roughly eight
    // of them between the logo and the account cluster, and letting flex squash
    // them mid-word looks broken long before it actually runs out of room.
    const barLink = `flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-[11px] font-semibold transition ${isDark ? 'text-[#b2b5be] hover:bg-[#2a2e39] hover:text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`;
    const menuItemClass = (active) => `flex h-9 items-center gap-2.5 rounded-md px-3 text-xs font-semibold transition ${active ? 'bg-[#2dd4bf] text-white' : isDark ? 'text-[#b2b5be] hover:bg-[#2a2e39] hover:text-white' : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'}`;
    const panelClass = `overflow-hidden rounded-xl border shadow-2xl ${isDark ? 'border-[#2a2e39] bg-[#131722]' : 'border-slate-200 bg-white'}`;
    const MenuIcon = ({ icon }) => <span className="flex h-5 w-5 shrink-0 items-center justify-center text-[12px] opacity-80"><i className={icon || 'fa-solid fa-circle-dot'}/></span>;

    return <header className={`flex h-14 items-center border-b px-3 sm:px-4 ${isDark ? 'border-[#2a2e39] bg-[#131722] text-[#d1d4dc]' : 'border-slate-200 bg-white text-slate-800'}`}>
        <Link href="/dashboard" className="flex shrink-0 items-center gap-2 pr-3"><span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-md">{logo?<img src={logo} alt={appName} className="h-full w-full object-contain"/>:<ShieldCheck size={22} className="text-[#2dd4bf]"/>}</span><span className="hidden sm:block"><span className="block text-sm font-bold leading-none"><AppNameWordmark name={appName} /></span><span className="mt-1 block text-[9px] font-semibold uppercase tracking-[.2em] text-[#787b86]">Admin console</span></span></Link>
        <nav className="hidden min-w-0 items-center gap-0.5 lg:flex" aria-label="Admin navigation">
            {userMenus.map((item) => <Link key={`menu-${item.id ?? item.name}`} href={menuHref(item)} className={`${barLink} ${isActive(item) ? 'bg-[#2dd4bf] text-white hover:bg-[#2dd4bf] hover:text-white' : ''}`}><MenuIcon icon={item.icon}/>{item.name}</Link>)}

            {groupEntries.length > 0 && <span className={`mx-1 h-5 w-px shrink-0 ${isDark ? 'bg-[#2a2e39]' : 'bg-slate-200'}`}/>}

            {groupEntries.map((group) => {
                const key = group.id ?? group.name;
                const open = openGroup === key;
                return <div key={`group-${key}`} data-nav-menu className="relative">
                    <button type="button" onClick={()=>setOpenGroup(open ? null : key)} aria-expanded={open} className={`${barLink} ${open || groupIsActive(group) ? 'bg-[#2dd4bf]/15 text-[#5eead4]' : ''}`}>
                        <MenuIcon icon={group.icon}/>{group.name}<ChevronDown size={13} className={`transition-transform ${open ? 'rotate-180' : ''}`}/>
                    </button>
                    {open && <div className={`absolute left-0 top-10 z-[230] w-60 p-1.5 ${panelClass}`}>
                        {(group.children ?? []).map((child) => <Link key={child.id ?? child.name} href={menuHref(child)} onClick={closeMenus} className={menuItemClass(isActive(child))}><MenuIcon icon={child.icon}/>{child.name}</Link>)}
                    </div>}
                </div>;
            })}

            {overflowEntries.length > 0 && <div data-nav-menu className="relative">
                <button type="button" onClick={()=>setShowMoreMenu((visible)=>!visible)} aria-expanded={showMoreMenu} className={`${barLink} ${showMoreMenu || overflowEntries.some(isActive) ? 'bg-[#2dd4bf]/15 text-[#5eead4]' : ''}`}>
                    More<ChevronDown size={13} className={`transition-transform ${showMoreMenu ? 'rotate-180' : ''}`}/>
                </button>
                {showMoreMenu && <div className={`absolute left-0 top-10 z-[230] w-60 p-1.5 ${panelClass}`}>
                    {overflowEntries.map((item) => <Link key={item.id ?? item.name} href={menuHref(item)} onClick={closeMenus} className={menuItemClass(isActive(item))}><MenuIcon icon={item.icon}/>{item.name}</Link>)}
                </div>}
            </div>}
        </nav>
        <button type="button" onClick={()=>setShowModuleMenu((visible)=>!visible)} className={`ml-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-md border lg:hidden ${isDark?'border-[#434955] bg-[#2a2e39] text-white':'border-slate-300 bg-slate-100 text-slate-900'}`} aria-label={showModuleMenu ? 'Close admin module menu' : 'Open admin module menu'} aria-expanded={showModuleMenu}><Menu size={20}/></button>
        {/* Below lg the whole tree becomes one sheet. Group parents render as
            labelled sections rather than nested dropdowns — there is vertical
            room here, so a second tap to reveal children would be pure friction. */}
        {showModuleMenu && <><button type="button" className="fixed inset-0 top-14 z-[190] bg-black/40 lg:hidden" onClick={()=>setShowModuleMenu(false)} aria-label="Close module menu"/><nav data-nav-menu className={`fixed inset-x-2 top-16 z-[220] grid max-h-[calc(100dvh-5rem)] gap-0.5 overflow-y-auto p-2 sm:left-auto sm:right-3 sm:w-80 lg:hidden ${panelClass}`} aria-label="Admin navigation">
            {userMenus.map((item) => <Link key={`m-menu-${item.id ?? item.name}`} href={menuHref(item)} onClick={closeMenus} className={`${menuItemClass(isActive(item))} h-11 text-sm`}><MenuIcon icon={item.icon}/>{item.name}</Link>)}

            {overflowEntries.length > 0 && <><div className={`mt-2 px-3 pb-1 text-[10px] font-bold uppercase tracking-[.16em] ${isDark ? 'text-[#787b86]' : 'text-slate-400'}`}>Admin</div>
            {overflowEntries.map((item) => <Link key={`m-single-${item.id ?? item.name}`} href={menuHref(item)} onClick={closeMenus} className={`${menuItemClass(isActive(item))} h-11 text-sm`}><MenuIcon icon={item.icon}/>{item.name}</Link>)}</>}

            {groupEntries.map((group) => <React.Fragment key={`m-group-${group.id ?? group.name}`}>
                <div className={`mt-2 px-3 pb-1 text-[10px] font-bold uppercase tracking-[.16em] ${isDark ? 'text-[#787b86]' : 'text-slate-400'}`}>{group.name}</div>
                {(group.children ?? []).map((child) => <Link key={child.id ?? child.name} href={menuHref(child)} onClick={closeMenus} className={`${menuItemClass(isActive(child))} h-11 text-sm`}><MenuIcon icon={child.icon}/>{child.name}</Link>)}
            </React.Fragment>)}
        </nav></>}
        <div className={`ml-0 flex shrink-0 items-center gap-0.5 border-l pl-1 sm:gap-1 sm:pl-2 lg:ml-auto ${isDark?'border-[#2a2e39]':'border-slate-200'}`}><div className="relative"><button type="button" onClick={()=>setShowNotifications((current)=>!current)} className={`relative rounded-md p-2 transition ${showNotifications ? 'bg-[#2dd4bf]/15 text-[#5eead4]' : 'text-[#787b86] hover:bg-white/10'}`} title="Notifications" aria-label="Notifications" aria-expanded={showNotifications}><Bell size={16}/>{unreadNotifications>0&&<span className="absolute right-0 top-0 flex min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">{unreadNotifications>99?'99+':unreadNotifications}</span>}</button>{showNotifications && <div className={`absolute right-0 top-11 z-[230] w-[min(92vw,380px)] overflow-hidden rounded-xl border shadow-2xl ${isDark?'border-[#2a2e39] bg-[#131722]':'border-slate-200 bg-white'}`}><div className={`flex items-center justify-between border-b px-4 py-3 ${isDark?'border-[#2a2e39]':'border-slate-200'}`}><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/15 text-amber-400"><Bell size={18}/></span><div><div className="text-sm font-bold">Notifications</div><div className="text-[10px] uppercase tracking-wider text-[#787b86]">{unreadNotifications} unread</div></div></div><button type="button" onClick={()=>setShowNotifications(false)} className="rounded-md p-2 text-[#787b86] hover:bg-white/10 hover:text-current" aria-label="Close notifications"><X size={16}/></button></div><div className="max-h-[min(72vh,480px)] overflow-y-auto">{notifications.length ? notifications.map((item)=>{const rowWrapClass=`group flex w-full items-start gap-1 border-b pl-4 pr-2 transition last:border-0 ${isDark?'border-[#2a2e39] hover:bg-white/5':'border-slate-200 hover:bg-slate-50'} ${item.is_read?'opacity-70':'bg-[#2dd4bf]/5'}`;const rowContent=<><span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-400"><Bell size={14}/></span><span className="min-w-0 flex-1"><span className="block text-[10px] font-bold uppercase tracking-wider text-[#787b86]">{item.type}</span><span className={`mt-0.5 block text-xs leading-5 ${isDark?'text-[#d1d4dc]':'text-slate-700'}`}>{item.content}</span><span className="mt-1 block text-[10px] text-[#787b86]">{new Date(item.created_at).toLocaleString()}</span></span></>;const inner=item.url?<a href={item.url} onClick={()=>markNotificationRead(item)} className="flex flex-1 items-start gap-3 py-3 text-left">{rowContent}</a>:<button type="button" onClick={()=>markNotificationRead(item)} className="flex flex-1 items-start gap-3 py-3 text-left">{rowContent}</button>;return <div key={item.id} className={rowWrapClass}>{inner}<button type="button" onClick={(event)=>{event.preventDefault();event.stopPropagation();dismissNotification(item);}} className="mt-2.5 shrink-0 rounded-md p-1.5 text-[#787b86] opacity-0 transition hover:bg-white/10 hover:text-current group-hover:opacity-100" aria-label="Dismiss notification" title="Dismiss from this list"><X size={14}/></button></div>;}) : <div className="p-8 text-center text-xs text-[#787b86]">No notifications yet.</div>}</div><Link href="/notifications/view-all-notifications" onClick={()=>setShowNotifications(false)} className={`block border-t px-4 py-3 text-center text-xs font-semibold text-[#5eead4] hover:bg-white/5 ${isDark?'border-[#2a2e39]':'border-slate-200'}`}>View all notifications</Link></div>}</div><button type="button" onClick={toggleTheme} className="rounded-md p-2 text-[#787b86] hover:bg-white/10" aria-label="Toggle theme">{isDark?<Sun size={16}/>:<Moon size={16}/>}</button><div className="relative"><button type="button" onClick={()=>setShowProfileMenu((current)=>!current)} title="Account menu" aria-label="Account menu" aria-expanded={showProfileMenu} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-white/5"><span className={`h-8 w-8 shrink-0 overflow-hidden rounded-full border shadow-sm ${isDark ? 'border-[#2a2e39]' : 'border-slate-200'}`}>{navAvatar ? <AvatarBadge avatar={navAvatar} sizeClassName="text-sm"/> : <div className={`flex h-full w-full items-center justify-center ${navBackground} text-[10px] font-bold text-slate-800`}>{navInitials}</div>}</span><span className="hidden text-right sm:block"><span className="block max-w-32 truncate text-xs font-semibold">{displayIdentity}</span><span className="block text-[9px] uppercase tracking-wider text-[#787b86]">Superadmin</span></span></button>{showProfileMenu && <div className={`absolute right-0 top-11 z-[230] w-48 overflow-hidden rounded-xl border shadow-2xl ${isDark?'border-[#2a2e39] bg-[#131722]':'border-slate-200 bg-white'}`}><Link href="/profile" onClick={()=>setShowProfileMenu(false)} className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold transition-colors duration-200 ${isDark?'text-[#d1d4dc] hover:bg-white/5':'text-slate-700 hover:bg-slate-50'}`}><UserRound size={14}/>View profile</Link><Link href="/change_password" onClick={()=>setShowProfileMenu(false)} className={`flex items-center gap-2 border-t px-4 py-2.5 text-xs font-semibold transition-colors duration-200 ${isDark?'border-[#2a2e39] text-[#d1d4dc] hover:bg-white/5':'border-slate-200 text-slate-700 hover:bg-slate-50'}`}><KeyRound size={14}/>Change password</Link></div>}</div><button type="button" onClick={()=>setShowLogoutModal(true)} className="rounded-md p-2 text-[#787b86] hover:bg-red-500/10 hover:text-red-400" aria-label="Sign out"><LogOut size={16}/></button></div>
        {showLogoutModal&&<div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onMouseDown={(event)=>event.target===event.currentTarget&&setShowLogoutModal(false)}><div className={`w-full max-w-sm overflow-hidden rounded-xl border shadow-2xl ${isDark?'border-[#2a2e39] bg-[#131722] text-[#d1d4dc]':'border-slate-200 bg-white text-slate-900'}`} role="dialog" aria-modal="true" aria-labelledby="admin-logout-title"><div className={`flex items-center justify-between border-b px-5 py-4 ${isDark?'border-[#2a2e39]':'border-slate-200'}`}><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400"><AlertTriangle size={18}/></span><div><h2 id="admin-logout-title" className="text-sm font-bold">Sign out of admin console?</h2><p className="mt-0.5 text-[11px] text-[#787b86]">Your administrative session will end.</p></div></div><button type="button" onClick={()=>setShowLogoutModal(false)} className="rounded-md p-1.5 text-[#787b86] hover:bg-white/10" aria-label="Close"><X size={17}/></button></div><div className="px-5 py-4 text-xs leading-5 text-[#787b86]">You will need to authenticate again before managing users, feedback, settings, or system access.</div><div className={`flex justify-end gap-2 border-t px-5 py-4 ${isDark?'border-[#2a2e39]':'border-slate-200'}`}><button type="button" onClick={()=>setShowLogoutModal(false)} className={`h-9 rounded-md border px-4 text-xs font-semibold ${isDark?'border-[#2a2e39] hover:bg-white/5':'border-slate-200 hover:bg-slate-50'}`}>Stay signed in</button><button type="button" onClick={logout} className="flex h-9 items-center gap-2 rounded-md bg-red-500 px-4 text-xs font-bold text-white hover:bg-red-600"><LogOut size={14}/>Sign out</button></div></div></div>}
    </header>;
}

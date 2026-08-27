import { Link, router } from '@inertiajs/react';
import React, { useEffect, useState } from 'react'
import useThemeStyles from '../../Hooks/useThemeStyles';
import { useTheme } from '../../Context/ThemeContext';
import { useSidebar } from '../../Context/SidebarContext';
import { useAnchoredTooltip, AnchoredTooltipPortal } from '../Tooltip/AnchoredTooltip';

const SidebarMenuCardMultiple = ({menuTitle = 'Sample Menu', icon = 'fa-solid fa-chart-simple', isMenuOpen , onMenuClick, onChildMenuClick, isMenuActive, isChildMenuActive, childMenus}) => {
    const {theme} = useTheme();
    const isDark = theme === 'bg-skin-black';
    const { isSidebarOpen } = useSidebar();
    const { anchorRef, pos, show, hide } = useAnchoredTooltip('right');
    const [loading, setLoading] = useState(false);
    router.on("start", () => setLoading(true));
    router.on("finish", () => setLoading(false));

    const { 
              sidebarHoverTextColor,
              sidebarHoverMenuBgColor, 
              sidebarHoverMenuBorderColor,
              sidebarActiveTextColor,
              sideBarTextColor,
              sidebarActiveMenuBgColor,
              sidebarActiveMenuBorderColor,
              sidebarBorderColor,
          } = useThemeStyles(theme);
      
  return (
    <div>
        {/* PARENT */}
        <div
            ref={anchorRef}
            tabIndex={0}
            className={`group flex h-10 cursor-pointer select-none items-center gap-2.5 overflow-hidden rounded-xl px-2.5 text-xs font-semibold transition-colors duration-200 ${isMenuActive ? 'bg-[#2dd4bf] text-white shadow-[0_6px_20px_rgba(45,212,191,.22)]' : theme === 'bg-skin-black' ? 'text-[#b2b5be] hover:bg-[#2a2e39] hover:text-white' : 'text-slate-700 hover:bg-slate-100'}`}
            onClick={onMenuClick}
            onMouseEnter={show}
            onMouseLeave={hide}
            onFocus={show}
            onBlur={hide}
        >
            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[13px] transition-colors duration-200 ${isMenuActive ? 'bg-white/15' : theme === 'bg-skin-black' ? 'bg-white/5 group-hover:bg-white/10' : 'bg-slate-100 group-hover:bg-slate-200'}`}>
                <i className={icon}></i>
            </span>
            <p className={`text-xs font-semibold text-nowrap flex-1 ${!isSidebarOpen ? 'hidden' : ''}`}>{menuTitle}</p>
            <div className={`w-4 h-4 items-center justify-center transition-transform duration-300 ${!isSidebarOpen ? 'hidden' : 'flex'} ${isMenuOpen ? '-rotate-180': ''}`}>
                <i className="fa-solid fa-caret-down text-[10px]"></i>
            </div>
            <AnchoredTooltipPortal pos={pos} label={menuTitle} isDark={isDark} />
        </div>
        {/* CHILD */}
        <div className={`${isMenuOpen && isSidebarOpen ? 'max-h-[100rem] opacity-100' : 'max-h-0 opacity-0'} flex flex-col space-y-1 overflow-hidden border-l ${isDark ? 'border-[#2a2e39]' : 'border-slate-200'} ml-6 pl-3 transition-all duration-300`}>
            {childMenus && childMenus.map((child_menu, index)=>{
                return <Link href={'/' + child_menu.slug}
                            onClick={(e) => {
                                if (loading) {
                                    e.preventDefault(); // Prevent navigation
                                    return;
                                }
                                onChildMenuClick(child_menu.name, menuTitle)
                            }}
                            key={child_menu.name + index}
                            className={`group flex min-h-9 items-center gap-2 rounded-lg px-2 text-[11px] font-medium transition-colors duration-200 first:mt-1 ${isChildMenuActive == child_menu.name ? 'bg-[#2dd4bf]/15 text-[#5eead4]' : theme === 'bg-skin-black' ? 'text-[#9598a1] hover:bg-[#2a2e39] hover:text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
                                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[9px] transition-colors duration-200 ${isChildMenuActive == child_menu.name ? 'bg-[#2dd4bf]/20' : isDark ? 'bg-white/5 group-hover:bg-white/10' : 'bg-slate-100 group-hover:bg-slate-200'}`}>
                                    <i className={child_menu.icon}></i>
                                </span>
                                <span className={`text-[11px] font-semibold flex-1 text-nowrap`}>{child_menu.name}</span>
                        </Link>
            })}
        </div>
    </div>
    
  )
}

export default SidebarMenuCardMultiple

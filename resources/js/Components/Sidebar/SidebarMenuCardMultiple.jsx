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
            className={`flex h-10 cursor-pointer select-none items-center overflow-hidden rounded-md px-3 text-xs font-semibold transition ${isMenuActive ? 'bg-[#2962ff] text-white shadow-[0_6px_20px_rgba(41,98,255,.22)]' : theme === 'bg-skin-black' ? 'text-[#b2b5be] hover:bg-[#2a2e39] hover:text-white' : 'text-slate-700 hover:bg-slate-100'}`}
            onClick={onMenuClick}
            onMouseEnter={show}
            onMouseLeave={hide}
            onFocus={show}
            onBlur={hide}
        >
            <div className='w-5 h-5  flex items-center justify-center mr-2 flex-shrink-0'>
                <i className={icon}></i>
            </div>
            <p className={`text-xs font-semibold text-nowrap flex-1 ${!isSidebarOpen ? 'hidden' : ''}`}>{menuTitle}</p>
            <div className={`w-5 h-5 items-center justify-center transition-full duration-300 ${!isSidebarOpen ? 'hidden' : 'flex'} ${isMenuOpen ? '-rotate-180': ''}`}>
                <i className="fa-solid fa-caret-down text-xs"></i>
            </div>
            <AnchoredTooltipPortal pos={pos} label={menuTitle} isDark={isDark} />
        </div>
        {/* CHILD */}
        <div className={`${isMenuOpen && isSidebarOpen ? 'max-h-[100rem] opacity-100' : 'max-h-0 opacity-0'} flex flex-col space-y-1 overflow-hidden border-l border-[#2a2e39] ml-5 pl-2 transition-all duration-300`}>
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
                            className={`flex min-h-9 items-center rounded-md px-2 text-[11px] font-medium first:mt-1 ${isChildMenuActive == child_menu.name ? 'bg-[#2962ff]/20 text-[#5b8cff]' : theme === 'bg-skin-black' ? 'text-[#9598a1] hover:bg-[#2a2e39] hover:text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
                                <div className='w-5 h-5 flex items-center justify-center mr-1 flex-shrink-0'>
                                    <i className={`${child_menu.icon} text-[9px]`}></i>
                                </div>
                                <span className={`text-[11px] font-semibold flex-1 text-nowrap`}>{child_menu.name}</span>
                        </Link>
            })}
        </div>
    </div>
    
  )
}

export default SidebarMenuCardMultiple

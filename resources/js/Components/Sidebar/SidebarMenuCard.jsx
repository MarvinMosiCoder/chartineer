import { Link, router } from '@inertiajs/react';
import React, { useState } from 'react';
import useThemeStyles from '../../Hooks/useThemeStyles';
import { useTheme } from '../../Context/ThemeContext';
import { useSidebar } from '../../Context/SidebarContext';
import { useAnchoredTooltip, AnchoredTooltipPortal } from '../Tooltip/AnchoredTooltip';

const SidebarMenuCard = ({
  menuTitle = 'Sample Menu',
  icon = 'fa-solid fa-chart-simple',
  href,
  isMenuActive,
  onClick,
  setActiveChildMenu,
}) => {
  const { theme } = useTheme();
  const { isSidebarOpen } = useSidebar();
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

  const [loading, setLoading] = useState(false);
  const isDark = theme === 'bg-skin-black';
  const { anchorRef, pos, show, hide } = useAnchoredTooltip('right');

  // Handle the click event to prevent double-clicks
  const handleClick = (e) => {
    if (loading) {
      e.preventDefault(); // Prevent default navigation behavior
      e.stopPropagation(); // Stop event propagation to avoid firing multiple clicks
      return;
    }

    setLoading(true); // Lock the link before navigation

    // Run the menu click handler and reset child menu
    onClick?.();
    setActiveChildMenu?.(null);

    // Set loading to false after a short delay (simulate page load)
    setTimeout(() => {
      setLoading(false);
    }, 1000); // Adjust the delay as needed to match your loading experience
  };

  return (
    <span className="relative flex" onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
      <Link
        ref={anchorRef}
        onClick={handleClick}
        disabled={true}
        href={'/' + href}
        className={`flex h-10 w-full cursor-pointer select-none items-center overflow-hidden rounded-md px-3 text-xs font-semibold transition ${isMenuActive ? 'bg-[#2962ff] text-white shadow-[0_6px_20px_rgba(41,98,255,.22)]' : theme === 'bg-skin-black' ? 'text-[#b2b5be] hover:bg-[#2a2e39] hover:text-white' : 'text-slate-700 hover:bg-slate-100'}`}
      >
        <div className="w-5 h-5 flex items-center justify-center mr-2 flex-shrink-0">
          <i className={icon}></i>
        </div>
        <p className={`flex-shrink-0 text-xs font-semibold ${!isSidebarOpen ? 'hidden' : ''}`}>{menuTitle}</p>
      </Link>
      <AnchoredTooltipPortal pos={pos} label={menuTitle} isDark={isDark} />
    </span>
  );
};

export default SidebarMenuCard;

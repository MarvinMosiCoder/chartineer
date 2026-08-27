import React from "react";
import { Link } from "@inertiajs/react";
import { useTheme } from "../../Context/ThemeContext";

const Card = ({ children, headerName, description, iconClass, marginBottom, loading, withButton, onClick, href, themeHead }) => {
    const { theme } = useTheme();
    const isDark = theme === 'bg-skin-black';
    const headerBgClass = themeHead || (isDark ? 'bg-white/5' : 'bg-slate-50');
    const iconChipClass = themeHead
        ? (isDark ? 'bg-white/10' : 'bg-black/10')
        : (isDark ? 'bg-white/5 text-[#b2b5be]' : 'bg-white text-slate-600');

    return (
        <div className={`flex w-full flex-col overflow-hidden rounded-2xl border shadow-sm mb-${marginBottom} ${isDark ? 'border-[#2a2e39] bg-[#131722]' : 'border-slate-200 bg-white'}`}>
            <div className={`flex items-center gap-3 border-b px-5 py-4 ${isDark ? 'border-[#2a2e39]' : 'border-slate-200'} ${headerBgClass}`}>
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[15px] ${iconChipClass}`}>
                    <i className={iconClass}></i>
                </span>
                <div>
                    <p className={`text-sm font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{headerName}</p>
                    {description && <p className={`mt-0.5 text-xs ${isDark ? 'text-[#9598a1]' : 'text-slate-500'}`}>{description}</p>}
                </div>
            </div>
            <div className="p-5">
                {children}
            </div>
            {withButton && (
                <div className={`flex items-center justify-between gap-2 border-t px-5 py-4 ${isDark ? 'border-[#2a2e39]' : 'border-slate-200'}`}>
                    <Link
                        href={href}
                        className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-xs font-semibold transition-colors duration-200 ${isDark ? 'border-[#2a2e39] text-[#b2b5be] hover:bg-white/5' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                    >
                        <i className="fa fa-times-circle"></i> Cancel
                    </Link>
                    <button
                        type="button"
                        disabled={loading}
                        onClick={onClick}
                        className="flex items-center gap-2 rounded-lg bg-[#2dd4bf] px-4 py-2 text-xs font-bold text-white transition-colors duration-200 hover:bg-[#14b8a6] disabled:opacity-50"
                    >
                        <i className="fa fa-save"></i> {loading ? "Saving..." : "Save"}
                    </button>
                </div>
            )}
        </div>
    );
};

export default Card;

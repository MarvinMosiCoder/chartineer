import React, { Fragment } from "react";
import { Link } from "@inertiajs/react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import useViewport from "../../Hooks/useViewport";
import { useTheme } from "../../Context/ThemeContext";

const Pagination = ({ paginate, onClick, extendClass }) => {
    const { width } = useViewport();
    const mobileView = width < 640 ? true : false;
    const { theme: activeTheme } = useTheme();
    const isDark = (extendClass ?? activeTheme) === 'bg-skin-black';
    const muted = isDark ? 'text-[#787b86]' : 'text-slate-500';
    const border = isDark ? 'border-[#2a2e39]' : 'border-slate-200';
    const navBtn = `flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${border} ${isDark ? 'text-[#d1d4dc] hover:bg-white/5' : 'text-slate-700 hover:bg-slate-100'}`;

    return (
        <div onClick={onClick} className={`mt-3 flex w-full items-center justify-between gap-2 text-xs ${muted}`}>
            {mobileView ? (
                <>
                    {paginate.prev_page_url ? (
                        <Link href={paginate.prev_page_url} preserveState preserveScroll className={navBtn}>
                            <ChevronLeft size={14}/> Previous
                        </Link>
                    ) : (
                        <span className={navBtn} aria-disabled="true"><ChevronLeft size={14}/> Previous</span>
                    )}

                    {paginate.next_page_url ? (
                        <Link href={paginate.next_page_url} preserveState preserveScroll className={navBtn}>
                            Next <ChevronRight size={14}/>
                        </Link>
                    ) : (
                        <span className={navBtn} aria-disabled="true">Next <ChevronRight size={14}/></span>
                    )}
                </>
            ) : (
                <>
                    <span className="font-medium">
                        {paginate.data.length != 0
                            ? `Showing ${paginate.from} to ${paginate.to} of ${paginate.total} results.`
                            : `Showing 0 results.`}
                    </span>

                    <nav className="flex items-center gap-1">
                        {paginate.links.map((link, index) => {
                            const isFirst = index === 0;
                            const isLast = index === paginate.links.length - 1;
                            const label = isFirst ? <ChevronLeft size={14}/> : isLast ? <ChevronRight size={14}/> : link.label;
                            const baseClass = `flex h-8 min-w-8 items-center justify-center rounded-lg border px-2 text-xs font-semibold transition ${border}`;
                            const activeClass = link.active ? 'bg-[#2dd4bf] text-white border-[#2dd4bf]' : isDark ? 'text-[#d1d4dc] hover:bg-white/5' : 'text-slate-700 hover:bg-slate-100';

                            return (
                                <Fragment key={"page" + link.label + 'index' + index}>
                                    {link.url ? (
                                        <Link href={link.url} preserveScroll preserveState className={`${baseClass} ${activeClass}`}>
                                            {label}
                                        </Link>
                                    ) : (
                                        <span className={`${baseClass} ${activeClass} cursor-not-allowed opacity-40`}>
                                            {label}
                                        </span>
                                    )}
                                </Fragment>
                            );
                        })}
                    </nav>
                </>
            )}
        </div>
    );
};

export default Pagination;

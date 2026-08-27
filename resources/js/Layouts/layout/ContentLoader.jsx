import React, { useEffect, useState } from "react";
import { router } from "@inertiajs/react";
import { useTheme } from "../../Context/ThemeContext";

// Same candlestick-bar animation as the boot splash (resources/views/app.blade.php,
// resources/css/boot-splash.css), scoped to the main content area for every
// Inertia page navigation. Positioned by the relative wrapper in layout.jsx, so
// it never covers the fixed navbar or the sidebar. Runs alongside the existing
// NProgress top bar (AppInitializer.jsx) rather than replacing it.
const NAV_SHOW_DELAY_MS = 150;

const BAR_HEIGHTS = [18, 34, 46, 26, 38];
const BAR_DELAYS = [0, 0.15, 0.3, 0.45, 0.6];

const ContentLoader = () => {
    const { theme } = useTheme();
    const isDark = theme === "bg-skin-black";
    const [isNavigating, setIsNavigating] = useState(false);

    useEffect(() => {
        let showTimeout;

        const unlistenStart = router.on("start", () => {
            showTimeout = setTimeout(() => setIsNavigating(true), NAV_SHOW_DELAY_MS);
        });

        const unlistenFinish = router.on("finish", () => {
            clearTimeout(showTimeout);
            setIsNavigating(false);
        });

        return () => {
            clearTimeout(showTimeout);
            unlistenStart();
            unlistenFinish();
        };
    }, []);

    if (!isNavigating) return null;

    return (
        <div
            className={`absolute inset-0 z-[140] flex items-center justify-center backdrop-blur-sm ${isDark ? "bg-[#070a10]/90" : "bg-slate-100/90"}`}
            role="status"
            aria-label="Loading"
        >
            <div className="flex items-end gap-1.5" style={{ height: 46 }}>
                {BAR_HEIGHTS.map((height, i) => (
                    <span
                        key={i}
                        className="w-1.5 animate-candlePulse motion-reduce:animate-none rounded-sm bg-[#2dd4bf] shadow-[0_0_8px_rgba(45,212,191,0.7)]"
                        style={{ height, animationDelay: `${BAR_DELAYS[i]}s` }}
                    />
                ))}
            </div>
        </div>
    );
};

export default ContentLoader;

import React, { useState } from 'react';
import { Link } from '@inertiajs/react';
import { Cookie } from 'lucide-react';

export const COOKIE_NOTICE_STORAGE_KEY = 'backtradelab-cookie-notice:v1';

const shouldShowNotice = () => {
    if (typeof window === 'undefined') return false;

    try {
        return window.localStorage.getItem(COOKIE_NOTICE_STORAGE_KEY) !== 'acknowledged';
    } catch {
        return true;
    }
};

export default function CookieNotice() {
    const [isVisible, setIsVisible] = useState(shouldShowNotice);

    const dismiss = () => {
        setIsVisible(false);

        try {
            window.localStorage.setItem(COOKIE_NOTICE_STORAGE_KEY, 'acknowledged');
        } catch {
            // The notice stays dismissed for this page session when storage is unavailable.
        }
    };

    if (!isVisible) return null;

    return (
        <aside
            className="fixed inset-x-3 bottom-3 z-[9999] mx-auto max-w-4xl rounded-xl border border-[#2a2e39] bg-[#131722] p-4 text-white shadow-2xl sm:inset-x-6 sm:bottom-6 sm:flex sm:items-center sm:gap-5 sm:p-5"
            role="region"
            aria-label="Cookie notice"
        >
            <div className="flex min-w-0 flex-1 gap-3">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#2dd4bf]/15 text-[#5eead4]" aria-hidden="true">
                    <Cookie size={18} />
                </span>
                <div>
                    <h2 className="text-sm font-bold">Essential cookies and local storage</h2>
                    <p className="mt-1 text-xs leading-5 text-[#b2b5be] sm:text-sm">
                        BacktradeLab uses essential cookies for secure sessions and functional local storage to remember your preferences. We do not use advertising or analytics cookies.{' '}
                        <Link href="/privacy-policy" className="font-semibold text-[#5eead4] underline-offset-2 hover:underline">
                            Read our Privacy Policy
                        </Link>
                        .
                    </p>
                </div>
            </div>
            <button
                type="button"
                onClick={dismiss}
                className="mt-4 h-10 w-full shrink-0 rounded-lg bg-[#2dd4bf] px-5 text-sm font-bold text-white transition hover:bg-[#14b8a6] sm:mt-0 sm:w-auto"
            >
                Got it
            </button>
        </aside>
    );
}

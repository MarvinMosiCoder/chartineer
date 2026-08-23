import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, X, XCircle } from "lucide-react";
import { useTheme } from "../../Context/ThemeContext";
import CapitalizeFirstLetter from "../../Utilities/CapitalizeFirstLetter";

// Fixed, top-right, non-blocking — the now-standard toast position/behavior
// (react-toastify, sonner, etc.), replacing the old design where this
// rendered inline at the top of #content-area and relied on scrollIntoView()
// to be seen at all. `displayed` is a locally-held copy of the last real
// toast so the exit transition has content to animate out; ToastContext's
// own `message` already went back to "" by the time that transition starts.
const TOAST_TRANSITION_MS = 220;

const DissapearingToast = ({ type, message, onDismiss }) => {
    const { theme } = useTheme();
    const isDark = theme === "bg-skin-black";
    const [visible, setVisible] = useState(false);
    const [displayed, setDisplayed] = useState({ type: "", message: "" });
    const clearTimeoutRef = useRef(null);

    useEffect(() => {
        if (message) {
            if (clearTimeoutRef.current) {
                clearTimeout(clearTimeoutRef.current);
                clearTimeoutRef.current = null;
            }
            setDisplayed({ type, message });
            const raf = requestAnimationFrame(() => setVisible(true));
            return () => cancelAnimationFrame(raf);
        }

        setVisible(false);
        clearTimeoutRef.current = setTimeout(() => {
            setDisplayed({ type: "", message: "" });
            clearTimeoutRef.current = null;
        }, TOAST_TRANSITION_MS);
        return () => clearTimeout(clearTimeoutRef.current);
    }, [message, type]);

    if (!displayed.message) return null;

    const isSuccess = displayed.type === "success";

    // Portaled to document.body — same reasoning as this app's other
    // floating overlays (useConfirm()'s modal, watchlist modals): a plain
    // inline-rendered `fixed` element is only guaranteed to sit relative to
    // the viewport if no ancestor happens to establish its own containing
    // block (a transform/filter/perspective anywhere above it in the tree),
    // and this component is mounted deep inside the authenticated layout
    // rather than at the document root.
    return typeof document !== "undefined" ? createPortal(
        <div
            role="status"
            aria-live="polite"
            className={`fixed right-4 top-20 left-4 sm:left-auto z-[10070] w-auto sm:w-full sm:max-w-sm transition-all ease-out ${
                visible ? "translate-x-0 opacity-100" : "translate-x-4 opacity-0"
            }`}
            style={{ transitionDuration: `${TOAST_TRANSITION_MS}ms` }}
        >
            <div
                className={`flex items-start gap-3 rounded-xl border p-3.5 shadow-2xl backdrop-blur-sm ${
                    isDark ? "border-[#2a2e39] bg-[#131722]/95 text-white" : "border-slate-200 bg-white/95 text-slate-900"
                }`}
            >
                <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                        isSuccess ? "bg-emerald-500/15 text-emerald-500" : "bg-red-500/15 text-red-500"
                    }`}
                >
                    {isSuccess ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
                </span>
                <div className="min-w-0 flex-1 pt-0.5">
                    <p className="text-[13px] font-bold">{CapitalizeFirstLetter(displayed.type || (isSuccess ? "success" : "error"))}</p>
                    <p className={`mt-0.5 break-words text-[13px] leading-5 ${isDark ? "text-[#b2b5be]" : "text-slate-600"}`}>{displayed.message}</p>
                </div>
                <button
                    type="button"
                    onClick={onDismiss}
                    aria-label="Dismiss notification"
                    className={`shrink-0 rounded p-1 ${isDark ? "text-[#787b86] hover:bg-white/10 hover:text-white" : "text-slate-400 hover:bg-slate-100 hover:text-slate-700"}`}
                >
                    <X size={15} />
                </button>
            </div>
        </div>,
        document.body
    ) : null;
};

export default DissapearingToast;

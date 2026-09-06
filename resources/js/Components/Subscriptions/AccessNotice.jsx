import React from 'react';
import { AlertTriangle, ArrowRight, Lock, Sparkles } from 'lucide-react';
import { isGatedError } from './accessError';

/**
 * The single error surface for anything gated by a subscription tier.
 *
 * A plain string renders the ordinary red bar these call sites already had,
 * now with an icon. A gated error renders a locked state instead: what is
 * locked, which plan unlocks it, and a way to get there — a bare
 * "Your replay access has expired." leaves the user with no next step, which
 * is the whole reason this component exists.
 */
export default function AccessNotice({ error, isDark = true, className = '', feature }) {
    if (!error) return null;

    if (!isGatedError(error)) {
        return (
            <div className={`flex items-start gap-2 rounded-md border px-3 py-2 text-xs ${isDark ? 'border-red-900 bg-red-950/60 text-red-200' : 'border-red-200 bg-red-50 text-red-700'} ${className}`}>
                <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                <span className="min-w-0">{typeof error === 'string' ? error : error.message}</span>
            </div>
        );
    }

    const { message, requiredTierName, trialAvailable, code, limit } = error;
    const quota = code === 'tier_quota_reached';

    const heading = trialAvailable
        ? 'Start your free 7-day trial'
        : quota
            ? "You've reached your plan's limit"
            : requiredTierName
                ? `Included with ${requiredTierName}`
                : 'Subscription required';

    // Say what they get, not just what they lack.
    const detail = trialAvailable
        ? `Activate your free week to unlock ${feature || 'this feature'} — no payment required.`
        : quota
            ? `${requiredTierName ? `The ${requiredTierName} plan raises this limit.` : 'Upgrade to raise this limit.'}`
            : `Subscribe to unlock ${feature || 'this feature'}${requiredTierName ? ` with the ${requiredTierName} plan` : ''}.`;

    const cta = trialAvailable ? 'Start free trial' : requiredTierName ? `Get ${requiredTierName}` : 'View plans';

    const shell = isDark
        ? 'border-[#2dd4bf]/30 bg-[#2dd4bf]/[0.06] text-[#d1d4dc]'
        : 'border-teal-200 bg-teal-50 text-slate-700';
    const mutedClass = isDark ? 'text-[#9598a1]' : 'text-slate-500';

    return (
        <div className={`rounded-lg border p-3 ${shell} ${className}`}>
            <div className="flex items-start gap-3">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${isDark ? 'bg-[#2dd4bf]/15 text-[#5eead4]' : 'bg-teal-100 text-teal-700'}`}>
                    {trialAvailable ? <Sparkles size={17} aria-hidden="true" /> : <Lock size={17} aria-hidden="true" />}
                </span>
                <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold">{heading}</div>
                    <p className={`mt-0.5 text-xs leading-5 ${mutedClass}`}>{detail}</p>
                    {/* The server's own wording, kept so the reason stays visible
                        (expired vs. never subscribed vs. over quota) under the CTA. */}
                    <p className={`mt-1 text-[11px] ${mutedClass}`}>
                        {message}{quota && limit !== null ? ` (limit ${limit})` : ''}
                    </p>
                    <a
                        href="/subscription"
                        className="mt-2.5 inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#2dd4bf] px-3 text-xs font-bold text-white transition hover:bg-teal-500"
                    >
                        {cta}
                        <ArrowRight size={14} aria-hidden="true" />
                    </a>
                </div>
            </div>
        </div>
    );
}

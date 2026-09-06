import React from 'react';
import { Lock } from 'lucide-react';

const TIER_NAMES = { 1: 'Starter', 2: 'Pro', 3: 'Elite' };

/**
 * Placeholder shown where a paid capability would have rendered.
 *
 * The server omits withheld analytics from the report payload entirely rather
 * than sending them and letting the client hide them, so this is genuinely all
 * there is to draw — there is no hidden data behind it to leak.
 */
export default function TierLockedPanel({
    title,
    description,
    requiredTier,
    requiredTierName,
    isDark = true,
    className = '',
}) {
    const tierName = requiredTierName || TIER_NAMES[requiredTier] || 'a paid';
    const shellClass = isDark
        ? 'border-white/10 bg-white/[0.03] text-gray-300'
        : 'border-gray-200 bg-gray-50 text-gray-600';
    const titleClass = isDark ? 'text-gray-100' : 'text-gray-900';
    const mutedClass = isDark ? 'text-gray-400' : 'text-gray-500';

    return (
        <div className={`rounded-lg border border-dashed p-4 ${shellClass} ${className}`}>
            <div className="flex items-start gap-3">
                <Lock size={16} className={`mt-0.5 shrink-0 ${mutedClass}`} aria-hidden="true" />
                <div className="min-w-0">
                    <div className={`text-xs font-semibold uppercase tracking-wide ${titleClass}`}>{title}</div>
                    {description && <p className={`mt-1 text-xs ${mutedClass}`}>{description}</p>}
                    <a
                        href="/subscription"
                        className="mt-2 inline-flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-blue-500"
                    >
                        Unlock with {tierName}
                    </a>
                </div>
            </div>
        </div>
    );
}

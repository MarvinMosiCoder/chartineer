import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';

/**
 * Reads the authenticated user's subscription tier and capability list.
 *
 * The payload comes from `/replay-access`, which builds it from the same
 * `config/subscription_tiers.php` map the server enforces with — the frontend
 * never derives a tier from plan codes, so what the UI unlocks and what the
 * API allows cannot drift apart.
 *
 * This is presentation only. Every capability is enforced server-side; hiding a
 * control here is a courtesy, never the security boundary.
 */

const EMPTY = { tier: 0, tierName: null, capabilities: [], limits: {} };

// Module-level cache so a page rendering several gated components makes one
// request rather than one per component.
let cache = null;
let inFlight = null;
const subscribers = new Set();

function publish(next) {
    cache = next;
    subscribers.forEach((notify) => notify(next));
}

function load(force = false) {
    if (cache && !force) return Promise.resolve(cache);
    if (inFlight) return inFlight;

    inFlight = axios
        .get('/replay-access')
        .then((response) => {
            const payload = response.data?.entitlements ?? EMPTY;
            publish({
                tier: Number(payload.tier ?? 0),
                tierName: payload.tierName ?? null,
                capabilities: Array.isArray(payload.capabilities) ? payload.capabilities : [],
                limits: payload.limits ?? {},
            });
            return cache;
        })
        .catch(() => {
            // A failed lookup must not unlock anything: fall back to no access.
            publish(EMPTY);
            return cache;
        })
        .finally(() => {
            inFlight = null;
        });

    return inFlight;
}

/** Clears the cache after a purchase or trial activation changes the tier. */
export function refreshEntitlements() {
    return load(true);
}

export default function useEntitlements() {
    const [state, setState] = useState(cache ?? EMPTY);
    const [loading, setLoading] = useState(!cache);

    useEffect(() => {
        let active = true;
        const notify = (next) => {
            if (active) setState(next);
        };
        subscribers.add(notify);

        if (!cache) {
            load().finally(() => {
                if (active) setLoading(false);
            });
        }

        return () => {
            active = false;
            subscribers.delete(notify);
        };
    }, []);

    const can = useCallback(
        (capability) => state.capabilities.includes(capability),
        [state.capabilities]
    );
    const tierAtLeast = useCallback((level) => state.tier >= Number(level), [state.tier]);
    const limit = useCallback((key) => state.limits?.[key] ?? null, [state.limits]);

    return {
        tier: state.tier,
        tierName: state.tierName,
        capabilities: state.capabilities,
        can,
        tierAtLeast,
        limit,
        loading,
        refresh: refreshEntitlements,
    };
}

import React, { useEffect, useRef, useState } from 'react';
import { Link } from '@inertiajs/react';
import api, { errorMessage } from './api';
import { PrimaryButton, SecondaryButton } from './ui';
import { shortAddress, tokens } from './format';
import { Panel } from './ReportView';

const supported = () => typeof window !== 'undefined' && 'Notification' in window;
const who = alert => alert.wallet_label || (alert.wallet_list === 'good_dev' ? 'Good dev' : 'Watched wallet');

export default function WatchAlerts() {
    const [status, setStatus] = useState(null);
    const [alerts, setAlerts] = useState(null);
    const [unseen, setUnseen] = useState(0);
    const [error, setError] = useState('');
    const [checking, setChecking] = useState(false);
    const [result, setResult] = useState(null);
    const [permission, setPermission] = useState(supported() ? Notification.permission : 'unsupported');
    const known = useRef(null);
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        let active = true;
        let timer;
        const controller = new AbortController();
        async function refresh() {
            try {
                const [watch, feed] = await Promise.all([
                    api.get('/memecoin/watch', { signal: controller.signal, timeout: 15000 }),
                    api.get('/memecoin/alerts', { signal: controller.signal, timeout: 15000 }),
                ]);
                if (!active) return;
                const fresh = feed.data.alerts;
                if (known.current && supported() && Notification.permission === 'granted') {
                    for (const alert of fresh.filter(item => !item.seen && !known.current.has(item.id))) {
                        try { new Notification(`${who(alert)} gained ${tokens(alert.amount)} tokens`, { body: alert.mint }); } catch {}
                    }
                }
                known.current = new Set(fresh.map(item => item.id));
                setStatus(watch.data);
                setChecking(Boolean(watch.data.checking));
                if (!watch.data.checking && watch.data.last_result) setResult(watch.data.last_result);
                setAlerts(fresh);
                setUnseen(feed.data.unseen);
                setError('');
            } catch (err) {
                if (active) setError(errorMessage(err, 'Could not load wallet alerts.'));
            } finally {
                if (active) timer = setTimeout(refresh, 10000);
            }
        }
        refresh();
        return () => { active = false; controller.abort(); clearTimeout(timer); };
    }, [attempt]);

    async function checkNow() {
        setChecking(true);
        setError('');
        try {
            const response = await api.post('/memecoin/watch/check');
            setResult(response.data);
            setAttempt(value => value + 1);
        } catch (err) {
            setChecking(false);
            setError(errorMessage(err, 'The scan could not be queued. Try again.'));
        }
    }

    async function markSeen() {
        try {
            await api.post('/memecoin/alerts/seen');
            setAlerts(current => (current || []).map(alert => ({ ...alert, seen: true })));
            setUnseen(0);
        } catch (err) { setError(errorMessage(err, 'Could not mark the alerts as seen.')); }
    }

    return <div className="space-y-4">
        <Panel title="Watched wallets">
            <p className="text-sm text-meme-text">{status ? `${status.wallets} wallets on your watch and good-dev lists. Last check: ${status.last_checked_at ? new Date(status.last_checked_at).toLocaleString() : 'never'}.` : 'Loading…'}</p>
            {status?.wallets === 0 && <p className="text-sm text-meme-dim">Add a wallet on the <Link className="text-meme-accent" href="/memecoin/wallets">Wallets tab</Link> to start following activity.</p>}
            <div className="flex flex-wrap gap-2">
                <PrimaryButton type="button" disabled={checking || !status || status.wallets === 0} onClick={checkNow}>{checking ? 'Scan queued or running…' : 'Check now'}</PrimaryButton>
                {unseen > 0 && <SecondaryButton onClick={markSeen}>Mark all seen ({unseen})</SecondaryButton>}
                {permission === 'default' && <SecondaryButton onClick={async () => { try { setPermission(await Notification.requestPermission()); } catch { setPermission('denied'); } }}>Enable browser notifications</SecondaryButton>}
            </div>
            {result && <p role="status" className="mt-3 text-sm text-meme-text">{result.queued ? 'Scan queued. Results appear when it completes.' : `Checked ${result.wallets_checked} wallets: ${result.new_alerts} new alerts.`}</p>}
            {result && Object.entries(result.errors || {}).map(([address, reason]) => <p key={address} className="mt-2 break-all text-xs text-meme-danger">{['telegram', 'scan'].includes(address) ? address : shortAddress(address)}: {reason}</p>)}
            <p className="mt-3 text-xs text-meme-dim">The first scan establishes a starting point. Alerts show token gains, which may be transfers or airdrops rather than buys. Solana wallets are supported.</p>
            <p className="mt-2 text-xs text-meme-dim">Browser notifications: {permission === 'granted' ? 'on while this page is open' : permission === 'denied' ? 'blocked in this browser' : permission === 'unsupported' ? 'not supported here' : 'off'}. Telegram: {status?.telegram ? 'on' : 'off'}.</p>
        </Panel>
        {error && <p role="alert" className="text-sm text-meme-danger">{error}</p>}
        <Panel title="Wallet activity">
            {alerts === null ? <p className="text-sm text-meme-dim">Loading alerts…</p> : alerts.length === 0 ? <p className="text-sm text-meme-dim">No alerts yet. New token gains appear after a wallet's first scan.</p> : <ul className="divide-y divide-meme-border">
                {alerts.map(alert => <li key={alert.id} className="space-y-2 py-3 text-sm">
                    <p className="text-meme-text"><span className="font-semibold">{who(alert)}</span> · {shortAddress(alert.wallet_address)}{!alert.seen && <span className="ml-2 text-xs text-meme-accent">New</span>}</p>
                    <p className="text-meme-dim">Gained {tokens(alert.amount)} tokens · {new Date(alert.block_time || alert.created_at).toLocaleString()}</p>
                    <div className="flex flex-wrap gap-4"><Link className="break-all text-meme-accent" href={`/memecoin/solana/${alert.mint}`}>Analyze {shortAddress(alert.mint)}</Link><a className="text-meme-accent" href={`https://solscan.io/tx/${alert.signature}`} target="_blank" rel="noopener noreferrer">Transaction ↗</a></div>
                </li>)}
            </ul>}
        </Panel>
    </div>;
}

import React from 'react';
import { Head, usePage } from '@inertiajs/react';
import { ScanSearch } from 'lucide-react';
import { useTheme } from '../../Context/ThemeContext';
import MemecoinNav from '../../Components/Memecoin/MemecoinNav';
import MemecoinSearch from '../../Components/Memecoin/MemecoinSearch';
import MemecoinReport from '../../Components/Memecoin/MemecoinReport';
import ReportHistory from '../../Components/Memecoin/ReportHistory';
import SavedReportView from '../../Components/Memecoin/SavedReportView';
import WalletLists from '../../Components/Memecoin/WalletLists';
import WalletSearch from '../../Components/Memecoin/WalletSearch';
import TradeJournal from '../../Components/Memecoin/TradeJournal';
import WatchAlerts from '../../Components/Memecoin/WatchAlerts';

export default function Index({ view, chain, address, id }) {
    const { theme } = useTheme();
    const { url } = usePage();
    const params = new URLSearchParams(url.split('?')[1] || '');
    const dark = theme === 'bg-skin-black';
    const style = dark ? { '--meme-bg': '#131722', '--meme-panel': '#1e222d', '--meme-border': '#363c4e', '--meme-text': '#e2e8f0', '--meme-dim': '#a5adbe', '--meme-accent': '#5eead4', '--meme-danger': '#fca5a5', '--meme-danger-soft': '#3d222a' } : { '--meme-bg': '#f8fafc', '--meme-panel': '#ffffff', '--meme-border': '#cbd5e1', '--meme-text': '#0f172a', '--meme-dim': '#64748b', '--meme-accent': '#0f766e', '--meme-danger': '#b91c1c', '--meme-danger-soft': '#fef2f2' };
    const views = {
        search: <MemecoinSearch />,
        report: <MemecoinReport chain={chain} address={address} />,
        history: <ReportHistory />,
        saved: <SavedReportView id={id} />,
        wallets: <WalletLists />,
        creators: <WalletSearch initialAddress={params.get('address') || ''} initialChain={params.get('chain') || 'solana'} initialRelationship={params.get('relationship') === 'owner' ? 'owner' : 'creator'} />,
        journal: <TradeJournal prefill={Object.fromEntries(params)} />,
        watch: <WatchAlerts />,
    };
    return <div style={style} className="mx-auto w-full max-w-6xl space-y-5 text-meme-text">
        <Head title="Memecoin Research" />
        <div className="flex items-start gap-3"><ScanSearch className="mt-1 shrink-0 text-meme-accent" size={24} /><div><h1 className="text-xl font-bold">Memecoin Research</h1><p className="mt-1 text-sm text-meme-dim">Research tokens, screen risk, follow wallets, and journal your decisions.</p></div></div>
        <MemecoinNav />
        <div key={`${view}:${chain}:${address}:${id}:${url}`}>{views[view] || views.search}</div>
    </div>;
}

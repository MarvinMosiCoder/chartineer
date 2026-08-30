import React, { useState } from 'react';
import { Head, usePage } from '@inertiajs/react';
import axios from 'axios';
import { Compass } from 'lucide-react';
import TradeCalendar from '../../Components/Market/TradeCalendar';
import TradeReport from '../../Components/Market/TradeReport';
import StrategyPlaybooks from '../../Components/Market/StrategyPlaybooks';
import RiskGuardrailSettings from '../../Components/Market/RiskGuardrailSettings';
import ImportedTrades from '../../Components/Market/ImportedTrades';
import ContentPanel from '../../Components/Table/ContentPanel';
import WorkspaceTour from '../../Components/Market/WorkspaceTour';
import { useTheme } from '../../Context/ThemeContext';
import { useAnnouncementGate } from '../../Context/AnnouncementGateContext';

const TOUR_STEPS = [
    { selector: '[data-tour="journal-risk"]', title: 'Cap your risk', description: 'Turn on daily-loss, trade-count, concurrent-position, or loss-streak limits before you start a session. Warning mode just flags a breach; enforced mode blocks the new entry.' },
    { selector: '[data-tour="journal-playbooks"]', title: 'Plan your setups', description: 'Build a reusable playbook here — entry/stop/target rules plus a checklist. Attach one when you open a position and every box must be ticked before the order can be placed.' },
    { selector: '[data-tour="journal-calendar"]', title: 'See your days at a glance', description: 'Daily realized PnL, colored by size and direction. Click the month label for a direct month/year jump.' },
    { selector: '[data-tour="journal-summary"]', title: 'Your account at a glance', description: 'Net PnL, win rate, wins, losses, and fees — always the whole account, even while the table below is filtered.' },
    { selector: '[data-tour="journal-table"]', title: 'Search, filter, and journal', description: 'Search or filter closed trades by symbol, side, result, or journal status. Click Edit on any row to open a modal — setup tag, tags, emotion, entry/exit reason, mistake, and notes.' },
    { selector: '[data-tour="journal-export"]', title: 'Export your history', description: 'CSV or JSON — this queues a background job and notifies you with a download link once it is ready, so a large account never freezes the page.' },
    { selector: '[data-tour="journal-import"]', title: 'Bring in real trades', description: 'Upload a broker or exchange CSV to import your real trading history. It is kept completely separate from the simulated trades everywhere else on this page.' },
];

const TradeReportPage = () => {
    const { auth } = usePage().props;
    const { theme } = useTheme();
    const isDark = theme === 'bg-skin-black';
    const [tourStep, setTourStep] = useState(() => (
        new URLSearchParams(window.location.search).get('tour') === '1' || !auth?.user?.journal_tour_completed_at ? 0 : -1
    ));
    // The unread-announcement modal (AnnouncementGate, mounted in layout.jsx) owns
    // the screen first on login; this tour holds at its current step until it is done.
    const { announcementsPending } = useAnnouncementGate();
    const showTour = tourStep >= 0 && !announcementsPending;

    const finishTour = () => {
        setTourStep(-1);
        axios.post('/journal-tour/complete').catch(() => {});
    };

    return (
        <>
            <Head title="Trade Report" />
            {showTour && (
                <WorkspaceTour step={tourStep} steps={TOUR_STEPS} onStep={setTourStep} onFinish={finishTour} dark={isDark} />
            )}
            <div className="mb-1 flex items-center justify-end">
                <button
                    type="button"
                    onClick={() => setTourStep(0)}
                    className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold ${isDark ? 'text-gray-400 hover:bg-white/5 hover:text-white' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'}`}
                >
                    <Compass size={14} />
                    Take the tour
                </button>
            </div>
            <div className="space-y-4">
                <ContentPanel marginBottom={2}>
                    <div className="p-4">
                        <RiskGuardrailSettings />
                    </div>
                </ContentPanel>
                <ContentPanel marginBottom={2}>
                    <div className="p-4">
                        <StrategyPlaybooks />
                    </div>
                </ContentPanel>
                <ContentPanel marginBottom={2}>
                    <div className="p-4">
                        <TradeCalendar />
                    </div>
                </ContentPanel>
                <ContentPanel marginBottom={2}>
                    <div className="p-4">
                        <TradeReport />
                    </div>
                </ContentPanel>
                <ContentPanel marginBottom={2}>
                    <div className="p-4">
                        <ImportedTrades />
                    </div>
                </ContentPanel>
            </div>
        </>
    );
};

export default TradeReportPage;

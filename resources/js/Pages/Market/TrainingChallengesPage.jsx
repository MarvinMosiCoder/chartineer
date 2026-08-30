import React, { useState } from 'react';
import { Head, usePage } from '@inertiajs/react';
import axios from 'axios';
import { Compass } from 'lucide-react';
import TrainingChallengeCatalog from '../../Components/Market/TrainingChallengeCatalog';
import ContentPanel from '../../Components/Table/ContentPanel';
import WorkspaceTour from '../../Components/Market/WorkspaceTour';
import { useTheme } from '../../Context/ThemeContext';
import { useAnnouncementGate } from '../../Context/AnnouncementGateContext';

const TOUR_STEPS = [
    { selector: '[data-tour="training-intro"]', title: 'Structured practice', description: 'Each challenge sets required trades, a max risk per trade, and sometimes a required playbook or loss-streak limit. Progress is scored automatically from your closed trades once you start an attempt — no manual tracking needed.' },
    { selector: '[data-tour="training-list"]', title: 'Track progress and violations', description: 'A progress bar shows trades completed toward the requirement, plus live Net PnL and Win Rate. Any rule you broke along the way — over-risking, missing a playbook, a loss streak — shows up here too. Start a challenge, or Abandon an active attempt if you need to restart.' },
];

const TrainingChallengesPage = () => {
    const { auth } = usePage().props;
    const { theme } = useTheme();
    const isDark = theme === 'bg-skin-black';
    const [tourStep, setTourStep] = useState(() => (
        new URLSearchParams(window.location.search).get('tour') === '1' || !auth?.user?.training_tour_completed_at ? 0 : -1
    ));
    // The unread-announcement modal (AnnouncementGate, mounted in layout.jsx) owns
    // the screen first on login; this tour holds at its current step until it is done.
    const { announcementsPending } = useAnnouncementGate();
    const showTour = tourStep >= 0 && !announcementsPending;

    const finishTour = () => {
        setTourStep(-1);
        axios.post('/training-tour/complete').catch(() => {});
    };

    return (
        <>
            <Head title="Training Challenges" />
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
                        <TrainingChallengeCatalog />
                    </div>
                </ContentPanel>
            </div>
        </>
    );
};

export default TrainingChallengesPage;

import React, { useState } from 'react';
import { Head, usePage } from '@inertiajs/react';
import axios from 'axios';
import { Compass } from 'lucide-react';
import ShareLinkManager from '../../Components/Market/ShareLinkManager';
import ContentPanel from '../../Components/Table/ContentPanel';
import WorkspaceTour from '../../Components/Market/WorkspaceTour';
import { useTheme } from '../../Context/ThemeContext';
import { useAnnouncementGate } from '../../Context/AnnouncementGateContext';

const TOUR_STEPS = [
    { selector: '[data-tour="mentor-intro"]', title: 'Share trades without an account', description: 'Generate a read-only public link so a mentor or coach can review your trades — no login required on their end, and you can revoke access at any time.' },
    { selector: '[data-tour="mentor-scope"]', title: 'Scope what they can see', description: 'Share one whole session, a date range, or a hand-picked list of trade IDs — never your entire account by default.' },
    { selector: '[data-tour="mentor-includes"]', title: "Choose what's included", description: 'Toggle journal notes, chart snapshots, and analytics on or off independently, so you can share just the trades without your private notes if you prefer.' },
    { selector: '[data-tour="mentor-links"]', title: 'Manage active links', description: 'Every link you\'ve created lives here with its view count and last-viewed time. The full URL is only ever shown once, right after creation — copy it then, and revoke a link instantly if it\'s no longer needed.' },
];

const MentorReviewManagePage = () => {
    const { auth } = usePage().props;
    const { theme } = useTheme();
    const isDark = theme === 'bg-skin-black';
    const [tourStep, setTourStep] = useState(() => (
        new URLSearchParams(window.location.search).get('tour') === '1' || !auth?.user?.mentor_tour_completed_at ? 0 : -1
    ));
    // The unread-announcement modal (AnnouncementGate, mounted in layout.jsx) owns
    // the screen first on login; this tour holds at its current step until it is done.
    const { announcementsPending } = useAnnouncementGate();
    const showTour = tourStep >= 0 && !announcementsPending;

    const finishTour = () => {
        setTourStep(-1);
        axios.post('/mentor-tour/complete').catch(() => {});
    };

    return (
        <>
            <Head title="Mentor Review" />
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
                        <ShareLinkManager />
                    </div>
                </ContentPanel>
            </div>
        </>
    );
};

export default MentorReviewManagePage;

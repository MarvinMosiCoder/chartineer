import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

// Login can hand a user two full-screen surfaces at once: the unread-announcement
// modal (AnnouncementGate, mounted in layout.jsx) and whichever page's spotlight
// tour is still uncompleted. They fight for the same screen, and the tour's
// spotlight measures a DOM node the modal's backdrop is covering. This context is
// the handshake that orders them: announcements first, tours after.
//
// The default value is a real object, not undefined, so a consumer rendered
// outside the provider (e.g. an Auth/* or Public/* page, which get no layout
// wrapper at all — see app.jsx) reads "nothing is holding" instead of throwing on
// destructure, the way useTheme() does in that same situation.
const AnnouncementGateContext = createContext({
    announcementsPending: false,
    markAnnouncementsResolved: () => {},
});

export const AnnouncementGateProvider = ({ initialPending = false, children }) => {
    // Seeded from auth.announcement on the very first render — before
    // AnnouncementGate's own fetch effect has even run — so a tour can never slip
    // through the window between mount and the /unread-announcement response.
    const [announcementsPending, setAnnouncementsPending] = useState(Boolean(initialPending));

    const markAnnouncementsResolved = useCallback(() => setAnnouncementsPending(false), []);

    const value = useMemo(
        () => ({ announcementsPending, markAnnouncementsResolved }),
        [announcementsPending, markAnnouncementsResolved],
    );

    return (
        <AnnouncementGateContext.Provider value={value}>
            {children}
        </AnnouncementGateContext.Provider>
    );
};

export const useAnnouncementGate = () => useContext(AnnouncementGateContext);

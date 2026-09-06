import React, { useContext, useEffect, useRef, useState } from "react";
import { Link, usePage } from "@inertiajs/react";
import AppFooter from "@/Layouts/layout/AppFooter.jsx";
import AppNavbar from "@/Layouts/layout/AppNavbar.jsx";
import AppContent from "@/Layouts/layout/AppContent.jsx";
import ContentLoader from "@/Layouts/layout/ContentLoader.jsx";
import { NavbarProvider } from "../../Context/NavbarContext";
import { useTheme } from "../../Context/ThemeContext";
import TraderNavbar from "./TraderNavbar";
import AdminNavbar from './AdminNavbar';
import AnnouncementGate from '../../Components/Announcements/AnnouncementGate';
import { AnnouncementGateProvider } from "../../Context/AnnouncementGateContext";

const Layout = ({ children }) => {
    const {theme} = useTheme();
    const { auth } = usePage().props;
    const isAdmin = Boolean(auth?.role?.isAdmin);
    return (
        <NavbarProvider>
            {/* Announcements gate the page's spotlight tour, so the provider has to
                wrap both the modal and the page content it holds back. */}
            <AnnouncementGateProvider initialPending={Boolean(auth?.announcement)}>
                <AnnouncementGate />
                <div className="fixed z-[200] w-full">
                    {isAdmin ? <AdminNavbar /> : <TraderNavbar />}
                </div>
                <div className="flex h-screen pt-14">
                    {/* Nobody has a sidebar. Both roles navigate from their navbar:
                        TraderNavbar's static NAV_ITEMS, AdminNavbar's session-driven
                        menu tree. Admin kept a sidebar on the belief that its tree was
                        "far too deep for a bar" — in the real data it is at most two
                        levels (a few `URL` group parents with `Route` children), which
                        a bar holds as dropdowns. Removing it gives admin pages the full
                        window width, the same reason the trader sidebar went. */}
                    <div className="relative flex min-w-0 w-full flex-col overflow-hidden">
                        <div className="flex-1 w-full flex flex-col overflow-auto">
                            <div className="flex-1">
                                <AppContent>{children}</AppContent>
                            </div>
                            {isAdmin && <AppFooter />}
                        </div>
                        <ContentLoader />
                    </div>
                </div>
            </AnnouncementGateProvider>
        </NavbarProvider>
    );
};

export default Layout;

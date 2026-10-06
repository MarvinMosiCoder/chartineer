import React from 'react';
import { createRoot } from 'react-dom/client';
import { createInertiaApp } from '@inertiajs/react';
import MarketChart from '../../resources/js/Components/Market/MarketChart.jsx';
import { ThemeProvider } from '../../resources/js/Context/ThemeContext.jsx';
import { AuthProvider } from '../../resources/js/Context/AuthContext.jsx';
import { ToastProvider } from '../../resources/js/Context/ToastContext.jsx';
import '../../resources/css/app.css';
const auth = { user: { id: 999999, name: 'Chart preview' }, sessions: {} };
const View = () => <MarketChart initialExchange="binance" initialMarketCategory="spot" tourCompleted />;
createInertiaApp({
  page: { component: 'Chart', props: { auth }, url: '/', version: 'preview' },
  resolve: () => View,
  setup: ({ el, App, props }) => createRoot(el).render(<AuthProvider initialAuth={auth}><ThemeProvider themeColor={new URLSearchParams(location.search).get('theme') === 'light' ? 'skin-white' : 'skin-black'}><ToastProvider><App {...props} /></ToastProvider></ThemeProvider></AuthProvider>),
});

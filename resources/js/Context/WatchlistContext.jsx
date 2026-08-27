import React, { createContext, useContext, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { Trash2, X } from 'lucide-react';
import { useTheme } from './ThemeContext';
import { broadcastChange, subscribeToChange } from '../utils/crossTabSync';

const WatchlistContext = createContext();

export const useWatchlist = () => useContext(WatchlistContext);

export const watchlistMarketKey = (exchange, category, symbol) => `${String(exchange).toLowerCase()}:${String(category).toLowerCase()}:${String(symbol).toUpperCase()}`;

export const WatchlistProvider = ({ children, userId }) => {
    const { theme } = useTheme();
    const isDark = theme === 'bg-skin-black';
    const watchlistKey = `backtradelab-watchlists:${userId ?? 'guest'}`;
    const [savedSymbols, setSavedSymbols] = useState([]);
    const [savedSymbolsMetadata, setSavedSymbolsMetadata] = useState({});
    const [watchlists, setWatchlists] = useState(() => { try { return JSON.parse(localStorage.getItem(watchlistKey) || '{"Main":[]}'); } catch { return { Main: [] }; } });
    const [activeWatchlist, setActiveWatchlist] = useState(Object.keys(watchlists)[0] ?? 'Main');
    const [expandedWatchlists, setExpandedWatchlists] = useState(() => new Set([Object.keys(watchlists)[0] ?? 'Main']));
    const [isWatchlistModalOpen, setIsWatchlistModalOpen] = useState(false);
    const [watchlistName, setWatchlistName] = useState('');
    const [watchlistError, setWatchlistError] = useState('');
    const [editingWatchlist, setEditingWatchlist] = useState(null);
    const [deleteWatchlistName, setDeleteWatchlistName] = useState(null);
    const [watchlistsHydrated, setWatchlistsHydrated] = useState(false);
    const [watchlistMetadata, setWatchlistMetadata] = useState({});

    const refreshSavedSymbols = () => {
        fetch('/market-symbols', { headers: { Accept: 'application/json' } }).then((response) => response.json()).then((data) => setSavedSymbols(data.symbols ?? [])).catch(() => setSavedSymbols([]));
    };

    useEffect(() => {
        refreshSavedSymbols();
    }, []);

    useEffect(() => subscribeToChange('backtradelab-symbols-changed', refreshSavedSymbols), []);

    useEffect(() => {
        if (!savedSymbols.length) { setSavedSymbolsMetadata({}); return undefined; }
        const markets = savedSymbols.map((item) => ({ exchange: item.exchange ?? 'bybit', category: item.category ?? 'spot', symbol: item.symbol }));
        let cancelled = false;
        axios.post('/market-metadata/batch', { markets }).then((response) => {
            if (cancelled) return;
            const next = {};
            (response.data?.items ?? []).forEach((item) => {
                next[watchlistMarketKey(item.market.exchange, item.market.category, item.market.symbol)] = item;
            });
            setSavedSymbolsMetadata(next);
        }).catch(() => {});
        return () => { cancelled = true; };
    }, [savedSymbols]);

    useEffect(() => {
        axios.get('/market-watchlists').then(({ data }) => {
            if (data?.exists) setWatchlists(data.watchlists ?? { Main: [] });
        }).catch(() => {}).finally(() => setWatchlistsHydrated(true));
    }, []);

    useEffect(() => {
        localStorage.setItem(watchlistKey, JSON.stringify(watchlists));
        if (!watchlistsHydrated) return;
        const timer = setTimeout(() => {
            axios.put('/market-watchlists', { data: watchlists }).catch(() => {});
        }, 500);
        return () => clearTimeout(timer);
    }, [watchlistKey, watchlists, watchlistsHydrated]);

    useEffect(() => {
        const allKeys = [...new Set(Object.values(watchlists).flat())];
        if (!allKeys.length) { setWatchlistMetadata({}); return undefined; }
        const markets = allKeys.map((key) => {
            const [exchange, category, ...symbolParts] = key.split(':');
            return { exchange, category, symbol: symbolParts.join(':') };
        });
        let cancelled = false;
        axios.post('/market-metadata/batch', { markets }).then((response) => {
            if (cancelled) return;
            const next = {};
            (response.data?.items ?? []).forEach((item) => {
                next[watchlistMarketKey(item.market.exchange, item.market.category, item.market.symbol)] = item;
            });
            setWatchlistMetadata(next);
        }).catch(() => {});
        return () => { cancelled = true; };
    }, [watchlists]);

    const createWatchlist = (event) => {
        event.preventDefault();
        const name = watchlistName.trim();
        if (!name) return setWatchlistError('Enter a watchlist name.');
        if (watchlists[name] && name !== editingWatchlist) return setWatchlistError('A watchlist with this name already exists.');
        setWatchlists((current) => editingWatchlist
            ? Object.fromEntries(Object.entries(current).map(([key, items]) => [key === editingWatchlist ? name : key, items]))
            : ({ ...current, [name]: [] }));
        setActiveWatchlist(name);
        setExpandedWatchlists(new Set([name]));
        setWatchlistName('');
        setWatchlistError('');
        setEditingWatchlist(null);
        setIsWatchlistModalOpen(false);
    };

    const toggleWatchlist = (name) => {
        setActiveWatchlist(name);
        setExpandedWatchlists((current) => {
            const next = new Set(current);
            if (next.has(name)) next.delete(name); else next.add(name);
            return next;
        });
    };

    const deleteWatchlist = () => {
        if (!deleteWatchlistName) return;
        const remainingNames = Object.keys(watchlists).filter((name) => name !== deleteWatchlistName);
        const fallbackName = remainingNames[0] ?? 'Main';
        setWatchlists((current) => {
            const next = Object.fromEntries(Object.entries(current).filter(([name]) => name !== deleteWatchlistName));
            return Object.keys(next).length ? next : { Main: [] };
        });
        setActiveWatchlist(fallbackName);
        setExpandedWatchlists(new Set([fallbackName]));
        setDeleteWatchlistName(null);
    };

    const addSymbolToWatchlist = (name, symbolKey) => {
        if (!symbolKey) return;
        setWatchlists((current) => ({
            ...current,
            [name]: current[name]?.includes(symbolKey) ? current[name] : [...(current[name] ?? []), symbolKey],
        }));
    };

    const removeSymbolFromWatchlist = (name, symbolKey) => {
        setWatchlists((current) => ({
            ...current,
            [name]: (current[name] ?? []).filter((value) => value !== symbolKey),
        }));
    };

    // Deletes the saved market symbol itself (DELETE /market-symbols/{id}) —
    // not just membership in one watchlist. Prunes it from every watchlist's
    // items too, so nothing points at a symbol that no longer exists. This is
    // now the only place a saved symbol gets deleted from (ChartHeader.jsx's
    // own duplicate trash-can button was removed as redundant); it broadcasts
    // `backtradelab-symbols-changed` (see utils/crossTabSync.js) so
    // MarketChart.jsx's own local `symbols` state — a separate `/market-symbols`
    // fetch, see the dual-source-of-truth note in docs/developer/trading-chart.md
    // — refreshes too, instead of keeping the just-deleted symbol around until reload.
    const deleteSavedSymbol = async (item) => {
        const key = watchlistMarketKey(item.exchange ?? 'bybit', item.category ?? 'spot', item.symbol);
        await axios.delete(`/market-symbols/${item.id}`, { headers: { Accept: 'application/json' } });
        setSavedSymbols((current) => current.filter((saved) => saved.id !== item.id));
        setWatchlists((current) => Object.fromEntries(
            Object.entries(current).map(([name, items]) => [name, items.filter((value) => value !== key)])
        ));
        broadcastChange('backtradelab-symbols-changed');
    };

    // Bulk counterpart to deleteSavedSymbol() — one request instead of one
    // per saved symbol, via the dedicated DELETE /market-symbols endpoint
    // (a client-side loop of individual deletes would hit the market-write
    // rate limit, 15/min, well before a user with more saved symbols than
    // that finished clearing them). Clears every watchlist's items in one
    // state update rather than pruning them one key at a time.
    const removeAllSavedSymbols = async () => {
        await axios.delete('/market-symbols', { headers: { Accept: 'application/json' } });
        setSavedSymbols([]);
        setWatchlists((current) => Object.fromEntries(
            Object.entries(current).map(([name]) => [name, []])
        ));
        broadcastChange('backtradelab-symbols-changed');
    };

    // Favoriting is a plain is_favorite flag on the saved symbol itself,
    // entirely independent of watchlist membership (see
    // docs/superpowers/specs/2026-08-23-symbol-favorites-design.md) — this
    // never touches `watchlists`. PUT /market-symbols/favorite upserts the
    // symbol server-side, so this also works for a symbol that isn't saved
    // yet (favorited straight from the search modal's Spot/Futures tabs).
    const toggleFavorite = async (item, isFavorite) => {
        const response = await axios.put('/market-symbols/favorite', {
            symbol: item.symbol,
            exchange: item.exchange ?? 'bybit',
            exchange_symbol: item.exchange_symbol ?? item.symbol,
            coin_name: item.coin_name ?? item.baseCoin ?? item.symbol,
            base_coin: item.base_coin ?? item.baseCoin ?? '',
            quote_coin: item.quote_coin ?? item.quoteCoin ?? '',
            category: item.category ?? 'spot',
            is_favorite: isFavorite,
        }, { headers: { Accept: 'application/json' } });

        const saved = response.data.symbol;
        setSavedSymbols((current) => {
            const exists = current.some((existing) => existing.id === saved.id);
            return exists
                ? current.map((existing) => (existing.id === saved.id ? { ...existing, ...saved } : existing))
                : [...current, saved];
        });
        broadcastChange('backtradelab-symbols-changed');
    };

    // Bulk-unfavorite counterpart, mirroring removeAllSavedSymbols()'s
    // one-request-not-N shape — but this only clears is_favorite (an UPDATE),
    // it never deletes a market_symbols row, so watchlist membership is
    // untouched.
    const removeAllFavorites = async () => {
        await axios.delete('/market-symbols/favorites', { headers: { Accept: 'application/json' } });
        setSavedSymbols((current) => current.map((item) => (item.is_favorite ? { ...item, is_favorite: false } : item)));
        broadcastChange('backtradelab-symbols-changed');
    };

    const openCreateWatchlistModal = () => {
        setEditingWatchlist(null);
        setWatchlistError('');
        setWatchlistName('');
        setIsWatchlistModalOpen(true);
    };

    const openEditWatchlistModal = (name) => {
        setEditingWatchlist(name);
        setWatchlistName(name);
        setWatchlistError('');
        setIsWatchlistModalOpen(true);
    };

    return (
        <WatchlistContext.Provider value={{
            savedSymbols,
            savedSymbolsMetadata,
            watchlists,
            activeWatchlist,
            expandedWatchlists,
            watchlistMetadata,
            toggleWatchlist,
            addSymbolToWatchlist,
            removeSymbolFromWatchlist,
            deleteSavedSymbol,
            removeAllSavedSymbols,
            toggleFavorite,
            removeAllFavorites,
            openCreateWatchlistModal,
            openEditWatchlistModal,
            setDeleteWatchlistName,
        }}>
            {children}
            {typeof document !== 'undefined' && createPortal(
                <>
                    {isWatchlistModalOpen && <div data-chart-ui="watchlists-panel" className="fixed inset-0 z-[10020] flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center" onMouseDown={(event) => event.target === event.currentTarget && setIsWatchlistModalOpen(false)}><form onSubmit={createWatchlist} className={`w-full max-w-md rounded-2xl border p-5 shadow-2xl ${isDark ? 'border-[#2a2e39] bg-[#131722] text-white' : 'border-slate-200 bg-white text-slate-900'}`}><div className="flex items-start justify-between gap-3"><div><div className="text-[10px] font-bold uppercase tracking-[.18em] text-[#2dd4bf]">Workspace watchlists</div><h2 className="mt-1 text-lg font-bold">{editingWatchlist ? 'Rename watchlist' : 'Create a watchlist'}</h2><p className="mt-1 text-xs text-[#787b86]">{editingWatchlist ? 'Update the group name without changing its markets.' : 'Name a group, then add saved markets from its dropdown.'}</p></div><button type="button" onClick={() => { setEditingWatchlist(null); setIsWatchlistModalOpen(false); }} className={`rounded-lg p-2 text-[#787b86] ${isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'}`} aria-label="Close"><X size={17} /></button></div><label className="mt-5 block text-xs font-semibold">Watchlist name<input autoFocus maxLength="60" value={watchlistName} onChange={(event) => { setWatchlistName(event.target.value); setWatchlistError(''); }} placeholder="Example: Swing trades" className={`mt-1.5 h-11 w-full rounded-lg border px-3 text-sm outline-none focus:border-[#2dd4bf] ${isDark ? 'border-[#2a2e39] bg-[#0b0e14] text-white placeholder:text-gray-600' : 'border-slate-300 bg-white text-slate-900 placeholder:text-slate-400'}`} /></label>{watchlistError && <p className="mt-2 text-xs text-red-500">{watchlistError}</p>}<div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => { setEditingWatchlist(null); setIsWatchlistModalOpen(false); }} className={`h-10 rounded-lg border px-4 text-xs font-semibold ${isDark ? 'border-[#2a2e39] hover:bg-white/5' : 'border-slate-200 hover:bg-slate-50'}`}>Cancel</button><button type="submit" className="h-10 rounded-lg bg-[#2dd4bf] px-4 text-xs font-bold text-white hover:bg-teal-600">{editingWatchlist ? 'Save changes' : 'Create watchlist'}</button></div></form></div>}
                    {deleteWatchlistName && <div data-chart-ui="watchlists-panel" className="fixed inset-0 z-[10021] flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center"><div className={`w-full max-w-sm rounded-2xl border p-5 shadow-2xl ${isDark ? 'border-[#2a2e39] bg-[#131722] text-white' : 'border-slate-200 bg-white text-slate-900'}`}><span className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/10 text-red-500"><Trash2 size={18} /></span><h2 className="mt-4 text-lg font-bold">Delete {deleteWatchlistName}?</h2><p className="mt-2 text-xs leading-5 text-[#787b86]">The group and its market assignments will be removed. Your saved market symbols will not be deleted.</p><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setDeleteWatchlistName(null)} className={`h-10 rounded-lg border px-4 text-xs font-semibold ${isDark ? 'border-[#2a2e39]' : 'border-slate-200'}`}>Cancel</button><button type="button" onClick={deleteWatchlist} className="h-10 rounded-lg bg-red-600 px-4 text-xs font-bold text-white hover:bg-red-700">Delete watchlist</button></div></div></div>}
                </>,
                document.body
            )}
        </WatchlistContext.Provider>
    );
};

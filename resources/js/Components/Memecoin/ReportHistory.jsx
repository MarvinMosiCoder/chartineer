import { useEffect, useRef, useState } from "react";
import { Link } from "@inertiajs/react";
import api from "./api";
import { errorMessage } from "./api";
import { useAuth } from "./ui";
import { TextInput } from "./ui";
import { PrimaryButton } from "./ui";
import { SecondaryButton } from "./ui";
import { shortAddress } from "./format";
import { Panel, VerdictBadge } from "./ReportView";
import { chainName, isAnyAddress } from "./chains";
const PAGE_SIZE = 50;
async function fetchPage(address, offset) {
  const params = { limit: PAGE_SIZE, offset };
  if (address) params.address = address;
  const response = await api.get("/memecoin/reports", { params });
  return response.data;
}
export default function ReportHistory() {
  const { user } = useAuth();
  const canClear = Boolean(user);
  const [confirming, setConfirming] = useState(false);
  const [confirmingId, setConfirmingId] = useState(null);
  const [clearing, setClearing] = useState(false);
  const [clearError, setClearError] = useState("");
  const [clearMessage, setClearMessage] = useState("");
  const generation = useRef(0);
  const clearLock = useRef(false);
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");
  const [input, setInput] = useState("");
  const [inputError, setInputError] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const actionPending = confirming || confirmingId !== null || clearing;
  useEffect(() => {
    let active = true;
    const version = ++generation.current;
    fetchPage(filter, 0).then((page) => {
      if (!active || version !== generation.current) return;
      setRows(page);
      setHasMore(page.length === PAGE_SIZE);
    }).catch((err) => {
      if (active && version === generation.current) setError(errorMessage(err, "Could not load the history."));
    });
    return () => {
      active = false;
    };
  }, [filter, attempt]);
  function reload(address) {
    generation.current++;
    setLoadingMore(false);
    setRows(null);
    setError("");
    if (address === filter) setAttempt((n) => n + 1);
    else setFilter(address);
  }
  function applyFilter(event) {
    event.preventDefault();
    const address = input.trim();
    if (address && !isAnyAddress(address)) {
      setInputError("Enter a full Solana or EVM token address.");
      return;
    }
    setInputError("");
    reload(address);
  }
  function clearFilter() {
    setInput("");
    setInputError("");
    reload("");
  }
  async function loadMore() {
    if (!rows || clearLock.current) return;
    const version = generation.current;
    setLoadingMore(true);
    try {
      const page = await fetchPage(filter, rows.length);
      if (version !== generation.current) return;
      setRows([...rows, ...page]);
      setHasMore(page.length === PAGE_SIZE);
    } catch (err) {
      if (version === generation.current) setError(errorMessage(err, "Could not load more reports."));
    } finally {
      if (version === generation.current) setLoadingMore(false);
    }
  }
  async function clearHistory(reportId = null) {
    if (clearLock.current) return;
    clearLock.current = true;
    generation.current++;
    setClearing(true);
    setLoadingMore(false);
    setClearError("");
    setClearMessage("");
    try {
      if (reportId !== null) {
        await api.delete(`/memecoin/reports/${reportId}`, { timeout: 15e3 });
        setClearMessage(`Removed report #${reportId}. Journal entries were kept.`);
      } else {
        const { data } = await api.delete("/memecoin/reports", {
          data: { confirm: "clear_all_reports" },
          timeout: 15e3
        });
        setClearMessage(`Cleared ${data.deleted} saved ${data.deleted === 1 ? "report" : "reports"}. Journal entries were kept.`);
      }
      setConfirming(false);
    } catch (err) {
      setClearError(errorMessage(err, "Could not confirm whether history was cleared. Check the refreshed list before trying again."));
    } finally {
      reload(filter);
      setConfirmingId(null);
      setClearing(false);
      clearLock.current = false;
    }
  }
  return <div className="flex flex-col gap-4"><form onSubmit={applyFilter} className="flex flex-col gap-3 rounded-[10px] border border-meme-border bg-meme-panel p-5"><label htmlFor="history-address" className="text-sm font-medium text-meme-text">
          Saved reports for one token address
        </label><div className="flex flex-col gap-2 sm:flex-row"><TextInput
    disabled={actionPending}
    id="history-address"
    value={input}
    onChange={(event) => setInput(event.target.value)}
    placeholder="Leave empty to list every coin"
    autoComplete="off"
  /><div className="flex shrink-0 gap-2"><PrimaryButton disabled={actionPending}>Filter</PrimaryButton>{filter && <SecondaryButton disabled={actionPending} onClick={clearFilter}>Clear filter</SecondaryButton>}</div></div>{inputError && <p role="alert" className="m-0 text-[13px] text-meme-danger">{inputError}</p>}<p className="m-0 text-xs text-meme-dim">Every report the analyzer fetches is saved here, newest first.</p></form>{canClear && <Panel title="Clear history">{confirming ? <><p className="m-0 text-sm text-meme-text">Permanently delete all of your saved reports, across all coins and chains? This includes reports outside the current filter. This cannot be undone.</p><p className="text-xs text-meme-dim">Journal entries, wallet lists and alerts are kept. Journal links to deleted reports are removed. Wallet search loses the creator history stored in these reports. New analyses will save new reports.</p><div className="mt-3 flex flex-wrap gap-2"><SecondaryButton disabled={clearing} onClick={() => clearHistory()} className="text-meme-danger">{clearing ? "Clearing\u2026" : "Confirm clear all history"}</SecondaryButton><SecondaryButton disabled={clearing} onClick={() => setConfirming(false)}>Cancel</SecondaryButton></div></> : <SecondaryButton disabled={actionPending} onClick={() => {
    setConfirming(true);
    setClearMessage("");
    setClearError("");
  }}>Clear all history</SecondaryButton>}{clearError && <p role="alert" className="mb-0 text-sm text-meme-danger">{clearError}</p>}{clearMessage && <p role="status" className="mb-0 text-sm text-meme-text">{clearMessage}</p>}</Panel>}{error && <Panel title="History unavailable"><p role="alert" className="m-0 text-sm text-meme-danger">{error}</p><div className="mt-3"><SecondaryButton disabled={actionPending} onClick={() => reload(filter)}>Retry</SecondaryButton></div></Panel>}{!error && rows === null && <p role="status" className="m-0 text-sm text-meme-dim">Loading saved reports…</p>}{rows !== null && <div className="rounded-[10px] border border-meme-border bg-meme-panel">{rows.length === 0 ? <p className="m-0 p-5 text-sm text-meme-dim">{filter ? "No saved reports for this address." : "No saved reports yet. Analyze a coin and it is saved here."}</p> : <ul className="m-0 list-none divide-y divide-meme-border p-0">{rows.map((row) => <li key={row.id}><div className="flex flex-col sm:flex-row sm:items-center"><Link
    href={`/memecoin/history/${row.id}`}
    className="flex min-w-0 flex-1 flex-col gap-2 px-5 py-3 text-meme-text no-underline hover:bg-meme-bg sm:flex-row sm:items-center sm:justify-between sm:gap-4"
  ><span className="min-w-0"><span className="font-medium">{row.symbol ?? "?"}</span>{" "}<span className="text-sm text-meme-dim">{row.name}</span><span className="block font-mono text-xs text-meme-dim">{chainName(row.chain)} · {shortAddress(row.address)} · {new Date(row.checked_at).toLocaleString()}</span></span><span className="flex shrink-0 items-center gap-3"><VerdictBadge verdict={row.verdict} /><span className="font-mono text-xs text-meme-dim">risk {row.score}/100</span></span></Link>{canClear && confirmingId !== row.id && <div className="px-5 pb-3 sm:py-3 sm:pl-0"><SecondaryButton disabled={actionPending} aria-label={`Remove report ${row.id} for ${row.symbol ?? row.address}`} onClick={() => {
    setConfirmingId(row.id);
    setClearError("");
    setClearMessage("");
  }}>Remove</SecondaryButton></div>}</div>{canClear && confirmingId === row.id && <div className="px-5 pb-4"><p className="mt-0 text-sm text-meme-text">Permanently remove report #{row.id} for {row.symbol ?? shortAddress(row.address)} from your history? Only this snapshot is deleted. Linked journal entries are kept without their report link.</p><div className="flex flex-wrap gap-2"><SecondaryButton disabled={clearing} className="text-meme-danger" onClick={() => clearHistory(row.id)}>{clearing ? "Removing\u2026" : "Confirm remove"}</SecondaryButton><SecondaryButton disabled={clearing} onClick={() => setConfirmingId(null)}>Cancel</SecondaryButton></div></div>}</li>)}</ul>}</div>}{rows !== null && hasMore && <div><SecondaryButton disabled={loadingMore || actionPending} onClick={loadMore}>{loadingMore ? "Loading\u2026" : "Load more"}</SecondaryButton></div>}</div>;
}


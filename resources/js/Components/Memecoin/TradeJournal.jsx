import { useEffect, useState } from "react";
import { Link } from "@inertiajs/react";
import api from "./api";
import { errorMessage } from "./api";
import { TextInput } from "./ui";
import { PrimaryButton } from "./ui";
import { SecondaryButton } from "./ui";
import { DangerButton } from "./ui";
import { price, shortAddress, usd } from "./format";
import { Panel } from "./ReportView";
import { CHAINS, chainById, chainName, isValidAddress } from "./chains";
const EMPTY_FORM = { chain: "solana", address: "", symbol: "", entry_price: "", amount_usd: "", entry_reason: "" };
function positive(value) {
  const number = Number(value.trim());
  return value.trim() !== "" && Number.isFinite(number) && number > 0 ? number : null;
}
function pnlText(pnl) {
  return `${pnl >= 0 ? "+" : "\u2212"}${Math.abs(pnl).toFixed(1)}%`;
}
export default function TradeJournal({ prefill }) {
  const [trades, setTrades] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [form, setForm] = useState({
    ...EMPTY_FORM,
    chain: chainById(prefill.chain ?? "")?.id ?? "solana",
    address: prefill.address ?? "",
    symbol: prefill.symbol ?? "",
    entry_price: prefill.price ?? ""
  });
  const [reportId, setReportId] = useState(prefill.report && /^[1-9]\d*$/.test(prefill.report) ? Number(prefill.report) : null);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [closing, setClosing] = useState(null);
  const [closeError, setCloseError] = useState("");
  const [confirmingId, setConfirmingId] = useState(null);
  const [listError, setListError] = useState("");
  useEffect(() => {
    let active = true;
    api.get("/memecoin/trades").then((response) => {
      if (active) setTrades(response.data);
    }).catch((err) => {
      if (active) setLoadError(errorMessage(err, "Could not load the journal."));
    });
    return () => {
      active = false;
    };
  }, []);
  function replaceTrade(trade) {
    setTrades((current) => (current ?? []).map((item) => item.id === trade.id ? trade : item));
  }
  async function add(event) {
    event.preventDefault();
    const address = form.address.trim();
    const entryPrice = positive(form.entry_price);
    const amount = form.amount_usd.trim() ? positive(form.amount_usd) : null;
    const chain = chainById(form.chain) ?? CHAINS[0];
    if (!isValidAddress(chain, address)) return setFormError(`Enter a full ${chain.name} token address.`);
    if (entryPrice === null) return setFormError("Enter the entry price in USD per token, above 0.");
    if (form.amount_usd.trim() && amount === null) return setFormError("The amount must be a number above 0, or empty.");
    if (!form.entry_reason.trim()) return setFormError("Write down why you are entering. It is the point of the journal.");
    setSaving(true);
    setFormError("");
    try {
      const response = await api.post("/memecoin/trades", {
        chain: form.chain,
        address,
        symbol: form.symbol.trim() || null,
        entry_price: entryPrice,
        amount_usd: amount,
        entry_reason: form.entry_reason.trim(),
        report_id: reportId
      });
      setTrades((current) => [response.data, ...current ?? []]);
      setForm(EMPTY_FORM);
      setReportId(null);
    } catch (err) {
      setFormError(errorMessage(err, "Could not save the trade."));
    } finally {
      setSaving(false);
    }
  }
  async function close(event) {
    event.preventDefault();
    if (!closing) return;
    const exitPrice = positive(closing.exit_price);
    if (exitPrice === null) return setCloseError("Enter the exit price in USD per token, above 0.");
    if (!closing.exit_reason.trim()) return setCloseError("Write down why you are selling.");
    setCloseError("");
    try {
      const response = await api.patch(`/memecoin/trades/${closing.id}`, {
        exit_price: exitPrice,
        exit_reason: closing.exit_reason.trim()
      });
      replaceTrade(response.data);
      setClosing(null);
    } catch (err) {
      setCloseError(errorMessage(err, "Could not close the trade."));
    }
  }
  async function remove(trade) {
    setListError("");
    try {
      await api.delete(`/memecoin/trades/${trade.id}`);
      setTrades((current) => (current ?? []).filter((item) => item.id !== trade.id));
    } catch (err) {
      setListError(errorMessage(err, "Could not delete the trade."));
    } finally {
      setConfirmingId(null);
    }
  }
  const open = (trades ?? []).filter((trade) => trade.exit_price === null);
  const closed = (trades ?? []).filter((trade) => trade.exit_price !== null);
  const wins = closed.filter((trade) => (trade.pnl_pct ?? 0) > 0).length;
  const averagePnl = closed.length ? closed.reduce((sum, trade) => sum + (trade.pnl_pct ?? 0), 0) / closed.length : null;
  function tradeRow(trade) {
    return <li key={trade.id} className="flex flex-col gap-2 py-3 text-sm"><div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><Link href={`/memecoin/${trade.chain}/${trade.address}`} className="font-medium text-meme-text">{trade.symbol ?? shortAddress(trade.address)}</Link>{" "}<span className="text-xs text-meme-dim">{chainName(trade.chain)}</span>{" "}<span className="font-mono text-xs text-meme-dim">{shortAddress(trade.address)}</span><p className="m-0 mt-1 font-mono text-xs text-meme-dim">
              in {price(trade.entry_price)}{trade.amount_usd !== null && ` \xB7 ${usd(trade.amount_usd)}`} · {new Date(trade.entered_at).toLocaleString()}{trade.exit_price !== null && ` \u2192 out ${price(trade.exit_price)} \xB7 ${trade.exited_at ? new Date(trade.exited_at).toLocaleString() : ""}`}</p></div>{trade.pnl_pct !== null && <span className={`shrink-0 font-mono text-sm font-semibold ${trade.pnl_pct >= 0 ? "text-meme-accent" : "text-meme-danger"}`}>{pnlText(trade.pnl_pct)}{trade.amount_usd !== null && <span className="font-normal text-meme-dim"> ({trade.pnl_pct >= 0 ? "+" : "\u2212"}{usd(Math.abs(trade.amount_usd * trade.pnl_pct) / 100)})</span>}</span>}</div><p className="m-0 text-meme-text"><span className="text-meme-dim">Why in:</span> {trade.entry_reason}</p>{trade.exit_reason && <p className="m-0 text-meme-text"><span className="text-meme-dim">Why out:</span> {trade.exit_reason}</p>}{trade.report_id !== null && <Link href={`/memecoin/history/${trade.report_id}`} className="self-start text-xs text-meme-accent">
            Report at entry
          </Link>}{closing?.id === trade.id ? <form onSubmit={close} className="flex flex-col gap-2 rounded-md border border-meme-border p-3"><div className="grid grid-cols-1 gap-2 sm:grid-cols-2"><label className="flex flex-col gap-1 text-xs text-meme-text">
                Exit price (USD per token)
                <TextInput value={closing.exit_price} inputMode="decimal" onChange={(event) => setClosing({ ...closing, exit_price: event.target.value })} /></label><label className="flex flex-col gap-1 text-xs text-meme-text">
                Why you are selling
                <TextInput value={closing.exit_reason} maxLength={2e3} onChange={(event) => setClosing({ ...closing, exit_reason: event.target.value })} /></label></div>{closeError && <p role="alert" className="m-0 text-[13px] text-meme-danger">{closeError}</p>}<div className="flex gap-2"><PrimaryButton>Save exit</PrimaryButton><SecondaryButton onClick={() => setClosing(null)}>Cancel</SecondaryButton></div></form> : <div className="flex gap-2">{trade.exit_price === null && <SecondaryButton
      onClick={() => {
        setCloseError("");
        setClosing({ id: trade.id, exit_price: "", exit_reason: "" });
      }}
    >
                Close trade
              </SecondaryButton>}{confirmingId === trade.id ? <><DangerButton type="button" onClick={() => remove(trade)}>
                  Confirm delete
                </DangerButton><SecondaryButton onClick={() => setConfirmingId(null)}>Cancel</SecondaryButton></> : <SecondaryButton onClick={() => setConfirmingId(trade.id)}>Delete</SecondaryButton>}</div>}</li>;
  }
  return <div className="flex flex-col gap-4"><form onSubmit={add} className="flex flex-col gap-3 rounded-[10px] border border-meme-border bg-meme-panel p-5"><h2 className="m-0 text-[15px] font-semibold text-meme-text">Log a trade</h2><div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><label className="flex flex-col gap-1 text-sm text-meme-text">
            Chain
            <select
    value={form.chain}
    onChange={(event) => setForm({ ...form, chain: event.target.value })}
    className="w-full rounded-md border border-meme-border bg-meme-bg px-3 py-2.5 font-poppins text-sm text-meme-text focus:outline-2 focus:outline-offset-1 focus:outline-meme-accent"
  >{CHAINS.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label><label className="flex flex-col gap-1 text-sm text-meme-text">
            Token address
            <TextInput value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} autoComplete="off" /></label><label className="flex flex-col gap-1 text-sm text-meme-text">
            Symbol (optional)
            <TextInput value={form.symbol} maxLength={64} onChange={(event) => setForm({ ...form, symbol: event.target.value })} /></label><label className="flex flex-col gap-1 text-sm text-meme-text">
            Entry price (USD per token)
            <TextInput value={form.entry_price} inputMode="decimal" onChange={(event) => setForm({ ...form, entry_price: event.target.value })} /></label><label className="flex flex-col gap-1 text-sm text-meme-text">
            Amount in USD (optional)
            <TextInput value={form.amount_usd} inputMode="decimal" onChange={(event) => setForm({ ...form, amount_usd: event.target.value })} /></label><label className="flex flex-col gap-1 text-sm text-meme-text sm:col-span-2">
            Why you are entering
            <TextInput value={form.entry_reason} maxLength={2e3} onChange={(event) => setForm({ ...form, entry_reason: event.target.value })} /></label></div>{reportId !== null && <p className="m-0 text-xs text-meme-dim">
            Linked to <Link href={`/memecoin/history/${reportId}`} className="text-meme-accent">saved report #{reportId}</Link>.{" "}<button type="button" onClick={() => setReportId(null)} className="cursor-pointer border-0 bg-transparent p-0 text-xs text-meme-dim underline">
              Unlink
            </button></p>}{formError && <p role="alert" className="m-0 text-[13px] text-meme-danger">{formError}</p>}<div><PrimaryButton disabled={saving}>{saving ? "Saving\u2026" : "Save trade"}</PrimaryButton></div></form>{loadError && <Panel title="Journal unavailable"><p role="alert" className="m-0 text-sm text-meme-danger">{loadError}</p></Panel>}{!loadError && trades === null && <p role="status" className="m-0 text-sm text-meme-dim">Loading the journal…</p>}{listError && <p role="alert" className="m-0 text-sm text-meme-danger">{listError}</p>}{trades !== null && <><Panel title={`Open trades (${open.length})`}>{open.length === 0 ? <p className="m-0 text-sm text-meme-dim">No open trades.</p> : <ul className="m-0 list-none divide-y divide-meme-border p-0">{open.map(tradeRow)}</ul>}</Panel><Panel title={`Closed trades (${closed.length})`}>{averagePnl !== null && <p className="m-0 mb-2 text-xs text-meme-dim">{wins} of {closed.length} in profit · average {pnlText(averagePnl)}</p>}{closed.length === 0 ? <p className="m-0 text-sm text-meme-dim">No closed trades yet.</p> : <ul className="m-0 list-none divide-y divide-meme-border p-0">{closed.map(tradeRow)}</ul>}</Panel></>}</div>;
}

import { useEffect, useState } from "react";
import api from "./api";
import { errorMessage } from "./api";
import { TextInput } from "./ui";
import { PrimaryButton } from "./ui";
import { SecondaryButton } from "./ui";
import { DangerButton } from "./ui";
import { Panel } from "./ReportView";
import { isAnyAddress } from "./chains";
const LISTS = [
  {
    value: "blacklist",
    title: "Blacklist",
    help: "A coin whose creator is on this list is Avoid; a top-10 holder on it adds a warning. Scam devs and bundle wallets go here."
  },
  {
    value: "good_dev",
    title: "Good devs",
    help: "Creators worth following. Solana wallets are watched for buys and launches on the Watch tab; it does not change verdicts."
  },
  {
    value: "watch",
    title: "Watch list",
    help: "Traders and influencers to follow. Solana wallets are watched for buys on the Watch tab; EVM wallets are not watched yet."
  }
];
const EMPTY_FORM = { address: "", list: "blacklist", label: "", note: "" };
export default function WalletLists() {
  const [wallets, setWallets] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmingId, setConfirmingId] = useState(null);
  const [deleteError, setDeleteError] = useState("");
  useEffect(() => {
    let active = true;
    api.get("/memecoin/wallets").then((response) => {
      if (active) setWallets(response.data);
    }).catch((err) => {
      if (active) setLoadError(errorMessage(err, "Could not load the wallet lists."));
    });
    return () => {
      active = false;
    };
  }, []);
  async function add(event) {
    event.preventDefault();
    const address = form.address.trim();
    if (!isAnyAddress(address)) {
      setFormError("Enter a full Solana or EVM wallet address.");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      const response = await api.post("/memecoin/wallets", {
        address,
        list: form.list,
        label: form.label.trim() || null,
        note: form.note.trim() || null
      });
      setWallets((current) => [response.data, ...current ?? []]);
      setForm({ ...EMPTY_FORM, list: form.list });
    } catch (err) {
      setFormError(errorMessage(err, "Could not add the wallet."));
    } finally {
      setSaving(false);
    }
  }
  async function remove(wallet) {
    setDeleteError("");
    try {
      await api.delete(`/memecoin/wallets/${wallet.id}`);
      setWallets((current) => (current ?? []).filter((item) => item.id !== wallet.id));
    } catch (err) {
      setDeleteError(errorMessage(err, "Could not delete the wallet."));
    } finally {
      setConfirmingId(null);
    }
  }
  return <div className="flex flex-col gap-4"><form onSubmit={add} className="flex flex-col gap-3 rounded-[10px] border border-meme-border bg-meme-panel p-5"><h2 className="m-0 text-[15px] font-semibold text-meme-text">Add a wallet</h2><div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><label className="flex flex-col gap-1 text-sm text-meme-text sm:col-span-2">
            Wallet address
            <TextInput value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} autoComplete="off" /></label><label className="flex flex-col gap-1 text-sm text-meme-text">
            List
            <select
    value={form.list}
    onChange={(event) => setForm({ ...form, list: event.target.value })}
    className="w-full rounded-md border border-meme-border bg-meme-bg px-3 py-2.5 font-poppins text-sm text-meme-text focus:outline-2 focus:outline-offset-1 focus:outline-meme-accent"
  >{LISTS.map((list) => <option key={list.value} value={list.value}>{list.title}</option>)}</select></label><label className="flex flex-col gap-1 text-sm text-meme-text">
            Label (optional)
            <TextInput value={form.label} onChange={(event) => setForm({ ...form, label: event.target.value })} maxLength={100} placeholder="scam dev, bundle wallet…" /></label><label className="flex flex-col gap-1 text-sm text-meme-text sm:col-span-2">
            Note (optional)
            <TextInput value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} maxLength={1e3} placeholder="Why it is on the list" /></label></div>{formError && <p role="alert" className="m-0 text-[13px] text-meme-danger">{formError}</p>}<div><PrimaryButton disabled={saving}>{saving ? "Adding\u2026" : "Add wallet"}</PrimaryButton></div></form>{loadError && <Panel title="Wallet lists unavailable"><p role="alert" className="m-0 text-sm text-meme-danger">{loadError}</p></Panel>}{!loadError && wallets === null && <p role="status" className="m-0 text-sm text-meme-dim">Loading wallet lists…</p>}{deleteError && <p role="alert" className="m-0 text-sm text-meme-danger">{deleteError}</p>}{wallets !== null && LISTS.map((list) => {
    const items = wallets.filter((wallet) => wallet.list === list.value);
    return <Panel key={list.value} title={`${list.title} (${items.length})`}><p className="m-0 mb-3 text-xs text-meme-dim">{list.help}</p>{items.length === 0 ? <p className="m-0 text-sm text-meme-dim">No wallets yet.</p> : <ul className="m-0 list-none divide-y divide-meme-border p-0">{items.map((wallet) => <li key={wallet.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0 text-sm"><p className="m-0 break-all font-mono text-xs text-meme-text">{wallet.address}</p><p className="m-0 mt-1 text-meme-dim">{[wallet.label, wallet.note].filter(Boolean).join(" \xB7 ") || "No label"} · added{" "}{new Date(wallet.created_at).toLocaleDateString()}{wallet.list !== "blacklist" && ` \xB7 ${wallet.last_checked_at ? `checked ${new Date(wallet.last_checked_at).toLocaleString()}` : "not checked yet"}`}</p></div><div className="flex shrink-0 gap-2">{confirmingId === wallet.id ? <><DangerButton type="button" onClick={() => remove(wallet)}>
                              Confirm delete
                            </DangerButton><SecondaryButton onClick={() => setConfirmingId(null)}>Cancel</SecondaryButton></> : <SecondaryButton onClick={() => setConfirmingId(wallet.id)} aria-label={`Delete ${wallet.address}`}>
                            Delete
                          </SecondaryButton>}</div></li>)}</ul>}</Panel>;
  })}</div>;
}

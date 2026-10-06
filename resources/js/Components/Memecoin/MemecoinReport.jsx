import { useEffect, useState } from "react";
import { Link } from "@inertiajs/react";
import api from "./api";
import { errorMessage } from "./api";
import { SecondaryButton } from "./ui";
import ReportView, { Panel, journalHref } from "./ReportView";
export default function MemecoinReport({ chain, address }) {
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [blacklistStatus, setBlacklistStatus] = useState("");
  const [blacklisting, setBlacklisting] = useState(false);
  useEffect(() => {
    let active = true;
    api.get(`/memecoin/analyze/${chain}/${address}`).then((response) => {
      if (active) setReport(response.data);
    }).catch((err) => {
      if (active) setError(errorMessage(err, "Could not load the report. Try again."));
    });
    return () => {
      active = false;
    };
  }, [chain, address, attempt]);
  function retry() {
    setError("");
    setReport(null);
    setAttempt((n) => n + 1);
  }
  async function blacklistCreator(creator2) {
    setBlacklisting(true);
    setBlacklistStatus("");
    try {
      await api.post("/memecoin/wallets", { address: creator2, list: "blacklist", label: "scam dev" });
      setBlacklistStatus("Creator added to the blacklist.");
      retry();
    } catch (err) {
      setBlacklistStatus(errorMessage(err, "Could not add the creator to the blacklist."));
    } finally {
      setBlacklisting(false);
    }
  }
  const creator = report?.safety?.creator ?? null;
  const creatorBlacklisted = report?.assessment.findings.some((finding) => finding.rule === "creator_blacklisted") ?? false;
  return <div className="flex flex-col gap-4"><Link href="/memecoin" className="self-start text-sm text-meme-dim no-underline hover:text-meme-accent">
        ← Back to search
      </Link>{blacklistStatus && <p role="status" className="m-0 text-sm text-meme-dim">{blacklistStatus}</p>}{error ? <Panel title="Report unavailable"><p role="alert" className="m-0 text-sm text-meme-danger">{error}</p><div className="mt-3"><SecondaryButton onClick={retry}>Retry</SecondaryButton></div></Panel> : report === null ? <Panel title="Checking the coin…"><p role="status" className="m-0 text-sm text-meme-dim">
            Collecting market and contract safety data. Large reports can take a little longer.
          </p></Panel> : <ReportView
    live
    report={report}
    actions={<><SecondaryButton onClick={retry}>Refresh full report</SecondaryButton><Link
      href={journalHref(report)}
      className="rounded-md border border-meme-border px-3.5 py-2 text-[13px] font-medium text-meme-dim no-underline hover:bg-meme-border hover:text-meme-text"
    >
                Log a trade
              </Link>{creator && !creatorBlacklisted && <SecondaryButton disabled={blacklisting} onClick={() => blacklistCreator(creator)}>{blacklisting ? "Adding\u2026" : "Add creator to blacklist"}</SecondaryButton>}</>}
  />}</div>;
}

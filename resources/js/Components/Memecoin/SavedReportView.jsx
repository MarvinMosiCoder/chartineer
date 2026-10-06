import { useEffect, useState } from "react";
import { Link } from "@inertiajs/react";
import api from "./api";
import { errorMessage } from "./api";
import ReportView, { Panel, journalHref } from "./ReportView";
export default function SavedReportView({ id }) {
  const [saved, setSaved] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api.get(`/memecoin/reports/${id}`).then((response) => {
      if (active) setSaved(response.data);
    }).catch((err) => {
      if (active) setError(errorMessage(err, "Could not load the saved report."));
    });
    return () => {
      active = false;
    };
  }, [id]);
  return <div className="flex flex-col gap-4"><Link href="/memecoin/history" className="self-start text-sm text-meme-dim no-underline hover:text-meme-accent">
        ← Back to history
      </Link>{error ? <Panel title="Saved report unavailable"><p role="alert" className="m-0 text-sm text-meme-danger">{error}</p></Panel> : saved === null ? <p role="status" className="m-0 text-sm text-meme-dim">Loading the saved report…</p> : <ReportView
    report={saved.report}
    note={<p className="m-0 rounded-md border border-meme-border px-3 py-2 text-xs text-meme-dim">
              Saved report. The coin may have changed since it was checked.{" "}<Link href={`/memecoin/${saved.chain}/${saved.address}`} className="text-meme-accent">
                Check it again now
              </Link></p>}
    actions={<Link
      href={journalHref(saved.report, saved.id)}
      className="rounded-md border border-meme-border px-3.5 py-2 text-[13px] font-medium text-meme-dim no-underline hover:bg-meme-border hover:text-meme-text"
    >
              Log a trade from this report
            </Link>}
  />}</div>;
}

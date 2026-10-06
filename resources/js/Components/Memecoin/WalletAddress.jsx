import { useState } from "react";
import { Link } from "@inertiajs/react";
export default function WalletAddress({ address, chain, relationship = "creator" }) {
  const [message, setMessage] = useState("");
  async function copy() {
    try {
      await navigator.clipboard.writeText(address);
      setMessage("Copied!");
    } catch {
      setMessage("Copy unavailable. Select and copy the address below.");
    }
  }
  const params = new URLSearchParams({ address, chain, relationship });
  return <span className="inline-flex min-w-0 max-w-full flex-col items-end gap-1"><span className="break-all select-all font-mono text-xs">{address}</span><span className="flex flex-wrap justify-end gap-3 font-poppins text-xs"><button type="button" onClick={copy} aria-label={`Copy ${relationship} wallet address`} className="text-meme-accent">Copy</button><Link href={`/memecoin/creators?${params}`} className="text-meme-accent">{relationship === "creator" ? "View created coins" : "View owned contracts"}</Link></span>{message && <span role="status" className="text-xs text-meme-dim">{message}</span>}</span>;
}

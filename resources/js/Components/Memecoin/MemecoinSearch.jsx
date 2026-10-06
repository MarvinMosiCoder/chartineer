import { useState } from "react";
import { Link } from "@inertiajs/react";
import api from "./api";
import { errorMessage } from "./api";
import { TextInput } from "./ui";
import { PrimaryButton } from "./ui";
import { CHAINS, chainName } from "./chains";
import { age, liquidity, shortAddress, usd } from "./format";
const MIN_QUERY = 2;
const MAX_QUERY = 100;
export default function MemecoinSearch() {
  const [query, setQuery] = useState("");
  const [chain, setChain] = useState("");
  const [results, setResults] = useState(null);
  const [searched, setSearched] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  async function search(event) {
    event.preventDefault();
    const q = query.trim();
    if (q.length < MIN_QUERY) {
      setError(`Type at least ${MIN_QUERY} characters.`);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await api.get("/memecoin/search", { params: chain ? { q, chain } : { q } });
      setResults(response.data);
      setSearched(q);
    } catch (err) {
      setResults(null);
      setError(errorMessage(err, "Search failed. Try again."));
    } finally {
      setLoading(false);
    }
  }
  return <div className="flex flex-col gap-4"><form onSubmit={search} className="flex flex-col gap-3 rounded-[10px] border border-meme-border bg-meme-panel p-5"><label htmlFor="memecoin-query" className="text-sm font-medium text-meme-text">
          Coin name or token address
        </label><div className="flex flex-col gap-2 sm:flex-row"><select
    aria-label="Chain"
    value={chain}
    onChange={(event) => setChain(event.target.value)}
    className="rounded-md border border-meme-border bg-meme-bg px-3 py-2.5 font-poppins text-sm text-meme-text focus:outline-2 focus:outline-offset-1 focus:outline-meme-accent sm:w-44"
  ><option value="">All chains</option>{CHAINS.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select><TextInput
    id="memecoin-query"
    value={query}
    onChange={(event) => setQuery(event.target.value)}
    maxLength={MAX_QUERY}
    placeholder="bonk"
    autoComplete="off"
  /><PrimaryButton disabled={loading} className="shrink-0">{loading ? "Searching\u2026" : "Search"}</PrimaryButton></div>{error && <p role="alert" className="m-0 text-[13px] text-meme-danger">{error}</p>}<p className="m-0 text-xs text-meme-dim">{CHAINS.map((option) => option.name).join(", ")}. Most traded first. A risk picture, not investment advice.
        </p></form>{results !== null && <div className="rounded-[10px] border border-meme-border bg-meme-panel">{results.length === 0 ? <p className="m-0 p-5 text-sm text-meme-dim">No token on {chain ? chainName(chain) : "a supported chain"} matches “{searched}”.</p> : <ul className="m-0 list-none divide-y divide-meme-border p-0">{results.map((token) => <li key={`${token.chain}:${token.address}`}><Link
    href={`/memecoin/${token.chain}/${token.address}`}
    className="flex flex-col gap-1 px-5 py-3 text-meme-text no-underline hover:bg-meme-bg sm:flex-row sm:items-center sm:justify-between sm:gap-4"
  ><span className="min-w-0"><span className="mr-2 rounded border border-meme-border px-1.5 text-[11px] text-meme-dim">{chainName(token.chain)}</span><span className="font-medium">{token.symbol ?? "?"}</span>{" "}<span className="text-sm text-meme-dim">{token.name}</span><span className="block font-mono text-xs text-meme-dim">{shortAddress(token.address)}</span></span><span className="flex shrink-0 gap-4 font-mono text-xs text-meme-dim"><span>liq {liquidity(token)}</span><span>vol {usd(token.total_volume_24h)}</span><span>{token.pools} {token.pools === 1 ? "pool" : "pools"}</span><span>{age(token.age_hours)}</span></span></Link></li>)}</ul>}</div>}</div>;
}

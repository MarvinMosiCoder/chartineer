import { Link } from "@inertiajs/react";
import ScalpPanel from "./ScalpPanel";
import WalletAddress from "./WalletAddress";
import { CHAINS, chainById, explorerUrl } from "./chains";
import { age, count, date, liquidity, pct, price, shortAddress, usd, yesNo } from "./format";
const HIGH_RISK_SCORE = 40;
const DEAD_MARKET_CAP_USD = 1e4;
const CREATOR_TOKENS_SHOWN = 10;
const VERDICT_DOT = {
  Avoid: "bg-meme-danger",
  "High risk": "bg-meme-palette-amber",
  Watch: "bg-meme-accent"
};
export function VerdictBadge({ verdict }) {
  return <span className="inline-flex shrink-0 items-center gap-2 rounded-full border border-meme-border px-3 py-1 text-sm font-semibold text-meme-text"><span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${VERDICT_DOT[verdict]}`} />{verdict}</span>;
}
export default function ReportView({ report, actions, note, live = false }) {
  const { market, safety, web, assessment, errors } = report;
  const symbol = market?.symbol ?? safety?.symbol ?? null;
  const name = market?.name ?? safety?.name ?? null;
  const riskFromMissingData = assessment.verdict === "High risk" && assessment.score < HIGH_RISK_SCORE;
  const chain = chainById(report.chain) ?? CHAINS[0];
  const evm = chain.family === "evm";
  const source = evm ? "GoPlus" : "RugCheck";
  const sourceError = evm ? errors.goplus : errors.rugcheck;
  const links = [
    { label: "DexScreener", href: market?.url ?? `https://dexscreener.com/${chain.id}/${report.address}` },
    evm ? { label: "GoPlus", href: `https://gopluslabs.io/token-security/${chain.goplusId}/${report.address}` } : { label: "RugCheck", href: `https://rugcheck.xyz/tokens/${report.address}` },
    { label: chain.explorerName, href: explorerUrl(chain, report.address) }
  ];
  return <><section className="flex flex-col gap-3 rounded-[10px] border border-meme-border bg-meme-panel p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><h2 className="m-0 text-lg font-semibold text-meme-text">{symbol ?? "Unknown token"} <span className="text-sm font-normal text-meme-dim">{name}</span></h2><p className="m-0 mt-1 text-xs font-medium text-meme-dim">{chain.name}</p><p className="m-0 mt-0.5 break-all font-mono text-xs text-meme-dim">{report.address}</p></div><div className="flex shrink-0 items-center gap-3"><VerdictBadge verdict={assessment.verdict} /><span className="font-mono text-sm text-meme-dim">risk {assessment.score}/100</span></div></div><p className="m-0 text-xs text-meme-dim">
          Checked {new Date(report.checked_at).toLocaleString()}. A report is reused for 5 minutes. A risk picture, not investment advice.
        </p>{note}<div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">{links.map((link) => <a key={link.label} href={link.href} target="_blank" rel="noopener noreferrer" className="text-meme-accent">{link.label} ↗
            </a>)}</div>{actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}</section><ScalpPanel key={`${report.chain}:${report.address}:${report.checked_at}`} report={report} live={live} /><Panel title="Red flags">{assessment.findings.length === 0 ? <p className="m-0 text-sm text-meme-dim">No red flags found.</p> : <ul className="m-0 flex list-none flex-col gap-2 p-0">{sortFindings(assessment.findings).map((finding) => <li key={finding.rule} className="flex items-start gap-2 text-sm text-meme-text"><span
    className={`shrink-0 rounded px-1.5 font-mono text-[11px] font-semibold uppercase ${finding.severity === "fail" ? "bg-meme-danger-soft text-meme-danger" : "bg-meme-border text-meme-dim"}`}
  >{finding.severity}</span>{finding.message}</li>)}</ul>}{assessment.verdict === "Watch" && <p className="m-0 mt-3 text-xs text-meme-dim">Watch is the best verdict the rules give. It is not a buy signal.</p>}{assessment.unchecked.length > 0 && <p className="m-0 mt-3 text-xs text-meme-dim">
            Not checked (data missing): {assessment.unchecked.map((rule) => rule.replace(/_/g, " ")).join(", ")}.
            {riskFromMissingData && " Checks that could not run count against the coin, so the verdict is High risk."}</p>}</Panel><Panel title="Market (DexScreener)">{market ? <Facts><Fact label="Price">{price(market.price_usd)}</Fact><Fact label="Liquidity">{liquidity(market)} in {market.pools} {market.pools === 1 ? "pool" : "pools"}</Fact><Fact label="Volume 24h">{usd(market.total_volume_24h)}</Fact><Fact label="Buys / sells 24h">{count(market.buys_24h)} / {count(market.sells_24h)}</Fact><Fact label="Main pool age">{age(market.age_hours)}</Fact><Fact label="Main pool DEX">{market.dex ?? "?"}</Fact></Facts> : <Unavailable reason={errors.dexscreener} fallback="DexScreener has no trading pairs for this token." />}</Panel><Panel title={`Safety (${source})`}>{safety ? <>{evm ? <EvmFacts safety={safety} chain={report.chain} /> : <Facts><Fact label="Mint authority">{authority(safety.mint_authority)}</Fact><Fact label="Freeze authority">{authority(safety.freeze_authority)}</Fact><Fact label="LP locked or burned">{pct(safety.lp_locked_pct)}</Fact><Fact label="Holders">{count(safety.total_holders)}</Fact><Fact label="Top 10 hold">{pct(safety.top10_pct)} ({count(safety.top10_insiders)} insiders)
              </Fact><Fact label="Creator holds">{pct(safety.creator_pct)}</Fact><Fact label="Transfer fee">{pct(safety.transfer_fee_pct)}</Fact><Fact label="Mutable metadata">{yesNo(safety.mutable_metadata)}</Fact><Fact label="Launchpad">{safety.launchpad ?? "-"}</Fact><Fact label="Rugged">{yesNo(safety.rugged)}</Fact><Fact label="RugCheck score">{count(safety.rugcheck_score)} / 100</Fact><Fact label="Creator">{safety.creator ? <WalletAddress address={safety.creator} chain={report.chain} /> : "?"}</Fact><Fact label="Linked wallets">{pct(safety.linked_wallets_pct)} in {safety.insider_networks.length} {safety.insider_networks.length === 1 ? "group" : "groups"}</Fact></Facts>}{safety.risks.length > 0 && <ul className="m-0 mt-4 flex list-none flex-col gap-1.5 p-0 text-sm">{safety.risks.map((risk, index) => <li key={`${risk.name}-${index}`} className="text-meme-text"><span className="font-mono text-xs uppercase text-meme-dim">{risk.level ?? "?"}</span> {risk.name}{risk.description && <span className="text-meme-dim">: {risk.description}</span>}</li>)}</ul>}{safety.top_holders.length > 0 && <details className="mt-4 text-sm"><summary className="cursor-pointer text-meme-dim">Top holders (pools{evm ? " and burn addresses" : ""} excluded)</summary><ol className="m-0 mt-2 flex flex-col gap-1 pl-6 font-mono text-xs text-meme-text">{safety.top_holders.map((holder, index) => <li key={`${holder.owner}-${index}`}>{holder.pct.toFixed(2)}% {holder.owner ? shortAddress(holder.owner) : "?"}{holder.label && ` ${holder.label}`}{holder.insider && " insider"}</li>)}</ol></details>}</> : <Unavailable reason={sourceError} fallback={`${source} returned no data for this token.`} />}</Panel>{evm ? <Panel title="Creator history (GoPlus)">{safety === null ? <Unavailable reason={sourceError} fallback="GoPlus returned no data for this token." /> : <p className="m-0 text-sm text-meme-text">{creatorHoneypots(safety.creator_made_honeypots)}</p>}<p className="m-0 mt-2 text-xs text-meme-dim">A creator&apos;s other launches come from RugCheck, which covers Solana only.</p></Panel> : <Panel title="Creator history (RugCheck)">{safety === null ? <Unavailable reason={sourceError} fallback="RugCheck returned no data for this token." /> : safety.creator_tokens === null ? <p className="m-0 text-sm text-meme-dim">RugCheck names no creator, so there is no launch history.</p> : safety.creator_tokens.length === 0 ? <p className="m-0 text-sm text-meme-dim">No other tokens from this creator.</p> : <CreatorTokens tokens={safety.creator_tokens} />}</Panel>}<Panel title="Website and socials">{market === null ? <Unavailable reason={errors.dexscreener} fallback="DexScreener has no trading pairs for this token." /> : <><Facts><Fact label="Website">{web?.website ? <a href={web.website} target="_blank" rel="noopener noreferrer" className="text-meme-accent">{web.domain ?? web.website} ↗
                  </a> : "None listed"}</Fact>{web?.website && <Fact label="Domain registered">{domainAge(web, errors.rdap)}</Fact>}{web?.website && !web.hosted && <Fact label="First Wayback snapshot">{web.wayback_first_at ? date(web.wayback_first_at) : web.wayback_error ? "Unavailable" : "None"}</Fact>}</Facts>{market.socials.length > 0 ? <ul className="m-0 mt-3 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-sm">{market.socials.map((social) => <li key={social.url}><a href={social.url} target="_blank" rel="noopener noreferrer" className="text-meme-accent">{social.type ?? "Link"} ↗
                    </a></li>)}</ul> : <p className="m-0 mt-3 text-sm text-meme-dim">No social accounts listed.</p>}<p className="m-0 mt-3 text-xs text-meme-dim">X account age and followers are not checked: X&apos;s API is paid.</p></>}</Panel></>;
}
function CreatorTokens({ tokens }) {
  const dead = tokens.filter((token) => token.market_cap !== null && token.market_cap < DEAD_MARKET_CAP_USD).length;
  return <><p className="m-0 text-sm text-meme-text">{tokens.length} other {tokens.length === 1 ? "token" : "tokens"}, {dead} worth under {usd(DEAD_MARKET_CAP_USD)}.
      </p><ul className="m-0 mt-2 flex list-none flex-col gap-1 p-0 font-mono text-xs">{tokens.slice(0, CREATOR_TOKENS_SHOWN).map((token) => <li key={token.mint} className="flex flex-wrap gap-x-3"><span className="text-meme-dim">{token.created_at ? new Date(token.created_at).toLocaleString() : "?"}</span><span className="text-meme-text">{usd(token.market_cap)}</span><Link href={`/memecoin/solana/${token.mint}`} className="text-meme-accent">{shortAddress(token.mint)}</Link></li>)}</ul>{tokens.length > CREATOR_TOKENS_SHOWN && <p className="m-0 mt-1 text-xs text-meme-dim">and {tokens.length - CREATOR_TOKENS_SHOWN} more</p>}</>;
}
function flagText(value, yes, no) {
  return value === null ? "?" : value ? yes : no;
}
function EvmFacts({ safety, chain }) {
  const owner = safety.owner_renounced ? "Renounced" : safety.owner ? shortAddress(safety.owner) : "?";
  return <Facts><Fact label="Honeypot">{flagText(safety.honeypot, "Yes: may not be sellable", "No")}</Fact><Fact label="Buy / sell tax">{pct(safety.buy_tax_pct)} / {pct(safety.sell_tax_pct)}</Fact><Fact label="Source verified">{flagText(safety.open_source, "Yes", "No")}</Fact><Fact label="Owner">{safety.owner && !safety.owner_renounced ? <WalletAddress address={safety.owner} chain={chain} relationship="owner" /> : owner}</Fact><Fact label="Owner can mint">{flagText(safety.owner_can_mint, "Yes", "No")}</Fact><Fact label="Owner can change balances">{flagText(safety.owner_can_change_balances, "Yes", "No")}</Fact><Fact label="Can pause transfers">{flagText(safety.transfers_pausable, "Yes", "No")}</Fact><Fact label="Can blacklist wallets">{flagText(safety.can_blacklist, "Yes", "No")}</Fact><Fact label="Upgradeable proxy">{flagText(safety.proxy, "Yes", "No")}</Fact><Fact label="Hidden owner">{flagText(safety.hidden_owner, "Yes", "No")}</Fact><Fact label="Ownership reclaimable">{flagText(safety.can_reclaim_ownership, "Yes", "No")}</Fact><Fact label="LP locked or burned">{pct(safety.lp_locked_pct)}</Fact><Fact label="Holders">{count(safety.total_holders)}</Fact><Fact label="Top 10 hold">{pct(safety.top10_pct)}</Fact><Fact label="Creator holds">{pct(safety.creator_pct)}</Fact><Fact label="Creator">{safety.creator ? <WalletAddress address={safety.creator} chain={chain} /> : "?"}</Fact></Facts>;
}
function creatorHoneypots(made) {
  if (made === null) return "GoPlus could not tell whether this creator made honeypots before.";
  return made ? "GoPlus says this creator has made honeypots before." : "GoPlus knows of no honeypots by this creator.";
}
function domainAge(web, rdapError) {
  if (web.hosted) return `${web.domain} is a shared host; its age is not checked`;
  if (web.domain_age_days !== null) return `${date(web.domain_registered_at)} (${age(web.domain_age_days * 24)} ago)`;
  return rdapError ? "Lookup failed" : "?";
}
export function journalHref(report, reportId) {
  const params = new URLSearchParams({ chain: report.chain, address: report.address });
  const symbol = report.market?.symbol ?? report.safety?.symbol;
  if (symbol) params.set("symbol", symbol);
  if (report.market?.price_usd) params.set("price", String(report.market.price_usd));
  if (reportId !== void 0) params.set("report", String(reportId));
  return `/memecoin/journal?${params}`;
}
function sortFindings(findings) {
  return [...findings].sort((a, b) => Number(b.severity === "fail") - Number(a.severity === "fail"));
}
function authority(value) {
  return value === null ? "Renounced" : `Enabled (${shortAddress(value)})`;
}
export function Panel({ title, children }) {
  return <section className="rounded-[10px] border border-meme-border bg-meme-panel p-5"><h3 className="m-0 mb-3 text-[15px] font-semibold text-meme-text">{title}</h3>{children}</section>;
}
function Facts({ children }) {
  return <dl className="m-0 grid grid-cols-1 gap-x-8 sm:grid-cols-2">{children}</dl>;
}
function Fact({ label, children }) {
  return <div className="flex justify-between gap-4 border-b border-meme-border py-1.5 text-sm"><dt className="text-meme-dim">{label}</dt><dd className="m-0 min-w-0 text-right font-mono text-meme-text">{children}</dd></div>;
}
function Unavailable({ reason, fallback }) {
  return <p className="m-0 text-sm text-meme-dim">{reason ? `Unavailable: ${reason}` : fallback}</p>;
}

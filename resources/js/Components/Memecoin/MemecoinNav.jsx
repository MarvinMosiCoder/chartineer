import { useEffect, useRef, useState } from "react";
import { Link } from "@inertiajs/react";
import { usePathname } from "./ui";
import api from "./api";
const TABS = [
  { href: "/memecoin", label: "Search" },
  { href: "/memecoin/history", label: "History" },
  { href: "/memecoin/wallets", label: "Wallets" },
  { href: "/memecoin/creators", label: "Wallet search" },
  { href: "/memecoin/journal", label: "Journal" },
  { href: "/memecoin/watch", label: "Watch" }
];
const BADGE_REFRESH_MS = 6e4;
export default function MemecoinNav() {
  const pathname = usePathname();
  const [unseen, setUnseen] = useState(0);
  const activeTab = useRef(null);
  const active = TABS.slice(1).find((tab) => pathname === tab.href || pathname.startsWith(`${tab.href}/`))?.href ?? "/memecoin";
  useEffect(() => {
    let active2 = true;
    const refresh = () => api.get("/memecoin/alerts", { params: { limit: 1 } }).then((response) => {
      if (active2) setUnseen(response.data.unseen);
    }).catch(() => {
    });
    refresh();
    const timer = setInterval(refresh, BADGE_REFRESH_MS);
    return () => {
      active2 = false;
      clearInterval(timer);
    };
  }, [pathname]);
  useEffect(() => {
    const reveal = () => activeTab.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
    reveal();
    document.fonts?.ready.then(reveal);
  }, [active, unseen]);
  return <nav aria-label="Memecoin" className="flex gap-0 overflow-x-auto border-b border-meme-border sm:gap-1">{TABS.map((tab) => <Link
    key={tab.href}
    href={tab.href}
    ref={tab.href === active ? activeTab : void 0}
    aria-current={tab.href === active ? "page" : void 0}
    className={`-mb-px shrink-0 border-b-2 px-2 py-2 text-[13px] no-underline sm:px-3 sm:text-sm ${tab.href === active ? "border-meme-accent font-medium text-meme-text" : "border-transparent text-meme-dim hover:text-meme-text"}`}
  >{tab.label}{tab.href === "/memecoin/watch" && unseen > 0 && <span className="ml-1.5 rounded-full bg-meme-accent px-1.5 text-[11px] font-semibold text-white">{unseen}<span className="sr-only"> unseen alerts</span></span>}</Link>)}</nav>;
}

import type { ReactNode } from "react";
import { motion } from "motion/react";
import { ChartColumn, ExternalLink, LogOut, Server } from "lucide-react";
import type { Page } from "../lib/range";
import { Wordmark } from "./Wordmark";
import { cn } from "./styles";

const NAV: { page: Page; label: string; icon: typeof ChartColumn }[] = [
  { page: "analytics", label: "Analytics", icon: ChartColumn },
  { page: "site", label: "Site", icon: Server },
];

const ITEM = "relative flex shrink-0 items-center gap-3 rounded-field px-3 py-2 text-sm whitespace-nowrap transition-colors";
const QUIET = "text-text-muted hover:text-text-primary";

/**
 * From 768px: a 240px sticky sidebar with the nav and, at the bottom, View site and Sign out.
 * Below: a top block with the wordmark row, then one horizontally scrolling row of pills that
 * ends with Sign out. One DOM for both, so nothing is duplicated.
 */
export function Shell({ page, maintenanceOn, onNavigate, onSignOut, children }: { page: Page; maintenanceOn: boolean; onNavigate: (page: Page) => void; onSignOut: () => void; children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col md:flex-row">
      <aside className="flex shrink-0 flex-col border-b border-line bg-surface md:sticky md:top-0 md:h-svh md:w-60 md:self-start md:overflow-y-auto md:border-r md:border-b-0">
        <div className="flex items-center justify-between px-5 py-5">
          <Wordmark />
          <span className="rounded-full bg-brand-dim px-2 py-0.5 text-[10px] font-medium tracking-wide text-brand-link uppercase">Admin</span>
        </div>
        <nav aria-label="Admin" className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-1 md:flex-col">
          {NAV.map((item) => {
            const active = item.page === page;
            const Icon = item.icon;
            return (
              <button key={item.page} type="button" aria-current={active ? "page" : undefined} onClick={() => onNavigate(item.page)} className={cn(ITEM, active ? "text-text-primary" : QUIET)}>
                {active ? <motion.span layoutId="admin-nav" className="absolute inset-0 rounded-field bg-elevated" transition={{ type: "spring", stiffness: 380, damping: 32 }} /> : null}
                <Icon className="relative size-4" />
                <span className="relative">{item.label}</span>
                {item.page === "site" && maintenanceOn ? <span className="relative ml-auto rounded-full bg-warning-dim px-1.5 py-px text-[10px] font-semibold text-warning">On</span> : null}
              </button>
            );
          })}
          <div className="flex gap-1 md:mt-auto md:flex-col md:border-t md:border-line md:pt-3">
            <a href="/" target="_blank" rel="noreferrer" className={cn(ITEM, QUIET)}>
              <ExternalLink className="size-4" />
              View site
            </a>
            <button type="button" onClick={onSignOut} className={cn(ITEM, QUIET)}>
              <LogOut className="size-4" />
              Sign out
            </button>
          </div>
        </nav>
      </aside>
      <main className="min-w-0 flex-1 px-[clamp(20px,4vw,48px)] py-8 md:px-10">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}

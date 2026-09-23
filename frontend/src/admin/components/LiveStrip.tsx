import type { Live, Maintenance } from "../lib/api";
import { formatCount } from "../lib/format";
import { cn } from "./styles";

const PILL = "inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-[13px] whitespace-nowrap";
const NEUTRAL = "border-line/60 bg-surface text-text-muted";

/** "1 fetch", "0 fetches", "2 fetches". "On the site now" needs no noun, so it reads right for 1. */
const noun = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** What is happening right now, whatever the selected range. The dots are decorative; the text says it all. */
export function LiveStrip({ live, maintenance, onGoToSite }: { live: Live; maintenance: Maintenance | null; onGoToSite: () => void }) {
  const active = live.active_now > 0;
  const errors = live.upstream_last_hour > 0;
  return (
    <div className="flex flex-wrap gap-2">
      <span className={cn(PILL, NEUTRAL, "gap-2.5")}>
        <span aria-hidden="true" className="relative flex size-2">
          {active ? <span className="absolute inset-0 rounded-full bg-success opacity-75 motion-safe:animate-ping" /> : null}
          <span className={cn("relative size-2 rounded-full", active ? "bg-success" : "bg-text-muted")} />
        </span>
        <span className="font-semibold text-text-primary tabular-nums">{formatCount(live.active_now)}</span> on the site now
      </span>
      <span className={cn(PILL, NEUTRAL)}>
        <span className="font-semibold text-text-secondary tabular-nums">{formatCount(live.fetches_last_hour)}</span> {noun(live.fetches_last_hour, "fetch", "fetches")} in the last hour
      </span>
      <span className={cn(PILL, errors ? "border-warning/30 bg-warning-dim text-text-primary" : NEUTRAL)}>
        <span className={cn("font-semibold tabular-nums", errors ? "text-warning" : "text-text-secondary")}>{formatCount(live.upstream_last_hour)}</span> {noun(live.upstream_last_hour, "resolver error", "resolver errors")} in the last hour
      </span>
      {maintenance ? (
        <a
          href="?page=site"
          onClick={(e) => {
            e.preventDefault();
            onGoToSite();
          }}
          className={cn(PILL, "font-medium transition-colors hover:border-line-strong", maintenance.on ? "border-warning/30 bg-warning-dim text-warning" : "border-success/30 bg-success-dim text-success")}
        >
          {maintenance.on ? "Maintenance is on" : "Site is live"}
        </a>
      ) : null}
    </div>
  );
}

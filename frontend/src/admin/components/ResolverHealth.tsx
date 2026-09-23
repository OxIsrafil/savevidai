import type { Resolvers } from "../lib/api";
import { COLORS } from "../lib/colors";
import { formatAgo, formatCount, formatPercent, outcomeLabel, platformName } from "../lib/format";
import { successTone } from "../lib/metrics";
import { EmptyState } from "./EmptyState";
import { Panel } from "./Panel";

const TONE_COLOR = { green: COLORS.green, yellow: COLORS.yellow, red: COLORS.red } as const;

/** The rolling 24 hours per resolver: lookups, success rate, the most common failure, the last failure. */
export function ResolverHealth({ data, failed }: { data: Resolvers | null; failed: boolean }) {
  return (
    <Panel title="Last 24 hours" hint="Resolver errors mean the service we use failed, not the visitor's link">
      {data ? (
        <ul className="flex flex-col divide-y divide-line/40">
          {data.platforms.map((row) => {
            const tone = successTone(row.fetches, row.ok);
            return (
              <li key={row.platform} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <div className="min-w-0">
                  <p className="text-sm text-text-primary">{platformName(row.platform)}</p>
                  <p className="text-xs text-text-muted">
                    {`${formatCount(row.fetches)} ${row.fetches === 1 ? "lookup" : "lookups"}`}
                    {row.top_failure ? `, ${outcomeLabel(row.top_failure.outcome)} ${formatCount(row.top_failure.count)}` : ""}
                    {row.last_failure_min_ago != null ? `, last failed ${formatAgo(row.last_failure_min_ago)}` : ""}
                  </p>
                </div>
                {tone === "none" ? (
                  <span className="shrink-0 text-sm text-text-muted">No lookups</span>
                ) : (
                  <span className="shrink-0 text-sm font-semibold tabular-nums" style={{ color: TONE_COLOR[tone] }}>
                    {formatPercent(row.ok / row.fetches)}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      ) : failed ? (
        <EmptyState text="Could not load resolver health" />
      ) : (
        <p className="text-[13px] text-text-muted">Loading</p>
      )}
    </Panel>
  );
}

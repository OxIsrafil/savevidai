import { formatCount, formatPercent } from "../lib/format";
import { EmptyState } from "./EmptyState";

export type Segment = { key: string; label: string; value: number; color: string };

/** One 12px bar split by share (3px gaps, 4px minimum, native titles) with a legend of counts and percents. */
export function SegmentBar({ segments, empty }: { segments: Segment[]; empty: string }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  if (total === 0) return <EmptyState text={empty} />;
  return (
    <div>
      <div className="flex h-3 w-full gap-[3px] overflow-hidden rounded-full">
        {segments
          .filter((s) => s.value > 0)
          .map((s) => (
            <div key={s.key} title={`${s.label}: ${formatCount(s.value)}`} className="h-full first:rounded-l-full last:rounded-r-full" style={{ width: `${(s.value / total) * 100}%`, background: s.color, minWidth: 4 }} />
          ))}
      </div>
      <ul className="mt-5 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        {segments.map((s) => (
          <li key={s.key} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-2.5">
              <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
              <span className="truncate text-text-primary">{s.label}</span>
            </span>
            <span className="flex shrink-0 items-baseline gap-2 tabular-nums">
              <span className="font-semibold text-text-primary">{formatCount(s.value)}</span>
              <span className="w-9 text-right text-xs text-text-muted">{formatPercent(s.value / total)}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

import { useState, type ReactNode } from "react";
import { COLORS } from "../lib/colors";
import { EmptyState } from "./EmptyState";

export type BarRow = { key: string; label: ReactNode; hint?: ReactNode; value: number; display: ReactNode; color?: string; muted?: boolean };

/** Label, figure and a 6px bar sized against the largest row. Long lists fold behind "Show all (n)". */
export function BarList({ rows, empty, color = COLORS.blue, limit }: { rows: BarRow[]; empty: string; color?: string; limit?: number }) {
  const [expanded, setExpanded] = useState(false);
  if (rows.length === 0) return <EmptyState text={empty} />;
  const max = Math.max(1, ...rows.map((r) => r.value));
  const foldable = limit !== undefined && rows.length > limit;
  const visible = foldable && !expanded ? rows.slice(0, limit) : rows;
  return (
    <div>
      <ul className="flex flex-col gap-4">
        {visible.map((r) => (
          <li key={r.key}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="flex min-w-0 items-baseline gap-2">
                <span className={r.muted ? "truncate text-text-muted" : "truncate text-text-primary"}>{r.label}</span>
                {r.hint ? <span className="shrink-0 text-xs text-text-muted">{r.hint}</span> : null}
              </span>
              <span className="shrink-0 text-[13px] text-text-secondary tabular-nums">{r.display}</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
              <div className="h-full rounded-full" style={{ width: `${Math.max(r.value > 0 ? 2 : 0, (r.value / max) * 100)}%`, background: r.color ?? color, opacity: r.muted ? 0.5 : 1 }} />
            </div>
          </li>
        ))}
      </ul>
      {foldable ? (
        <button type="button" onClick={() => setExpanded((v) => !v)} className="mt-4 text-xs text-text-muted underline decoration-dotted underline-offset-4 transition-colors hover:text-text-primary">
          {expanded ? "Show less" : `Show all (${rows.length})`}
        </button>
      ) : null}
    </div>
  );
}

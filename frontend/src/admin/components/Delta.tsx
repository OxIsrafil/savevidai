import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "./styles";

/**
 * "+12%" in green or "-8%" in red, rounded to a whole percent. A rounded 0% is plain muted
 * text; null renders nothing. `invert` treats up as bad (failed fetches, resolver errors).
 */
export function Delta({ value, compare, invert = false }: { value: number | null; compare?: string; invert?: boolean }) {
  if (value == null) return null;
  const pct = Math.round(value * 100);
  const title = compare ? `Compared with ${compare}` : undefined;
  if (pct === 0) {
    return (
      <span title={title} className="font-mono text-[11px] text-text-muted">
        0%
      </span>
    );
  }
  const up = pct > 0;
  const good = invert ? !up : up;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span title={title} className={cn("inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-mono text-[11px] tabular-nums", good ? "bg-success-dim text-success" : "bg-danger-dim text-danger")}>
      <Icon className="size-3" strokeWidth={2.5} aria-hidden="true" />
      {up ? "+" : ""}
      {pct}%
    </span>
  );
}

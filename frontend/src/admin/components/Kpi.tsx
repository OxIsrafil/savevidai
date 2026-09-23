import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { tint } from "../lib/colors";
import { Delta } from "./Delta";
import { CARD, cn } from "./styles";

/** One figure with a 28px tinted icon tile, the change against the period before and a 12px note. */
export function Kpi({ icon: Icon, color, label, value, sub, delta = null, compare, invert }: { icon: LucideIcon; color: string; label: string; value: string; sub?: ReactNode; delta?: number | null; compare?: string; invert?: boolean }) {
  return (
    <div className={cn(CARD, "flex min-w-0 flex-col p-4 sm:p-5")}>
      <div className="flex min-w-0 items-center gap-2.5">
        <span aria-hidden="true" className="grid size-7 shrink-0 place-items-center rounded-full" style={{ background: tint(color), color }}>
          <Icon className="size-3.5" strokeWidth={2.25} />
        </span>
        <p className="truncate text-[13px] text-text-secondary">{label}</p>
      </div>
      <p className="mt-4 truncate text-[24px] leading-none font-semibold tracking-[-0.025em] text-text-primary tabular-nums sm:text-[28px]">{value}</p>
      <div className="mt-2.5 flex min-w-0 items-center gap-2">
        <Delta value={delta} compare={compare} invert={invert} />
        {sub ? <p className="min-w-0 truncate text-xs text-text-muted">{sub}</p> : null}
      </div>
    </div>
  );
}

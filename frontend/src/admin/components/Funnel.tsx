import { COLORS } from "../lib/colors";
import { formatCount, formatPercent } from "../lib/format";

export type FunnelStep = { label: string; value: number };

/** Each bar against the first step, with the share kept from the step before; opacity drops 0.15 per step. */
export function Funnel({ steps }: { steps: FunnelStep[] }) {
  const top = Math.max(1, steps[0]?.value ?? 0);
  return (
    <ol className="flex flex-col gap-4">
      {steps.map((s, i) => {
        const before = i > 0 ? steps[i - 1].value : null;
        const kept = before ? s.value / before : null;
        return (
          <li key={s.label}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="flex items-baseline gap-2.5">
                <span className="w-4 text-xs text-text-muted tabular-nums">{i + 1}</span>
                <span className="text-text-primary">{s.label}</span>
              </span>
              <span className="flex items-baseline gap-3 tabular-nums">
                <span className="text-[15px] font-semibold text-text-primary">{formatCount(s.value)}</span>
                <span className="w-12 text-right text-xs text-text-muted">{kept != null ? formatPercent(kept) : ""}</span>
              </span>
            </div>
            <div className="mt-2 ml-6.5 h-2 overflow-hidden rounded-full bg-white/[0.06]">
              <div className="h-full rounded-full" style={{ width: `${Math.max(s.value > 0 ? 1.5 : 0, (s.value / top) * 100)}%`, background: COLORS.blue, opacity: 1 - i * 0.15 }} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}

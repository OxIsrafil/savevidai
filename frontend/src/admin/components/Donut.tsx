import { Cell, Pie, PieChart } from "recharts";
import { formatPercent } from "../lib/format";
import { EmptyState } from "./EmptyState";

export type Slice = { key: string; label: string; value: number; color: string; display: string; hint?: string };

/**
 * A ring of shares in a fixed 176px box with the total in the middle and a legend beside it
 * (below it under 640px). The box is fixed by spec, so the chart takes its size directly and
 * renders under jsdom without a ResponsiveContainer. The ring does not draw in (spec F2 limits
 * motion), so every sector is there from the first render. It is hidden from screen readers
 * (the legend carries every number), so recharts' keyboard layer is off: no hidden tab stops.
 */
export function Donut({ slices, center, empty }: { slices: Slice[]; center: { value: string; label: string }; empty: string }) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  if (total === 0) return <EmptyState text={empty} />;
  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row">
      <div className="relative size-44 shrink-0">
        <div aria-hidden="true">
          <PieChart width={176} height={176} accessibilityLayer={false}>
            <Pie data={slices} dataKey="value" nameKey="key" innerRadius={58} outerRadius={84} paddingAngle={2} cornerRadius={4} stroke="none" isAnimationActive={false} rootTabIndex={-1}>
              {slices.map((s) => (
                <Cell key={s.key} fill={s.color} />
              ))}
            </Pie>
          </PieChart>
        </div>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <p className="text-[26px] leading-none font-semibold tracking-[-0.025em] text-text-primary tabular-nums">{center.value}</p>
            <p className="mt-1 text-xs text-text-muted">{center.label}</p>
          </div>
        </div>
      </div>
      <ul className="flex w-full min-w-0 flex-col gap-2.5">
        {slices.map((s) => (
          <li key={s.key} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-2.5">
              <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
              <span className="truncate text-text-primary">{s.label}</span>
            </span>
            <span className="flex shrink-0 items-baseline gap-2.5 tabular-nums">
              <span className="text-[13px] text-text-secondary">{s.display}</span>
              <span className="w-9 text-right text-xs text-text-muted">{formatPercent(s.value / total)}</span>
              {s.hint ? <span className="text-xs text-text-muted">{s.hint}</span> : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

import { Cell, Pie, PieChart } from "recharts";
import { formatPercent } from "../lib/format";
import { EmptyState } from "./EmptyState";

/** `muted` greys the legend label, for a catch-all row such as "Other links". */
export type Slice = { key: string; label: string; value: number; color: string; display: string; hint?: string; muted?: boolean };

/**
 * A ring of shares in a fixed 176px box with the total in the middle. The legend sits beside it
 * once the donut's own box is 26rem wide and above it when narrower: a container query, because
 * beside the sidebar a wide screen can still mean a narrow panel. Each row keeps the name and the
 * "worked" share on two lines so the row stays narrow (it needs about 24rem beside the ring).
 * The box is fixed by spec, so the chart takes its size directly and renders under jsdom without
 * a ResponsiveContainer. The ring does not draw in (spec F2 limits motion), so every sector is
 * there from the first render. It is hidden from screen readers (the legend carries every
 * number), so recharts' keyboard layer is off: no hidden tab stops.
 */
export function Donut({ slices, center, empty }: { slices: Slice[]; center: { value: string; label: string }; empty: string }) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  if (total === 0) return <EmptyState text={empty} />;
  return (
    <div className="@container">
      <div className="flex flex-col items-center gap-6 @min-[26rem]:flex-row">
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
            <li key={s.key} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-baseline gap-x-2.5 text-sm">
              <span aria-hidden="true" className="size-2.5 self-center rounded-full" style={{ background: s.color }} />
              <span className={s.muted ? "truncate text-text-muted" : "truncate text-text-primary"}>{s.label}</span>
              <span className="flex items-baseline gap-2.5 tabular-nums">
                <span className="text-[13px] text-text-secondary">{s.display}</span>
                <span className="w-9 text-right text-xs text-text-muted">{formatPercent(s.value / total)}</span>
              </span>
              {s.hint ? <span className="col-start-2 text-xs text-text-muted">{s.hint}</span> : null}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

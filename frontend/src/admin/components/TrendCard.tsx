import { useId, useRef, useState, type KeyboardEvent } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Report, SeriesMetric } from "../lib/api";
import { COLORS, SURFACE } from "../lib/colors";
import { change } from "../lib/delta";
import { formatCompact, formatCount } from "../lib/format";
import { isFlat, trendRows, type TrendRow } from "../lib/metrics";
import { Delta } from "./Delta";
import { CARD, cn, fitStyle } from "./styles";

export const METRICS: { key: SeriesMetric; label: string; color: string; invert?: boolean }[] = [
  { key: "visitors", label: "Visitors", color: COLORS.teal },
  { key: "fetches", label: "Fetches", color: COLORS.blue },
  { key: "downloads", label: "Downloads", color: COLORS.green },
  { key: "failed_fetches", label: "Failed fetches", color: COLORS.red, invert: true },
];

/** Tests pass a fixed size because ResponsiveContainer measures 0x0 under jsdom. */
export type ChartSize = { width: number; height: number };

/** The tooltip body, pure so it can be tested with a fixed payload. Recharts hands the data row as payload[0].payload. */
export function TrendTooltip({ active, payload, color, showPrev }: { active?: boolean; payload?: ReadonlyArray<{ payload?: unknown }>; color: string; showPrev: boolean }) {
  const row = active ? (payload?.[0]?.payload as TrendRow | undefined) : undefined;
  if (!row || row.value == null) return null;
  return (
    <div className="min-w-40 rounded-card border border-line/60 bg-elevated/95 px-3 py-2.5 text-xs shadow-raised backdrop-blur-md">
      <div className="flex items-center justify-between gap-6">
        <span className="flex items-center gap-1.5 text-text-secondary">
          <span aria-hidden="true" className="size-1.5 rounded-full" style={{ background: color }} />
          {row.label}
        </span>
        <span className="font-mono font-medium text-text-primary tabular-nums">{formatCount(row.value)}</span>
      </div>
      {showPrev && row.prev != null ? (
        <div className="mt-1.5 flex items-center justify-between gap-6 text-text-muted">
          <span className="flex items-center gap-1.5">
            <span aria-hidden="true" className="size-1.5 rounded-full" style={{ background: COLORS.gray }} />
            {row.prevLabel}
          </span>
          <span className="font-mono tabular-nums">{formatCount(row.prev)}</span>
        </div>
      ) : null}
    </div>
  );
}

/** Four metric tabs that double as headline numbers, over this period as a filled line and the one before dashed. */
export function TrendCard({ report, compare, size }: { report: Report; compare: string; size?: ChartSize }) {
  const [metric, setMetric] = useState<SeriesMetric>("visitors");
  const uid = useId().replace(/:/g, "");
  const gradientId = `trend-${uid}`;
  const tabId = (key: SeriesMetric) => `trend-${uid}-tab-${key}`;
  const panelId = `trend-${uid}-panel`;
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  // The 700ms draw-in is off when the device asks for reduced motion (spec F2).
  const reduceMotion = useReducedMotion();
  const current = METRICS.find((m) => m.key === metric) ?? METRICS[0];
  const rows = trendRows(report, metric);
  const flat = isFlat(rows);
  const hasPrev = report.has_previous;
  const totals = report.totals;
  const previous = report.previous;

  // WAI-ARIA tabs with automatic activation: only the selected tab is in the Tab order; the
  // arrow keys move and select, wrapping at the ends, and Home and End jump to the first and last.
  function onTabKeyDown(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    const last = METRICS.length - 1;
    const next = e.key === "ArrowRight" ? (i === last ? 0 : i + 1) : e.key === "ArrowLeft" ? (i === 0 ? last : i - 1) : e.key === "Home" ? 0 : e.key === "End" ? last : null;
    if (next === null) return;
    e.preventDefault();
    setMetric(METRICS[next].key);
    tabRefs.current[next]?.focus();
  }

  // The chart is aria-hidden (the tabs carry the numbers), so recharts' keyboard layer is off: no hidden tab stop.
  const chart = (
    <AreaChart data={rows} margin={{ left: 0, right: 8, top: 8, bottom: 0 }} width={size?.width} height={size?.height} accessibilityLayer={false}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={current.color} stopOpacity={0.32} />
          <stop offset="100%" stopColor={current.color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.06)" />
      <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={10} minTickGap={28} tick={{ fill: COLORS.gray, fontSize: 11 }} />
      <YAxis tickLine={false} axisLine={false} width={46} allowDecimals={false} tick={{ fill: COLORS.gray, fontSize: 11 }} tickFormatter={(v: number) => formatCompact(v)} />
      <Tooltip cursor={{ stroke: "rgba(255,255,255,0.18)", strokeWidth: 1 }} content={(p) => <TrendTooltip active={p.active} payload={p.payload} color={current.color} showPrev={hasPrev} />} />
      {hasPrev ? <Area dataKey="prev" type="monotone" stroke={COLORS.gray} strokeOpacity={0.7} strokeWidth={1.5} strokeDasharray="4 4" fill="none" dot={false} activeDot={false} isAnimationActive={false} /> : null}
      <Area dataKey="value" type="monotone" stroke={current.color} strokeWidth={2.25} fill={`url(#${gradientId})`} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: SURFACE }} isAnimationActive={!reduceMotion} animationDuration={700} />
    </AreaChart>
  );

  return (
    <section className={cn(CARD, "overflow-hidden")}>
      <div role="tablist" aria-label="Metric" className="grid grid-cols-2 border-b border-line/50 sm:grid-cols-4" style={fitStyle(METRICS.map((m) => formatCount(totals[m.key])))}>
        {METRICS.map((m, i) => {
          const active = m.key === metric;
          return (
            <button
              key={m.key}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              id={tabId(m.key)}
              role="tab"
              type="button"
              aria-selected={active}
              aria-controls={panelId}
              tabIndex={active ? 0 : -1}
              onClick={() => setMetric(m.key)}
              onKeyDown={(e) => onTabKeyDown(e, i)}
              className={cn(
                // The card clips its overflow, which would cut an outside ring on every edge
                // that meets the card's, so these tabs draw their ring inside. The tabs in the
                // card's top corners take its radius so the ring follows the rounded corner.
                "@container relative flex min-w-0 flex-col items-start border-line/50 px-5 pt-4 pb-4 text-left transition-colors focus-visible:-outline-offset-3 sm:px-6 sm:pt-5",
                i === 0 && "rounded-tl-card",
                i === 1 && "max-sm:rounded-tr-card",
                i === 3 && "sm:rounded-tr-card",
                i < 2 && "max-sm:border-b",
                i % 2 === 0 && "max-sm:border-r",
                i < 3 && "sm:border-r",
                active ? "bg-white/[0.03]" : "hover:bg-white/[0.02]",
              )}
            >
              <span className="flex items-center gap-2 text-[13px] text-text-secondary">
                <span aria-hidden="true" className="size-2 rounded-full transition-opacity" style={{ background: m.color, opacity: active ? 1 : 0.35 }} />
                {m.label}
              </span>
              <span className="mt-2.5 text-[length:min(22px,calc(100cqi/var(--fit)))] leading-none font-semibold tracking-[-0.025em] whitespace-nowrap text-text-primary tabular-nums sm:text-[length:min(26px,calc(100cqi/var(--fit)))]">{formatCount(totals[m.key])}</span>
              <span className="mt-2.5 flex h-5 items-center">
                {previous ? <Delta value={change(totals[m.key], previous[m.key])} compare={compare} invert={m.invert} /> : <span className="text-xs text-text-muted">No earlier period</span>}
              </span>
              {active ? <motion.span layoutId="metric-bar" className="absolute inset-x-0 bottom-0 h-[2px]" style={{ background: m.color }} transition={{ type: "spring", stiffness: 420, damping: 36 }} /> : null}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" id={panelId} aria-labelledby={tabId(metric)} className="px-3 pt-5 pb-4 sm:px-6">
        <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 px-2 text-xs text-text-muted sm:px-0">
          <span className="text-[13px] text-text-secondary">
            {current.label} per {report.bucket}
          </span>
          <span className="flex items-center gap-1.5">
            <span aria-hidden="true" className="h-[2px] w-3 rounded-full" style={{ background: current.color }} />
            This period
          </span>
          {hasPrev ? (
            <span className="flex items-center gap-1.5">
              <span aria-hidden="true" className="w-3 border-t-[1.5px] border-dashed" style={{ borderColor: COLORS.gray }} />
              Period before
            </span>
          ) : null}
        </div>
        <div className="relative">
          <div aria-hidden="true" className="h-64 w-full sm:h-72">
            {size ? (
              chart
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                {chart}
              </ResponsiveContainer>
            )}
          </div>
          {flat ? <p className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-text-muted">Nothing in this range yet</p> : null}
        </div>
      </div>
    </section>
  );
}

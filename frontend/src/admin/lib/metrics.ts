import type { HourRow, Report, SeriesMetric, Totals } from "./api";
import { change } from "./delta";
import { formatBucket } from "./format";

/** Null on a zero denominator; the tile renders a dash. */
export function ratio(num: number, den: number): number | null {
  return den > 0 ? num / den : null;
}

export const successRate = (t: Totals) => ratio(t.ok_fetches, t.fetches);
export const conversion = (t: Totals) => ratio(t.downloaded_visitors, t.visitors);
export const downloadsPerVisitor = (t: Totals) => ratio(t.downloads, t.visitors);
export const visitorsADay = (t: Totals) => ratio(t.complete_day_visitors, t.complete_days);
export const returningShare = (t: Totals) => ratio(t.returning_visitors, t.new_visitors + t.returning_visitors);
export const viewsPerVisitor = (t: Totals) => ratio(t.page_views, t.visitors);

/** Relative change of a derived ratio (spec F4: ratio tiles compare the ratio itself). */
export function ratioDelta(pick: (t: Totals) => number | null, current: Totals, previous: Totals | null): number | null {
  if (!previous) return null;
  const now = pick(current);
  const before = pick(previous);
  if (now == null || before == null) return null;
  return change(now, before);
}

export function countDelta(pick: (t: Totals) => number, current: Totals, previous: Totals | null): number | null {
  return previous ? change(pick(current), pick(previous)) : null;
}

export type TrendRow = { label: string; value: number | null; prev: number | null; prevLabel: string };

/** One metric out of the series, labelled for the axis and the tooltip. */
export function trendRows(report: Report, metric: SeriesMetric): TrendRow[] {
  return report.series.map((p) => ({
    label: formatBucket(p.key),
    value: p.cur ? p.cur[metric] : null,
    prev: p.prev ? p.prev[metric] : null,
    prevLabel: formatBucket(p.prev_key),
  }));
}

/** True when there is nothing to draw in either period. */
export function isFlat(rows: TrendRow[]): boolean {
  return rows.every((r) => !r.value && !r.prev);
}

/** The busiest hour; the earliest wins a tie; null when no hour had a fetch. */
export function peakHour(hours: HourRow[]): HourRow | null {
  let best: HourRow | null = null;
  for (const h of hours) {
    if (h.fetches > 0 && (!best || h.fetches > best.fetches)) best = h;
  }
  return best;
}

export function quietHours(hours: HourRow[]): number {
  return hours.filter((h) => h.fetches === 0).length;
}

/** Resolver health colour: green at 90% and up, yellow at 70% and up, red below, none without lookups.
 *  Judged on the whole percent the Site page shows (the same rounding as formatPercent), so 0.8996,
 *  shown as 90%, is green. */
export function successTone(fetches: number, ok: number): "green" | "yellow" | "red" | "none" {
  if (fetches === 0) return "none";
  const pct = Math.round((ok / fetches) * 100);
  if (pct >= 90) return "green";
  if (pct >= 70) return "yellow";
  return "red";
}

import type { HourRow } from "../lib/api";
import { COLORS } from "../lib/colors";
import { formatCount, formatHour, formatHourRange } from "../lib/format";
import { peakHour, quietHours } from "../lib/metrics";
import { EmptyState } from "./EmptyState";

/** Fetches by local hour: 24 columns in a 144px row; the busiest is solid, the rest fade with how busy they are. */
export function HoursChart({ hours, empty }: { hours: HourRow[]; empty: string }) {
  const peak = peakHour(hours);
  if (!peak) return <EmptyState text={empty} />;
  const quiet = quietHours(hours);
  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <p className="text-[22px] leading-none font-semibold tracking-[-0.02em] text-text-primary tabular-nums">{formatHourRange(peak.hour)}</p>
        <p className="text-xs text-text-muted">
          busiest, {formatCount(peak.fetches)} {peak.fetches === 1 ? "fetch" : "fetches"}
          {quiet ? `. ${quiet} ${quiet === 1 ? "hour" : "hours"} had none` : ""}
        </p>
      </div>
      <div aria-hidden="true" className="mt-6 flex h-36 items-end gap-[3px]">
        {hours.map((h) => (
          <div key={h.hour} title={`${formatHour(h.hour)}, ${formatCount(h.fetches)} ${h.fetches === 1 ? "fetch" : "fetches"}`} className="group flex h-full flex-1 items-end">
            {/* Solid on hover (spec F3): the fade is an inline style, which outranks a plain utility, so the hover opacity is important. */}
            <div
              className="w-full rounded-[4px] transition-opacity group-hover:opacity-100!"
              style={{
                height: `${h.fetches > 0 ? Math.max(6, (h.fetches / peak.fetches) * 100) : 2.5}%`,
                background: h.fetches > 0 ? COLORS.blue : "rgba(255,255,255,0.08)",
                opacity: h.fetches === 0 || h.hour === peak.hour ? 1 : 0.3 + 0.5 * (h.fetches / peak.fetches),
              }}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-text-muted tabular-nums">
        <span>00</span>
        <span>06</span>
        <span>12</span>
        <span>18</span>
        <span>23</span>
      </div>
    </div>
  );
}

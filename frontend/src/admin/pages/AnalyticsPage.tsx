import { useEffect, useRef, useState } from "react";
import { fetchReport, type Maintenance, type RangeKey, type Report } from "../lib/api";
import { compareLabel } from "../lib/delta";
import { formatClock, formatSpan } from "../lib/format";
import { RANGE_TITLES } from "../lib/range";
import { LiveStrip } from "../components/LiveStrip";
import { PageHeader } from "../components/PageHeader";
import { RangeTabs } from "../components/RangeTabs";
import { Reveal } from "../components/Reveal";
import { TrendCard, type ChartSize } from "../components/TrendCard";
import { cn } from "../components/styles";

export type AnalyticsPageProps = {
  range: RangeKey;
  tz: number;
  tick: number;
  maintenance: Maintenance | null;
  onRangeChange: (range: RangeKey) => void;
  onGoToSite: () => void;
  onUnauthorized: () => void;
  onUnavailable: () => void;
  /** Tests pass a fixed chart size; production measures the container. */
  chartSize?: ChartSize;
};

type Loaded = { report: Report; updatedAt: Date };

export function AnalyticsPage({ range, tz, tick, maintenance, onRangeChange, onGoToSite, onUnauthorized, onUnavailable, chartSize }: AnalyticsPageProps) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);
  const loadedRef = useRef(loaded);
  loadedRef.current = loaded;
  const handlers = useRef({ onUnauthorized, onUnavailable });
  handlers.current = { onUnauthorized, onUnavailable };

  // One fetch per range change and per refresh tick. A response that arrives after the
  // range moved on is dropped by the cleanup flag, so the page never shows the wrong range.
  useEffect(() => {
    let alive = true;
    void fetchReport(range, tz).then((result) => {
      if (!alive) return;
      if (result === "unauthorized") {
        handlers.current.onUnauthorized();
        return;
      }
      if (result === "error") {
        if (loadedRef.current === null) handlers.current.onUnavailable();
        else setFailed(true);
        return;
      }
      setLoaded({ report: result, updatedAt: new Date() });
      setFailed(false);
    });
    return () => {
      alive = false;
    };
  }, [range, tz, tick]);

  const report = loaded?.report ?? null;
  // The old numbers stay on screen at 50% until the new range arrives; the pill moved already.
  const pending = report !== null && report.range !== range;
  const note = failed ? "Could not refresh, trying again" : loaded ? `Updated ${formatClock(loaded.updatedAt)}` : undefined;

  return (
    <div>
      <PageHeader
        kicker="Analytics"
        title={RANGE_TITLES[range]}
        subtitle={report ? formatSpan(report.window) : "Your local time"}
        note={note}
        actions={<RangeTabs active={range} onChange={onRangeChange} />}
      />
      {report ? (
        <>
          <Reveal i={1} className="mt-6">
            <LiveStrip live={report.live} maintenance={maintenance} onGoToSite={onGoToSite} />
          </Reveal>
          <div aria-busy={pending} className={cn("transition-opacity duration-300", pending && "pointer-events-none opacity-50")}>
            <Reveal i={2} className="mt-6">
              <TrendCard report={report} compare={compareLabel(report.range)} size={chartSize} />
            </Reveal>
          </div>
        </>
      ) : null}
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { Activity, CircleCheck, Download, Eye, MousePointerClick, RotateCcw, TriangleAlert, Users } from "lucide-react";
import { fetchReport, type Maintenance, type RangeKey, type Report } from "../lib/api";
import { COLORS, outcomeColor, SERIES } from "../lib/colors";
import { compareLabel } from "../lib/delta";
import { countryName, DASH, formatClock, formatCount, formatPeak, formatRatio, formatShare, formatSpan, formatWhole, outcomeLabel, pageLabel, platformName, qualityLabel, sourceLabel } from "../lib/format";
import { conversion, countDelta, downloadsPerVisitor, ratio, ratioDelta, returningShare, successRate, viewsPerVisitor, visitorsADay } from "../lib/metrics";
import { RANGE_TITLES } from "../lib/range";
import { BarList } from "../components/BarList";
import { Donut } from "../components/Donut";
import { EmptyState } from "../components/EmptyState";
import { Footnote } from "../components/Footnote";
import { Funnel } from "../components/Funnel";
import { HoursChart } from "../components/HoursChart";
import { Kpi } from "../components/Kpi";
import { LiveStrip } from "../components/LiveStrip";
import { MiniStats } from "../components/MiniStats";
import { PageHeader } from "../components/PageHeader";
import { Panel } from "../components/Panel";
import { RangeTabs } from "../components/RangeTabs";
import { Reveal } from "../components/Reveal";
import { SegmentBar } from "../components/SegmentBar";
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

const NO_LINKS = "No links pasted in this range yet";
const NO_VISITS = "No visits in this range yet";

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
            <RangeBody report={report} compare={compareLabel(report.range)} />
          </div>
          <Footnote tz={tz} />
        </>
      ) : null}
    </div>
  );
}

function CountryChip({ code }: { code: string }) {
  return <span className="mr-2 rounded-full border border-line/60 bg-white/[0.04] px-1.5 py-0.5 font-mono text-xs text-text-secondary">{code}</span>;
}

/** The eight tiles and the four panel pairs for one report (spec F3, items 3 and 4). */
function RangeBody({ report, compare }: { report: Report; compare: string }) {
  const t = report.totals;
  const p = report.previous;
  const f = report.funnel;
  const today = report.range === "today";
  const outcomeCount = (name: string) => report.outcomes.find((o) => o.outcome === name)?.count ?? 0;
  const unknownVisitors = report.countries.find((c) => c.country === "unknown")?.visitors ?? 0;
  const anyCountry = report.countries.some((c) => c.visitors > 0);
  const splitVisitors = t.new_visitors + t.returning_visitors;

  return (
    <>
      <Reveal i={3} className="mt-4 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Kpi icon={CircleCheck} color={COLORS.green} label="Success rate" value={formatShare(successRate(t))} sub="links that returned media" delta={ratioDelta(successRate, t, p)} compare={compare} />
        <Kpi icon={MousePointerClick} color={COLORS.purple} label="Conversion" value={formatShare(conversion(t))} sub="visitors who downloaded" delta={ratioDelta(conversion, t, p)} compare={compare} />
        <Kpi icon={Download} color={COLORS.blue} label="Downloads per visitor" value={formatRatio(downloadsPerVisitor(t))} sub="per visitor a day" delta={ratioDelta(downloadsPerVisitor, t, p)} compare={compare} />
        <Kpi
          icon={Users}
          color={COLORS.teal}
          label="Visitors a day"
          value={today ? DASH : formatWhole(visitorsADay(t))}
          sub={today ? "needs a full day" : "average of full days"}
          delta={today ? null : ratioDelta(visitorsADay, t, p)}
          compare={compare}
        />
        <Kpi icon={RotateCcw} color={COLORS.orange} label="Returning" value={formatShare(returningShare(t))} sub="of visitors came back" delta={ratioDelta(returningShare, t, p)} compare={compare} />
        <Kpi icon={Eye} color={COLORS.indigo} label="Page views" value={formatCount(t.page_views)} sub={`${formatRatio(viewsPerVisitor(t))} per visitor`} delta={countDelta((x) => x.page_views, t, p)} compare={compare} />
        <Kpi icon={Activity} color={COLORS.yellow} label="Peak at once" value={report.peak ? formatCount(report.peak.count) : DASH} sub={report.peak ? formatPeak(report.peak) : undefined} />
        <Kpi icon={TriangleAlert} color={COLORS.red} label="Resolver errors" value={formatCount(t.upstream_errors)} sub="failures on our side" delta={countDelta((x) => x.upstream_errors, t, p)} compare={compare} invert />
      </Reveal>

      <Reveal i={4} className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="From visit to download" hint="Each visitor counted once a day">
          {f.visitors > 0 ? (
            <Funnel
              steps={[
                { label: "Visitors", value: f.visitors },
                { label: "Pasted a link", value: f.fetched },
                { label: "Got a result", value: f.got_result },
                { label: "Downloaded", value: f.downloaded },
              ]}
            />
          ) : (
            <EmptyState text={NO_VISITS} />
          )}
        </Panel>
        <Panel title="Fetch outcomes" hint="What happened to each link">
          {t.fetches > 0 ? (
            <>
              <MiniStats
                className="mb-6"
                items={[
                  { label: "Worked", value: formatShare(successRate(t)), tone: COLORS.green },
                  { label: "Deleted or missing", value: formatCount(outcomeCount("not_found")) },
                  { label: "Failed on our side", value: formatCount(outcomeCount("upstream_error")) },
                ]}
              />
              <SegmentBar empty={NO_LINKS} segments={report.outcomes.map((o) => ({ key: o.outcome, label: outcomeLabel(o.outcome), value: o.count, color: outcomeColor(o.outcome) }))} />
            </>
          ) : (
            <EmptyState text={NO_LINKS} />
          )}
        </Panel>
      </Reveal>

      <Reveal i={5} className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Platforms" hint="Where the links came from">
          <Donut
            empty={NO_LINKS}
            center={{ value: formatCount(t.fetches), label: t.fetches === 1 ? "fetch" : "fetches" }}
            slices={report.platforms.map((pl, i) => ({
              key: pl.platform,
              label: platformName(pl.platform),
              value: pl.fetches,
              color: SERIES[i % SERIES.length],
              display: formatCount(pl.fetches),
              hint: `${formatShare(ratio(pl.ok, pl.fetches))} worked`,
            }))}
          />
        </Panel>
        <Panel title="Qualities" hint="What people saved">
          <BarList empty="Nothing saved in this range yet" color={COLORS.purple} limit={8} rows={report.qualities.map((q) => ({ key: q.quality, label: qualityLabel(q.quality), value: q.count, display: formatCount(q.count) }))} />
        </Panel>
      </Reveal>

      <Reveal i={6} className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Countries" hint={unknownVisitors > 0 ? "Not known includes every visit from before country lookup came back" : "Where visitors are"}>
          {anyCountry ? (
            <BarList
              empty="No visitors in this range yet"
              color={COLORS.teal}
              rows={report.countries.map((c) =>
                c.country === "unknown"
                  ? { key: "unknown", label: "Not known", value: c.visitors, display: formatCount(c.visitors), muted: true }
                  : {
                      key: c.country,
                      label: (
                        <>
                          <CountryChip code={c.country} />
                          {countryName(c.country)}
                        </>
                      ),
                      value: c.visitors,
                      display: formatCount(c.visitors),
                    },
              )}
            />
          ) : (
            <EmptyState text="No visitors in this range yet" />
          )}
        </Panel>
        <Panel title="Pages" hint="Which pages people used">
          <BarList empty="No page views in this range yet" color={COLORS.blue} rows={report.pages.map((pg) => ({ key: `${pg.platform}:${pg.locale}`, label: pageLabel(pg.platform, pg.locale), value: pg.views, display: formatCount(pg.views) }))} />
        </Panel>
      </Reveal>

      <Reveal i={7} className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Busiest hours" hint="When people use it">
          <HoursChart hours={report.hours} empty={NO_LINKS} />
        </Panel>
        <Panel title="New and returning" hint="From the visit beacon; people who only pasted a link are not split">
          {splitVisitors > 0 ? (
            <>
              <MiniStats
                items={[
                  { label: "Visitors", value: formatCount(splitVisitors) },
                  { label: "New", value: formatCount(t.new_visitors) },
                  { label: "Came back", value: formatShare(returningShare(t)) },
                ]}
              />
              <p className="mt-6 mb-3 text-xs font-medium text-text-secondary">Traffic sources</p>
              <BarList empty="No page views in this range yet" color={COLORS.orange} rows={report.sources.map((s) => ({ key: s.source, label: sourceLabel(s.source), value: s.visits, display: formatCount(s.visits) }))} />
            </>
          ) : (
            <EmptyState text={NO_VISITS} />
          )}
        </Panel>
      </Reveal>
    </>
  );
}

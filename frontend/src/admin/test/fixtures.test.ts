import { expect, test } from "vitest";
import type { Report, SeriesValues } from "../lib/api";
import { EMPTY_REPORT, REPORT_7D, REPORT_7D_NO_PLATFORM, REPORT_90D, REPORT_TODAY, REPORTS, RESOLVERS } from "./fixtures";

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const seriesSum = (r: Report, key: keyof SeriesValues, side: "cur" | "prev") => sum(r.series.map((p) => p[side]?.[key] ?? 0));

const TOTAL_KEYS = [
  "visitors",
  "page_views",
  "fetches",
  "ok_fetches",
  "failed_fetches",
  "upstream_errors",
  "downloads",
  "downloaded_visitors",
  "new_visitors",
  "returning_visitors",
  "complete_days",
  "complete_day_visitors",
];

function checkShape(r: Report) {
  expect(Object.keys(r.totals).sort()).toEqual([...TOTAL_KEYS].sort());
  if (r.previous) expect(Object.keys(r.previous).sort()).toEqual([...TOTAL_KEYS].sort());
  expect(r.hours).toHaveLength(24);
  expect(r.hours.map((h) => h.hour)).toEqual(Array.from({ length: 24 }, (_, i) => i));
  expect(r.countries.at(-1)?.country).toBe("unknown");
  expect(r.countries.length).toBeLessThanOrEqual(11);
  expect(r.pages.length).toBeLessThanOrEqual(12);
  expect(sum(r.outcomes.map((o) => o.count))).toBe(r.totals.fetches);
  // Platforms count only fetches with a platform (spec B3), so they can sum to less.
  expect(sum(r.platforms.map((p) => p.fetches))).toBeLessThanOrEqual(r.totals.fetches);
  expect(sum(r.platforms.map((p) => p.ok))).toBe(r.totals.ok_fetches);
  expect(sum(r.platforms.map((p) => p.downloads))).toBe(r.totals.downloads);
  expect(sum(r.qualities.map((q) => q.count))).toBe(r.totals.downloads);
  expect(sum(r.hours.map((h) => h.fetches))).toBe(r.totals.fetches);
  expect(sum(r.sources.map((s) => s.visits))).toBeLessThanOrEqual(r.totals.page_views);
  expect(sum(r.pages.map((p) => p.views))).toBeLessThanOrEqual(r.totals.page_views);
  expect(sum(r.countries.map((c) => c.visitors))).toBeLessThanOrEqual(r.totals.visitors);
  expect(r.totals.ok_fetches + r.totals.failed_fetches).toBe(r.totals.fetches);
  expect(r.totals.downloaded_visitors).toBe(r.funnel.downloaded);
  expect(r.funnel.visitors).toBe(r.totals.visitors);
  expect(r.funnel.visitors >= r.funnel.fetched && r.funnel.fetched >= r.funnel.got_result && r.funnel.got_result >= r.funnel.downloaded).toBe(true);
  expect(r.totals.new_visitors + r.totals.returning_visitors).toBeLessThanOrEqual(r.totals.visitors);
}

test("7d: daily buckets with a previous period, totals equal the series sums", () => {
  checkShape(REPORT_7D);
  expect(REPORT_7D.bucket).toBe("day");
  expect(REPORT_7D.has_previous).toBe(true);
  expect(REPORT_7D.series).toHaveLength(7);
  expect(REPORT_7D.series[0]).toMatchObject({ key: "2026-09-17", prev_key: "2026-09-10" });
  expect(REPORT_7D.series.every((p) => typeof p.key === "string" && p.cur && p.prev)).toBe(true);
  for (const key of ["visitors", "fetches", "downloads", "failed_fetches"] as const) {
    expect(seriesSum(REPORT_7D, key, "cur")).toBe(REPORT_7D.totals[key]);
    expect(seriesSum(REPORT_7D, key, "prev")).toBe(REPORT_7D.previous![key]);
  }
  expect(REPORT_7D.totals.complete_day_visitors).toBe(1742 - 176);
  expect(REPORT_7D.qualities).toHaveLength(9);
  // Roughly production: 91% ok, 6% not_found, 2% invalid_url, twitter first.
  expect(REPORT_7D.totals.ok_fetches / REPORT_7D.totals.fetches).toBeCloseTo(0.91, 2);
  expect(REPORT_7D.outcomes[1]).toEqual({ outcome: "not_found", count: 163 });
  expect(REPORT_7D.platforms[0].platform).toBe("twitter");
});

test("7d without a platform on the invalid links: the platforms sum to the fetches minus those links", () => {
  checkShape(REPORT_7D_NO_PLATFORM);
  // Every other fixture attributes each fetch to a platform; this one does not.
  for (const r of [REPORT_7D, REPORT_TODAY, REPORT_90D, EMPTY_REPORT]) expect(sum(r.platforms.map((p) => p.fetches))).toBe(r.totals.fetches);
  const invalid = REPORT_7D_NO_PLATFORM.outcomes.find((o) => o.outcome === "invalid_url")?.count ?? 0;
  expect(invalid).toBe(56);
  expect(sum(REPORT_7D_NO_PLATFORM.platforms.map((p) => p.fetches))).toBe(REPORT_7D_NO_PLATFORM.totals.fetches - invalid);
  expect(REPORT_7D_NO_PLATFORM.platforms.every((p) => p.ok <= p.fetches)).toBe(true);
});

test("today: 24 hourly buckets with integer keys, null after the current hour", () => {
  checkShape(REPORT_TODAY);
  expect(REPORT_TODAY.bucket).toBe("hour");
  expect(REPORT_TODAY.window).toEqual({ start: "2026-09-23", end: "2026-09-23" });
  expect(REPORT_TODAY.series).toHaveLength(24);
  expect(REPORT_TODAY.series.map((p) => p.key)).toEqual(Array.from({ length: 24 }, (_, i) => i));
  expect(REPORT_TODAY.series.map((p) => p.prev_key)).toEqual(Array.from({ length: 24 }, (_, i) => i));
  expect(REPORT_TODAY.series.slice(0, 14).every((p) => p.cur && p.prev)).toBe(true);
  expect(REPORT_TODAY.series.slice(14).every((p) => p.cur === null && p.prev === null)).toBe(true);
  for (const key of ["fetches", "downloads", "failed_fetches"] as const) {
    expect(seriesSum(REPORT_TODAY, key, "cur")).toBe(REPORT_TODAY.totals[key]);
    expect(seriesSum(REPORT_TODAY, key, "prev")).toBe(REPORT_TODAY.previous![key]);
  }
  expect(seriesSum(REPORT_TODAY, "visitors", "cur")).toBeGreaterThan(REPORT_TODAY.totals.visitors);
  expect(REPORT_TODAY.totals.complete_days).toBe(0);
  expect(REPORT_TODAY.hours.slice(14).every((h) => h.fetches === 0)).toBe(true);
  expect(REPORT_TODAY.qualities).toHaveLength(8);
});

test("90d: 90 daily buckets, no previous period anywhere, series sums to the totals", () => {
  checkShape(REPORT_90D);
  expect(REPORT_90D.has_previous).toBe(false);
  expect(REPORT_90D.previous).toBeNull();
  expect(REPORT_90D.series).toHaveLength(90);
  expect(REPORT_90D.series.every((p) => p.prev === null && p.cur !== null)).toBe(true);
  expect(REPORT_90D.series[0].key).toBe("2026-06-26");
  expect(REPORT_90D.series[89].key).toBe("2026-09-23");
  expect(REPORT_90D.window).toEqual({ start: "2026-06-26", end: "2026-09-23" });
  for (const key of ["visitors", "fetches", "downloads", "failed_fetches"] as const) {
    expect(seriesSum(REPORT_90D, key, "cur")).toBe(REPORT_90D.totals[key]);
  }
  expect(REPORT_90D.totals.complete_days).toBe(89);
  expect(REPORT_90D.totals.complete_day_visitors).toBe(22646 - (REPORT_90D.series[89].cur?.visitors ?? 0));
  expect(REPORT_90D.series.every((p) => (p.cur?.visitors ?? 0) > 0)).toBe(true);
});

test("the empty report is a valid fresh install", () => {
  checkShape(EMPTY_REPORT);
  expect(EMPTY_REPORT.peak).toBeNull();
  expect(EMPTY_REPORT.countries).toEqual([{ country: "unknown", visitors: 0 }]);
  expect(EMPTY_REPORT.series.every((p) => p.cur?.fetches === 0 && p.prev === null)).toBe(true);
});

test("REPORTS covers every range and RESOLVERS has the five fixed rows in order", () => {
  expect(Object.keys(REPORTS).sort()).toEqual(["30d", "7d", "90d", "today"]);
  expect(REPORTS.today.range).toBe("today");
  expect(REPORTS["30d"].range).toBe("30d");
  expect(RESOLVERS.platforms.map((p) => p.platform)).toEqual(["twitter", "tiktok", "reddit", "instagram", "facebook"]);
  expect(RESOLVERS.platforms[4]).toEqual({ platform: "facebook", fetches: 0, ok: 0, top_failure: null, last_failure_min_ago: null });
  expect(RESOLVERS.platforms.every((p) => p.ok <= p.fetches)).toBe(true);
});

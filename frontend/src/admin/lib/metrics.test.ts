import { expect, test } from "vitest";
import { EMPTY_REPORT, REPORT_7D, REPORT_90D, REPORT_TODAY } from "../test/fixtures";
import {
  conversion,
  countDelta,
  downloadsPerVisitor,
  isFlat,
  peakHour,
  quietHours,
  ratio,
  ratioDelta,
  returningShare,
  successRate,
  successTone,
  trendRows,
  viewsPerVisitor,
  visitorsADay,
} from "./metrics";

const t = REPORT_7D.totals;
const p = REPORT_7D.previous!;

test("ratio is null on a zero denominator", () => {
  expect(ratio(1, 0)).toBeNull();
  expect(ratio(0, 0)).toBeNull();
  expect(ratio(1, 4)).toBe(0.25);
});

test("tile ratios from the 7d fixture", () => {
  expect(successRate(t)).toBeCloseTo(2559 / 2812);
  expect(conversion(t)).toBeCloseTo(1187 / 1742);
  expect(downloadsPerVisitor(t)).toBeCloseTo(2310 / 1742);
  expect(visitorsADay(t)).toBe(261);
  expect(returningShare(t)).toBeCloseTo(402 / 1522);
  expect(viewsPerVisitor(t)).toBeCloseTo(2236 / 1742);
});

test("today has no complete day, so visitors a day is null", () => {
  expect(visitorsADay(REPORT_TODAY.totals)).toBeNull();
});

test("ratio deltas compare the ratio itself and are null without a previous period", () => {
  expect(ratioDelta(successRate, t, p)).toBeCloseTo((2559 / 2812 - 2319 / 2590) / (2319 / 2590));
  expect(ratioDelta(successRate, t, null)).toBeNull();
  expect(ratioDelta(visitorsADay, REPORT_TODAY.totals, REPORT_TODAY.previous)).toBeNull();
  expect(ratioDelta(successRate, REPORT_90D.totals, REPORT_90D.previous)).toBeNull();
});

test("count deltas are relative and null without a previous period", () => {
  expect(countDelta((x) => x.fetches, t, p)).toBeCloseTo((2812 - 2590) / 2590);
  expect(countDelta((x) => x.fetches, t, null)).toBeNull();
});

test("trendRows label buckets and pick one metric from cur and prev", () => {
  const rows = trendRows(REPORT_7D, "fetches");
  expect(rows).toHaveLength(7);
  expect(rows[0]).toEqual({ label: "Sep 17", value: 402, prev: 372, prevLabel: "Sep 10" });
  expect(rows[6]).toEqual({ label: "Sep 23", value: 280, prev: 257, prevLabel: "Sep 16" });
  const hourly = trendRows(REPORT_TODAY, "visitors");
  expect(hourly).toHaveLength(24);
  expect(hourly[0]).toEqual({ label: "00:00", value: 9, prev: 8, prevLabel: "00:00" });
  expect(hourly[13].value).toBe(12);
  expect(hourly[14]).toEqual({ label: "14:00", value: null, prev: null, prevLabel: "14:00" });
  const noPrev = trendRows(REPORT_90D, "downloads");
  expect(noPrev).toHaveLength(90);
  expect(noPrev.every((r) => r.prev === null)).toBe(true);
});

test("isFlat is true only when every value and previous value is empty", () => {
  expect(isFlat(trendRows(EMPTY_REPORT, "fetches"))).toBe(true);
  expect(isFlat(trendRows(REPORT_7D, "fetches"))).toBe(false);
  expect(isFlat([{ label: "a", value: null, prev: 3, prevLabel: "b" }])).toBe(false);
});

test("peakHour is the busiest hour, earliest on a tie, null when empty", () => {
  expect(peakHour(REPORT_7D.hours)).toEqual({ hour: 14, fetches: 196 });
  expect(peakHour(REPORT_TODAY.hours)).toEqual({ hour: 12, fetches: 40 });
  expect(peakHour([{ hour: 0, fetches: 2 }, { hour: 1, fetches: 2 }])).toEqual({ hour: 0, fetches: 2 });
  expect(peakHour(EMPTY_REPORT.hours)).toBeNull();
});

test("quietHours counts empty hours", () => {
  expect(quietHours(REPORT_7D.hours)).toBe(0);
  expect(quietHours(REPORT_TODAY.hours)).toBe(10);
  expect(quietHours(EMPTY_REPORT.hours)).toBe(24);
});

test("successTone: green from 90%, yellow from 70%, red below, none without lookups", () => {
  expect(successTone(0, 0)).toBe("none");
  expect(successTone(100, 90)).toBe("green");
  expect(successTone(100, 89)).toBe("yellow");
  expect(successTone(100, 70)).toBe("yellow");
  expect(successTone(100, 69)).toBe("red");
});

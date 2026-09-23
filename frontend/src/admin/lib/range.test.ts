import { afterEach, expect, test, vi } from "vitest";
import {
  buildSearch,
  bucketWord,
  currentTz,
  DEFAULT_RANGE,
  parsePage,
  parseRange,
  RANGE_KEYS,
  RANGE_LABELS,
  RANGE_TITLES,
  readUrlState,
} from "./range";

afterEach(() => {
  vi.restoreAllMocks();
});

test("range keys, labels and titles", () => {
  expect(RANGE_KEYS).toEqual(["today", "7d", "30d", "90d"]);
  expect(DEFAULT_RANGE).toBe("7d");
  expect(RANGE_LABELS).toEqual({ today: "Today", "7d": "7 days", "30d": "30 days", "90d": "90 days" });
  expect(RANGE_TITLES).toEqual({ today: "Today", "7d": "Last 7 days", "30d": "Last 30 days", "90d": "Last 90 days" });
});

test("parseRange accepts the four keys and falls back to 7d", () => {
  expect(parseRange("today")).toBe("today");
  expect(parseRange("90d")).toBe("90d");
  expect(parseRange("14d")).toBe("7d");
  expect(parseRange("")).toBe("7d");
  expect(parseRange(null)).toBe("7d");
  expect(parseRange(undefined)).toBe("7d");
});

test("parsePage knows site and defaults to analytics", () => {
  expect(parsePage("site")).toBe("site");
  expect(parsePage("orders")).toBe("analytics");
  expect(parsePage(null)).toBe("analytics");
});

test("readUrlState reads page and range from a query string", () => {
  expect(readUrlState("")).toEqual({ page: "analytics", range: "7d" });
  expect(readUrlState("?page=site")).toEqual({ page: "site", range: "7d" });
  expect(readUrlState("?range=today")).toEqual({ page: "analytics", range: "today" });
  expect(readUrlState("?page=site&range=30d")).toEqual({ page: "site", range: "30d" });
  expect(readUrlState("?page=nope&range=nope")).toEqual({ page: "analytics", range: "7d" });
});

test("buildSearch omits defaults and round-trips through readUrlState", () => {
  expect(buildSearch({ page: "analytics", range: "7d" })).toBe("");
  expect(buildSearch({ page: "site", range: "7d" })).toBe("?page=site");
  expect(buildSearch({ page: "analytics", range: "90d" })).toBe("?range=90d");
  expect(buildSearch({ page: "site", range: "today" })).toBe("?page=site&range=today");
  for (const page of ["analytics", "site"] as const) {
    for (const range of RANGE_KEYS) {
      expect(readUrlState(buildSearch({ page, range }))).toEqual({ page, range });
    }
  }
});

test("bucketWord is hour for today and day otherwise", () => {
  expect(bucketWord("today")).toBe("hour");
  expect(bucketWord("7d")).toBe("day");
  expect(bucketWord("90d")).toBe("day");
});

test("currentTz is minutes east of UTC (the sign of getTimezoneOffset flipped)", () => {
  vi.spyOn(Date.prototype, "getTimezoneOffset").mockReturnValue(-360);
  expect(currentTz()).toBe(360);
  vi.spyOn(Date.prototype, "getTimezoneOffset").mockReturnValue(300);
  expect(currentTz()).toBe(-300);
});

test("currentTz is a plain 0 at a zero offset, never -0", () => {
  vi.spyOn(Date.prototype, "getTimezoneOffset").mockReturnValue(0);
  expect(Object.is(currentTz(), 0), "currentTz() must be +0, not -0").toBe(true);
});

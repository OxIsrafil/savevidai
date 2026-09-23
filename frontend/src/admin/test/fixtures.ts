import type { RangeKey, Report, Resolvers, SeriesPoint, SeriesValues } from "../lib/api";

// Fixed "now": 2026-09-23 07:30 UTC, owner at tz +360 (13:30 local). Matches the backend tests.

const LIVE = { active_now: 6, fetches_last_hour: 27, upstream_last_hour: 0 };

function values(visitors: number, fetches: number, downloads: number, failed_fetches: number): SeriesValues {
  return { visitors, fetches, downloads, failed_fetches };
}

// Sep 17 to Sep 23 (last day partial at 13:30 local): visitors, fetches, downloads, failed.
const DAYS_7: [string, SeriesValues][] = [
  ["2026-09-17", values(248, 402, 331, 37)],
  ["2026-09-18", values(255, 415, 342, 39)],
  ["2026-09-19", values(271, 438, 356, 40)],
  ["2026-09-20", values(283, 461, 379, 41)],
  ["2026-09-21", values(262, 419, 344, 38)],
  ["2026-09-22", values(247, 397, 326, 35)],
  ["2026-09-23", values(176, 280, 232, 23)],
];

// Sep 10 to Sep 16, cut at the same hour on the last day.
const DAYS_7_PREV: [string, SeriesValues][] = [
  ["2026-09-10", values(231, 372, 308, 40)],
  ["2026-09-11", values(226, 364, 302, 38)],
  ["2026-09-12", values(238, 381, 316, 41)],
  ["2026-09-13", values(252, 409, 339, 43)],
  ["2026-09-14", values(244, 396, 328, 40)],
  ["2026-09-15", values(258, 411, 340, 37)],
  ["2026-09-16", values(161, 257, 212, 32)],
];

export const REPORT_7D: Report = {
  range: "7d",
  tz: 360,
  bucket: "day",
  has_previous: true,
  window: { start: "2026-09-17", end: "2026-09-23" },
  totals: {
    visitors: 1742,
    page_views: 2236,
    fetches: 2812,
    ok_fetches: 2559,
    failed_fetches: 253,
    upstream_errors: 17,
    downloads: 2310,
    downloaded_visitors: 1187,
    new_visitors: 1120,
    returning_visitors: 402,
    complete_days: 6,
    complete_day_visitors: 1566,
  },
  previous: {
    visitors: 1610,
    page_views: 2040,
    fetches: 2590,
    ok_fetches: 2319,
    failed_fetches: 271,
    upstream_errors: 21,
    downloads: 2145,
    downloaded_visitors: 1098,
    new_visitors: 1050,
    returning_visitors: 360,
    complete_days: 6,
    complete_day_visitors: 1449,
  },
  series: DAYS_7.map(([key, cur], i) => ({ key, prev_key: DAYS_7_PREV[i][0], cur, prev: DAYS_7_PREV[i][1] })),
  peak: { count: 14, day: "2026-09-20", time: "21:15" },
  funnel: { visitors: 1742, fetched: 1388, got_result: 1296, downloaded: 1187 },
  outcomes: [
    { outcome: "ok", count: 2559 },
    { outcome: "not_found", count: 163 },
    { outcome: "invalid_url", count: 56 },
    { outcome: "upstream_error", count: 17 },
    { outcome: "private_or_restricted", count: 8 },
    { outcome: "no_video", count: 6 },
    { outcome: "unsupported_post", count: 3 },
  ],
  platforms: [
    { platform: "twitter", fetches: 1684, ok: 1552, downloads: 1389 },
    { platform: "tiktok", fetches: 612, ok: 551, downloads: 503 },
    { platform: "instagram", fetches: 298, ok: 262, downloads: 236 },
    { platform: "reddit", fetches: 141, ok: 124, downloads: 112 },
    { platform: "facebook", fetches: 77, ok: 70, downloads: 70 },
  ],
  qualities: [
    { quality: "1080p", count: 1102 },
    { quality: "720p", count: 618 },
    { quality: "hd", count: 214 },
    { quality: "photo", count: 158 },
    { quality: "sd", count: 96 },
    { quality: "480p", count: 71 },
    { quality: "album", count: 29 },
    { quality: "sound", count: 14 },
    { quality: "360p", count: 8 },
  ],
  countries: [
    { country: "US", visitors: 412 },
    { country: "IN", visitors: 298 },
    { country: "BD", visitors: 187 },
    { country: "GB", visitors: 121 },
    { country: "ID", visitors: 96 },
    { country: "PH", visitors: 84 },
    { country: "BR", visitors: 73 },
    { country: "DE", visitors: 61 },
    { country: "NG", visitors: 55 },
    { country: "CA", visitors: 41 },
    { country: "unknown", visitors: 290 },
  ],
  pages: [
    { platform: "twitter", locale: "en", views: 986 },
    { platform: "tiktok", locale: "en", views: 412 },
    { platform: "instagram", locale: "en", views: 246 },
    { platform: "twitter", locale: "es", views: 131 },
    { platform: "reddit", locale: "en", views: 118 },
    { platform: "twitter", locale: "hi", views: 97 },
    { platform: "tiktok", locale: "es", views: 62 },
    { platform: "facebook", locale: "en", views: 58 },
    { platform: "tiktok", locale: "hi", views: 41 },
    { platform: "instagram", locale: "es", views: 33 },
    { platform: "twitter", locale: "unknown", views: 22 },
    { platform: "instagram", locale: "hi", views: 19 },
  ],
  hours: [61, 48, 39, 34, 37, 52, 78, 104, 122, 141, 156, 168, 179, 188, 196, 191, 183, 171, 162, 149, 131, 108, 84, 30].map(
    (fetches, hour) => ({ hour, fetches }),
  ),
  sources: [
    { source: "search", visits: 1204 },
    { source: "direct", visits: 612 },
    { source: "social", visits: 289 },
    { source: "referral", visits: 84 },
    { source: "internal", visits: 47 },
  ],
  live: LIVE,
};

/**
 * The 7-day report the way production shapes the platforms panel: the 56 invalid_url fetches
 * were links no platform matched, so they carry no platform (resolve.py records them without
 * one) and the platforms sum to 2,756 of the 2,812 fetches.
 */
export const REPORT_7D_NO_PLATFORM: Report = {
  ...REPORT_7D,
  platforms: REPORT_7D.platforms.map((p) => (p.platform === "twitter" ? { ...p, fetches: p.fetches - 56 } : p)),
};

// Today, hours 0..13 (13:30 local); hours 14..23 are null in both series.
const HOURS_TODAY: SeriesValues[] = [
  values(9, 14, 11, 1),
  values(7, 10, 8, 1),
  values(5, 8, 6, 0),
  values(4, 7, 6, 1),
  values(6, 8, 7, 0),
  values(8, 12, 10, 1),
  values(12, 18, 15, 2),
  values(15, 23, 19, 2),
  values(17, 27, 22, 2),
  values(19, 31, 26, 3),
  values(22, 34, 28, 3),
  values(23, 37, 31, 3),
  values(25, 40, 33, 4),
  values(12, 11, 10, 0),
];

const HOURS_YESTERDAY: SeriesValues[] = [
  values(8, 12, 10, 1),
  values(6, 9, 7, 1),
  values(5, 7, 5, 0),
  values(4, 6, 5, 0),
  values(5, 8, 6, 1),
  values(7, 11, 9, 1),
  values(11, 16, 13, 1),
  values(13, 21, 17, 2),
  values(15, 24, 20, 2),
  values(17, 28, 23, 2),
  values(20, 32, 26, 3),
  values(21, 33, 28, 3),
  values(23, 37, 31, 3),
  values(11, 13, 12, 1),
];

export const REPORT_TODAY: Report = {
  range: "today",
  tz: 360,
  bucket: "hour",
  has_previous: true,
  window: { start: "2026-09-23", end: "2026-09-23" },
  // visitors is the visitor-day count (176); the hourly series sums to 184 because a
  // person active in two hours counts in both buckets (spec B3).
  totals: {
    visitors: 176,
    page_views: 231,
    fetches: 280,
    ok_fetches: 257,
    failed_fetches: 23,
    upstream_errors: 2,
    downloads: 232,
    downloaded_visitors: 118,
    new_visitors: 121,
    returning_visitors: 38,
    complete_days: 0,
    complete_day_visitors: 0,
  },
  previous: {
    visitors: 161,
    page_views: 208,
    fetches: 257,
    ok_fetches: 236,
    failed_fetches: 21,
    upstream_errors: 1,
    downloads: 212,
    downloaded_visitors: 106,
    new_visitors: 108,
    returning_visitors: 35,
    complete_days: 0,
    complete_day_visitors: 0,
  },
  series: Array.from({ length: 24 }, (_, hour): SeriesPoint => ({
    key: hour,
    prev_key: hour,
    cur: HOURS_TODAY[hour] ?? null,
    prev: HOURS_YESTERDAY[hour] ?? null,
  })),
  peak: { count: 9, day: "2026-09-23", time: "12:40" },
  funnel: { visitors: 176, fetched: 140, got_result: 130, downloaded: 118 },
  outcomes: [
    { outcome: "ok", count: 257 },
    { outcome: "not_found", count: 15 },
    { outcome: "invalid_url", count: 5 },
    { outcome: "upstream_error", count: 2 },
    { outcome: "no_video", count: 1 },
  ],
  platforms: [
    { platform: "twitter", fetches: 168, ok: 155, downloads: 139 },
    { platform: "tiktok", fetches: 61, ok: 56, downloads: 50 },
    { platform: "instagram", fetches: 30, ok: 27, downloads: 24 },
    { platform: "reddit", fetches: 14, ok: 12, downloads: 12 },
    { platform: "facebook", fetches: 7, ok: 7, downloads: 7 },
  ],
  qualities: [
    { quality: "1080p", count: 111 },
    { quality: "720p", count: 62 },
    { quality: "hd", count: 21 },
    { quality: "photo", count: 16 },
    { quality: "sd", count: 10 },
    { quality: "480p", count: 7 },
    { quality: "album", count: 3 },
    { quality: "sound", count: 2 },
  ],
  countries: [
    { country: "US", visitors: 41 },
    { country: "IN", visitors: 30 },
    { country: "BD", visitors: 19 },
    { country: "GB", visitors: 12 },
    { country: "ID", visitors: 10 },
    { country: "PH", visitors: 8 },
    { country: "BR", visitors: 7 },
    { country: "DE", visitors: 6 },
    { country: "NG", visitors: 5 },
    { country: "CA", visitors: 4 },
    { country: "unknown", visitors: 31 },
  ],
  pages: [
    { platform: "twitter", locale: "en", views: 102 },
    { platform: "tiktok", locale: "en", views: 43 },
    { platform: "instagram", locale: "en", views: 25 },
    { platform: "twitter", locale: "es", views: 14 },
    { platform: "reddit", locale: "en", views: 12 },
    { platform: "twitter", locale: "hi", views: 10 },
    { platform: "tiktok", locale: "es", views: 6 },
    { platform: "facebook", locale: "en", views: 6 },
    { platform: "tiktok", locale: "hi", views: 4 },
    { platform: "instagram", locale: "es", views: 3 },
    { platform: "instagram", locale: "hi", views: 2 },
    { platform: "twitter", locale: "unknown", views: 2 },
  ],
  hours: Array.from({ length: 24 }, (_, hour) => ({ hour, fetches: HOURS_TODAY[hour]?.fetches ?? 0 })),
  sources: [
    { source: "search", visits: 124 },
    { source: "direct", visits: 63 },
    { source: "social", visits: 30 },
    { source: "referral", visits: 9 },
    { source: "internal", visits: 5 },
  ],
  live: LIVE,
};

// 90 days: no previous period (retention is 90 days). The series is generated so its
// buckets sum exactly to the totals, with a weekly swing and a partial last day.
const DAY_MS = 86_400_000;
const REF = Date.UTC(2026, 8, 23);

function dayKey(daysBefore: number): string {
  return new Date(REF - daysBefore * DAY_MS).toISOString().slice(0, 10);
}

function spread(total: number, days: number, seed: number): number[] {
  const weights = Array.from({ length: days }, (_, i) => 1 + 0.12 * Math.sin(((i + seed) * 2 * Math.PI) / 7) + 0.05 * Math.cos((i * 7 + seed) * 0.9));
  weights[days - 1] *= 0.55;
  const sum = weights.reduce((a, b) => a + b, 0);
  const out = weights.map((w) => Math.floor((total * w) / sum));
  let rest = total - out.reduce((a, b) => a + b, 0);
  for (let i = 0; rest > 0; i = (i + 1) % (days - 1), rest -= 1) out[i] += 1;
  return out;
}

const N90 = 90;
const V90 = spread(22646, N90, 1);
const F90 = spread(36556, N90, 2);
const D90 = spread(30030, N90, 3);
const X90 = spread(3289, N90, 4);

function times13<T extends object, K extends keyof T>(rows: T[], key: K): T[] {
  return rows.map((r) => ({ ...r, [key]: (r[key] as number) * 13 }));
}

export const REPORT_90D: Report = {
  range: "90d",
  tz: 360,
  bucket: "day",
  has_previous: false,
  window: { start: dayKey(N90 - 1), end: "2026-09-23" },
  totals: {
    visitors: 22646,
    page_views: 29068,
    fetches: 36556,
    ok_fetches: 33267,
    failed_fetches: 3289,
    upstream_errors: 221,
    downloads: 30030,
    downloaded_visitors: 15431,
    new_visitors: 14560,
    returning_visitors: 5226,
    complete_days: 89,
    complete_day_visitors: 22646 - V90[N90 - 1],
  },
  previous: null,
  series: Array.from({ length: N90 }, (_, i): SeriesPoint => ({
    key: dayKey(N90 - 1 - i),
    prev_key: dayKey(2 * N90 - 1 - i),
    cur: values(V90[i], F90[i], D90[i], X90[i]),
    prev: null,
  })),
  peak: { count: 19, day: "2026-08-30", time: "20:35" },
  funnel: { visitors: 22646, fetched: 18044, got_result: 16848, downloaded: 15431 },
  outcomes: times13(REPORT_7D.outcomes, "count"),
  platforms: REPORT_7D.platforms.map((p) => ({ ...p, fetches: p.fetches * 13, ok: p.ok * 13, downloads: p.downloads * 13 })),
  qualities: times13(REPORT_7D.qualities, "count"),
  countries: times13(REPORT_7D.countries, "visitors"),
  pages: times13(REPORT_7D.pages, "views"),
  hours: times13(REPORT_7D.hours, "fetches"),
  sources: times13(REPORT_7D.sources, "visits"),
  live: LIVE,
};

/** A fresh install: nothing recorded yet, no previous period. */
export const EMPTY_REPORT: Report = {
  range: "7d",
  tz: 0,
  bucket: "day",
  has_previous: false,
  window: { start: "2026-09-17", end: "2026-09-23" },
  totals: {
    visitors: 0,
    page_views: 0,
    fetches: 0,
    ok_fetches: 0,
    failed_fetches: 0,
    upstream_errors: 0,
    downloads: 0,
    downloaded_visitors: 0,
    new_visitors: 0,
    returning_visitors: 0,
    complete_days: 6,
    complete_day_visitors: 0,
  },
  previous: null,
  series: DAYS_7.map(([key], i) => ({ key, prev_key: DAYS_7_PREV[i][0], cur: values(0, 0, 0, 0), prev: null })),
  peak: null,
  funnel: { visitors: 0, fetched: 0, got_result: 0, downloaded: 0 },
  outcomes: [],
  platforms: [],
  qualities: [],
  countries: [{ country: "unknown", visitors: 0 }],
  pages: [],
  hours: Array.from({ length: 24 }, (_, hour) => ({ hour, fetches: 0 })),
  sources: [],
  live: { active_now: 0, fetches_last_hour: 0, upstream_last_hour: 0 },
};

/** One report per range for the fake server. 30d is a stand-in shaped like 7d (range switching tests only). */
export const REPORTS: Record<RangeKey, Report> = {
  today: REPORT_TODAY,
  "7d": REPORT_7D,
  "30d": { ...REPORT_7D, range: "30d", window: { start: "2026-08-25", end: "2026-09-23" } },
  "90d": REPORT_90D,
};

/** Rolling 24 hours. Covers every colour band plus a platform with no lookups. */
export const RESOLVERS: Resolvers = {
  platforms: [
    { platform: "twitter", fetches: 574, ok: 531, top_failure: { outcome: "not_found", count: 31 }, last_failure_min_ago: 12 },
    { platform: "tiktok", fetches: 208, ok: 186, top_failure: { outcome: "not_found", count: 14 }, last_failure_min_ago: 27 },
    { platform: "reddit", fetches: 46, ok: 41, top_failure: { outcome: "no_video", count: 3 }, last_failure_min_ago: 190 },
    { platform: "instagram", fetches: 101, ok: 68, top_failure: { outcome: "private_or_restricted", count: 21 }, last_failure_min_ago: 0 },
    { platform: "facebook", fetches: 0, ok: 0, top_failure: null, last_failure_min_ago: null },
  ],
};

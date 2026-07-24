import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { Admin, Dashboard } from "./Admin";
import type { Stats } from "./api";

// Dashboard now embeds SiteControls, which calls getMaintenance() on mount.
// Stub that module method so these tests don't hit a real fetch; the rest of
// ./api (login, fetchStats) stays real and rides the global fetch stubs.
vi.mock("./api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api")>();
  return {
    ...actual,
    getMaintenance: vi.fn(async () => ({ on: false, forced_by_env: false })),
    setMaintenance: vi.fn(async () => ({ on: false, forced_by_env: false })),
  };
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const STATS: Stats = {
  totals: {
    fetches: { today: 5, d7: 20, d30: 50, all_time: 100 },
    downloads: { today: 3, d7: 12, d30: 30, all_time: 60 },
    visits: { today: 8, d7: 40, d30: 90, all_time: 200 },
    unique_today: 7,
    success_rate: 0.9,
    conversion: 0.5,
  },
  active_now: 2,
  series: [],
  countries: [{ country: "BD", count: 40 }],
  qualities: [{ quality: "1080p", count: 30 }],
  errors: [{ code: "no_video", count: 4 }],
  hours: [],
  platforms: [
    { platform: "twitter", fetches: 10, downloads: 8 },
    { platform: "tiktok", fetches: 4, downloads: 3 },
  ],
  avg_active: { d7: 340, d30: 300 },
  sources: [
    { source: "search", count: 120 },
    { source: "direct", count: 90 },
  ],
  visitors: { new: 200, returning: 140 },
  peak_active: {
    record: { count: 9, day: "2026-07-21", time: "21:15" },
    series: [
      { day: "2026-07-20", peak: 4 },
      { day: "2026-07-21", peak: 9 },
    ],
  },
};

test("shows login first, then dashboard after auth", async () => {
  // The real backend is unauthenticated until the login cookie is set; model
  // that here so the mount's silent session check can't race the explicit
  // login flow below into the dashboard early.
  let authed = false;
  const fetchMock = vi.fn(async (url: string) => {
    const u = String(url);
    if (u.includes("/login")) {
      authed = true;
      return new Response(null, { status: 204 });
    }
    return authed
      ? new Response(JSON.stringify(STATS), { status: 200 })
      : new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  });
  vi.stubGlobal("fetch", fetchMock);

  render(<Admin />);
  expect(screen.getByLabelText(/password/i)).toBeInTheDocument();

  await userEvent.type(screen.getByLabelText(/password/i), "pw");
  await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

  expect(await screen.findByText(/active now/i)).toBeInTheDocument();
  expect(screen.getByText("2")).toBeInTheDocument(); // active_now
});

test("wrong password shows an error and no dashboard", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 })),
  );
  render(<Admin />);
  await userEvent.type(screen.getByLabelText(/password/i), "bad");
  await userEvent.click(screen.getByRole("button", { name: /sign in/i }));
  expect(await screen.findByRole("alert")).toBeInTheDocument();
  expect(screen.queryByText(/active now/i)).not.toBeInTheDocument();
});

test("shows a friendly retry panel when analytics is unavailable", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ error: "analytics_unavailable" }), { status: 503 })),
  );
  render(<Admin />);
  expect(await screen.findByText(/unavailable/i)).toBeInTheDocument();
  expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();

  const retry = screen.getByRole("button", { name: /retry/i });
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(STATS), { status: 200 })));
  await userEvent.click(retry);
  expect(await screen.findByText(/active now/i)).toBeInTheDocument();
});

test("sends the local UTC offset with the sign flipped from getTimezoneOffset", async () => {
  // getTimezoneOffset() is UTC-minus-local (Dhaka reports -360); the wire
  // format is minutes east of UTC, so the client must send the negation.
  vi.spyOn(Date.prototype, "getTimezoneOffset").mockReturnValue(-360);
  const fetchMock = vi.fn(async (_url: string) => new Response(JSON.stringify(STATS), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);

  render(<Admin />);
  await screen.findByText(/active now/i);

  const requestedUrl = String(fetchMock.mock.calls.at(-1)?.[0]);
  expect(requestedUrl).toContain("tz=360");
});

test("dashboard renders tiles, totals, and bar lists from a stats fixture", async () => {
  render(<Dashboard stats={STATS} />);
  await screen.findByText("Live"); // flush SiteControls' mount fetch
  expect(screen.getByText("2")).toBeInTheDocument(); // active_now tile
  expect(screen.getByText("7")).toBeInTheDocument(); // unique_today tile
  expect(screen.getByText("90%")).toBeInTheDocument(); // success_rate
  expect(screen.getByText("50%")).toBeInTheDocument(); // conversion
  expect(screen.getByText("BD")).toBeInTheDocument();
  expect(screen.getByText("1080p")).toBeInTheDocument();
  expect(screen.getByText("no_video")).toBeInTheDocument();
  // By platform panel: label per platform, fetches as the bar value, downloads alongside.
  // Scope to the panel so tiktok's fetches ("4") can't collide with the errors
  // panel's no_video count, which is also 4.
  const platformPanel = within(screen.getByText("By platform").closest(".panel") as HTMLElement);
  expect(platformPanel.getByText("twitter")).toBeInTheDocument();
  expect(platformPanel.getByText("tiktok")).toBeInTheDocument();
  expect(platformPanel.getByText("10")).toBeInTheDocument(); // twitter fetches
  expect(platformPanel.getByText("4")).toBeInTheDocument(); // tiktok fetches
  expect(platformPanel.getByText(/8 downloads/i)).toBeInTheDocument();
  expect(platformPanel.getByText(/3 downloads/i)).toBeInTheDocument();
  // Empty series/hours fall back to the same "No data yet." empty state as BarList.
  expect(screen.getAllByText(/no data yet/i).length).toBeGreaterThanOrEqual(2);
});

test("shows avg-active tiles, traffic sources, and new vs returning", async () => {
  render(<Dashboard stats={STATS} />);
  await screen.findByText("Live"); // flush SiteControls' mount fetch

  // Avg-active tiles.
  expect(screen.getByText("Avg/day (7d)")).toBeInTheDocument();
  expect(screen.getByText("340")).toBeInTheDocument();
  expect(screen.getByText("Avg/day (30d)")).toBeInTheDocument();
  expect(screen.getByText("300")).toBeInTheDocument();

  // Traffic sources panel: label per source with its count.
  const sourcesPanel = within(screen.getByText("Traffic sources").closest(".panel") as HTMLElement);
  expect(sourcesPanel.getByText("search")).toBeInTheDocument();
  expect(sourcesPanel.getByText("120")).toBeInTheDocument();
  expect(sourcesPanel.getByText("direct")).toBeInTheDocument();
  expect(sourcesPanel.getByText("90")).toBeInTheDocument();

  // New vs returning panel: both counts plus the privacy caption.
  const nvrPanel = within(screen.getByText("New vs returning").closest(".panel") as HTMLElement);
  expect(nvrPanel.getByText("200")).toBeInTheDocument();
  expect(nvrPanel.getByText("140")).toBeInTheDocument();
  expect(nvrPanel.getByText(/browser-based estimate, privacy-safe/i)).toBeInTheDocument();
});

test("older-deploy stats without the new keys still render without throwing", async () => {
  // Simulate a stats payload from a backend that predates avg_active/sources/
  // visitors; the Dashboard's read-site guards must default them to 0/[].
  const legacy = {
    totals: STATS.totals,
    active_now: STATS.active_now,
    series: STATS.series,
    countries: STATS.countries,
    qualities: STATS.qualities,
    errors: STATS.errors,
    hours: STATS.hours,
    platforms: STATS.platforms,
  } as Stats;
  render(<Dashboard stats={legacy} />);
  await screen.findByText("Live"); // flush SiteControls' mount fetch
  expect(screen.getByText("New vs returning")).toBeInTheDocument();
  expect(screen.getByText("Traffic sources")).toBeInTheDocument();
  // Guards default avg-active to 0/0 rather than crashing on the missing key.
  expect(screen.getByText("Avg/day (7d)")).toBeInTheDocument();
  // Missing peak_active defaults to { record: null, series: [] }, no crash.
  expect(screen.getByText("Peak concurrent")).toBeInTheDocument();
});

test("collapses a long qualities list behind a show-all toggle", async () => {
  const qualities = Array.from({ length: 12 }, (_, i) => ({ quality: `q${i}`, count: 12 - i }));
  render(<Dashboard stats={{ ...STATS, qualities }} />);
  // Flush the SiteControls mount fetch so its state update lands inside act().
  await screen.findByText("Live");

  const panel = () => within(screen.getByText("Top qualities").closest(".panel") as HTMLElement);

  // Collapsed: only the first 8 rows render, plus a "Show all (12)" toggle.
  expect(panel().getByText("q0")).toBeInTheDocument();
  expect(panel().getByText("q7")).toBeInTheDocument();
  expect(panel().queryByText("q8")).not.toBeInTheDocument();
  const toggle = panel().getByRole("button", { name: /show all \(12\)/i });

  // Expanded: all 12 render, button now reads "Show less".
  await userEvent.click(toggle);
  expect(panel().getByText("q8")).toBeInTheDocument();
  expect(panel().getByText("q11")).toBeInTheDocument();
  expect(panel().getByRole("button", { name: /show less/i })).toBeInTheDocument();

  // Collapse again: back to 8 rows.
  await userEvent.click(panel().getByRole("button", { name: /show less/i }));
  expect(panel().queryByText("q8")).not.toBeInTheDocument();
  expect(panel().getByRole("button", { name: /show all \(12\)/i })).toBeInTheDocument();
});

test("shows no toggle when a maxRows panel has few enough rows", async () => {
  // STATS has a single quality row, well under the maxRows=8 threshold.
  render(<Dashboard stats={STATS} />);
  await screen.findByText("Live"); // flush SiteControls' mount fetch
  const panel = within(screen.getByText("Top qualities").closest(".panel") as HTMLElement);
  expect(panel.queryByRole("button")).not.toBeInTheDocument();
});

test("renders the trend chart and busiest-hours strip when data exists", async () => {
  const stats: Stats = {
    ...STATS,
    series: [
      { day: "2026-07-16", fetch: 5, download: 3, visit: 8, uniques: 4 },
      { day: "2026-07-17", fetch: 6, download: 4, visit: 9, uniques: 5 },
    ],
    hours: [{ hour: 14, count: 12 }],
  };
  render(<Dashboard stats={stats} />);
  await screen.findByText("Live"); // flush SiteControls' mount fetch
  expect(screen.getByText(/fetches vs downloads vs visits/i)).toBeInTheDocument();
  expect(screen.getByText(/busiest hours/i)).toBeInTheDocument();
  expect(screen.getByRole("img", { name: /line chart of daily fetches/i })).toBeInTheDocument();
});

test("shows the peak concurrent tile with caption and the peak chart", async () => {
  render(<Dashboard stats={STATS} />);
  await screen.findByText("Live"); // flush SiteControls' mount fetch
  const tile = within(screen.getByText("Peak concurrent").closest(".panel") as HTMLElement);
  expect(tile.getByText("9")).toBeInTheDocument();
  // 21:15 renders as 9:15pm; month wording is locale-formatted, so pin only
  // the clock and the honesty caption.
  expect(tile.getByText(/9:15pm - last 90 days/)).toBeInTheDocument();
  expect(screen.getByText("Peak concurrent per day (last 90 days)")).toBeInTheDocument();
  expect(
    screen.getByRole("img", { name: /line chart of daily peak concurrent visitors/i }),
  ).toBeInTheDocument();
});

test("peak concurrent tile shows a dash when there is no record", async () => {
  render(<Dashboard stats={{ ...STATS, peak_active: { record: null, series: [] } }} />);
  await screen.findByText("Live"); // flush SiteControls' mount fetch
  const tile = within(screen.getByText("Peak concurrent").closest(".panel") as HTMLElement);
  expect(tile.getAllByText("-").length).toBeGreaterThanOrEqual(1);
  // Empty series falls back to the shared "No data yet." empty state.
  const chartPanel = within(screen.getByText("Peak concurrent per day (last 90 days)").closest(".panel") as HTMLElement);
  expect(chartPanel.getByText(/no data yet/i)).toBeInTheDocument();
});

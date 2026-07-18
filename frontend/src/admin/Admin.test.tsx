import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { Admin, Dashboard } from "./Admin";
import type { Stats } from "./api";

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

test("dashboard renders tiles, totals, and bar lists from a stats fixture", () => {
  render(<Dashboard stats={STATS} />);
  expect(screen.getByText("2")).toBeInTheDocument(); // active_now tile
  expect(screen.getByText("7")).toBeInTheDocument(); // unique_today tile
  expect(screen.getByText("90%")).toBeInTheDocument(); // success_rate
  expect(screen.getByText("50%")).toBeInTheDocument(); // conversion
  expect(screen.getByText("BD")).toBeInTheDocument();
  expect(screen.getByText("1080p")).toBeInTheDocument();
  expect(screen.getByText("no_video")).toBeInTheDocument();
  // Empty series/hours fall back to the same "No data yet." empty state as BarList.
  expect(screen.getAllByText(/no data yet/i).length).toBeGreaterThanOrEqual(2);
});

test("renders the trend chart and busiest-hours strip when data exists", () => {
  const stats: Stats = {
    ...STATS,
    series: [
      { day: "2026-07-16", fetch: 5, download: 3, visit: 8, uniques: 4 },
      { day: "2026-07-17", fetch: 6, download: 4, visit: 9, uniques: 5 },
    ],
    hours: [{ hour: 14, count: 12 }],
  };
  render(<Dashboard stats={stats} />);
  expect(screen.getByText(/fetches vs downloads vs visits/i)).toBeInTheDocument();
  expect(screen.getByText(/busiest hours/i)).toBeInTheDocument();
  expect(screen.getByRole("img", { name: /line chart/i })).toBeInTheDocument();
});

import { act, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { fakeServer } from "../test/fakeServer";
import { wholeText } from "../test/text";
import { AnalyticsPage, type AnalyticsPageProps } from "./AnalyticsPage";

afterEach(() => {
  vi.unstubAllGlobals();
});

const SIZE = { width: 640, height: 256 };

function props(over: Partial<AnalyticsPageProps> = {}): AnalyticsPageProps {
  return {
    range: "7d",
    tz: 360,
    tick: 0,
    maintenance: { on: false, forced_by_env: false },
    onRangeChange: vi.fn(),
    onGoToSite: vi.fn(),
    onUnauthorized: vi.fn(),
    onUnavailable: vi.fn(),
    chartSize: SIZE,
    ...over,
  };
}

test("loads the report for the range and tz, then shows the header, the live strip and the trend card", async () => {
  const server = fakeServer();
  vi.stubGlobal("fetch", server.fetch);
  render(<AnalyticsPage {...props()} />);
  expect(await screen.findByText("Sep 17 to Sep 23, your local time")).toBeInTheDocument();
  expect(server.urls("/api/admin/report")).toEqual(["/api/admin/report?range=7d&tz=360"]);
  expect(screen.getByText("Analytics")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Last 7 days" })).toBeInTheDocument();
  expect(screen.getByText(/^Updated \d\d:\d\d$/)).toBeInTheDocument();
  expect(screen.getByText(wholeText("6 on the site now"))).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Site is live" })).toBeInTheDocument();
  expect(screen.getAllByRole("tab")).toHaveLength(4);
  expect(screen.getByRole("button", { name: "7 days" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByText("Visitors per day").closest("[aria-busy]")).toHaveAttribute("aria-busy", "false");
});

test("a new range moves the pill and title at once and keeps the old numbers dimmed until the new report lands", async () => {
  const server = fakeServer();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let reportCalls = 0;
  const real = server.fetch;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).startsWith("/api/admin/report") && ++reportCalls === 2) await gate;
      return real(input, init);
    }),
  );
  const p = props();
  const { rerender } = render(<AnalyticsPage {...p} />);
  await screen.findByText("Sep 17 to Sep 23, your local time");
  rerender(<AnalyticsPage {...p} range="today" />);
  expect(screen.getByRole("heading", { name: "Today" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Today" })).toHaveAttribute("aria-pressed", "true");
  const body = screen.getByText("Visitors per day").closest("[aria-busy]") as HTMLElement;
  expect(body).toHaveAttribute("aria-busy", "true");
  expect(body.className).toContain("opacity-50");
  expect(body.className).toContain("pointer-events-none");
  expect(screen.getByText("Sep 17 to Sep 23, your local time")).toBeInTheDocument();
  release();
  expect(await screen.findByText("Sep 23, your local time")).toBeInTheDocument();
  expect(screen.getByText("Visitors per hour").closest("[aria-busy]")).toHaveAttribute("aria-busy", "false");
  expect(server.urls("/api/admin/report").at(-1)).toBe("/api/admin/report?range=today&tz=360");
});

test("the live strip never dims, and a late answer for a range already left is dropped", async () => {
  const server = fakeServer();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const real = server.fetch;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).startsWith("/api/admin/report?range=90d")) await gate;
      return real(input, init);
    }),
  );
  const p = props();
  const { rerender } = render(<AnalyticsPage {...p} />);
  await screen.findByText("Sep 17 to Sep 23, your local time");
  rerender(<AnalyticsPage {...p} range="90d" />);
  expect(screen.getByText("Visitors per day").closest("[aria-busy]")).toHaveAttribute("aria-busy", "true");
  expect(screen.getByText(wholeText("6 on the site now")).closest("[aria-busy]")).toBeNull();
  rerender(<AnalyticsPage {...p} range="today" />);
  expect(await screen.findByText("Sep 23, your local time")).toBeInTheDocument();
  // The slow 90-day answer lands after the page moved on to today; it must not replace today.
  release();
  await vi.waitFor(() => expect(server.urls("/api/admin/report?range=90d")).toHaveLength(1));
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  expect(screen.getByText("Sep 23, your local time")).toBeInTheDocument();
  expect(screen.getByText("Visitors per hour").closest("[aria-busy]")).toHaveAttribute("aria-busy", "false");
});

test("a refresh tick refetches; a failed refresh keeps the numbers and says so; the next success clears the line", async () => {
  const server = fakeServer();
  vi.stubGlobal("fetch", server.fetch);
  const p = props();
  const { rerender } = render(<AnalyticsPage {...p} />);
  await screen.findByText(/^Updated/);
  server.state.reportStatus = 503;
  rerender(<AnalyticsPage {...p} tick={1} />);
  expect(await screen.findByText("Could not refresh, trying again")).toBeInTheDocument();
  expect(screen.queryByText(/^Updated/)).not.toBeInTheDocument();
  expect(screen.getByText("Sep 17 to Sep 23, your local time")).toBeInTheDocument();
  expect(screen.getByText(wholeText("6 on the site now"))).toBeInTheDocument();
  expect(p.onUnavailable).not.toHaveBeenCalled();
  server.state.reportStatus = 200;
  rerender(<AnalyticsPage {...p} tick={2} />);
  expect(await screen.findByText(/^Updated/)).toBeInTheDocument();
  expect(screen.queryByText("Could not refresh, trying again")).not.toBeInTheDocument();
  expect(server.urls("/api/admin/report")).toHaveLength(3);
});

test("a failed first load reports unavailable; a 401 reports unauthorized", async () => {
  const server = fakeServer({ reportStatus: 503 });
  vi.stubGlobal("fetch", server.fetch);
  const p = props();
  render(<AnalyticsPage {...p} />);
  await vi.waitFor(() => expect(p.onUnavailable).toHaveBeenCalledTimes(1));
  expect(p.onUnauthorized).not.toHaveBeenCalled();

  vi.stubGlobal("fetch", fakeServer({ authed: false }).fetch);
  const p2 = props();
  render(<AnalyticsPage {...p2} />);
  await vi.waitFor(() => expect(p2.onUnauthorized).toHaveBeenCalledTimes(1));
  expect(p2.onUnavailable).not.toHaveBeenCalled();
});

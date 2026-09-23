import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { fakeServer } from "../test/fakeServer";
import { COLORS } from "../lib/colors";
import { EMPTY_REPORT, REPORT_7D_NO_PLATFORM } from "../test/fixtures";
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
  expect(screen.queryByRole("region", { name: "Analytics is unavailable" })).not.toBeInTheDocument();
  server.state.reportStatus = 200;
  rerender(<AnalyticsPage {...p} tick={2} />);
  expect(await screen.findByText(/^Updated/)).toBeInTheDocument();
  expect(screen.queryByText("Could not refresh, trying again")).not.toBeInTheDocument();
  expect(server.urls("/api/admin/report")).toHaveLength(3);
});

const UNAVAILABLE = "Analytics is unavailable";

test("a failed first load shows the unavailable card in the page, without the live strip or the body; a later tick that works shows the page", async () => {
  const server = fakeServer({ reportStatus: 503 });
  vi.stubGlobal("fetch", server.fetch);
  const p = props();
  const { rerender } = render(<AnalyticsPage {...p} />);
  const card = within(await screen.findByRole("region", { name: UNAVAILABLE }));
  expect(card.getByRole("heading", { name: UNAVAILABLE })).toBeInTheDocument();
  expect(card.getByText("The dashboard could not reach the analytics service. The public site is not affected.")).toBeInTheDocument();
  expect(card.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  // The header and the range tabs stay; nothing that needs a report is drawn.
  expect(screen.getByRole("heading", { name: "Last 7 days" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "7 days" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.queryByText(wholeText("6 on the site now"))).not.toBeInTheDocument();
  expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "Platforms" })).not.toBeInTheDocument();
  expect(screen.queryByText("Could not refresh, trying again")).not.toBeInTheDocument();
  expect(p.onUnauthorized).not.toHaveBeenCalled();

  server.state.reportStatus = 200;
  rerender(<AnalyticsPage {...p} tick={1} />);
  expect(await screen.findByText("Sep 17 to Sep 23, your local time")).toBeInTheDocument();
  expect(screen.queryByRole("region", { name: UNAVAILABLE })).not.toBeInTheDocument();
  expect(screen.getByText(wholeText("6 on the site now"))).toBeInTheDocument();
  expect(screen.getAllByRole("tab")).toHaveLength(4);
  expect(screen.getByText(/^Updated \d\d:\d\d$/)).toBeInTheDocument();
});

test("Retry on the unavailable card refetches the report, never the session, and shows the data", async () => {
  const server = fakeServer({ reportStatus: 503 });
  vi.stubGlobal("fetch", server.fetch);
  render(<AnalyticsPage {...props()} />);
  await screen.findByRole("region", { name: UNAVAILABLE });
  server.state.reportStatus = 200;
  await userEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(await screen.findByText("Sep 17 to Sep 23, your local time")).toBeInTheDocument();
  expect(screen.queryByRole("region", { name: UNAVAILABLE })).not.toBeInTheDocument();
  expect(screen.getAllByRole("tab")).toHaveLength(4);
  expect(server.urls("/api/admin/report")).toEqual(["/api/admin/report?range=7d&tz=360", "/api/admin/report?range=7d&tz=360"]);
  expect(server.urls("/api/admin/maintenance")).toEqual([]);
});

test("Retry is busy while it runs: a second tap sends nothing, and a failed Retry keeps the card", async () => {
  const server = fakeServer({ reportStatus: 503 });
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
  render(<AnalyticsPage {...props()} />);
  await screen.findByRole("region", { name: UNAVAILABLE });
  const retry = screen.getByRole("button", { name: "Retry" });
  await userEvent.click(retry);
  expect(retry).toHaveAttribute("aria-disabled", "true");
  await userEvent.click(retry);
  expect(reportCalls).toBe(2);
  release();
  // Testing Library's waitFor, not vi.waitFor: the held answer lands inside act.
  await waitFor(() => expect(retry).not.toHaveAttribute("aria-disabled"));
  expect(screen.getByRole("region", { name: UNAVAILABLE })).toBeInTheDocument();
  expect(retry).toHaveFocus();
});

test("a 401 on the first load, or on a Retry, reports unauthorized", async () => {
  vi.stubGlobal("fetch", fakeServer({ authed: false }).fetch);
  const p = props();
  render(<AnalyticsPage {...p} />);
  await vi.waitFor(() => expect(p.onUnauthorized).toHaveBeenCalledTimes(1));
  expect(screen.queryByRole("region", { name: UNAVAILABLE })).not.toBeInTheDocument();
  cleanup();

  const server = fakeServer({ reportStatus: 503 });
  vi.stubGlobal("fetch", server.fetch);
  const p2 = props();
  render(<AnalyticsPage {...p2} />);
  await screen.findByRole("region", { name: UNAVAILABLE });
  server.state.reportStatus = 401;
  await userEvent.click(screen.getByRole("button", { name: "Retry" }));
  await vi.waitFor(() => expect(p2.onUnauthorized).toHaveBeenCalledTimes(1));
});

test("the eight tiles read from the 7d report", async () => {
  vi.stubGlobal("fetch", fakeServer().fetch);
  render(<AnalyticsPage {...props()} />);
  await screen.findByText("Sep 17 to Sep 23, your local time");
  const tile = (label: string) => within(screen.getByText(label).closest(".rounded-card") as HTMLElement);
  expect(tile("Success rate").getByText("91%")).toBeInTheDocument();
  expect(tile("Success rate").getByText("+2%")).toHaveAttribute("title", "Compared with the 7 days before");
  expect(tile("Success rate").getByText("links that returned media")).toBeInTheDocument();
  expect(tile("Conversion").getByText("68%")).toBeInTheDocument();
  expect(tile("Conversion").getByText("0%")).toBeInTheDocument();
  expect(tile("Conversion").getByText("visitors who downloaded")).toBeInTheDocument();
  expect(tile("Downloads per visitor").getByText("1.3")).toBeInTheDocument();
  expect(tile("Downloads per visitor").getByText("per visitor a day")).toBeInTheDocument();
  expect(tile("Visitors a day").getByText("261")).toBeInTheDocument();
  expect(tile("Visitors a day").getByText("+8%")).toBeInTheDocument();
  expect(tile("Visitors a day").getByText("average of full days")).toBeInTheDocument();
  expect(tile("Returning").getByText("26%")).toBeInTheDocument();
  expect(tile("Returning").getByText("+3%")).toBeInTheDocument();
  expect(tile("Returning").getByText("of visitors came back")).toBeInTheDocument();
  expect(tile("Page views").getByText("2,236")).toBeInTheDocument();
  expect(tile("Page views").getByText("+10%")).toBeInTheDocument();
  expect(tile("Page views").getByText("1.3 per visitor")).toBeInTheDocument();
  expect(tile("Peak at once").getByText("14")).toBeInTheDocument();
  expect(tile("Peak at once").getByText("Sep 20 at 21:15")).toBeInTheDocument();
  expect(tile("Peak at once").queryByText(/%$/)).not.toBeInTheDocument();
  expect(tile("Resolver errors").getByText("17")).toBeInTheDocument();
  expect(tile("Resolver errors").getByText("-19%").className).toContain("text-success");
  expect(tile("Resolver errors").getByText("failures on our side")).toBeInTheDocument();
});

test("today: Visitors a day shows a dash with no delta; the hours panel counts quiet hours", async () => {
  vi.stubGlobal("fetch", fakeServer().fetch);
  render(<AnalyticsPage {...props({ range: "today" })} />);
  await screen.findByText("Sep 23, your local time");
  const tile = within(screen.getByText("Visitors a day").closest(".rounded-card") as HTMLElement);
  expect(tile.getByText("-")).toBeInTheDocument();
  expect(tile.getByText("needs a full day")).toBeInTheDocument();
  expect(tile.queryByText(/%$/)).not.toBeInTheDocument();
  expect(screen.getByText("12:00 to 13:00")).toBeInTheDocument();
  expect(screen.getByText("busiest, 40 fetches. 10 hours had none")).toBeInTheDocument();
});

test("panels: funnel, outcomes, platforms, qualities, countries, pages, hours, visitors, sources and the footnote", async () => {
  vi.stubGlobal("fetch", fakeServer().fetch);
  render(<AnalyticsPage {...props()} />);
  await screen.findByText("Sep 17 to Sep 23, your local time");
  const panel = (name: string) => within(screen.getByRole("region", { name }));

  const funnel = panel("From visit to download");
  expect(funnel.getByText("Each visitor counted once a day")).toBeInTheDocument();
  expect(funnel.getByText("Pasted a link")).toBeInTheDocument();
  expect(funnel.getByText("Got a result")).toBeInTheDocument();
  expect(funnel.getByText("1,187")).toBeInTheDocument();
  expect(funnel.getByText("80%")).toBeInTheDocument();

  const outcomes = panel("Fetch outcomes");
  expect(outcomes.getByText("What happened to each link")).toBeInTheDocument();
  expect(outcomes.getAllByText("Worked")).toHaveLength(2);
  expect(outcomes.getAllByText("91%")).toHaveLength(2);
  expect(outcomes.getAllByText("Deleted or missing")).toHaveLength(2);
  expect(outcomes.getAllByText("163")).toHaveLength(2);
  expect(outcomes.getByText("Failed on our side")).toBeInTheDocument();
  expect(outcomes.getByText("Resolver error")).toBeInTheDocument();
  expect(outcomes.getByText("Unsupported post")).toBeInTheDocument();
  expect(outcomes.getByText("5.8%")).toBeInTheDocument();

  const platforms = panel("Platforms");
  expect(platforms.getByText("Where the links came from")).toBeInTheDocument();
  expect(platforms.getByText("2,812")).toBeInTheDocument();
  expect(platforms.getByText("X (Twitter)")).toBeInTheDocument();
  expect(platforms.getByText("60%")).toBeInTheDocument();
  expect(platforms.getByText("92% worked")).toBeInTheDocument();
  expect(platforms.getByText("Facebook")).toBeInTheDocument();
  expect(platforms.queryByText("Other links")).not.toBeInTheDocument();

  const qualities = panel("Qualities");
  expect(qualities.getByText("What people saved")).toBeInTheDocument();
  expect(qualities.getByText("1080p")).toBeInTheDocument();
  expect(qualities.getByText("Photo")).toBeInTheDocument();
  expect(qualities.getByRole("button", { name: "Show all (9)" })).toBeInTheDocument();

  const countries = panel("Countries");
  expect(countries.getByText("Not known covers visits with no country on record, including every visit from before country lookup came back")).toBeInTheDocument();
  expect(countries.getByText("US")).toBeInTheDocument();
  expect(countries.getByText("United States")).toBeInTheDocument();
  expect(countries.getByText("Bangladesh")).toBeInTheDocument();
  const last = countries.getAllByRole("listitem").at(-1) as HTMLElement;
  expect(within(last).getByText("Not known")).toBeInTheDocument();
  expect(within(last).getByText("290")).toBeInTheDocument();

  const pages = panel("Pages");
  expect(pages.getByText("Which pages people used")).toBeInTheDocument();
  expect(pages.getByText("X (Twitter), English")).toBeInTheDocument();
  expect(pages.getByText("986")).toBeInTheDocument();
  expect(pages.getByText("TikTok, Hindi")).toBeInTheDocument();
  expect(pages.getByText("X (Twitter), language not recorded")).toBeInTheDocument();

  const hours = panel("Busiest hours");
  expect(hours.getByText("When people use it")).toBeInTheDocument();
  expect(hours.getByText("14:00 to 15:00")).toBeInTheDocument();

  const visitors = panel("New and returning");
  expect(visitors.getByText("From the visit beacon; people who only pasted a link are not split")).toBeInTheDocument();
  expect(visitors.getByText("1,522")).toBeInTheDocument();
  expect(visitors.getByText("1,120")).toBeInTheDocument();
  expect(visitors.getByText("26%")).toBeInTheDocument();
  expect(visitors.getByText("Traffic sources")).toBeInTheDocument();
  expect(visitors.getByText("Search")).toBeInTheDocument();
  expect(visitors.getByText("1,204")).toBeInTheDocument();
  expect(visitors.getByText("Other sites")).toBeInTheDocument();
  expect(visitors.getByText("Between pages")).toBeInTheDocument();

  expect(screen.getByRole("link", { name: "IP Geolocation by DB-IP" })).toBeInTheDocument();
  expect(screen.getByText(/\(06:00 your time\)/)).toBeInTheDocument();
});

test("fetches with no platform are a final muted Other links row and a gray slice, so the legend adds up to the centre", async () => {
  vi.stubGlobal("fetch", vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify(REPORT_7D_NO_PLATFORM), { status: 200 })));
  render(<AnalyticsPage {...props()} />);
  await screen.findByText("Sep 17 to Sep 23, your local time");
  const region = screen.getByRole("region", { name: "Platforms" });
  const platforms = within(region);
  expect(platforms.getByText("2,812")).toBeInTheDocument();
  const rows = platforms.getAllByRole("listitem");
  expect(rows).toHaveLength(6);
  const counts = rows.map((row) => Number(within(row).getByText(/^[\d,]+$/).textContent?.replace(/,/g, "")));
  expect(counts.reduce((a, b) => a + b, 0)).toBe(2812);
  expect(within(rows[0]).getByText("X (Twitter)")).toBeInTheDocument();
  expect(within(rows[0]).getByText("1,628")).toBeInTheDocument();
  expect(within(rows[0]).getByText("58%")).toBeInTheDocument();
  const other = within(rows[5]);
  expect(other.getByText("Other links").className).toContain("text-text-muted");
  expect(other.getByText("56")).toBeInTheDocument();
  expect(other.getByText("2.0%")).toBeInTheDocument();
  expect(other.queryByText(/worked$/)).not.toBeInTheDocument();
  const sectors = region.querySelectorAll(".recharts-pie-sector path");
  expect(sectors).toHaveLength(6);
  expect(sectors[5].getAttribute("fill")).toBe(COLORS.gray);
});

test("a fresh install shows an empty state in every panel and dashes on the ratio tiles", async () => {
  vi.stubGlobal("fetch", vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify(EMPTY_REPORT), { status: 200 })));
  render(<AnalyticsPage {...props()} />);
  await screen.findByText("Nothing in this range yet");
  expect(screen.getAllByText("No links pasted in this range yet")).toHaveLength(3);
  expect(screen.getAllByText("No visits in this range yet")).toHaveLength(2);
  expect(screen.getByText("Nothing saved in this range yet")).toBeInTheDocument();
  expect(screen.getByText("No visitors in this range yet")).toBeInTheDocument();
  expect(screen.getByText("No page views in this range yet")).toBeInTheDocument();
  expect(screen.getAllByText("-")).toHaveLength(5);
  expect(screen.getByText("- per visitor")).toBeInTheDocument();
  expect(within(screen.getByRole("region", { name: "Countries" })).getByText("Where visitors are")).toBeInTheDocument();
});

test("Failed on our side counts resolver errors only; the unknown country row is muted", async () => {
  vi.stubGlobal("fetch", fakeServer().fetch);
  render(<AnalyticsPage {...props()} />);
  await screen.findByText("Sep 17 to Sep 23, your local time");
  const failed = within(screen.getByRole("region", { name: "Fetch outcomes" })).getByText("Failed on our side").closest("div") as HTMLElement;
  expect(within(failed).getByText("17")).toBeInTheDocument();
  expect(within(screen.getByRole("region", { name: "Countries" })).getByText("Not known").className).toContain("text-text-muted");
});

test("nothing inside an aria-hidden chart or icon on the page can take focus", async () => {
  vi.stubGlobal("fetch", fakeServer().fetch);
  const { container } = render(<AnalyticsPage {...props()} />);
  await screen.findByText("Sep 17 to Sep 23, your local time");
  const focusable = "a[href], button, input, select, textarea, [contenteditable], [tabindex]";
  const hidden = Array.from(container.querySelectorAll("[aria-hidden='true']"));
  expect(hidden.length).toBeGreaterThan(0);
  const stops = hidden
    .flatMap((h) => [h, ...Array.from(h.querySelectorAll(focusable))])
    .filter((el) => el.matches(focusable) && el.getAttribute("tabindex") !== "-1")
    .map((el) => `${el.tagName.toLowerCase()} tabindex=${el.getAttribute("tabindex")}`);
  expect(stops).toEqual([]);
});

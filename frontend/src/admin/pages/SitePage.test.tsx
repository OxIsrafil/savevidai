import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { fakeServer } from "../test/fakeServer";
import { SitePage, type SitePageProps } from "./SitePage";

afterEach(() => {
  vi.unstubAllGlobals();
});

function props(over: Partial<SitePageProps> = {}): SitePageProps {
  return { tz: 360, tick: 0, maintenance: { on: false, forced_by_env: false }, onMaintenanceChange: vi.fn(), onUnauthorized: vi.fn(), ...over };
}

test("fetches resolvers with the tz, shows both cards, and refetches on a tick", async () => {
  const server = fakeServer();
  vi.stubGlobal("fetch", server.fetch);
  const p = props();
  const { rerender } = render(<SitePage {...p} />);
  expect(await screen.findByText("X (Twitter)")).toBeInTheDocument();
  expect(server.urls("/api/admin/resolvers")).toEqual(["/api/admin/resolvers?tz=360"]);
  expect(screen.getByRole("heading", { name: "Site" })).toBeInTheDocument();
  expect(screen.getByText("Maintenance switch and resolver health")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Turn on maintenance" })).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Last 24 hours" })).toBeInTheDocument();
  rerender(<SitePage {...p} tick={1} />);
  // Testing Library's waitFor, not vi.waitFor: it drains the refetch before returning, so the
  // answer's state update is not an act() warning after the test.
  await waitFor(() => expect(server.urls("/api/admin/resolvers")).toHaveLength(2));
});

test("a resolver failure shows the failure line; a 401 reports unauthorized", async () => {
  vi.stubGlobal("fetch", fakeServer({ resolversStatus: 503 }).fetch);
  const p = props();
  render(<SitePage {...p} />);
  expect(await screen.findByText("Could not load resolver health")).toBeInTheDocument();
  expect(p.onUnauthorized).not.toHaveBeenCalled();

  vi.stubGlobal("fetch", fakeServer({ authed: false }).fetch);
  const p2 = props();
  render(<SitePage {...p2} />);
  await vi.waitFor(() => expect(p2.onUnauthorized).toHaveBeenCalledTimes(1));
});

test("the maintenance card lifts the new state to the app", async () => {
  vi.stubGlobal("fetch", fakeServer().fetch);
  const p = props();
  render(<SitePage {...p} />);
  await userEvent.click(await screen.findByRole("button", { name: "Turn on maintenance" }));
  await userEvent.click(screen.getByRole("button", { name: "Tap to confirm" }));
  await vi.waitFor(() => expect(p.onMaintenanceChange).toHaveBeenCalledWith({ on: true, forced_by_env: false }));
});

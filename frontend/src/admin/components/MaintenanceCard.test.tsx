import { useLayoutEffect, useState } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, onTestFinished, test, vi } from "vitest";
import type { Maintenance } from "../lib/api";
import { fakeServer } from "../test/fakeServer";
import { MaintenanceCard } from "./MaintenanceCard";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const LIVE = { on: false, forced_by_env: false };
const IN_MAINTENANCE = { on: true, forced_by_env: false };
const ARMED = ["border-warning/40!", "bg-warning-dim!", "text-warning!"];

/**
 * Browsers run the HTML focus fixup rule: a focused control that becomes disabled drops focus to
 * the body (measured in Chrome on this card). jsdom does not, so this observer does it for the
 * test, which then sees what the owner's browser does. jsdom's blur() ignores an element that is
 * no longer focusable, so focus goes through a throwaway element that is then blurred.
 */
function browserFocusFixup() {
  const observer = new MutationObserver(() => {
    const el = document.activeElement;
    if (!(el instanceof HTMLElement) || !el.matches(":disabled")) return;
    const sink = document.createElement("span");
    sink.tabIndex = -1;
    document.body.append(sink);
    sink.focus();
    sink.blur();
    sink.remove();
  });
  observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ["disabled"] });
  onTestFinished(() => observer.disconnect());
}

/** Holds the state the way the App does, so a settled update re-renders the card. */
function Lifted({ initial }: { initial: Maintenance }) {
  const [state, setState] = useState<Maintenance | null>(initial);
  return <MaintenanceCard state={state} onChange={setState} onUnauthorized={() => {}} />;
}

type Commit = { label: string; classes: string[] };

/** The card, plus the button as committed each time this renders: a layout effect runs before
 *  the card's passive effects, so a render that lasts a single frame is seen too. */
function Recorded({ state, commits }: { state: Maintenance; commits: Commit[] }) {
  useLayoutEffect(() => {
    const button = screen.getByRole("button");
    commits.push({ label: button.textContent ?? "", classes: button.className.split(" ") });
  });
  return <MaintenanceCard state={state} onChange={() => {}} onUnauthorized={() => {}} />;
}

test("live: the first tap asks to confirm, the second within 4 s turns maintenance on", async () => {
  vi.useFakeTimers();
  const server = fakeServer();
  vi.stubGlobal("fetch", server.fetch);
  const onChange = vi.fn();
  render(<MaintenanceCard state={LIVE} onChange={onChange} onUnauthorized={() => {}} />);
  expect(screen.getByText("Live")).toBeInTheDocument();
  expect(screen.getByText("Visitors can use the site")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Turn on maintenance" }));
  const confirm = screen.getByRole("button", { name: "Tap to confirm" });
  expect(confirm.className).toContain("bg-warning-dim");
  expect(server.urls("/api/admin/maintenance")).toHaveLength(0);
  fireEvent.click(confirm);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10);
  });
  const post = server.fetch.mock.calls.find((c) => c[1]?.method === "POST");
  expect(JSON.parse(String(post?.[1]?.body))).toEqual({ on: true });
  expect(onChange).toHaveBeenCalledWith({ on: true, forced_by_env: false });
});

test("the armed tint wins over the pill's own colours: both set border, background and text, so the tint is important", () => {
  render(<MaintenanceCard state={LIVE} onChange={() => {}} onUnauthorized={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: "Turn on maintenance" }));
  const classes = screen.getByRole("button", { name: "Tap to confirm" }).className.split(" ");
  expect(classes).toEqual(expect.arrayContaining(ARMED));
});

test("the confirm state expires after 4 s without applying anything", async () => {
  vi.useFakeTimers();
  const server = fakeServer();
  vi.stubGlobal("fetch", server.fetch);
  render(<MaintenanceCard state={LIVE} onChange={() => {}} onUnauthorized={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: "Turn on maintenance" }));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3999);
  });
  expect(screen.getByRole("button", { name: "Tap to confirm" })).toBeInTheDocument();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(screen.getByRole("button", { name: "Turn on maintenance" })).toBeInTheDocument();
  expect(server.urls("/api/admin/maintenance")).toHaveLength(0);
});

test("in maintenance: Go live needs one tap and lifts the new state", async () => {
  const server = fakeServer({ maintenance: IN_MAINTENANCE });
  vi.stubGlobal("fetch", server.fetch);
  const onChange = vi.fn();
  render(<MaintenanceCard state={IN_MAINTENANCE} onChange={onChange} onUnauthorized={() => {}} />);
  expect(screen.getByText("In maintenance")).toBeInTheDocument();
  expect(screen.getByText("Visitors see the maintenance page until you go live")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Go live" }));
  await vi.waitFor(() => expect(onChange).toHaveBeenCalledWith({ on: false, forced_by_env: false }));
  const post = server.fetch.mock.calls.find((c) => c[1]?.method === "POST");
  expect(JSON.parse(String(post?.[1]?.body))).toEqual({ on: false });
});

test("forced by the environment: the button is disabled and the note says where to fix it", () => {
  render(<MaintenanceCard state={{ on: true, forced_by_env: true }} onChange={() => {}} onUnauthorized={() => {}} />);
  expect(screen.getByRole("button", { name: "Go live" })).toBeDisabled();
  expect(screen.getByText("Forced on by MAINTENANCE_MODE in deploy/app.env on the server. Remove it there and redeploy")).toBeInTheDocument();
  expect(screen.getByText("Sign out clears this browser only. To sign out everywhere, change ADMIN_PASSWORD")).toBeInTheDocument();
});

test("a failed update says so and keeps the state; a 401 reports unauthorized", async () => {
  const server = fakeServer({ maintenance: IN_MAINTENANCE });
  vi.stubGlobal("fetch", server.fetch);
  const onChange = vi.fn();
  const onUnauthorized = vi.fn();
  render(<MaintenanceCard state={IN_MAINTENANCE} onChange={onChange} onUnauthorized={onUnauthorized} />);
  server.state.down = true;
  await userEvent.click(screen.getByRole("button", { name: "Go live" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not update, try again");
  expect(onChange).not.toHaveBeenCalled();
  expect(screen.getByText("In maintenance")).toBeInTheDocument();
  server.state.down = false;
  server.state.authed = false;
  await userEvent.click(screen.getByRole("button", { name: "Go live" }));
  await vi.waitFor(() => expect(onUnauthorized).toHaveBeenCalledTimes(1));
  expect(onChange).not.toHaveBeenCalled();
});

test("while an update is in flight the button spins, is marked busy and ignores taps, and the last error is gone", async () => {
  const server = fakeServer({ maintenance: IN_MAINTENANCE });
  vi.stubGlobal("fetch", server.fetch);
  const onChange = vi.fn();
  render(<MaintenanceCard state={IN_MAINTENANCE} onChange={onChange} onUnauthorized={() => {}} />);
  server.state.down = true;
  await userEvent.click(screen.getByRole("button", { name: "Go live" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not update, try again");
  server.state.down = false;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const gated = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    await gate;
    return server.fetch(input, init);
  });
  vi.stubGlobal("fetch", gated);
  const button = screen.getByRole("button", { name: "Go live" });
  await userEvent.click(button);
  expect(button).toHaveAttribute("aria-disabled", "true");
  expect(button).toBeEnabled();
  expect(button.querySelector("svg.animate-spin")).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  await userEvent.click(button);
  expect(gated.mock.calls.filter((c) => c[1]?.method === "POST")).toHaveLength(1);
  release();
  await waitFor(() => expect(button).not.toHaveAttribute("aria-disabled"));
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(onChange).toHaveBeenCalledWith({ on: false, forced_by_env: false });
  expect(button.querySelector("svg")).not.toBeInTheDocument();
});

test("the switch keeps keyboard focus through each update, turning on and then going live", async () => {
  browserFocusFixup();
  vi.stubGlobal("fetch", fakeServer().fetch);
  render(<Lifted initial={LIVE} />);
  const button = screen.getByRole("button", { name: "Turn on maintenance" });
  button.focus();
  await userEvent.keyboard("{Enter}");
  expect(button).toHaveTextContent("Tap to confirm");
  await userEvent.keyboard("{Enter}");
  expect(await screen.findByText("In maintenance")).toBeInTheDocument();
  expect(button).toHaveTextContent("Go live");
  expect(document.activeElement).toBe(button);
  await userEvent.keyboard("{Enter}");
  expect(await screen.findByText("Live")).toBeInTheDocument();
  expect(button).toHaveTextContent("Turn on maintenance");
  expect(document.activeElement).toBe(button);
});

test("a refresh that flips the state drops a pending confirm, so one tap never turns it on", () => {
  const server = fakeServer();
  vi.stubGlobal("fetch", server.fetch);
  const commits: Commit[] = [];
  const { rerender } = render(<Recorded state={LIVE} commits={commits} />);
  fireEvent.click(screen.getByRole("button", { name: "Turn on maintenance" }));
  expect(screen.getByRole("button", { name: "Tap to confirm" })).toBeInTheDocument();
  rerender(<Recorded state={IN_MAINTENANCE} commits={commits} />);
  const flip = commits[commits.length - 1];
  expect(flip.label).toBe("Go live");
  for (const armed of ARMED) expect(flip.classes).not.toContain(armed);
  const button = screen.getByRole("button", { name: "Go live" });
  for (const armed of ARMED) expect(button.className.split(" ")).not.toContain(armed);
  rerender(<Recorded state={LIVE} commits={commits} />);
  expect(screen.getByRole("button", { name: "Turn on maintenance" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Tap to confirm" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Turn on maintenance" }));
  expect(screen.getByRole("button", { name: "Tap to confirm" })).toBeInTheDocument();
  expect(server.urls("/api/admin/maintenance")).toHaveLength(0);
});

test("before the state is known: a checking line and no button", () => {
  render(<MaintenanceCard state={null} onChange={() => {}} onUnauthorized={() => {}} />);
  expect(screen.getByText("Checking the site status")).toBeInTheDocument();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});

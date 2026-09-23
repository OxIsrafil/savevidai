import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { fakeServer } from "../test/fakeServer";
import { MaintenanceCard } from "./MaintenanceCard";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const LIVE = { on: false, forced_by_env: false };
const IN_MAINTENANCE = { on: true, forced_by_env: false };

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
  expect(classes).toEqual(expect.arrayContaining(["border-warning/40!", "bg-warning-dim!", "text-warning!"]));
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

test("while an update is in flight the button is disabled and spins, and the last error is gone", async () => {
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
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      await gate;
      return server.fetch(input, init);
    }),
  );
  const button = screen.getByRole("button", { name: "Go live" });
  await userEvent.click(button);
  expect(button).toBeDisabled();
  expect(button.querySelector("svg.animate-spin")).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  release();
  await waitFor(() => expect(button).toBeEnabled());
  expect(onChange).toHaveBeenCalledWith({ on: false, forced_by_env: false });
  expect(button.querySelector("svg")).not.toBeInTheDocument();
});

test("before the state is known: a checking line and no button", () => {
  render(<MaintenanceCard state={null} onChange={() => {}} onUnauthorized={() => {}} />);
  expect(screen.getByText("Checking the site status")).toBeInTheDocument();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});

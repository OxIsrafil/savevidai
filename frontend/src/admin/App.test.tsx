import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { App } from "./App";
import { fakeServer } from "./test/fakeServer";

beforeEach(() => {
  window.history.replaceState(null, "", "/");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

test("checking: no login flash, a spinner only after 400 ms, then the shell", async () => {
  vi.useFakeTimers();
  const server = fakeServer();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const real = server.fetch;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input) === "/api/admin/maintenance" && !init?.method) await gate;
      return real(input, init);
    }),
  );
  render(<App />);
  expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(399);
  });
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(screen.getByRole("status", { name: "Checking your session" })).toBeInTheDocument();
  release();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10);
  });
  expect(screen.getByRole("heading", { name: "Last 7 days" })).toBeInTheDocument();
  expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});

test("a 401 probe goes straight to the login view with the button disabled while empty", async () => {
  vi.stubGlobal("fetch", fakeServer({ authed: false }).fetch);
  render(<App />);
  expect(await screen.findByLabelText("Password")).toHaveAttribute("autocomplete", "current-password");
  expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  expect(screen.getByText("Traffic, downloads and site controls for SaveVid AI")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Sign in" })).toBeDisabled();
});

test("signing in with the right password shows the shell and never the password again", async () => {
  const server = fakeServer({ authed: false });
  vi.stubGlobal("fetch", server.fetch);
  render(<App />);
  const field = await screen.findByLabelText("Password");
  await userEvent.type(field, "hunter2");
  expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
  await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
  expect(await screen.findByRole("heading", { name: "Last 7 days" })).toBeInTheDocument();
  expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
  const loginCall = server.fetch.mock.calls.find((c) => String(c[0]) === "/api/admin/login");
  expect(JSON.parse(String(loginCall?.[1]?.body))).toEqual({ password: "hunter2" });
});

test("a wrong password says so, marks the field and stays on the login view", async () => {
  vi.stubGlobal("fetch", fakeServer({ authed: false, loginStatus: 401 }).fetch);
  render(<App />);
  const field = await screen.findByLabelText("Password");
  await userEvent.type(field, "nope");
  await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
  expect(await screen.findByText("Wrong password")).toBeInTheDocument();
  expect(field).toHaveAttribute("aria-invalid", "true");
  expect(screen.queryByRole("heading", { name: "Last 7 days" })).not.toBeInTheDocument();
});

test("too many tries shows the rate-limit line without marking the field", async () => {
  vi.stubGlobal("fetch", fakeServer({ authed: false, loginStatus: 429 }).fetch);
  render(<App />);
  const field = await screen.findByLabelText("Password");
  await userEvent.type(field, "pw");
  await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
  expect(await screen.findByText("Too many tries. Wait a minute")).toBeInTheDocument();
  expect(field).not.toHaveAttribute("aria-invalid");
});

test("a network failure while signing in says the server could not be reached", async () => {
  const server = fakeServer({ authed: false });
  vi.stubGlobal("fetch", server.fetch);
  render(<App />);
  const field = await screen.findByLabelText("Password");
  await userEvent.type(field, "pw");
  server.state.down = true;
  await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
  expect(await screen.findByText("Could not reach the server")).toBeInTheDocument();
});

test("sign out posts to logout and returns to the login view", async () => {
  const server = fakeServer();
  vi.stubGlobal("fetch", server.fetch);
  render(<App />);
  await screen.findByRole("heading", { name: "Last 7 days" });
  await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
  expect(await screen.findByLabelText("Password")).toBeInTheDocument();
  const logoutCall = server.fetch.mock.calls.find((c) => String(c[0]) === "/api/admin/logout");
  expect(logoutCall?.[1]?.method).toBe("POST");
});

test("the nav switches pages, writes the URL, and popstate restores it", async () => {
  vi.stubGlobal("fetch", fakeServer().fetch);
  render(<App />);
  await screen.findByRole("heading", { name: "Last 7 days" });
  await userEvent.click(screen.getByRole("button", { name: "Site" }));
  expect(screen.getByRole("heading", { name: "Site" })).toBeInTheDocument();
  expect(screen.getByText("Maintenance switch and resolver health")).toBeInTheDocument();
  expect(window.location.search).toBe("?page=site");
  expect(screen.getByRole("button", { name: "Site" })).toHaveAttribute("aria-current", "page");
  await userEvent.click(screen.getByRole("button", { name: "Analytics" }));
  expect(screen.getByRole("heading", { name: "Last 7 days" })).toBeInTheDocument();
  expect(window.location.search).toBe("");
  act(() => {
    window.history.replaceState(null, "", "/?page=site");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  expect(screen.getByRole("heading", { name: "Site" })).toBeInTheDocument();
});

test("?page=site on load opens the Site page", async () => {
  window.history.replaceState(null, "", "/?page=site");
  vi.stubGlobal("fetch", fakeServer().fetch);
  render(<App />);
  expect(await screen.findByRole("heading", { name: "Site" })).toBeInTheDocument();
});

test("a 404 probe explains that analytics is off and names the variables", async () => {
  vi.stubGlobal("fetch", fakeServer({ enabled: false }).fetch);
  render(<App />);
  expect(await screen.findByRole("heading", { name: "Analytics is off on this server" })).toBeInTheDocument();
  for (const name of ["ADMIN_PASSWORD", "ANALYTICS_SALT", "ANALYTICS_DB_PATH", "TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN"]) {
    expect(screen.getByText(name)).toBeInTheDocument();
  }
  expect(screen.getByText(/deploy\/app\.env/)).toBeInTheDocument();
  expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
});

test("a 503 probe shows Unavailable, and Retry recovers", async () => {
  const server = fakeServer({ probeStatus: 503 });
  vi.stubGlobal("fetch", server.fetch);
  render(<App />);
  expect(await screen.findByRole("heading", { name: "Analytics is unavailable" })).toBeInTheDocument();
  expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
  server.state.probeStatus = 200;
  await userEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(await screen.findByRole("heading", { name: "Last 7 days" })).toBeInTheDocument();
});

test("while maintenance is on, the Site nav item carries the On pill", async () => {
  vi.stubGlobal("fetch", fakeServer({ maintenance: { on: true, forced_by_env: false } }).fetch);
  render(<App />);
  expect(await screen.findByText("On")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Site On" })).toBeInTheDocument();
});

test("a range tab writes the URL and refetches the report for that range", async () => {
  const server = fakeServer();
  vi.stubGlobal("fetch", server.fetch);
  render(<App />);
  await screen.findByText("Sep 17 to Sep 23, your local time");
  await userEvent.click(screen.getByRole("button", { name: "30 days" }));
  expect(window.location.search).toBe("?range=30d");
  expect(screen.getByRole("heading", { name: "Last 30 days" })).toBeInTheDocument();
  await vi.waitFor(() => expect(server.urls("/api/admin/report").at(-1)).toBe("/api/admin/report?range=30d&tz=" + String(-new Date().getTimezoneOffset())));
  act(() => {
    window.history.replaceState(null, "", "/?range=today");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  expect(screen.getByRole("heading", { name: "Today" })).toBeInTheDocument();
  expect(await screen.findByText("Sep 23, your local time")).toBeInTheDocument();
});

test("refreshes every 30 s only while the tab is visible, and catches up on return", async () => {
  vi.useFakeTimers();
  const server = fakeServer();
  vi.stubGlobal("fetch", server.fetch);
  render(<App />);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10);
  });
  expect(server.urls("/api/admin/report")).toHaveLength(1);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(30_000);
  });
  expect(server.urls("/api/admin/report")).toHaveLength(2);
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(60_000);
  });
  expect(server.urls("/api/admin/report")).toHaveLength(2);
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
  await act(async () => {
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(10);
  });
  expect(server.urls("/api/admin/report")).toHaveLength(3);
  delete (document as unknown as { visibilityState?: string }).visibilityState;
});

test("a 401 on a refresh returns to the login view", async () => {
  vi.useFakeTimers();
  const server = fakeServer();
  vi.stubGlobal("fetch", server.fetch);
  render(<App />);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10);
  });
  expect(screen.getByRole("heading", { name: "Last 7 days" })).toBeInTheDocument();
  // Only the report says 401; the maintenance refresh on the same tick still answers 200, so
  // this pins the Analytics page's own 401 handler rather than the app's maintenance check.
  server.state.reportStatus = 401;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(30_000);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10);
  });
  expect(screen.getByLabelText("Password")).toBeInTheDocument();
});

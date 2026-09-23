import { afterEach, expect, test, vi } from "vitest";
import { fetchReport, fetchResolvers, getMaintenance, login, logout, probe, setMaintenance } from "./api";
import { REPORT_7D, RESOLVERS } from "../test/fixtures";

afterEach(() => {
  vi.unstubAllGlobals();
});

function respond(status: number, body?: unknown) {
  return vi.fn(async (_url: string, _init?: RequestInit) =>
    new Response(body === undefined ? null : JSON.stringify(body), { status }),
  );
}

function failing() {
  return vi.fn(async (_url: string, _init?: RequestInit): Promise<Response> => {
    throw new TypeError("Failed to fetch");
  });
}

test.each([
  [200, "ok"],
  [401, "unauthorized"],
  [404, "off"],
  [503, "error"],
] as const)("probe maps %i to %s", async (status, expected) => {
  const fetchMock = respond(status, { on: false, forced_by_env: false });
  vi.stubGlobal("fetch", fetchMock);
  expect(await probe()).toBe(expected);
  expect(String(fetchMock.mock.calls[0]?.[0])).toBe("/api/admin/maintenance");
});

test("probe reports a network failure as error", async () => {
  vi.stubGlobal("fetch", failing());
  expect(await probe()).toBe("error");
});

test.each([
  [204, "ok"],
  [401, "wrong"],
  [429, "limited"],
  [500, "error"],
] as const)("login maps %i to %s", async (status, expected) => {
  const fetchMock = respond(status);
  vi.stubGlobal("fetch", fetchMock);
  expect(await login("hunter2")).toBe(expected);
  const [url, init] = fetchMock.mock.calls[0] ?? [];
  expect(String(url)).toBe("/api/admin/login");
  expect(init?.method).toBe("POST");
  expect(String((init?.headers as Record<string, string>)["Content-Type"])).toContain("application/json");
  expect(JSON.parse(String(init?.body))).toEqual({ password: "hunter2" });
});

test("login reports a network failure as error", async () => {
  vi.stubGlobal("fetch", failing());
  expect(await login("x")).toBe("error");
});

test("logout POSTs and never throws, even on a network failure", async () => {
  const fetchMock = respond(204);
  vi.stubGlobal("fetch", fetchMock);
  await expect(logout()).resolves.toBeUndefined();
  expect(String(fetchMock.mock.calls[0]?.[0])).toBe("/api/admin/logout");
  expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("POST");
  vi.stubGlobal("fetch", failing());
  await expect(logout()).resolves.toBeUndefined();
});

test("fetchReport sends range and tz and returns the parsed report", async () => {
  const fetchMock = respond(200, REPORT_7D);
  vi.stubGlobal("fetch", fetchMock);
  const r = await fetchReport("7d", 360);
  expect(String(fetchMock.mock.calls[0]?.[0])).toBe("/api/admin/report?range=7d&tz=360");
  expect(r).toEqual(REPORT_7D);
});

test.each([
  [401, "unauthorized"],
  [422, "error"],
  [503, "error"],
] as const)("fetchReport maps %i to %s", async (status, expected) => {
  vi.stubGlobal("fetch", respond(status, { error: "x" }));
  expect(await fetchReport("today", -300)).toBe(expected);
});

test("fetchReport reports a network failure as error", async () => {
  vi.stubGlobal("fetch", failing());
  expect(await fetchReport("7d", 0)).toBe("error");
});

test("fetchResolvers sends tz and returns the five rows", async () => {
  const fetchMock = respond(200, RESOLVERS);
  vi.stubGlobal("fetch", fetchMock);
  const r = await fetchResolvers(360);
  expect(String(fetchMock.mock.calls[0]?.[0])).toBe("/api/admin/resolvers?tz=360");
  expect(r).toEqual(RESOLVERS);
  vi.stubGlobal("fetch", respond(401, { error: "unauthorized" }));
  expect(await fetchResolvers(360)).toBe("unauthorized");
});

test("getMaintenance and setMaintenance return the parsed state or a failure word", async () => {
  vi.stubGlobal("fetch", respond(200, { on: true, forced_by_env: false }));
  expect(await getMaintenance()).toEqual({ on: true, forced_by_env: false });
  const fetchMock = respond(200, { on: false, forced_by_env: false });
  vi.stubGlobal("fetch", fetchMock);
  expect(await setMaintenance(false)).toEqual({ on: false, forced_by_env: false });
  const [url, init] = fetchMock.mock.calls[0] ?? [];
  expect(String(url)).toBe("/api/admin/maintenance");
  expect(init?.method).toBe("POST");
  expect(JSON.parse(String(init?.body))).toEqual({ on: false });
  vi.stubGlobal("fetch", respond(401, { error: "unauthorized" }));
  expect(await getMaintenance()).toBe("unauthorized");
  expect(await setMaintenance(true)).toBe("unauthorized");
  vi.stubGlobal("fetch", respond(503, { error: "analytics_unavailable" }));
  expect(await getMaintenance()).toBe("error");
});

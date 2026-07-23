import { afterEach, expect, test, vi } from "vitest";
import { getMaintenance, setMaintenance } from "./api";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("getMaintenance GETs the endpoint and returns the parsed shape", async () => {
  const fetchMock = vi.fn(
    async (_url: string) =>
      new Response(JSON.stringify({ on: true, forced_by_env: false }), { status: 200 }),
  );
  vi.stubGlobal("fetch", fetchMock);

  const result = await getMaintenance();

  expect(String(fetchMock.mock.calls.at(-1)?.[0])).toBe("/api/admin/maintenance");
  expect(result).toEqual({ on: true, forced_by_env: false });
});

test("setMaintenance(true) POSTs {on:true} and returns the parsed shape", async () => {
  const fetchMock = vi.fn(
    async (_url: string, _init?: RequestInit) =>
      new Response(JSON.stringify({ on: true, forced_by_env: false }), { status: 200 }),
  );
  vi.stubGlobal("fetch", fetchMock);

  const result = await setMaintenance(true);

  const [url, init] = fetchMock.mock.calls.at(-1) ?? [];
  expect(String(url)).toBe("/api/admin/maintenance");
  expect(init?.method).toBe("POST");
  expect(String((init?.headers as Record<string, string>)?.["Content-Type"])).toContain(
    "application/json",
  );
  expect(String(init?.body)).toContain('"on":true');
  expect(result).toEqual({ on: true, forced_by_env: false });
});

test("getMaintenance throws on a non-ok response", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 })),
  );
  await expect(getMaintenance()).rejects.toThrow();
});

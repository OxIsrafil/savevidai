import { afterEach, expect, test, vi } from "vitest";
import { sendEvent } from "./analytics";

afterEach(() => vi.unstubAllGlobals());

test("posts a visit event via fetch", async () => {
  const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
    new Response(null, { status: 204 }),
  );
  vi.stubGlobal("fetch", fetchMock);
  sendEvent("visit", { platform: "twitter" });
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("/api/event");
  expect(JSON.parse(String(init?.body))).toEqual({ type: "visit", platform: "twitter" });
});

test("includes quality and platform for downloads", () => {
  const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetchMock);
  sendEvent("download", { quality: "1080p", platform: "tiktok" });
  const [, init] = fetchMock.mock.calls[0];
  expect(JSON.parse(String(init?.body))).toEqual({
    type: "download",
    quality: "1080p",
    platform: "tiktok",
  });
});

test("sends only the type when no options are given", () => {
  const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetchMock);
  sendEvent("visit");
  const [, init] = fetchMock.mock.calls[0];
  expect(JSON.parse(String(init?.body))).toEqual({ type: "visit" });
});

test("never throws when fetch itself throws synchronously", () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("network");
    }),
  );
  expect(() => sendEvent("download", { quality: "1080p" })).not.toThrow();
});

test("swallows a rejected fetch (e.g. 404 when analytics is disabled) without throwing", () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 404 })));
  expect(() => sendEvent("visit")).not.toThrow();
});

import { afterEach, expect, test, vi } from "vitest";
import { classifySource, sendEvent, visitContext } from "./analytics";

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

test("classifySource buckets referrers into privacy-safe sources", () => {
  expect(classifySource("", "savevidai.israfill.dev")).toBe("direct");
  expect(
    classifySource("https://savevidai.israfill.dev/x", "savevidai.israfill.dev"),
  ).toBe("internal");
  expect(classifySource("https://www.google.com/search", "savevidai.israfill.dev")).toBe("search");
  expect(classifySource("https://google.co.uk/", "savevidai.israfill.dev")).toBe("search");
  expect(classifySource("https://t.co/abc", "savevidai.israfill.dev")).toBe("social");
  expect(classifySource("https://www.reddit.com/r/x", "savevidai.israfill.dev")).toBe("social");
  expect(classifySource("https://someblog.com/post", "savevidai.israfill.dev")).toBe("referral");
  expect(classifySource("not a url", "savevidai.israfill.dev")).toBe("direct");
});

test("visitContext returns new on first call then returning on the second", () => {
  const store: Record<string, string> = {};
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => {
      store[k] = v;
    },
    removeItem: (k: string) => {
      delete store[k];
    },
  });
  vi.stubGlobal("document", { referrer: "" });
  vi.stubGlobal("location", { hostname: "savevidai.israfill.dev" });

  const first = visitContext();
  expect(first).toEqual({ source: "direct", visitor_kind: "new" });
  expect(store.svai_seen).toBe("1");

  const second = visitContext();
  expect(second).toEqual({ source: "direct", visitor_kind: "returning" });
});

test("a visit beacon carries source and visitor_kind from visitContext", () => {
  const store: Record<string, string> = {};
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => {
      store[k] = v;
    },
    removeItem: (k: string) => {
      delete store[k];
    },
  });
  vi.stubGlobal("document", { referrer: "https://www.google.com/search" });
  vi.stubGlobal("location", { hostname: "savevidai.israfill.dev" });
  const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
    new Response(null, { status: 204 }),
  );
  vi.stubGlobal("fetch", fetchMock);

  sendEvent("visit", { platform: "twitter", ...visitContext() });
  const [, init] = fetchMock.mock.calls[0];
  expect(JSON.parse(String(init?.body))).toEqual({
    type: "visit",
    platform: "twitter",
    source: "search",
    visitor_kind: "new",
  });
});

function stubVisitGlobals(lang?: string) {
  const store: Record<string, string> = {};
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => {
      store[k] = v;
    },
    removeItem: (k: string) => {
      delete store[k];
    },
  });
  vi.stubGlobal(
    "document",
    lang === undefined ? { referrer: "" } : { referrer: "", documentElement: { lang } },
  );
  vi.stubGlobal("location", { hostname: "savevidai.israfill.dev" });
}

test("visitContext reads the page language from <html lang>", () => {
  for (const lang of ["en", "es", "hi"]) {
    stubVisitGlobals(lang);
    expect(visitContext()).toEqual({ source: "direct", visitor_kind: "new", locale: lang });
  }
});

test("visitContext omits locale for any other language or when lang is missing", () => {
  for (const lang of ["fr", "en-US", "EN", ""]) {
    stubVisitGlobals(lang);
    const ctx = visitContext();
    expect(ctx).toEqual({ source: "direct", visitor_kind: "new" });
    expect(ctx).not.toHaveProperty("locale");
  }
  stubVisitGlobals(undefined);
  expect(visitContext()).not.toHaveProperty("locale");
});

test("a visit beacon carries the locale next to source and visitor_kind", () => {
  stubVisitGlobals("hi");
  const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
    new Response(null, { status: 204 }),
  );
  vi.stubGlobal("fetch", fetchMock);
  sendEvent("visit", { platform: "tiktok", ...visitContext() });
  const [, init] = fetchMock.mock.calls[0];
  expect(JSON.parse(String(init?.body))).toEqual({
    type: "visit",
    platform: "tiktok",
    source: "direct",
    visitor_kind: "new",
    locale: "hi",
  });
});

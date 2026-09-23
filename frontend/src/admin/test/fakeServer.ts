import { vi } from "vitest";
import type { Maintenance, RangeKey } from "../lib/api";
import { REPORTS, RESOLVERS } from "./fixtures";

export type FakeState = {
  /** A valid cookie is present. Login with a 204 sets it, logout clears it. */
  authed: boolean;
  /** Analytics configured on the server; false answers 404 everywhere. */
  enabled: boolean;
  /** Status of GET /api/admin/maintenance when not 200 (the probe). */
  probeStatus: number;
  loginStatus: number;
  reportStatus: number;
  resolversStatus: number;
  maintenance: Maintenance;
  /** Every request throws, like a lost connection. */
  down: boolean;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** A fetch stub that answers every admin endpoint from the fixtures. Mutate `state` mid-test. */
export function fakeServer(overrides: Partial<FakeState> = {}) {
  const state: FakeState = {
    authed: true,
    enabled: true,
    probeStatus: 200,
    loginStatus: 204,
    reportStatus: 200,
    resolversStatus: 200,
    maintenance: { on: false, forced_by_env: false },
    down: false,
    ...overrides,
  };
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    const path = url.split("?")[0];
    const method = init?.method ?? "GET";
    if (state.down) throw new TypeError("Failed to fetch");
    if (!state.enabled) return new Response("Not Found", { status: 404 });
    if (path === "/api/admin/login") {
      if (state.loginStatus === 204) {
        state.authed = true;
        return new Response(null, { status: 204 });
      }
      return json({ error: state.loginStatus === 429 ? "rate_limited" : "unauthorized" }, state.loginStatus);
    }
    if (path === "/api/admin/logout") {
      state.authed = false;
      return new Response(null, { status: 204 });
    }
    if (!state.authed) return json({ error: "unauthorized" }, 401);
    if (path === "/api/admin/maintenance") {
      if (method === "POST") {
        state.maintenance = { ...state.maintenance, on: Boolean(JSON.parse(String(init?.body)).on) };
        return json(state.maintenance);
      }
      if (state.probeStatus !== 200) return json({ error: "analytics_unavailable" }, state.probeStatus);
      return json(state.maintenance);
    }
    if (path === "/api/admin/report") {
      if (state.reportStatus !== 200) return json({ error: "analytics_unavailable" }, state.reportStatus);
      const range = (new URL(url, "http://admin.test").searchParams.get("range") ?? "7d") as RangeKey;
      return json(REPORTS[range]);
    }
    if (path === "/api/admin/resolvers") {
      if (state.resolversStatus !== 200) return json({ error: "analytics_unavailable" }, state.resolversStatus);
      return json(RESOLVERS);
    }
    return new Response("Not Found", { status: 404 });
  });
  return {
    fetch: fetchMock,
    state,
    /** Every requested URL that starts with `prefix`, in order. */
    urls: (prefix: string) => fetchMock.mock.calls.map((c) => String(c[0])).filter((u) => u.startsWith(prefix)),
  };
}

export type FakeServer = ReturnType<typeof fakeServer>;

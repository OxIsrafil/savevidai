// Types mirror the backend JSON of spec B4 (report) and B5 (resolvers) exactly.
// Every fetcher maps HTTP status to a small word so views never see a Response.

export type RangeKey = "today" | "7d" | "30d" | "90d";
export type Bucket = "hour" | "day";

export type Totals = {
  visitors: number;
  page_views: number;
  fetches: number;
  ok_fetches: number;
  failed_fetches: number;
  upstream_errors: number;
  downloads: number;
  downloaded_visitors: number;
  new_visitors: number;
  returning_visitors: number;
  complete_days: number;
  complete_day_visitors: number;
};

export type SeriesValues = { visitors: number; fetches: number; downloads: number; failed_fetches: number };
export type SeriesMetric = keyof SeriesValues;

/** Hourly buckets (today) carry integer keys 0..23; daily buckets carry "YYYY-MM-DD". */
export type SeriesPoint = {
  key: string | number;
  prev_key: string | number;
  /** Null for hours after the current local hour (today only). */
  cur: SeriesValues | null;
  /** Null when has_previous is false, and for hours after the current hour. */
  prev: SeriesValues | null;
};

export type Peak = { count: number; day: string; time: string };
export type Funnel = { visitors: number; fetched: number; got_result: number; downloaded: number };
export type OutcomeRow = { outcome: string; count: number };
export type PlatformRow = { platform: string; fetches: number; ok: number; downloads: number };
export type QualityRow = { quality: string; count: number };
export type CountryRow = { country: string; visitors: number };
export type PageRow = { platform: string; locale: string; views: number };
export type HourRow = { hour: number; fetches: number };
export type SourceRow = { source: string; visits: number };
export type Live = { active_now: number; fetches_last_hour: number; upstream_last_hour: number };

export type Report = {
  range: RangeKey;
  tz: number;
  bucket: Bucket;
  has_previous: boolean;
  window: { start: string; end: string };
  totals: Totals;
  previous: Totals | null;
  series: SeriesPoint[];
  peak: Peak | null;
  funnel: Funnel;
  outcomes: OutcomeRow[];
  platforms: PlatformRow[];
  qualities: QualityRow[];
  countries: CountryRow[];
  pages: PageRow[];
  hours: HourRow[];
  sources: SourceRow[];
  live: Live;
};

export type ResolverRow = {
  platform: string;
  fetches: number;
  ok: number;
  top_failure: { outcome: string; count: number } | null;
  last_failure_min_ago: number | null;
};
export type Resolvers = { platforms: ResolverRow[] };

export type Maintenance = { on: boolean; forced_by_env: boolean };

export type ProbeResult = "ok" | "unauthorized" | "off" | "error";
export type LoginResult = "ok" | "wrong" | "limited" | "error";
export type ApiFailure = "unauthorized" | "error";

const JSON_HEADERS = { "Content-Type": "application/json" };

/** GET /api/admin/maintenance as a session probe: 200 ok, 401 unauthorized, 404 analytics off. */
export async function probe(): Promise<ProbeResult> {
  try {
    const r = await fetch("/api/admin/maintenance");
    if (r.status === 200) return "ok";
    if (r.status === 401) return "unauthorized";
    if (r.status === 404) return "off";
    return "error";
  } catch {
    return "error";
  }
}

export async function login(password: string): Promise<LoginResult> {
  try {
    const r = await fetch("/api/admin/login", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ password }),
    });
    if (r.status === 204) return "ok";
    if (r.status === 401) return "wrong";
    if (r.status === 429) return "limited";
    return "error";
  } catch {
    return "error";
  }
}

/** The login view follows whatever happens here; the cookie is httponly, so this is the only way to clear it. */
export async function logout(): Promise<void> {
  try {
    await fetch("/api/admin/logout", { method: "POST" });
  } catch {
    // Nothing to do: the caller shows the login view either way.
  }
}

async function getJson<T>(url: string, init?: RequestInit): Promise<T | ApiFailure> {
  try {
    const r = await fetch(url, init);
    if (r.status === 401) return "unauthorized";
    if (!r.ok) return "error";
    return (await r.json()) as T;
  } catch {
    return "error";
  }
}

export function fetchReport(range: RangeKey, tz: number): Promise<Report | ApiFailure> {
  return getJson<Report>(`/api/admin/report?range=${range}&tz=${tz}`);
}

export function fetchResolvers(tz: number): Promise<Resolvers | ApiFailure> {
  return getJson<Resolvers>(`/api/admin/resolvers?tz=${tz}`);
}

export function getMaintenance(): Promise<Maintenance | ApiFailure> {
  return getJson<Maintenance>("/api/admin/maintenance");
}

export function setMaintenance(on: boolean): Promise<Maintenance | ApiFailure> {
  return getJson<Maintenance>("/api/admin/maintenance", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ on }),
  });
}

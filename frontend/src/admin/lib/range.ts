import type { RangeKey } from "./api";

export const RANGE_KEYS: readonly RangeKey[] = ["today", "7d", "30d", "90d"];
export const DEFAULT_RANGE: RangeKey = "7d";
/** Tab labels. */
export const RANGE_LABELS: Record<RangeKey, string> = { today: "Today", "7d": "7 days", "30d": "30 days", "90d": "90 days" };
/** Page titles. */
export const RANGE_TITLES: Record<RangeKey, string> = { today: "Today", "7d": "Last 7 days", "30d": "Last 30 days", "90d": "Last 90 days" };
export const RANGE_DAYS: Record<RangeKey, number> = { today: 1, "7d": 7, "30d": 30, "90d": 90 };

/** Unknown or missing values fall back to the default, so a stale link never breaks the page. */
export function parseRange(raw: string | null | undefined): RangeKey {
  return raw && (RANGE_KEYS as readonly string[]).includes(raw) ? (raw as RangeKey) : DEFAULT_RANGE;
}

export type Page = "analytics" | "site";
export const DEFAULT_PAGE: Page = "analytics";

export function parsePage(raw: string | null | undefined): Page {
  return raw === "site" ? "site" : DEFAULT_PAGE;
}

export type UrlState = { page: Page; range: RangeKey };

export function readUrlState(search: string): UrlState {
  const params = new URLSearchParams(search);
  return { page: parsePage(params.get("page")), range: parseRange(params.get("range")) };
}

/** Defaults carry no parameter: the plain /admin URL is Analytics, last 7 days. */
export function buildSearch(state: UrlState): string {
  const params = new URLSearchParams();
  if (state.page !== DEFAULT_PAGE) params.set("page", state.page);
  if (state.range !== DEFAULT_RANGE) params.set("range", state.range);
  const s = params.toString();
  return s ? `?${s}` : "";
}

export function bucketWord(range: RangeKey): "hour" | "day" {
  return range === "today" ? "hour" : "day";
}

/** Minutes east of UTC, the sign the backend expects (getTimezoneOffset is UTC minus local). */
export function currentTz(): number {
  return -new Date().getTimezoneOffset();
}

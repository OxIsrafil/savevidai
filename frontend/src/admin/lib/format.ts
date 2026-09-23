// Raw values to display strings. Numbers use en-US separators everywhere; compact
// notation is only for the chart's Y axis (spec F4).

export function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}

const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

export function formatCompact(n: number): string {
  return compact.format(n);
}

/** One decimal below 10%, whole numbers from 10%. An exact zero is "0%". */
export function formatPercent(x: number): string {
  if (!Number.isFinite(x)) return "0%";
  const pct = x * 100;
  if (pct === 0) return "0%";
  return pct < 10 ? `${pct.toFixed(1)}%` : `${Math.round(pct)}%`;
}

/** What a ratio with a zero denominator renders as. */
export const DASH = "-";

export function formatShare(x: number | null): string {
  return x == null ? DASH : formatPercent(x);
}

/** "1.3", one decimal always. */
export function formatRatio(x: number | null): string {
  return x == null ? DASH : x.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export function formatWhole(x: number | null): string {
  return x == null ? DASH : formatCount(Math.round(x));
}

const DAY_FORMAT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** "2026-09-17" to "Sep 17". The key is already a local date, so it is read as UTC to avoid a shift. */
export function formatDay(key: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return key;
  return DAY_FORMAT.format(new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))));
}

export function formatHour(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

export function formatHourRange(hour: number): string {
  return `${formatHour(hour)} to ${formatHour((hour + 1) % 24)}`;
}

/** Series keys: integers are hours, strings are days. */
export function formatBucket(key: string | number): string {
  return typeof key === "number" ? formatHour(key) : formatDay(key);
}

export function formatPeak(peak: { day: string; time: string }): string {
  return `${formatDay(peak.day)} at ${peak.time}`;
}

/** The header's span line. Today has equal start and end and shows one date. */
export function formatSpan(window: { start: string; end: string }): string {
  const tail = ", your local time";
  if (window.start === window.end) return `${formatDay(window.start)}${tail}`;
  return `${formatDay(window.start)} to ${formatDay(window.end)}${tail}`;
}

/** Local wall clock "14:02" for the Updated line. */
export function formatClock(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** "just now" under 1, "12 min ago" under 60, then "3 h ago" (spec B5). */
export function formatAgo(minutes: number): string {
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${Math.floor(minutes)} min ago`;
  return `${Math.floor(minutes / 60)} h ago`;
}

/** Midnight UTC on the owner's clock, from the tz offset in minutes east of UTC. */
export function utcMidnightLocal(tz: number): string {
  const m = ((tz % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** English region name; .of() throws RangeError on bad input, so fall back to the code. */
export function countryName(code: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

export const PLATFORM_NAMES: Record<string, string> = {
  twitter: "X (Twitter)",
  tiktok: "TikTok",
  reddit: "Reddit",
  instagram: "Instagram",
  facebook: "Facebook",
};

export function platformName(platform: string): string {
  return PLATFORM_NAMES[platform] ?? platform;
}

const QUALITY_LABELS: Record<string, string> = { hd: "HD", sd: "SD", photo: "Photo", album: "Album", sound: "Audio", video: "Video" };

export function qualityLabel(quality: string): string {
  return QUALITY_LABELS[quality] ?? quality;
}

const LANGUAGE_LABELS: Record<string, string> = { en: "English", es: "Spanish", hi: "Hindi" };

export function languageLabel(locale: string): string {
  return LANGUAGE_LABELS[locale] ?? "language not recorded";
}

export function pageLabel(platform: string, locale: string): string {
  return `${platformName(platform)}, ${languageLabel(locale)}`;
}

const SOURCE_LABELS: Record<string, string> = {
  direct: "Direct",
  search: "Search",
  social: "Social",
  referral: "Other sites",
  internal: "Between pages",
};

export function sourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source;
}

export const OUTCOME_LABELS: Record<string, string> = {
  ok: "Worked",
  not_found: "Deleted or missing",
  invalid_url: "Not a supported link",
  no_video: "No video in the post",
  private_or_restricted: "Private or restricted",
  upstream_error: "Resolver error",
  unsupported_post: "Unsupported post",
  not_configured: "Not set up",
};

export function outcomeLabel(outcome: string): string {
  return OUTCOME_LABELS[outcome] ?? outcome;
}

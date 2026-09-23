type EventType = "visit" | "download";

/** Fire-and-forget analytics beacon. No personal data, never throws, never blocks. */
export function sendEvent(
  type: EventType,
  opts: {
    quality?: string;
    platform?: string;
    source?: string;
    visitor_kind?: string;
    locale?: string;
  } = {},
): void {
  try {
    const body = JSON.stringify({ type, ...opts });
    void fetch("/api/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // analytics must never affect the user
  }
}

// Search engines matched by a token contained in the host, so subdomains and
// TLD variants (www.google.com, google.co.uk, search.brave.com) all resolve.
const SEARCH_TOKENS = [
  "google.",
  "bing.",
  "duckduckgo.",
  "yahoo.",
  "ecosia.",
  "baidu.",
  "yandex.",
  "brave.",
];

// Social hosts matched by exact host or a dot-boundary suffix, so reddit.com and
// www.reddit.com match but notreddit.com does not.
const SOCIAL_HOSTS = [
  "twitter.com",
  "x.com",
  "reddit.com",
  "facebook.com",
  "instagram.com",
  "tiktok.com",
  "youtube.com",
  "youtu.be",
  "linkedin.com",
  "pinterest.com",
];

/**
 * Classify a referrer into a coarse, privacy-safe bucket. Pure: no globals.
 * Returns one of: direct, internal, search, social, referral.
 */
export function classifySource(referrer: string, currentHost: string): string {
  if (!referrer || !referrer.trim()) return "direct";

  let host: string;
  try {
    host = new URL(referrer).hostname.toLowerCase();
  } catch {
    return "direct";
  }

  if (host === currentHost.toLowerCase()) return "internal";

  if (SEARCH_TOKENS.some((token) => host.includes(token))) return "search";

  if (host === "t.co") return "social";
  if (SOCIAL_HOSTS.some((d) => host === d || host.endsWith("." + d))) {
    return "social";
  }

  return "referral";
}

// The page language as the shells set it on <html lang>. Only the three
// languages the site ships are reported; anything else omits the field.
const LOCALES = new Set(["en", "es", "hi"]);

function pageLocale(): string | undefined {
  try {
    const lang = document.documentElement?.lang;
    return typeof lang === "string" && LOCALES.has(lang) ? lang : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Read the current page context for a visit beacon. Guards every global access
 * so it never throws; falls back to a direct/new visit on any failure.
 */
export function visitContext(): { source: string; visitor_kind: string; locale?: string } {
  try {
    const source = classifySource(
      document.referrer || "",
      location.hostname,
    );

    let visitor_kind = "new";
    try {
      if (localStorage.getItem("svai_seen")) {
        visitor_kind = "returning";
      } else {
        localStorage.setItem("svai_seen", "1");
      }
    } catch {
      // private mode can throw; treat as a new visit without persisting
      visitor_kind = "new";
    }

    const locale = pageLocale();
    return locale ? { source, visitor_kind, locale } : { source, visitor_kind };
  } catch {
    return { source: "direct", visitor_kind: "new" };
  }
}

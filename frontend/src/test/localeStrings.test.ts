// Structural parity of the three string tables. en is the reference: es and hi
// must expose exactly the same leaf paths, no gaps, no extras, no leftovers of
// the English copy where a translation was owed.
//
// Copy fidelity (is this the right Spanish?) is NOT this file's job: the
// translations doc docs/superpowers/specs/2026-08-01-i18n-translations.md is the
// source of truth for wording and review checks character fidelity against it.
// What this file catches is mechanical: a missed key, an empty string, an em
// dash, a dropped {n}, a wrong prefix, a copy-pasted English value.
import en from "../locales/en";
import es from "../locales/es";
import hi from "../locales/hi";
import type { LocaleStrings, PlatformKey } from "../locales/types";

const PLATFORMS: readonly PlatformKey[] = [
  "twitter",
  "tiktok",
  "reddit",
  "instagram",
  "facebook",
];

const TABLES: ReadonlyArray<[locale: "es" | "hi", table: LocaleStrings, prefix: string]> = [
  ["es", es, "/es"],
  ["hi", hi, "/hi"],
];

// en included: the em dash ban is a house rule for every locale, not just the
// new ones, so the guard covers the reference table too.
const ALL_TABLES: ReadonlyArray<[locale: string, table: LocaleStrings]> = [
  ["en", en],
  ...TABLES.map(([locale, table]): [string, LocaleStrings] => [locale, table]),
];

/**
 * Flatten a page table into path -> string. Arrays index by position, so a
 * dropped chip or a missing step shows up as a missing path rather than a
 * silently shorter list. Every leaf must be a string: the tables carry copy
 * only, so a number or a null is itself a defect.
 */
function flatten(value: unknown, path = "", out: Record<string, string> = {}) {
  if (typeof value === "string") {
    out[path] = value;
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach((item, i) => flatten(item, `${path}.${i}`, out));
    return out;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      flatten(child, path ? `${path}.${key}` : key, out);
    }
    return out;
  }
  throw new Error(`non-string leaf at "${path}": ${String(value)}`);
}

/**
 * Paths whose value is IDENTICAL in every locale by design: the brand, the
 * canonical platform names (spec section 1: never transliterated), the format
 * tokens, the language autonyms (a Hindi reader must see हिन्दी on every shell),
 * and the two non-copy fields that are keys rather than text (platformKey,
 * chipKeys). Everything not listed here is copy and MUST be translated.
 */
const CANONICAL = new Set<string>([
  "platformKey",
  "chipKeys.0",
  "chipKeys.1",
  "chipKeys.2",
  "chipKeys.3",
  "nav.brand",
  "nav.twitter",
  "nav.tiktok",
  "nav.reddit",
  "nav.instagram",
  "nav.facebook",
  "platform.twitter",
  "platform.tiktok",
  "platform.reddit",
  "platform.instagram",
  "platform.facebook",
  "preview.gifBadge",
  "quality.hdChip",
  "lang.en",
  "lang.es",
  "lang.hi",
  "footer.brand",
  "footer.xLink",
  "footer.copyright",
]);

/**
 * Per-locale additions to CANONICAL, each a deliberate decision in the
 * translations doc rather than an oversight:
 * - es "Video" / "Video {n}" is the Spanish word too (2.6), spelled the same.
 * - hi svg.copyLink stays Latin "Copy link": it labels the platform's own share
 *   menu, which a Hindi user sees in Latin script on their device (4.1).
 */
const CANONICAL_EXTRA: Record<"es" | "hi", ReadonlySet<string>> = {
  es: new Set(["preview.videoSingle", "preview.videoN"]),
  hi: new Set(["svg.copyLink"]),
};

const EM_DASH = /[—–―]/;

function occurrences(haystack: string, needle: string) {
  return haystack.split(needle).length - 1;
}

describe("locale string tables", () => {
  it("en covers all five platforms", () => {
    expect(Object.keys(en).sort()).toEqual([...PLATFORMS].sort());
  });

  it.each(TABLES)("%s exposes the same five platform pages as en", (_locale, table) => {
    expect(Object.keys(table).sort()).toEqual(Object.keys(en).sort());
  });

  it.each(TABLES)("%s has exactly en's leaf paths on every page", (_locale, table) => {
    for (const platform of PLATFORMS) {
      const expected = Object.keys(flatten(en[platform])).sort();
      const actual = Object.keys(flatten(table[platform])).sort();
      expect(actual, `page ${platform}`).toEqual(expected);
    }
  });

  it.each(TABLES)("%s has no empty or whitespace-only strings", (_locale, table) => {
    for (const platform of PLATFORMS) {
      for (const [path, value] of Object.entries(flatten(table[platform]))) {
        // prefix is "" only for en; every locale table here is prefixed.
        expect(value.trim(), `${platform}.${path}`).not.toBe("");
      }
    }
  });

  it.each(ALL_TABLES)("%s has no em dashes anywhere", (_locale, table) => {
    for (const platform of PLATFORMS) {
      for (const [path, value] of Object.entries(flatten(table[platform]))) {
        expect(EM_DASH.test(value), `${platform}.${path}: ${value}`).toBe(false);
      }
    }
  });

  it.each(TABLES)("%s preserves every {n} placeholder, and adds none", (_locale, table) => {
    for (const platform of PLATFORMS) {
      const reference = flatten(en[platform]);
      const actual = flatten(table[platform]);
      for (const [path, enValue] of Object.entries(reference)) {
        expect(occurrences(actual[path], "{n}"), `${platform}.${path}`).toBe(
          occurrences(enValue, "{n}"),
        );
      }
    }
  });

  it.each(TABLES)("%s uses the right locale field and path prefix", (locale, table, prefix) => {
    for (const platform of PLATFORMS) {
      expect(table[platform].locale).toBe(locale);
      expect(table[platform].prefix).toBe(prefix);
      // Components append the slug and derive the home link as `${prefix}/`, so
      // a trailing slash here would produce "/es//tiktokvideodownloader".
      expect(table[platform].prefix.endsWith("/")).toBe(false);
    }
    expect(en.twitter.prefix).toBe("");
  });

  it.each(TABLES)("%s translates every value that is not a canonical token", (locale, table) => {
    const allowed = CANONICAL_EXTRA[locale];
    for (const platform of PLATFORMS) {
      const reference = flatten(en[platform]);
      const actual = flatten(table[platform]);
      for (const [path, value] of Object.entries(actual)) {
        const canonical = CANONICAL.has(path) || allowed.has(path);
        if (canonical) {
          // The reverse guard: a canonical token must NOT drift into a
          // translation (no टिकटॉक, no "SaveVid IA"), and the allowlist cannot
          // silently rot into a licence to leave English copy untranslated.
          expect(value, `${platform}.${path} must stay canonical`).toBe(reference[path]);
        } else {
          expect(value, `${platform}.${path} is still the English string`).not.toBe(
            reference[path],
          );
        }
      }
    }
  });
});

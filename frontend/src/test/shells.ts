/**
 * The static HTML shells as one registry, plus the URL model every shell-level
 * test shares.
 *
 * Shell sources are read straight off disk at test time (Vite's ?raw), so the
 * assertions run against the files a crawler is served, not a build artifact.
 * Adding a locale is meant to be adding rows here: the hi shells land in Task 4
 * and extend LOCALES, SOURCES and therefore SHELLS by five rows, after which
 * every suite that iterates SHELLS covers them with no further edits.
 */
import twitterShell from "../../index.html?raw";
import tiktokShell from "../../tiktokvideodownloader.html?raw";
import redditShell from "../../redditvideodownloader.html?raw";
import instagramShell from "../../instagramvideodownloader.html?raw";
import facebookShell from "../../facebookvideodownloader.html?raw";
import esTwitterShell from "../../es/index.html?raw";
import esTiktokShell from "../../es/tiktokvideodownloader.html?raw";
import esRedditShell from "../../es/redditvideodownloader.html?raw";
import esInstagramShell from "../../es/instagramvideodownloader.html?raw";
import esFacebookShell from "../../es/facebookvideodownloader.html?raw";
import type { Locale, PlatformKey } from "../locales/types";

/** Locales that have shells on disk today. hi joins them in Task 4. */
export const LOCALES: readonly Locale[] = ["en", "es"];

/**
 * Every locale the hreflang cluster names, in the order the shells list them.
 * This is the fixed URL model from the spec, so it already includes hi: the en
 * and es shells point at the hi URLs before those shells exist.
 */
export const CLUSTER_LOCALES: readonly Locale[] = ["en", "es", "hi"];

export const PLATFORMS: readonly PlatformKey[] = [
  "twitter",
  "tiktok",
  "reddit",
  "instagram",
  "facebook",
];

/** URL slug per page. The Twitter page is the locale's home, so its slug is empty. */
export const SLUGS: Record<PlatformKey, string> = {
  twitter: "",
  tiktok: "tiktokvideodownloader",
  reddit: "redditvideodownloader",
  instagram: "instagramvideodownloader",
  facebook: "facebookvideodownloader",
};

export const ORIGIN = "https://savevidai.israfill.dev";

/**
 * Site-root-relative path a page is served at. en stays at the root, every other
 * locale sits under /<locale>/, and the home page keeps its trailing slash in
 * every locale ("/", "/es/", "/hi/"): the form the spec pins.
 */
export function pagePath(locale: Locale, platform: PlatformKey): string {
  const prefix = locale === "en" ? "" : `/${locale}`;
  return `${prefix}/${SLUGS[platform]}`;
}

/** Absolute form of pagePath, which is what canonicals and hreflang carry. */
export function pageUrl(locale: Locale, platform: PlatformKey): string {
  return `${ORIGIN}${pagePath(locale, platform)}`;
}

export type ShellRow = {
  /** Test title, e.g. "es tiktok". */
  name: string;
  locale: Locale;
  platform: PlatformKey;
  /** Raw file contents. */
  shell: string;
  path: string;
  url: string;
};

const SOURCES: { [L in Locale]?: Record<PlatformKey, string> } = {
  en: {
    twitter: twitterShell,
    tiktok: tiktokShell,
    reddit: redditShell,
    instagram: instagramShell,
    facebook: facebookShell,
  },
  es: {
    twitter: esTwitterShell,
    tiktok: esTiktokShell,
    reddit: esRedditShell,
    instagram: esInstagramShell,
    facebook: esFacebookShell,
  },
};

export const SHELLS: readonly ShellRow[] = LOCALES.flatMap((locale) =>
  PLATFORMS.map((platform) => ({
    name: `${locale} ${platform}`,
    locale,
    platform,
    shell: SOURCES[locale]![platform],
    path: pagePath(locale, platform),
    url: pageUrl(locale, platform),
  })),
);

/**
 * Only runs of whitespace are collapsed (source line wrapping is not a wording
 * difference); every other character has to match.
 */
export const norm = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim();

export const parse = (shell: string) => new DOMParser().parseFromString(shell, "text/html");

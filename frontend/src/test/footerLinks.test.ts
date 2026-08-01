import en from "../locales/en";
import es from "../locales/es";
import hi from "../locales/hi";
import type { Locale, LocaleStrings } from "../locales/types";
import { PLATFORMS, SHELLS, SLUGS, norm, parse } from "./shells";

// Every page must link to every other page of ITS OWN LOCALE from static HTML in
// the footer, so a crawler that lands on any one of them reaches the other four
// without running React (the in-app platform switcher only exists after mount)
// and never leaves the locale mid-crawl. The anchor text is pinned too: it is
// the internal anchor text Google reads for each target page, so drifting it
// silently changes what each page ranks for.
//
// Expected hrefs and anchor texts come from the locale string table rather than
// a second hand-written list: the shells and the tables are two hand-authored
// copies of the same doc, and pinning them to each other is the drift guard.
const TABLES: { [L in Locale]?: LocaleStrings } = { en, es, hi };

// og:locale takes Facebook's regional codes: es_LA is LatAm Spanish, which is
// the register the copy is written in (the spec rules out es_ES).
const OG_LOCALE: Record<Locale, string> = { en: "en_US", es: "es_LA", hi: "hi_IN" };

function expectedLinks(locale: Locale) {
  // footerNav and prefix are shared across a locale's five pages, so any page's
  // table answers for all of them.
  const table = TABLES[locale]!.twitter;
  return PLATFORMS.map((platform) => ({
    href: `${table.prefix}/${SLUGS[platform]}`,
    text: table.footerNav[platform],
  }));
}

function footerNav(shell: string): Element {
  const doc = parse(shell);
  // Scoped to the footer on purpose: the crawl path has to be in the static
  // footer, not anywhere else on the page that happens to carry the same label.
  const nav = doc.querySelector("footer.site-footer nav.footer-platforms");
  expect(nav, "no <nav class=footer-platforms> inside footer.site-footer").not.toBeNull();
  return nav as Element;
}

test.each(SHELLS)("$name shell footer links to all five downloaders with the exact anchor text", ({ shell, locale }) => {
  const nav = footerNav(shell);
  const anchors = Array.from(nav.querySelectorAll("a"));
  const found = anchors.map((a) => ({ href: a.getAttribute("href"), text: norm(a.textContent) }));

  for (const link of expectedLinks(locale)) {
    const match = found.find((candidate) => candidate.href === link.href);
    expect(
      match,
      `footer nav has no link to ${link.href}\nfound: ${JSON.stringify(found)}`,
    ).toBeDefined();
    expect(match?.text).toBe(link.text);
  }

  // Exactly five: an extra link here dilutes the crawl path and is more likely
  // a copy-paste mistake than an intentional addition.
  expect(anchors).toHaveLength(PLATFORMS.length);
});

test.each(SHELLS)("$name shell footer crawl path uses relative, same-tab links", ({ shell }) => {
  for (const anchor of Array.from(footerNav(shell).querySelectorAll("a"))) {
    // Absolute URLs would break local/preview builds and add a redirect hop.
    expect(anchor.getAttribute("href")?.startsWith("/")).toBe(true);
    // These are internal pages: opening them in a new tab is wrong here.
    expect(anchor.getAttribute("target")).toBeNull();
  }
});

test.each(SHELLS)("$name shell footer nav carries its own locale's aria-label", ({ shell, locale }) => {
  // The label is read aloud, so it has to be in the page's language.
  expect(footerNav(shell).getAttribute("aria-label")).toBe(TABLES[locale]!.twitter.footer.platformsLabel);
});

test.each(SHELLS)("$name shell marks its own page as current in the crawl path", ({ shell, path }) => {
  const current = Array.from(footerNav(shell).querySelectorAll("a")).filter(
    (a) => a.getAttribute("aria-current") === "page",
  );
  expect(current).toHaveLength(1);
  expect(current[0].getAttribute("href")).toBe(path);
});

test.each(SHELLS)("$name shell declares the og:locale of its own locale", ({ shell, locale }) => {
  const doc = parse(shell);
  const locales = Array.from(doc.querySelectorAll('meta[property="og:locale"]'));
  expect(locales).toHaveLength(1);
  expect(locales[0].getAttribute("content")).toBe(OG_LOCALE[locale]);
});

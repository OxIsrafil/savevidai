import en from "../locales/en";
import es from "../locales/es";
import hi from "../locales/hi";
import type { Locale, LocaleStrings } from "../locales/types";
import { CLUSTER_LOCALES, SHELLS, pagePath, norm, parse } from "./shells";

// The language switcher is the only way a reader who landed on the wrong locale
// gets to their own, and it has to work without JS: it is static HTML in the
// footer of every shell, with AUTONYM labels (a Hindi reader looking for Hindi
// must see हिन्दी, whatever page they landed on) linking to the SAME slug in
// each locale. Crawlable too: it is a second, human-facing signal alongside the
// hreflang cluster.
const TABLES: { [L in Locale]?: LocaleStrings } = { en, es, hi };

// Autonyms are identical in every locale by design (translations doc 2.12), so
// one table answers for all of them. localeStrings.test.ts pins that the tables
// agree; this file pins that the shells match the tables.
const AUTONYMS = en.twitter.lang;

function switcher(shell: string): Element {
  const doc = parse(shell);
  const nav = doc.querySelector("footer.site-footer nav.footer-langs");
  expect(nav, "no <nav class=footer-langs> inside footer.site-footer").not.toBeNull();
  return nav as Element;
}

test.each(SHELLS)("$name shell footer carries the three-autonym language switcher", ({ shell, platform }) => {
  const anchors = Array.from(switcher(shell).querySelectorAll("a"));
  expect(anchors).toHaveLength(CLUSTER_LOCALES.length);

  // Order is fixed across all shells so the control does not move between pages.
  expect(anchors.map((a) => norm(a.textContent))).toEqual(
    CLUSTER_LOCALES.map((locale) => AUTONYMS[locale]),
  );
  expect(anchors.map((a) => a.getAttribute("href"))).toEqual(
    CLUSTER_LOCALES.map((locale) => pagePath(locale, platform)),
  );
});

test.each(SHELLS)("$name shell switcher declares each link's language", ({ shell }) => {
  const anchors = Array.from(switcher(shell).querySelectorAll("a"));
  for (const [index, anchor] of anchors.entries()) {
    const locale = CLUSTER_LOCALES[index];
    // hreflang tells a crawler what it is linking to; lang lets a screen reader
    // pronounce the autonym in the right language instead of the page's.
    expect(anchor.getAttribute("hreflang")).toBe(locale);
    expect(anchor.getAttribute("lang")).toBe(locale);
    // Internal pages: relative, same tab, same rules as the crawl path.
    expect(anchor.getAttribute("href")?.startsWith("/")).toBe(true);
    expect(anchor.getAttribute("target")).toBeNull();
  }
});

test.each(SHELLS)("$name shell switcher marks the page's own language as current", ({ shell, path }) => {
  const current = Array.from(switcher(shell).querySelectorAll("a")).filter(
    (a) => a.getAttribute("aria-current") === "page",
  );
  expect(current).toHaveLength(1);
  expect(current[0].getAttribute("href")).toBe(path);
});

test.each(SHELLS)("$name shell switcher carries its own locale's aria-label", ({ shell, locale }) => {
  expect(switcher(shell).getAttribute("aria-label")).toBe(TABLES[locale]!.twitter.lang.navLabel);
});

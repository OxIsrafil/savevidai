import type { Locale } from "../locales/types";
import { CLUSTER_LOCALES, ORIGIN, PLATFORMS, SHELLS, pageUrl, parse } from "./shells";

// Shell <link rel="alternate"> tags are the ONLY hreflang source on this site
// (the sitemap deliberately carries no xhtml alternates: one hand-maintained
// artifact, not two drifting ones). So the whole cluster invariant is checked
// here, against the files themselves.
//
// Google's rules, all pinned below: every page of a cluster lists the SAME set
// of alternates, the set is self-inclusive (a page must name itself), the URLs
// are absolute, and x-default points at the en page. A cluster where one page
// disagrees is silently dropped by Google, which is invisible without a test.
//
// The hi rows land in Task 4: the en and es shells already point at the hi URLs
// because the URL model is fixed in the spec, so this file's expectations do not
// change when those shells arrive, only SHELLS grows.
const OG_LOCALE: Record<Locale, string> = { en: "en_US", es: "es_LA", hi: "hi_IN" };

function alternates(shell: string): Array<{ hreflang: string; href: string }> {
  const doc = parse(shell);
  return Array.from(doc.querySelectorAll('link[rel="alternate"][hreflang]')).map((link) => ({
    hreflang: link.getAttribute("hreflang") ?? "",
    href: link.getAttribute("href") ?? "",
  }));
}

test.each(SHELLS)("$name shell lists the full en/es/hi/x-default cluster", ({ shell, platform }) => {
  const found = alternates(shell);
  expect(found).toHaveLength(CLUSTER_LOCALES.length + 1);

  const expected = [
    ...CLUSTER_LOCALES.map((locale) => ({ hreflang: locale, href: pageUrl(locale, platform) })),
    // x-default is the en page: the site's fallback for readers of any other
    // language, per the spec.
    { hreflang: "x-default", href: pageUrl("en", platform) },
  ];
  expect(found).toEqual(expected);
});

test.each(SHELLS)("$name shell alternates are absolute and self-inclusive", ({ shell, locale, url }) => {
  const found = alternates(shell);
  for (const alternate of found) {
    // Relative hreflang URLs are ignored by Google.
    expect(alternate.href.startsWith(`${ORIGIN}/`), alternate.href).toBe(true);
  }
  // A page that does not name itself breaks the whole cluster.
  expect(found.find((alternate) => alternate.hreflang === locale)?.href).toBe(url);
});

test.each(SHELLS)("$name shell is self-canonical", ({ shell, url }) => {
  const doc = parse(shell);
  const canonicals = Array.from(doc.querySelectorAll('link[rel="canonical"]'));
  expect(canonicals).toHaveLength(1);
  // Canonicalising a translation at the en page would deindex it outright.
  expect(canonicals[0].getAttribute("href")).toBe(url);
  expect(doc.querySelector('meta[property="og:url"]')?.getAttribute("content")).toBe(url);
});

test.each(PLATFORMS)("the %s cluster agrees across every locale's shell", (platform) => {
  const clusters = SHELLS.filter((row) => row.platform === platform).map((row) => ({
    name: row.name,
    tags: alternates(row.shell),
  }));
  expect(clusters.length).toBeGreaterThan(1);

  const [reference, ...rest] = clusters;
  for (const cluster of rest) {
    expect(cluster.tags, `${cluster.name} disagrees with ${reference.name}`).toEqual(reference.tags);
  }
});

test.each(SHELLS)("$name shell lists the other locales as og:locale:alternate", ({ shell, locale }) => {
  const doc = parse(shell);
  const found = Array.from(doc.querySelectorAll('meta[property="og:locale:alternate"]')).map(
    (meta) => meta.getAttribute("content"),
  );
  expect(found).toEqual(
    CLUSTER_LOCALES.filter((other) => other !== locale).map((other) => OG_LOCALE[other]),
  );
});

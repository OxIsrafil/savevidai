import { cleanup, render, screen } from "@testing-library/react";
import type { ComponentType } from "react";
import App from "../App";
import TikTokApp from "../tiktok/TikTokApp";
import RedditApp from "../reddit/RedditApp";
import InstagramApp from "../instagram/InstagramApp";
import FacebookApp from "../facebook/FacebookApp";
import en from "../locales/en";
import es from "../locales/es";
import hi from "../locales/hi";
import type { Locale, LocaleStrings, PageStrings, PlatformKey } from "../locales/types";
import { SHELLS, norm, type ShellRow } from "./shells";

// Every HTML shell ships a static hero snapshot inside #root so crawlers (and
// users on a slow/failed JS load) get the h1, the sub line and a working form
// without running React. React clears #root on mount and re-renders the same
// copy, so any drift between the two is a visible swap and a wrong h1 in the
// index. These cases pin each shell's copy to the copy the app renders with the
// SAME locale's string table: a Spanish shell is checked against the Spanish
// mount, so a shell that keeps an English line fails here.
type AppComponent = ComponentType<{ strings?: PageStrings }>;

const APPS: Record<PlatformKey, AppComponent> = {
  twitter: App,
  tiktok: TikTokApp,
  reddit: RedditApp,
  instagram: InstagramApp,
  facebook: FacebookApp,
};

const TABLES: { [L in Locale]?: LocaleStrings } = { en, es, hi };

type Case = ShellRow & { Component: AppComponent; strings: PageStrings };

const cases: Case[] = SHELLS.map((row) => ({
  ...row,
  Component: APPS[row.platform],
  strings: TABLES[row.locale]![row.platform],
}));

function shellRoot(shell: string) {
  const doc = new DOMParser().parseFromString(shell, "text/html");
  const root = doc.querySelector("#root");
  expect(root).not.toBeNull();
  return { doc, root: root as Element };
}

afterEach(cleanup);

test.each(cases)("$name shell hero snapshot matches the mounted hero copy", ({ shell, Component, strings }) => {
  const { root } = shellRoot(shell);

  const snapshot = root.querySelector(".hero-snapshot");
  expect(snapshot).not.toBeNull();
  // The container has to fill the viewport so React's mount-time swap of the
  // snapshot for the real hero shifts what is below it off-screen, never in view.
  expect((snapshot?.getAttribute("style") ?? "").replace(/\s+/g, "")).toContain("min-height:100vh");

  const snapshotH1 = root.querySelector("h1");
  const snapshotLede = root.querySelector(".lede");
  expect(snapshotH1).not.toBeNull();
  expect(snapshotLede).not.toBeNull();

  const { container } = render(<Component strings={strings} />);
  const mountedH1 = screen.getByRole("heading", { level: 1 });
  const mountedLede = container.querySelector(".lede");
  expect(mountedLede).not.toBeNull();

  expect(norm(snapshotH1?.textContent)).toBe(norm(mountedH1.textContent));
  expect(norm(snapshotLede?.textContent)).toBe(norm(mountedLede?.textContent));
});

test.each(cases)("$name shell snapshot form works without JS and mirrors the React field", ({ shell, Component, strings }) => {
  const { root } = shellRoot(shell);

  const form = root.querySelector("form");
  expect(form).not.toBeNull();
  // Pre-JS submit has to produce ?url=..., which every app resolves on boot.
  expect((form?.getAttribute("method") ?? "").toLowerCase()).toBe("get");
  // Empty action keeps that submit on the current page instead of sending the
  // link somewhere else, so the app that boots is the one that can resolve it.
  expect(form?.getAttribute("action")).toBe("");

  const input = form?.querySelector("input");
  expect(input).not.toBeNull();
  expect(input?.getAttribute("name")).toBe("url");
  expect(input?.getAttribute("type")).toBe("url");

  const submit = form?.querySelector("button");
  expect(submit?.getAttribute("type")).toBe("submit");
  expect(norm(submit?.textContent)).toBe(strings.input.submit);

  render(<Component strings={strings} />);
  const mountedInput = screen.getByRole("textbox");
  expect(input?.getAttribute("placeholder")).toBe(mountedInput.getAttribute("placeholder"));
  expect(input?.getAttribute("aria-label")).toBe(mountedInput.getAttribute("aria-label"));
});

test.each(cases)("$name shell carries exactly one h1 and no ad marker", ({ shell }) => {
  const { doc, root } = shellRoot(shell);

  // React replaces the snapshot h1, never adds a second one, so the built page
  // ships exactly one h1 both before and after mount.
  expect(doc.querySelectorAll("h1")).toHaveLength(1);
  expect(root.querySelectorAll("h1")).toHaveLength(1);

  // The ad marker is gone for good, and this guards against it coming back.
  expect(shell).not.toContain("<!--ADS-->");
});

test.each(cases)("$name shell head copy matches its string table", ({ shell, strings }) => {
  const { doc } = shellRoot(shell);
  const meta = (selector: string) => doc.querySelector(selector)?.getAttribute("content");

  // The head is shell-only copy (React never renders it), so without this the
  // title and description of a translated page could keep the English wording,
  // or drift from the doc, with every other assertion still green. og/twitter
  // titles mirror the meta title, and both descriptions mirror ogDescription:
  // that is the shape of all five en shells and it holds per locale.
  expect(norm(doc.querySelector("title")?.textContent)).toBe(strings.meta.title);
  expect(meta('meta[name="description"]')).toBe(strings.meta.description);
  expect(meta('meta[property="og:title"]')).toBe(strings.meta.title);
  expect(meta('meta[name="twitter:title"]')).toBe(strings.meta.title);
  expect(meta('meta[property="og:description"]')).toBe(strings.meta.ogDescription);
  expect(meta('meta[name="twitter:description"]')).toBe(strings.meta.ogDescription);
});

test.each(cases)("$name shell static sections match its string table", ({ shell, strings }) => {
  const { doc } = shellRoot(shell);
  const text = (el: Element | null | undefined) => norm(el?.textContent);

  // The how-it-works and FAQ headers plus the three step cards are shell-only
  // copy as well. The FAQ bodies stay shell-only by design (the tables carry no
  // FAQ), and faqJsonLd.test.ts is what guards those.
  const kickers = Array.from(doc.querySelectorAll(".kicker"));
  expect(kickers.map(text)).toEqual([
    strings.section.howItWorksKicker,
    strings.section.questionsKicker,
  ]);
  expect(Array.from(doc.querySelectorAll(".section-title")).map(text)).toEqual([
    strings.section.howItWorksTitle,
    strings.section.faqTitle,
  ]);

  const steps = Array.from(doc.querySelectorAll(".step-card"));
  expect(steps).toHaveLength(strings.steps.length);
  for (const [index, card] of steps.entries()) {
    expect(text(card.querySelector("h3"))).toBe(strings.steps[index].heading);
    expect(text(card.querySelector("p"))).toBe(strings.steps[index].body);
  }

  // Footer copy: the description and the two labelled navs.
  expect(text(doc.querySelector(".footer-desc"))).toBe(strings.footerDescription);
  expect(doc.querySelector("footer.site-footer nav.footer-links")?.getAttribute("aria-label")).toBe(
    strings.footer.linksLabel,
  );
  expect(text(doc.querySelector("footer.site-footer nav.footer-links a"))).toBe(strings.footer.xLink);

  const credits = Array.from(doc.querySelectorAll(".credit")).map(text);
  // builtBy is a text node next to the @israfill link, and Hindi flips that
  // order, so the assertion is containment rather than equality here. The case
  // below is what pins the order per locale.
  expect(credits[0]).toContain(strings.footer.builtBy);
  expect(credits[1]).toBe(strings.footer.copyright);
});

test.each(cases)("$name shell footer credit puts builtBy on its locale's side of the link", ({ shell, locale, strings }) => {
  const { doc } = shellRoot(shell);

  const credit = doc.querySelector(".credit");
  const link = credit?.querySelector('a[href="https://x.com/israfill"]');
  expect(link, "credit row has no @israfill link").not.toBeNull();

  // Hindi is head-final: the doc (section 2.14) renders the name first and
  // "ne banaya" after it, the reverse of "built by @israfill". Containment
  // alone would pass the English node order under a Hindi string, which reads
  // as broken grammar to the only people who can tell.
  const handle = norm(link?.textContent);
  const builtBy = strings.footer.builtBy;
  expect(norm(credit?.textContent)).toBe(
    locale === "hi" ? `${handle} ${builtBy}` : `${builtBy} ${handle}`,
  );
});

test.each(cases)("$name shell declares its own lang and boots its own entry", ({ shell, locale, platform }) => {
  const { doc } = shellRoot(shell);

  // Wrong lang is invisible in a browser and wrong to every crawler and screen
  // reader, so it is pinned rather than assumed from the directory name.
  expect(doc.documentElement.getAttribute("lang")).toBe(locale);

  const module = doc.querySelector('script[type="module"]')?.getAttribute("src");
  // en pages keep their original per-platform mains (the Twitter page is the
  // root one); locale pages boot the entry that hands the app that locale's
  // table. Loading the wrong one ships a fully English app under a translated
  // shell, which nothing else in the suite would catch.
  const enMain = platform === "twitter" ? "/src/main.tsx" : `/src/${platform}/main.tsx`;
  expect(module).toBe(locale === "en" ? enMain : `/src/entries/${locale}-${platform}.tsx`);
});

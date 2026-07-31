// Raw shell sources, read straight off disk at test time (Vite's ?raw), so the
// assertions run against the files a crawler is served, not a build artifact.
import twitterShell from "../../index.html?raw";
import tiktokShell from "../../tiktokvideodownloader.html?raw";
import redditShell from "../../redditvideodownloader.html?raw";
import instagramShell from "../../instagramvideodownloader.html?raw";
import facebookShell from "../../facebookvideodownloader.html?raw";

// Every page must link to every other page from static HTML in the footer, so a
// crawler that lands on any one of the five reaches the other four without
// running React (the in-app platform switcher only exists after mount). The
// anchor text is pinned too: it is the internal anchor text Google reads for
// each target page, so drifting it silently changes what each page ranks for.
type Shell = [name: string, shell: string];

const shells: Shell[] = [
  ["twitter", twitterShell],
  ["tiktok", tiktokShell],
  ["reddit", redditShell],
  ["instagram", instagramShell],
  ["facebook", facebookShell],
];

// Anchor text matches each target page's own title register: the Instagram page
// is a "reel downloader", the other four are "video downloader".
const links: Array<{ href: string; text: string }> = [
  { href: "/", text: "Twitter/X video downloader" },
  { href: "/tiktokvideodownloader", text: "TikTok video downloader" },
  { href: "/redditvideodownloader", text: "Reddit video downloader" },
  { href: "/instagramvideodownloader", text: "Instagram reel downloader" },
  { href: "/facebookvideodownloader", text: "Facebook video downloader" },
];

const norm = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim();

const parse = (shell: string) => new DOMParser().parseFromString(shell, "text/html");

function footerNav(shell: string): Element {
  const doc = parse(shell);
  // Scoped to the footer on purpose: the crawl path has to be in the static
  // footer, not anywhere else on the page that happens to carry the same label.
  const nav = doc.querySelector('footer.site-footer nav[aria-label="All downloaders"]');
  expect(nav, 'no <nav aria-label="All downloaders"> inside footer.site-footer').not.toBeNull();
  return nav as Element;
}

test.each(shells)("%s shell footer links to all five downloaders with the exact anchor text", (_name, shell) => {
  const nav = footerNav(shell);
  const anchors = Array.from(nav.querySelectorAll("a"));
  const found = anchors.map((a) => ({ href: a.getAttribute("href"), text: norm(a.textContent) }));

  for (const link of links) {
    const match = found.find((candidate) => candidate.href === link.href);
    expect(
      match,
      `footer nav has no link to ${link.href}\nfound: ${JSON.stringify(found)}`,
    ).toBeDefined();
    expect(match?.text).toBe(link.text);
  }

  // Exactly five: an extra link here dilutes the crawl path and is more likely
  // a copy-paste mistake than an intentional addition.
  expect(anchors).toHaveLength(links.length);
});

test.each(shells)("%s shell footer crawl path uses relative, same-tab links", (_name, shell) => {
  for (const anchor of Array.from(footerNav(shell).querySelectorAll("a"))) {
    // Absolute URLs would break local/preview builds and add a redirect hop.
    expect(anchor.getAttribute("href")?.startsWith("/")).toBe(true);
    // These are internal pages: opening them in a new tab is wrong here.
    expect(anchor.getAttribute("target")).toBeNull();
  }
});

test.each(shells)("%s shell declares og:locale en_US", (_name, shell) => {
  const doc = parse(shell);
  const locales = Array.from(doc.querySelectorAll('meta[property="og:locale"]'));
  expect(locales).toHaveLength(1);
  expect(locales[0].getAttribute("content")).toBe("en_US");
});

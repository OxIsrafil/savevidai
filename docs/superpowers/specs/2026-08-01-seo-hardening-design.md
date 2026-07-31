# SEO technical hardening - design spec (2026-08-01, draft for cold review)

## Goal

Make all five platform pages fully crawlable and technically competitive for a
worldwide audience, and lay the URL/canonical groundwork for the multi-language
follow-up (separate spec). No ranking promises: this removes technical handicaps;
authority and time do the rest.

## Context (audited 2026-08-01)

- Served HTML has NO h1 on any page: the hero (h1, sub, input) is React-rendered
  into an empty #root. Crawlers that do not execute JS see a page whose primary
  heading and keyword block are absent; Google's first-pass HTML crawl sees the
  same until render-queue time.
- Structured data: FAQPage only. NOTE (2026 reality): Google restricted FAQ rich
  results to authority sites in 2023 and dropped HowTo rich results entirely, so
  schema here aids entity understanding at best; it is NOT a SERP-feature play
  and the spec treats it as low-priority polish.
- sitemap.xml lacks lastmod. robots.txt allows everything including /admin
  (currently indexable; it serves the login shell).
- No footer: internal linking relies solely on the platform switcher.
- Three ad scripts (banner iframe, popunder, social bar) now load on every
  public page: CWV impact unmeasured. Social bar is an overlay format: Google's
  intrusive-interstitial penalty on mobile is a live risk to assess, not assume
  away.
- Copy per page is one hero + three steps + five FAQ entries: thin vs
  competitors, but honest. Ranking pages in this niche carry more indexable
  unique text.

## Changes

### 1. Static hero snapshot in every shell (highest value)

Each shell's #root gains a static, non-interactive snapshot of the hero:
h1 (split heading exactly as React renders it), sub line, and a visually
identical but inert input+button block. React's createRoot().render() replaces
it on mount (no hydration; brief identical-looking swap). Result: full h1 +
keyword block in the served HTML, better perceived first paint (today #root is
empty until JS), zero user-visible change. The snapshot markup lives in each
shell next to the existing static landing section and must be kept in sync with
the React hero by a test: for each page, the shell's h1 text equals the React
hero's rendered h1 text (frontend test imports both).

### 2. Indexability hygiene

- admin.html gains <meta name="robots" content="noindex">. robots.txt stays
  Allow (a Disallow line would block the noindex from being seen).
- Canonicals audited: every page self-canonical (already true), and the future
  locale URL scheme is fixed NOW as path-prefix (/es/instagramvideodownloader)
  with x-default = English root, so Spec B adds hreflang without URL churn.
  No hreflang tags ship in this spec (nothing to point at yet).
- sitemap.xml gains lastmod per URL, set from each shell's git last-commit date
  at build time is NOT available (static file): keep it a manually-maintained
  date bumped when page content actually changes (dishonest lastmod is worse
  than none). A comment in the file says exactly that.

### 3. Internal linking footer

A small static footer in every shell (outside #root, crawlable without JS):
five platform links with descriptive anchor text ("Twitter video downloader"
etc.), plus the existing theme-consistent styling. React pages keep it (it
lives in the shell, below the React root and static sections). No orphan risk,
second crawl path, and exact-match internal anchors.

### 4. Copy depth per page (unique, honest)

Each page gains 3 more FAQ entries in BOTH JSON-LD and the visible static FAQ
(kept character-identical, the established invariant), answering real search
intents, unique per platform: file format and quality (mp4, what "HD" means per
platform), saving on iPhone/Android specifics, and a plain-language legality
note (personal use, respect creators' rights, no re-upload). No keyword
stuffing, owner voice, sentence case.

### 5. Performance / CWV verification (measure, then decide)

Run Lighthouse mobile+desktop on all five pages with ads ON (prod). Budget:
LCP < 2.5s mobile, CLS < 0.1, INP < 200ms. Known risks: three third-party
scripts; the banner iframe reserves 300x250 (check CLS), social bar overlay
(check intrusive-interstitial exposure and CLS). Deliverable: measured numbers
in the final report plus, if the social bar breaches thresholds or covers
content on load at mobile widths, a documented recommendation to the owner
(keep / defer-load / drop) with the evidence. This spec does NOT silently
remove ad units: that is the owner's revenue call.

### 6. Meta polish

- og:locale (en_US) added; titles/descriptions reviewed per page against the
  actual query register (keep current structure, fix only misfires found in
  review).
- Alt/aria pass over the static sections (how-to figures, footer links).

## Explicitly out of scope

Multi-language pages and hreflang tags (Spec B, next), blog/content marketing,
backlink work, domain change, prerendering beyond the hero snapshot, SSR.

## Testing

- Shell/React h1 parity test per page (the sync guard for change 1).
- Static greps in CI-runnable tests: h1 present exactly once per served shell,
  noindex on admin.html only, footer links present on all five shells,
  JSON-LD FAQ still equals visible FAQ after the new entries.
- Backend page-route tests unchanged (renderer passes shells through; marker
  behavior untouched: the snapshot must NOT contain the ads marker).
- Full suites + build; Lighthouse run recorded in the gate report.
- Live: curl each prod page, assert h1 and footer present in raw HTML.

## Risks

- Snapshot drift vs React hero: mitigated by the parity test.
- Social bar vs interstitial penalty: measured, reported, owner decides.
- lastmod honesty: manual date, bumped only on real content change.

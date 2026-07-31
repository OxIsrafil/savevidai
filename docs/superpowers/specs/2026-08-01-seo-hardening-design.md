# SEO technical hardening - design spec (2026-08-01, rev2 after cold Fable review)

## Goal

Make all five platform pages fully crawlable and technically competitive for a
worldwide audience, and lay the URL/canonical groundwork for the multi-language
follow-up (separate spec). No ranking promises: this removes technical
handicaps; authority and time do the rest.

## Context (audited 2026-08-01, corrected by cold review)

- Served HTML has NO h1 on any page: the hero (h1, sub, input) is React-rendered
  into an empty #root. Crawlers that do not execute JS see no primary heading;
  Google's first-pass HTML crawl sees the same until render-queue time. Side
  benefit the draft undersold: non-rendering AI crawlers (a growing referral
  source) also see nothing today.
- All five shells already have a .site-footer (brand, description, X link) but
  NO platform links in it, and the platform switcher is React-rendered, so
  there is currently no static crawl path between the five pages.
- Structured data: FAQPage only. 2026 reality: FAQ rich results are restricted
  to authority sites and HowTo rich results are gone, so JSON-LD earns nothing
  in SERPs here. The JSON-LD/visible-FAQ identity is NOT currently tested and
  is already violated on index.html (Q2/Q3/Q4 texts diverge).
- sitemap.xml lacks lastmod (and carries ignored changefreq). robots.txt allows
  everything; /admin (and /admin.html via the static mount) serve the login
  shell with no noindex.
- Three ad scripts load on every public page, injected at end of body. .ad-slot
  has no min-height (nothing reserves banner space; likely harmless since the
  slot sits at the bottom of the body, but unverified). CWV impact unmeasured.
- Ads-ecosystem risk register, corrected: the POPUNDER is the primary risk
  (Better Ads Standards flagged category; a failing Chrome Ad Experience review
  strips ALL ads site-wide = revenue zero). The social bar is secondary
  (intrusive-interstitial exposure only if it covers content on load). There is
  also an honesty tension between click-triggered popunders and the site's
  "always one real click" copy: named here so the owner decides with open eyes.
- Copy per page is thin vs competitors but honest.

## Changes

### 1. Static hero snapshot in every shell (highest value)

Each shell's #root gains a static snapshot of the hero: the h1 (split exactly
as React renders it), sub line, and a REAL form (progressive enhancement, not a
dead mock): `<form method="get">` with `<input name="url">` and a submit
button. Pre-JS, submitting reloads the page with ?url=, which every app
already resolves on boot (existing behavior); post-JS, React replaces the
snapshot. The snapshot container reserves `min-height: 100vh` to match the
mounted app wrapper, so the static sections sit below the fold pre-mount and
the mount-time layout shift happens off-viewport where CLS does not count it.

REQUIRED companion change (cold-review Blocker): the React heroes currently
mount with entrance animations from hidden states (words rise from y:110%,
fadeRise on sub/input). With a snapshot in place that becomes a visible
vanish-and-replay flash. The hero motion elements must gate their entrance
animation (initial state = final state on first mount, e.g. initial={false} or
equivalent) so the swap lands visually still. Acceptance criterion: no visible
re-animation of hero content at mount, verified in a real browser, both
desktop and mobile widths.

Parity guard: a frontend test per page reads the shell from disk (fs), parses
the snapshot h1, renders the app in jsdom, and compares whitespace-normalized
h1 textContent (React inserts a space between word spans). Same for the sub
line.

### 2. Indexability hygiene

- admin.html gains <meta name="robots" content="noindex">, covering both
  /admin (FileResponse route) and /admin.html (static mount). Belt-and-braces:
  the /admin route also sets an X-Robots-Tag: noindex header. robots.txt stays
  Allow (a Disallow would hide the noindex from crawlers).
- Canonicals audited: every page self-canonical (already true; the .html alias
  routes are crawlable duplicates already neutralized by those canonicals,
  no action). The future locale URL scheme is fixed NOW: path prefix
  (/es/instagramvideodownloader), x-default = English root. No hreflang tags
  ship in this spec (nothing to point at yet).
- sitemap.xml: add manually-maintained lastmod per URL (bumped only when page
  content actually changes; a dishonest lastmod is worse than none; an XML
  comment says exactly that), drop the ignored changefreq lines.

### 3. Footer platform links

Extend the EXISTING .site-footer nav on all five shells with links to all five
platform pages. Anchor text matches each target page's actual title register
("Twitter/X video downloader", "TikTok video downloader", "Reddit video
downloader", "Instagram reel downloader", "Facebook video downloader"). This
creates the first static (no-JS) crawl path between the pages. CI test asserts
the five specific hrefs on every shell.

### 4. Copy depth per page (unique, honest, visible-only)

Each page gains up to 3 new VISIBLE FAQ entries (static shell section),
answering real search intents unique to the platform: file format and quality
(mp4, what HD means on that platform), saving on iPhone and Android, and a
legality note WHERE MISSING (index.html already has one; do not duplicate).
Constraints:
- iOS copy must describe the real flow (downloads land in the Files app via
  Safari's download manager; getting video into Photos takes a share-sheet
  step). Never promise camera-roll saves.
- Legality copy follows the existing hedged template ("generally fine for
  personal use... you are responsible"); never render the verdict "it is
  legal".
- JSON-LD decision: new entries go to visible copy ONLY. Existing JSON-LD
  stays frozen as-is (it earns nothing in 2026 SERPs; doubling its size adds
  maintenance for zero return). The invariant becomes SUBSET and gets its
  first real test: every JSON-LD Question/Answer must be character-identical
  to a visible FAQ entry. Prerequisite task: reconcile index.html, whose
  JSON-LD currently diverges from its visible FAQ, to satisfy the subset rule.

### 5. Performance / CWV (measure with stated conditions, then decide)

- Measure: Lighthouse mobile (throttled) + desktop on all five prod pages with
  ads ON, plus at least one remote-region run (the origin is a single EU VPS,
  DNS-only Cloudflare, no CDN for HTML; field numbers for far regions will be
  worse than local lab runs). Budgets: LCP < 2.5s mobile, CLS < 0.1,
  INP < 200ms. Long-term source of truth: CrUX/Search Console field data.
- Remediation menu, pinned now so measurement picks thresholds rather than
  tactics: min-height on .ad-slot when ads are active; defer-load the social
  bar post-LCP; last resort per unit, owner call.
- Ads risk checks: social bar must not cover content on load at mobile widths
  (screenshot evidence); once Search Console is set up, check the Chrome Ad
  Experience Report status (popunder exposure). This spec does NOT remove ad
  units; any keep/defer/drop decision is presented to the owner with evidence.

### 6. Ops: Search Console and Bing Webmaster (new, from cold review)

Verify the property (DNS TXT via Cloudflare), submit sitemap.xml, and record
where the owner checks coverage, field CWV, and the Ad Experience Report.
Without this step nothing in this spec is measurable afterwards. Agent does the
code/DNS-adjacent parts it can; account creation/login is the owner's.

### 7. Meta polish

og:locale (en_US) as labeled display polish (not a ranking input; no
og:locale:alternate until Spec B ships real locale pages). Titles/descriptions
reviewed against actual query register; fix only misfires. Alt/aria pass over
static sections and footer links.

## Explicitly out of scope

Multi-language pages and hreflang tags (Spec B, next), blog/content marketing,
backlink work, domain change, SSR or prerendering beyond the hero snapshot,
JSON-LD expansion.

## Testing

- Hero parity tests (fs-read shell vs jsdom-rendered app, normalized text),
  h1 exactly once per served shell.
- No-reanimation acceptance check in a real browser (gate step, both widths).
- JSON-LD subset invariant test (first ever; index.html reconciled first).
- Footer: five platform hrefs asserted on every shell.
- noindex present on admin.html only; X-Robots-Tag on /admin route (backend
  test).
- Snapshot must not contain the <!--ADS--> marker (renderer behavior
  untouched; backend page tests stay green).
- Full suites + build; Lighthouse numbers + screenshots in the gate report;
  live curl asserts h1 + footer links in raw prod HTML.

## Risks

- Snapshot drift vs React hero: parity tests.
- Hero animation gating changes the feel of first paint: browser-verified
  acceptance criterion; the swap must land still.
- Popunder vs Chrome Ad Experience: monitored via Search Console after setup;
  owner decides on evidence.
- lastmod honesty: manual, bumped only on real content change.

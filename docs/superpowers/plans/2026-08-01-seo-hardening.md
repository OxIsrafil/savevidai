# SEO Technical Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every platform page serves its h1, hero, working form, and full FAQ in raw HTML; indexability hygiene (admin noindex, honest sitemap lastmod, footer crawl path); no visual regression from the hero swap.

**Architecture:** Static hero snapshot inside #root (replaced by React on mount, entrance animations gated so the swap lands still), extended static footer, visible-only FAQ additions with a new JSON-LD-subset invariant. Spec (rev2, binding): `docs/superpowers/specs/2026-08-01-seo-hardening-design.md` - read it before any task.

**Tech Stack:** Vite 6 multi-page shells + React 19 + motion/react; FastAPI backend (admin route header only).

## Global Constraints

- NO em dashes, NO emoji anywhere. Conventional commits ending with the trailer: `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`
- Backend from `backend/` with venv active; frontend from `frontend/`. TDD: failing test first. Warnings baseline 7.
- Branch: `feature/seo-hardening` (exists). Copy: owner voice, sentence case, honest (iOS = Files app + share sheet, never camera-roll promises; legality always hedged, never "it is legal").
- The `<!--ADS-->` marker stays exactly once per shell, NEVER inside the #root snapshot. Ads behavior untouched.
- Shell edits: the five shells are `index.html`, `tiktokvideodownloader.html`, `redditvideodownloader.html`, `instagramvideodownloader.html`, `facebookvideodownloader.html` in `frontend/`.

---

### Task 1: Gate hero entrance animations

**Files:** `frontend/src/App.tsx`, `frontend/src/tiktok/TikTokApp.tsx`, `frontend/src/reddit/RedditApp.tsx`, `frontend/src/instagram/InstagramApp.tsx`, `frontend/src/facebook/FacebookApp.tsx`, possibly `frontend/src/lib/motion.ts`.

**Requirement:** The hero block (h1 word spans, sub/lede line, paste form area) must render at its final visual state on first mount: no rise-from-hidden or fade-in replay. Everything below the hero (cards, how-to, chips if they animate) may keep its animation. Mechanism is implementer's choice after reading `lib/motion.ts` and the five heroes (e.g. `initial={false}` on the hero motion elements, or a static variant); apply the SAME mechanism in all five apps.

- [ ] Read the five heroes + motion.ts; identify every hero motion element.
- [ ] Apply gating uniformly; run `npx vitest run` (existing tests must stay green; the smoke tests find headings by role and must still pass).
- [ ] `npm run build` green. Commit `fix(seo): hero renders still on mount, no entrance replay`.

---

### Task 2: Static hero snapshots + parity tests

**Files:** all five shells (inside `<div id="root">`), new test `frontend/src/test/heroSnapshot.test.tsx`, possibly a few lines in `frontend/src/styles/index.css` for snapshot-only classes.

**Requirement per shell:** inside `#root`, add:

```html
<div class="hero-snapshot" style="min-height:100vh">
  <h1>...exact React h1 text, split across the same visible lines...</h1>
  <p>...exact sub line text...</p>
  <form method="get" action="">
    <input name="url" type="url" placeholder="...same placeholder as the React input..." aria-label="...same aria-label..." />
    <button type="submit">Fetch</button>
  </form>
</div>
```

Styled to visually approximate the mounted hero (reuse existing classes where possible; close is enough, the swap is what must not jump the viewport). `min-height:100vh` on the snapshot container is mandatory (mount-time shift must happen off-viewport). Pre-JS the form submits `?url=` which every app already resolves on boot: do not change that behavior. No `<!--ADS-->` inside the snapshot.

**Parity test (failing first):** for each of the five (shell file, App component) pairs: read the shell with `fs`, parse the `#root` h1 and sub-line text; render the App in jsdom; compare whitespace-normalized textContent of the rendered h1 (level-1 heading by role) and lede. Also assert each BUILT page would carry exactly one h1: shell h1 count == 1 (the React h1 replaces it, never adds).

- [ ] Write the test, verify it fails (no snapshots yet), implement all five snapshots, verify pass.
- [ ] `npx vitest run` full + `npm run build`. Browser check on the dev server: load `/` and `/facebookvideodownloader.html`, confirm hero text visible before JS settles and NO visible vanish/re-animate flash (Task 1 acceptance), desktop + mobile widths.
- [ ] Commit `feat(seo): static hero snapshot with working form in every shell`.

---

### Task 3: JSON-LD subset invariant + index.html reconciliation

**Files:** `frontend/index.html`, new test `frontend/src/test/faqJsonLd.test.ts`.

**Invariant (the first real test of it):** for each of the five shells, every JSON-LD FAQPage Question `name` and Answer `text` must appear character-identical as a visible FAQ entry (`<summary>` + its `<p>`) in the same shell. Visible entries MAY exist without JSON-LD counterparts (subset, not equality).

- [ ] Write the test (parse each shell's `application/ld+json` blocks + visible `<details>` entries with regex or a tiny parser; normalize nothing, compare exact strings). Verify it FAILS on index.html (known divergence: Q2 quality wording, Q3, Q4).
- [ ] Reconcile `frontend/index.html` by editing the VISIBLE entries or the JSON-LD to match (prefer aligning JSON-LD text to the better-written visible text; keep meaning identical, owner voice). "Who runs this?" stays visible-only (subset allows it).
- [ ] Test green for all five shells. `npx vitest run` + build. Commit `fix(seo): json-ld faq is a strict subset of visible faq, index reconciled`.

---

### Task 4: FAQ copy depth (visible-only additions)

**Files:** the five shells (static FAQ `<details>` sections only; JSON-LD untouched).

Add these entries VERBATIM (each as a new `<details><summary>Q</summary><p>A</p></details>` matching existing markup):

`index.html` (+2):
1. `What format do Twitter videos download in?` / `Always mp4, the format Twitter serves natively. It plays everywhere: phones, laptops, editors, no conversion needed.`
2. `How do I save a Twitter video on iPhone or Android?` / `Paste the link and tap your quality on either. On iPhone, Safari puts the file in the Files app; use the share sheet to move it to Photos. On Android it lands in your Downloads folder.`

`tiktokvideodownloader.html` (+3):
1. `What format and quality do TikTok downloads come in?` / `mp4, in the best quality TikTok serves for that video: hd when available, sd otherwise. Photo slideshows save as the original images plus the soundtrack as audio.`
2. `How do I save TikTok videos on iPhone or Android?` / `Paste the link and tap download on either. iPhone saves through Safari into the Files app; move it to Photos with the share sheet. Android saves straight to your Downloads folder.`
3. `Is it legal to download TikTok videos?` / `Generally fine for personal use, like watching offline. The video belongs to its creator, so do not re-upload it or claim it as yours. You are responsible for how you use what you save.`

`redditvideodownloader.html` (+3):
1. `What format do Reddit videos download in?` / `mp4 with the audio already merged in. Reddit stores video and audio separately; we join them server-side so you get one normal file, not a silent clip.`
2. `How do I save Reddit videos on iPhone or Android?` / `Paste the post link and tap download. iPhone saves through Safari into the Files app; the share sheet moves it to Photos. Android saves to your Downloads folder.`
3. `Is it legal to download Reddit videos?` / `Generally fine for personal use. Content belongs to its poster and the communities it came from, so do not re-upload it as yours. You are responsible for how you use what you save.`

`instagramvideodownloader.html` (+3):
1. `What format do Instagram downloads come in?` / `Reels and videos save as mp4 in the quality Instagram serves. Single photos save as the original image file.`
2. `How do I save Instagram reels on iPhone or Android?` / `Paste the reel link and tap download. iPhone saves through Safari into the Files app; use the share sheet to move it to Photos. Android saves to your Downloads folder.`
3. `Is it legal to download Instagram reels?` / `Generally fine for personal use, like watching offline. The reel belongs to its creator, so do not re-upload it or pass it off as yours. You are responsible for how you use what you save.`

`facebookvideodownloader.html` (+3):
1. `What format do Facebook videos download in?` / `mp4 in the best quality Facebook serves for that video, as a single file with audio included.`
2. `How do I save Facebook videos on iPhone or Android?` / `Paste the video or reel link and tap download. iPhone saves through Safari into the Files app; the share sheet moves it to Photos. Android saves to your Downloads folder.`
3. `Is it legal to download Facebook videos?` / `Generally fine for personal use. The video belongs to its creator, so do not re-upload it or claim it as yours. You are responsible for how you use what you save.`

- [ ] Add entries, keep markup/style identical to existing FAQ items. The Task 3 subset test must stay green (JSON-LD untouched). Grep gate per shell: no `watermark` claims added on non-tiktok pages, no `no ads`, no `camera roll`.
- [ ] `npx vitest run` + build. Commit `feat(seo): platform-specific faq entries on all five pages`.

---

### Task 5: Footer links, sitemap, og:locale, alt/aria

**Files:** five shells, `frontend/public/sitemap.xml`, new test `frontend/src/test/footerLinks.test.ts`.

- Footer: extend the existing `.site-footer` on each shell with a nav of five links, anchor text exactly: `Twitter/X video downloader` (`/`), `TikTok video downloader` (`/tiktokvideodownloader`), `Reddit video downloader` (`/redditvideodownloader`), `Instagram reel downloader` (`/instagramvideodownloader`), `Facebook video downloader` (`/facebookvideodownloader`). Style consistent with the footer's existing muted links; `aria-label="All downloaders"` on the nav.
- Test (failing first): each shell contains all five hrefs with those anchor texts.
- sitemap.xml: add `<lastmod>2026-08-01</lastmod>` to every URL (content genuinely changes in this branch), REMOVE the `changefreq` lines, add one XML comment: `<!-- lastmod is maintained by hand: bump only when page content actually changes -->`.
- og:locale: `<meta property="og:locale" content="en_US" />` in each shell's OG block.
- Alt/aria pass: every `<img>` and interactive element in the STATIC sections of the shells has a sensible alt/aria-label (fix only what is missing or wrong).
- [ ] Tests red -> green, `npx vitest run` + build, commit `feat(seo): footer crawl path, sitemap lastmod, og locale`.

---

### Task 6: Admin noindex (backend + shell)

**Files:** `frontend/admin.html`, `backend/app/analytics/router.py` (the /admin FileResponse route), `backend/tests/test_analytics_api.py` or the file where /admin serving is pinned (find it first).

- `frontend/admin.html`: add `<meta name="robots" content="noindex" />` in head.
- The `/admin` route response gains header `X-Robots-Tag: noindex`.
- Tests (failing first, backend): GET /admin carries the header; the served admin.html body contains the noindex meta; the five PUBLIC pages do NOT gain any noindex (assert absence on one public route as a canary).
- [ ] Red -> green, full backend suite + ruff, commit `feat(seo): admin is noindex via meta and header`.

---

### Task 7: Full gate + ledger

- [ ] Backend: `pytest tests/ -q` (warnings <= 7), `ruff check .`, `ruff check ../scripts`. Frontend: `npx vitest run`, `npm run build`.
- [ ] Dist greps per built public page: exactly 1 `<h1`, exactly 1 `<!--ADS-->` (0 in admin), 5 footer platform hrefs, noindex ONLY in admin.html.
- [ ] Dev-server browser pass (both widths, at least `/` and one platform page): hero visible in view-source HTML, no re-animation flash, pre-JS form submit resolves via `?url=` (verify by loading the page with `?url=<real link>` and confirming auto-resolve still works).
- [ ] Append the SEO section to the LEGACY ledger `.superpowers/sdd/progress.md` (dense style).
- [ ] Commit any gate fixes: `chore(seo): final gate fixes and ledger`.

## Post-merge (same run, controller-executed)

Deploy per runbook; prod curl each page asserting h1 + footer in raw HTML and noindex absent; Lighthouse (mobile throttled + desktop) on all five prod pages with ads on, numbers recorded; social bar mobile screenshot (content-covering check); if CLS breaches 0.1 from the ad slot, apply the pinned min-height remediation as a follow-up fix. Search Console + Bing: DNS TXT and account steps are owner actions; deliver exact instructions in the final report.

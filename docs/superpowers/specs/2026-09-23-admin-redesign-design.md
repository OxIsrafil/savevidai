# Admin redesign: premium store look, range analytics, countries back - design

Date: 2026-09-23
Status: approved in chat by the owner (2026-09-23), rev 1, cold review pending
Branch: feature/admin-redesign

## Problem

- `/admin` is one long page (`frontend/src/admin/Admin.tsx`, 507 lines) of hand-drawn SVG
  charts with no hover, a fixed 30-day window, no range picker, no comparison with an earlier
  period and no logout. The owner built a detailed admin for the premium store
  (`/Users/israfil/projects/premium-store`, commits 6b521bd, 40bfc65, bb83a10, a3e92cf, aad81f1)
  and wants the same here: "i like the admin dashboard its so detailed".
- Countries have been empty since 2026-07-24. Production shows 0.0% of the last 30 days'
  events with a country (32,478 of 32,478 null). The country came from Cloudflare's
  `CF-IPCountry` header and the record went DNS-only when the site moved to the VPS.
- `backend/tests/test_stats.py`: 7 tests fail on main because their seeds are hardcoded to
  2026-07-16..20 while `compute_stats` windows on SQLite `datetime('now')`.
- Stale copy: "Errors (FixTweet health)" (errors cover five platforms), "Clear it in Render"
  (Render is decommissioned), "All-time" (data is pruned at 90 days).

## Decisions (owner, 2026-09-23)

1. Port the premium store admin's visual system and analytics structure. Dark only.
2. Range analytics: Today, 7 days, 30 days, 90 days, each compared with the period before.
3. Countries come back through an offline DB-IP Lite lookup on our own server. The IP is still
   used only in memory and thrown away.
4. Visit events also record the page language (en, es, hi).
5. A real logout.
6. A Site page: the maintenance switch plus a 24-hour resolver health card.
7. Stats code takes an injectable `now`, fixing the 7 failing tests by construction.
8. The owner pre-approved downloading the DB-IP file (about 8 MB compressed) for local testing
   and on the server.

## Non-goals

- Client IP and Cloudflare header trust. Owned by the separate branch
  `claude/tender-heisenberg-fuk5v2` (cloud session, not merged at time of writing). This branch
  does NOT touch `backend/app/client_ip.py` or `Caddyfile`. See "Merge coordination".
- History beyond the 90-day retention (no rollup tables, no "All time" range).
- Light mode for the admin. The premium store admin is dark only; so is this one.
- Any change to public pages beyond the visit beacon's new `locale` field.
- Any identifying field. Restated invariants below.

## Privacy invariants (unchanged, restated so every task can check against them)

- The IP is used in memory for the daily visitor hash and, new, the country lookup, then
  discarded. It is never stored, logged, cached, or passed to the recorder.
- `country` is an ISO 3166-1 alpha-2 code or NULL. Nothing finer.
- `locale` is exactly one of `en`, `es`, `hi`, or NULL.
- Visitors are counted per day (the hash rotates at UTC midnight). No cross-day identifiers.
- No referrer URLs (the `source` bucket stays coarse).

## Backend

### B1. Deterministic clock and index-friendly windows

- New module `backend/app/analytics/report.py` with
  `compute_report(store, range_key: str, tz: int, now: datetime) -> dict` and
  `compute_resolvers(store, tz: int, now: datetime) -> dict`. `now` is an aware UTC datetime;
  the router passes `datetime.now(UTC)`.
- Every window bound is computed in Python from `now` and `tz`, formatted as the stored UTC
  text format `YYYY-MM-DD HH:MM:SS`, and passed as bound parameters: `ts >= ? AND ts < ?`.
  Stored `ts` values share that fixed-width format, so the text comparison is chronological and
  `idx_events_ts` / `idx_events_type_ts` can serve it.
- No `datetime('now')` anywhere in report.py. Local-time grouping uses
  `datetime(ts, '<+/-N minutes>')` built by the existing `_tzmod` helper (tz is a validated int,
  safe to inline, as today).
- Helpers that survive move from `stats.py` to `report.py` unchanged: `parse_tz`, `_tzmod`,
  `_bucket_quality` and `_TIER_LADDER`; until the cleanup task, `stats.py` imports them back from
  `report.py` so the old endpoint keeps working. `stats.py`, `compute_stats` and
  `GET /api/admin/stats` are deleted in the cleanup task, after the new UI no longer calls them.

### B2. Ranges and windows

Let `L = now + tz minutes` (local wall time) and `M0` = local midnight of `L`'s date.
`N` is 1 for `today`, 7 for `7d`, 30 for `30d`, 90 for `90d`. An omitted `range` means `7d`;
any other value is a 422.

- Current window: local `[M0 - (N-1) days, L)`.
- Previous window: the current window shifted back by exactly `N` days, local
  `[M0 - (2N-1) days, L - N days)`. Same length, same time-of-day cut, so "today" compares with
  "yesterday up to this time" and "7 days" compares with the 7 days before, cut at the same
  hour.
- Local bounds convert to UTC by subtracting `tz` minutes.
- `has_previous` is true only when the oldest retained event is at or before the previous
  window's start: `SELECT MIN(ts) FROM events` <= previous start (UTC text). A partly covered
  previous window counts as unavailable, so a delta never compares against half a period.
  Consequence: `90d` never has a previous period (retention is 90 days), and neither does a
  fresh install.
- Buckets:
  - `today`: 24 local hours of the current day, keys `00`..`23`. Hours after `L`'s hour have
    null values in both the current and the previous series (both lines stop at "now").
  - Otherwise: `N` local days, oldest first, zero-filled. Bucket `i` of the previous series is
    local day `M0 - (2N-1) + i`. Both last buckets are partial at the same cut.
- Fixed offset per request: a DST change inside the range shifts part of it by an hour.
  Accepted: the owner's zone (UTC+6) has no DST.

### B3. Metric definitions

"visitor-day" means one distinct `visitor` hash on one local day. Because hashes rotate daily,
the same person on two days is two visitor-days; the UI says so in the footnote.

Totals, computed for the current window and (when `has_previous`) the previous window:

| key | definition |
|---|---|
| `visitors` | sum over local days of COUNT(DISTINCT visitor), all event types |
| `page_views` | COUNT of `visit` events |
| `fetches` | COUNT of `fetch` events |
| `ok_fetches` | COUNT of `fetch` events with outcome `ok` |
| `failed_fetches` | COUNT of `fetch` events with outcome not `ok` (NULL outcomes excluded, as today) |
| `upstream_errors` | COUNT of `fetch` events with outcome `upstream_error` |
| `downloads` | COUNT of `download` events |
| `downloaded_visitors` | visitor-days with at least one `ok` fetch AND at least one `download` (same rule as `funnel.downloaded`) |
| `new_visitors` | DISTINCT visitor with a `visit` whose visitor_kind is `new` |
| `returning_visitors` | DISTINCT visitor with a `returning` visit and no `new` visit in the window (today's rule, kept) |
| `complete_days` | local days in the window before its last, partial day: N-1, and 0 for `today` |
| `complete_day_visitors` | `visitors` restricted to those complete days |

Funnel, current window only, visitor-day basis and nested so it can never grow step to step:

- `visitors`: every visitor-day.
- `fetched`: visitor-days with at least one `fetch`.
- `got_result`: visitor-days with at least one `ok` fetch.
- `downloaded`: visitor-days with at least one `ok` fetch AND at least one `download`.
- `totals.downloaded_visitors` (current and previous) uses the same rule, because the
  Conversion tile needs a delta; the current value always equals `funnel.downloaded`.
- Definition change: the old Conversion tile measured visitors who FETCHED. The new tile
  measures visitors who downloaded; the fetched share is still visible as funnel step two.

Series values per bucket (current and previous): `visitors` is COUNT(DISTINCT visitor) inside
the bucket, so a person active in two hours counts in both hour buckets while the tab total stays
the visitor-day sum; `fetches`, `downloads` and `failed_fetches` are plain counts.

Panels, current window only:

- `outcomes`: every fetch outcome (including `ok`) with its count, count desc, then outcome asc.
- `platforms`: per non-null platform: `fetches`, `ok`, `downloads`; ordered fetches desc, then
  platform asc.
- `qualities`: download counts by `_bucket_quality(outcome)`, re-summed and sorted count desc,
  then label asc (today's rule, kept).
- `countries`: DISTINCT visitor per non-null country, top 10 by visitors desc then code asc,
  followed by exactly one `{"country": "unknown", "visitors": n}` row for NULL country, always
  present even when 0.
- `pages`: `visit` events grouped by (platform, COALESCE(locale, 'unknown')), top 12 by views
  desc, then platform asc, then locale asc.
- `hours`: `fetch` events by local hour, exactly 24 rows `{"hour": 0..23, "fetches": n}`,
  zero-filled.
- `sources`: `visit` events by non-null source, count desc then source asc.
- `peak`: the highest COUNT(DISTINCT visitor) in any 5-minute tumbling bucket
  (`epoch // 300 * 300`, today's rule) among events inside the current window, with that
  bucket's local day and `HH:MM`; ties go to the earliest bucket. Null when the window is empty.

Live, independent of the range and of `tz` except for display:

- `active_now`: DISTINCT visitor with `ts >= now - 5 minutes`.
- `fetches_last_hour`: fetch events with `ts >= now - 60 minutes`.
- `upstream_last_hour`: fetch events with outcome `upstream_error` in the same hour.

Ratios are NOT computed on the server. The client derives them from totals with one set of
rules (F4), so current and previous ratios can never drift apart.

### B4. Report response (`GET /api/admin/report?range=7d&tz=360`)

```json
{
  "range": "7d",
  "tz": 360,
  "bucket": "day",
  "has_previous": true,
  "totals":   { "visitors": 0, "page_views": 0, "fetches": 0, "ok_fetches": 0,
                "failed_fetches": 0, "upstream_errors": 0, "downloads": 0,
                "downloaded_visitors": 0, "new_visitors": 0, "returning_visitors": 0,
                "complete_days": 6, "complete_day_visitors": 0 },
  "previous": { "...same keys as totals..." },
  "series": [
    { "key": "2026-09-17", "prev_key": "2026-09-10",
      "cur":  { "visitors": 0, "fetches": 0, "downloads": 0, "failed_fetches": 0 },
      "prev": { "visitors": 0, "fetches": 0, "downloads": 0, "failed_fetches": 0 } }
  ],
  "peak": { "count": 12, "day": "2026-09-20", "time": "21:15" },
  "funnel": { "visitors": 0, "fetched": 0, "got_result": 0, "downloaded": 0 },
  "outcomes":  [ { "outcome": "ok", "count": 0 } ],
  "platforms": [ { "platform": "twitter", "fetches": 0, "ok": 0, "downloads": 0 } ],
  "qualities": [ { "quality": "1080p", "count": 0 } ],
  "countries": [ { "country": "BD", "visitors": 0 }, { "country": "unknown", "visitors": 0 } ],
  "pages":     [ { "platform": "instagram", "locale": "hi", "views": 0 } ],
  "hours":     [ { "hour": 0, "fetches": 0 } ],
  "sources":   [ { "source": "search", "visits": 0 } ],
  "live": { "active_now": 0, "fetches_last_hour": 0, "upstream_last_hour": 0 }
}
```

- `previous` is null and every `series[].prev` is null when `has_previous` is false.
- `bucket` is `hour` for `today` (series keys `00`..`23`, `prev_key` is the same hour) and
  `day` otherwise (keys are local dates).
- For `today`, `cur` and `prev` are null for hours after the current local hour.
- `peak` is null for an empty window.
- Errors, same conventions as the stats endpoint: 404 when analytics is disabled, 401
  `{"error":"unauthorized"}` without a valid cookie, 422 `{"error":"bad_range"}`, 422
  `{"error":"bad_tz"}`, 503 `{"error":"analytics_unavailable"}` on any exception.

### B5. Resolver health (`GET /api/admin/resolvers?tz=360`)

Rolling 24 hours, `[now - 24h, now)`, fetch events only:

```json
{ "platforms": [ { "platform": "twitter", "fetches": 0, "ok": 0,
                   "top_failure": { "outcome": "not_found", "count": 0 },
                   "last_failure": "14:02" } ] }
```

- Always exactly five rows in this order: twitter, tiktok, reddit, instagram, facebook, so a
  platform with zero lookups still shows up.
- `top_failure` is the most common non-`ok` outcome (ties: outcome asc), null when none.
- `last_failure` is the local `HH:MM` of the newest non-`ok` fetch, null when none.
- Same auth, 404, 422 `bad_tz` and 503 conventions as the report.

### B6. Logout (`POST /api/admin/logout`)

- 204 with `Set-Cookie: svid_admin=""; Max-Age=0; Path=/api/admin; HttpOnly; Secure;
  SameSite=Strict` (FastAPI `delete_cookie` with the same attributes as the login cookie).
- No cookie required (idempotent). 404 when analytics is disabled, like every admin route.
- Note: cookies are stateless HMACs, so logout clears this browser only. Changing
  `ADMIN_PASSWORD` is still the way to revoke every session. The Site page says so.

### B7. Country lookup (DB-IP Lite)

Module `backend/app/analytics/geo.py`:

- `CountryLookup`: holds an open `maxminddb` reader or None.
  - `country(ip: str) -> str | None`: `reader.get(ip)`, then `record["country"]["iso_code"]`.
    Returns the code only if it fully matches `[A-Z]{2}` and is not `ZZ` or `XX`; returns None
    for a missing reader, an invalid IP (`ValueError`), a missing key, or ANY exception. Never
    raises.
  - `load(path)`: opens the file, validates it (a lookup of `8.8.8.8` must yield a two-letter
    code), then swaps it in with a single attribute assignment. On failure keeps the old reader.
  - No IP cache, no IP logging.
- Directory: `GEOIP_DIR` env when set, else `dirname(ANALYTICS_DB_PATH)/geoip` when the SQLite
  backend is in use, else country lookup is off. Production resolves to `/data/geoip` on the
  existing `analytics_data` volume, so the file survives rebuilds and no compose change is
  needed.
- File names: `dbip-country-lite.mmdb` plus a marker `dbip-country-lite.month` holding the
  `YYYY-MM` it came from. The updater creates the directory when it is missing.
- At service init: if the file exists, load it synchronously (fast, local).
- `GeoUpdater` daemon thread, started only when analytics is enabled, a directory resolves, and
  `GEOIP_UPDATE` is truthy. Tests and CI never set it, so they never touch the network; the
  Dockerfile sets `ENV GEOIP_UPDATE=1` in the final stage.
  - Runs 10 seconds after start, then every 24 hours.
  - Wants the current UTC month. Skips when the marker already says that month. Otherwise GETs
    `https://download.db-ip.com/free/dbip-country-lite-{YYYY-MM}.mmdb.gz` with
    `follow_redirects=False` and a 60-second timeout. A 404 for the current month falls back to
    the previous month, but only when the marker is not already that month.
  - Anything but 200 is a failure. The body streams to a temp file in the same directory with a
    32 MiB cap on the compressed bytes and a 256 MiB cap on the gunzipped output; over either
    cap aborts. The gunzipped file must pass `CountryLookup.load` validation before
    `os.replace` moves it into place and the marker is written.
  - Failures log one warning line without a traceback and retry on the next cycle. Nothing here
    can raise into request handling or block startup.
- `service.record_from_request` computes `ip = client_ip(request)` once, uses it for the hash
  and for `lookup.country(ip)`, and passes only the resulting code to the recorder. The
  `cf-ipcountry` header read is removed.
- Licence: CC BY 4.0. The admin footnote carries DB-IP's required link, verbatim:
  `<a href="https://db-ip.com">IP Geolocation by DB-IP</a>`. DB-IP asks for the link "on pages
  that display or use results from the database"; the only page that displays results is the
  admin, and public pages neither display nor use them (the lookup feeds aggregate analytics
  server-side). `deploy/README.md` documents the data source, licence and refresh.
- Dependency: `maxminddb>=2.6` added to `backend/pyproject.toml`.
- History: rows before this deploy stay NULL. The countries panel explains "Not known".

### B8. Page language on visit events

- `EventIn.locale: str | None`, validated to `en`, `es` or `hi` (422 otherwise), kept only for
  `visit` events (the router drops it for downloads, like `source`).
- Store: `locale TEXT` column, added by an `_ensure_locale_column` migration in the same style as
  the three existing ones, for both the SQLite and the Turso store. `Recorder.record` and its
  queue tuple and INSERT gain `locale`.
- Frontend: `visitContext()` in `frontend/src/lib/analytics.ts` adds
  `locale` read from `document.documentElement.lang` (`en`, `es`, `hi`; anything else omits the
  field). The 15 shells already carry the right `lang`, so no App file changes.

## Frontend

### F1. Structure

Everything stays under `frontend/src/admin/`, the separate `admin` Vite entry, so public pages
load none of it.

- `main.tsx` imports `./admin.css` and no longer imports `../styles/index.css`.
- `admin.css`: `@import "tailwindcss" source(none);` plus `@source "./";` so only admin files
  are scanned, then an `@theme` block with the tokens in F2. `src/styles/index.css` gains
  `@source not "../admin";` so admin utilities stop leaking into the public stylesheet.
  (Tailwind 4.3.2 is installed; both directives are supported.)
- `admin.html`: keep the noindex meta; drop the Onest preload and the light-theme script; add
  `<meta name="color-scheme" content="dark">`; black body background inline so there is no
  white flash.
- `lib/`: `api.ts`, `format.ts`, `delta.ts`, `metrics.ts`, `range.ts` (range keys, URL sync),
  `colors.ts` (palette verbatim).
- `components/`: Shell, Wordmark, PageHeader, RangeTabs, LiveStrip, TrendCard, Kpi, Delta,
  Panel, Donut, SegmentBar, BarList, Funnel, HoursChart, MiniStats, EmptyState, Footnote,
  LoginView, SiteView (MaintenanceCard, ResolverHealth), UnavailableView.
- New dependencies, admin only: `recharts` (the trend line and the ring, as in the premium
  store) and `lucide-react` (icons). Verify at install that the chosen recharts version's peer
  range includes React 18.3; fall back to the newest version that does.
- Deleted in the cleanup task: `Admin.tsx`, `SiteControls.tsx`, their tests, and the admin's use
  of `ThemeToggle` (public pages keep it).

### F2. Visual tokens (copied from the premium store)

- Colours, dark only: bg `#000`, surface `#1d1d1f`, elevated `#2c2c2e`, line
  `rgba(255,255,255,.12)` (cards use it at 50%, dividers 40%, chips 60%), line-strong
  `rgba(255,255,255,.22)`, text `#f5f5f7` / `#a1a1a6` / `#86868b`, brand `#0071e3`, brand hover
  `#0077ed`, brand link `#2997ff`, brand dim `rgba(41,151,255,.16)`, success `#30d158`, warning
  `#ffd60a`, danger `#ff453a` (each dim at .16).
- Chart palette, verbatim from `premium-store/components/admin/analytics/palette.ts`:
  blue `#0a84ff`, green `#30d158`, orange `#ff9f0a`, purple `#bf5af2`, teal `#64d2ff`, pink
  `#ff375f`, yellow `#ffd60a`, indigo `#5e5ce6`, red `#ff453a`, gray `#8e8e93`; SERIES order
  blue, green, orange, purple, teal, pink, yellow, indigo. Tints are the colour at 15%.
- Radii: cards, tooltips, dialogs 22px; small stat tiles, empty states 28px; nav items and
  inputs 18px; every button, chip, tab and badge a full pill. Use explicit values, not
  Tailwind's `rounded-*` names (the premium store redefined that scale and the names mislead).
- Shadow: none on cards. `0 4px 12px rgba(0,0,0,.4), 0 32px 64px -24px rgba(0,0,0,.7)` only on
  the login card, chart tooltips and floating bars.
- Fonts: sans `-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text",
  "Helvetica Neue", "Segoe UI", Roboto, Inter, sans-serif`; mono `ui-monospace, "SF Mono",
  Menlo, "Roboto Mono", monospace`. No webfont on the admin.
- Type: page title clamp(28px, 3vw, 40px) / 1.1 / 600 / -0.018em; kicker 12px 600 +0.06em
  uppercase muted; KPI figure 24px (28px from 640px); tab figure 22px (26px from 640px); donut
  centre 26px; small stat 20px; all figures 600, line-height 1, -0.025em, `tabular-nums`. Panel
  titles 15px 600; hints 13px; rows 14px; secondary 12px; badges, deltas, axis labels 11px.
  Mono for deltas and tooltip values.
- Focus: 2px blue outline, 3px offset.
- Motion: blocks fade in and rise 12px over 0.6s with `cubic-bezier(0.22,1,0.36,1)`, 40ms
  stagger; sliding selection pills on springs (nav 380/32, range 420/34, metric tabs 420/36);
  only transform and opacity; all of it off under `prefers-reduced-motion`. The installed
  `motion` 11 supports `layoutId`.
- Copy: no emoji, no em dashes, no trailing periods on titles, tile labels or tab labels,
  sentence case. No flag emoji: countries show a mono code chip plus the English name from
  `Intl.DisplayNames(["en"], { type: "region" })`, falling back to the code.

### F3. Screens

**Checking.** On load the app probes `GET /api/admin/maintenance`. Until it answers, the page is
plain black; a small spinner appears only after 400ms. 200 goes to the shell, 401 to login,
404 to "Analytics is off on this server" (with the three env vars it needs), anything else to
Unavailable with Retry. The login form never flashes for a signed-in owner.

**Login.** Centred 384px column: wordmark, then 40px below a card (22px radius, surface, faint
border, raised shadow, padding 24px, 32px from 640px). "ADMIN" kicker, "Sign in" title, muted
line "Traffic, downloads and site controls for SaveVid AI". One Password field
(`autocomplete="current-password"`, 44px tall, 18px radius, line-strong border, faint fill,
3px focus ring, a reserved 20px message row). Full-width 44px blue pill "Sign in", disabled
while empty, spinner while pending. 401: field turns red, card shakes
(`x: [0,-6,6,-4,4,0]` over 0.4s), "Wrong password". 429: "Too many tries. Wait a minute".
Network failure: "Could not reach the server".

**Shell.** From 768px: a 240px sticky full-height sidebar (surface, right border). Top: the
wordmark (a 22px blue rounded square with a white lucide `ArrowDownToLine`, then "SaveVid" 15px
600) and an "ADMIN" pill (10px uppercase, blue tint). Nav: Analytics (`ChartColumn`), Site
(`Server`); the Site item shows a small warning pill "On" while maintenance is on. Active item:
primary text on an elevated pill that slides between items. Footer: "View site" (to `/`) and
"Sign out". Below 768px: a top block with the wordmark row, then one horizontally scrolling row
of nav pills that ends with Sign out (the premium store hides sign-out on phones; this does
not). Main area: side padding clamp(20px, 4vw, 48px), 40px from 768px, 32px top and bottom, max
width 1152px, centred.

**Routing.** One page, URL state: `?page=site` selects Site (default Analytics), `?range=` one
of `today`, `7d`, `30d`, `90d` (default `7d`, which has no parameter; unknown values fall back
to the default). Changes use `history.pushState`; `popstate` restores both.

**Analytics page, top to bottom:**

1. Header: kicker "ANALYTICS", title "Traffic", muted line "What people did on SaveVid AI, in
   your local time". Right side (bottom-aligned from 640px): RangeTabs, a pill track with 32px
   buttons and 13px labels, full width with equal segments on phones, the active pill elevated
   with `0 1px 2px rgba(0,0,0,.4)`, sliding. Under the title, 12px muted "Updated 14:02" or,
   after a failed refresh, "Could not refresh, trying again".
2. LiveStrip (never dims): 36px pills. "N on the site now" with a green dot and ping ring above
   0, gray dot at 0. "N fetches in the last hour", neutral. "N resolver errors in the last
   hour", neutral at 0, warning tint above 0. "Site is live" (success tint) or "Maintenance is
   on" (warning tint), linking to the Site page.
3. Range body. While a new range loads, the old numbers stay, fade to 50% and ignore clicks; the
   selected range pill moves at once.
   - **TrendCard.** Four metric tabs across the top that double as headline numbers: Visitors
     (teal), Fetches (blue), Downloads (green), Failed fetches (red, inverted so up is bad). Each
     tab: coloured dot (35% when inactive), label, total, and a Delta or "No earlier period".
     Active tab: faint white wash plus a 2px underline in its colour that slides. Two per row
     under 640px, four in a row above. Legend row: "{Metric} per day" (or "per hour" for
     Today), a "This period" swatch and, only with a previous period, a dashed "Period before"
     swatch. Chart: Recharts AreaChart, 256px tall (288px from 640px). This period: monotone
     line, stroke 2.25, gradient fill 0.32 to 0, active dot r 4 with a surface-coloured stroke,
     700ms draw-in. Period before: gray, `strokeDasharray="4 4"`, width 1.5, opacity 0.7, no
     fill, no animation, drawn only when present. Horizontal grid lines only at 6% white, no
     axis lines, compact Y labels (1.2K), sparse X labels ("Sep 17", or "14:00"). Tooltip: an
     elevated box at 95% with blur and the raised shadow, two rows (this period's label and
     value, the earlier label and value); hover cursor a 1px line at 18% white. Empty range:
     "Nothing in this range yet" over a flat chart.
   - **Eight tiles** (2 columns, 4 from 1024px; 12px gap, 16px from 640px). Each: a 28px round
     icon tile (15% tint, 14px lucide icon, stroke 2.25), a 13px label, the figure, then a row
     with the Delta and a 12px note.
     1. Success rate, green, `CircleCheck`: ok_fetches / fetches; note "links that returned media".
     2. Conversion, purple, `MousePointerClick`: downloaded_visitors / visitors; note "visitors who downloaded".
     3. Downloads per visitor, blue, `Download`: downloads / visitors; note "per visitor a day".
     4. Visitors a day, teal, `Users`: complete_day_visitors / complete_days; note "average of full days". For Today it shows a dash and "needs a full day", no delta.
     5. Returning, orange, `RotateCcw`: returning / (new + returning); note "of visitors came back".
     6. Page views, indigo, `Eye`: page_views; note "{x} per visitor".
     7. Peak at once, yellow, `Activity`: peak.count; note "Sep 20 at 21:15"; never a delta.
     8. Resolver errors, red, `TriangleAlert`: upstream_errors, inverted delta; note "failures on our side".
   - **Panels** in pairs (one column, two from 1024px). Each panel: 22px card, padding 20px
     (24px from 640px), 15px title, 13px muted hint, 20px before the content.
     1. Funnel "From visit to download", hint "Each visitor counted once a day": four steps
        (Visitors, Pasted a link, Got a result, Downloaded), each with its number, label, value
        and share kept from the step before, over an 8px blue bar sized against step one whose
        opacity drops 0.15 per step.
        Beside it, Fetch outcomes "What happened to each link": small stat tiles (Worked %,
        Deleted or missing, Failed on our side), then a 12px segment bar of every outcome (3px
        gaps, 4px minimum segment, native hover titles) with a legend in one column (two from
        640px). Labels and colours: ok "Worked" green; not_found "Deleted or missing" gray;
        invalid_url "Not a supported link" orange; no_video "No video in the post" yellow;
        private_or_restricted "Private or restricted" purple; upstream_error "Resolver error"
        red; unsupported_post "Unsupported post" pink; not_configured "Not set up" indigo.
     2. Platforms "Where the links came from": Recharts Pie, `innerRadius 58`, `outerRadius 84`,
        `paddingAngle 2`, `cornerRadius 4`, no stroke, in a 176px box; total fetches in the
        centre; legend rows: dot, name, fetches, percent, and a muted "{ok%} worked". Colours in
        SERIES order by rank. Names: X (Twitter), TikTok, Reddit, Instagram, Facebook. The donut
        sits beside its legend from 640px, above it below.
        Beside it, Qualities "What people saved": a BarList (purple) with a 6px track at 6%
        white, fill sized against the largest row; labels 1080p..., `hd` HD, `sd` SD, `photo`
        Photo, `album` Album, `sound` Audio, `video` Video; 8 rows then "Show all (n)".
     3. Countries "Where visitors are": BarList (teal) of visitors per country, each row a mono
        code chip and the English name; the unknown row last as "Not known", muted. Hint when
        unknown is above 0: "Not known includes every visit from before country lookup came
        back". DB-IP link lives in the footnote.
        Beside it, Pages "Which pages people used": BarList (blue) of page views, labelled
        "{Platform name}, {Language}" (English, Spanish, Hindi, or "language not recorded").
     4. Busiest hours "When people use it": heading "14:00 to 15:00" at 22px for the peak hour;
        24 columns in a 144px row, 3px gaps, 4px radius, blue; the peak solid, others at
        opacity 0.3 + 0.5 * n / max, solid on hover, native title "14:00, 123 fetches"; empty
        hours an 8% white stub.
        Beside it, Visitors "New and returning": small stat tiles (Visitors, New, Came back),
        then Traffic sources as a BarList (orange): direct "Direct", search "Search", social
        "Social", referral "Other sites", internal "Between pages".
4. Footnote, 12px muted: visitors are counted once a day because the anonymous ID resets at
   midnight UTC; times are your local time; data is kept 90 days, so the 90-day range has
   nothing earlier to compare with; refreshes every 30 seconds while this tab is open; then the
   DB-IP link.

Empty states everywhere: a dashed box (min 96px tall, 28px radius) with one muted 14px sentence.

**Site page.** Kicker "SITE", title "Site", muted line "Maintenance switch and resolver health".

- Maintenance card: status dot with "Live" or "In maintenance" and one line of explanation.
  "Turn on maintenance" uses a two-tap confirm: the first tap turns it into a warning-tinted
  "Tap to confirm" for 4 seconds (the premium store's Deliver pattern), replacing
  `window.confirm`. "Go live" needs one tap. Spinner while busy. When `forced_by_env` is true:
  the button is disabled and the note reads "Forced on by MAINTENANCE_MODE in deploy/app.env on
  the server. Remove it there and redeploy". Below, one muted line: "Sign out clears this
  browser only. To sign out everywhere, change ADMIN_PASSWORD".
- Resolver health card "Last 24 hours", hint "Resolver errors mean the service we use failed,
  not the visitor's link": five rows (name, lookups, success % coloured green at 90% and up,
  yellow at 70% and up, red below, "No lookups" at zero), the most common failure label with
  its count, and "last failed 14:02" when present.

### F4. Data rules (pure functions, unit tested)

- Delta (verbatim from the premium store): previous null gives null; previous 0 gives 0 when
  current is 0, otherwise null; else `(current - previous) / previous`. Displayed rounded to a
  whole percent as an 11px mono pill with an up-right or down-right arrow ("+12%"), green on a
  green tint when good, red on a red tint when bad; a rounded 0% is plain muted "0%" with no
  pill; null shows nothing. `title` reads "Compared with the {period} before". Inverted metrics
  (Failed fetches, Resolver errors) treat up as bad.
- Ratio tiles take the delta of the ratio itself (relative change), matching the premium store.
- A ratio with a zero denominator is null and renders a dash.
- Percent formatting: one decimal below 10%, whole numbers from 10%.
- Counts: thousands separators in tabs, tiles and lists; compact (1.2K, 3.4M) only on the Y axis.
- Dates: "Sep 17" (`en-US`, short month), hours "14:00", the peak note "Sep 20 at 21:15".

### F4b. Accessibility

- Metric tabs are a `role="tablist"` of `role="tab"` buttons with `aria-selected`; range and
  nav controls are buttons with `aria-pressed` / `aria-current`.
- Charts are `aria-hidden`; the tab figures, tile figures and list rows carry the same numbers
  as text, so nothing is chart-only.
- Every control shows the F2 focus ring; hover-only styles apply only on devices that hover.
- The live strip's dots are decorative; each pill's text states its meaning.

### F5. Data flow

- After the probe, the Analytics page fetches the report for the URL's range and the tz from
  `-new Date().getTimezoneOffset()`; the Site page fetches resolvers and maintenance.
- Auto-refresh every 30 seconds only while `document.visibilityState` is `visible`; on becoming
  visible again it refreshes at once if the last refresh is older than 30 seconds. The live
  strip's maintenance pill uses the same cycle.
- A failed refresh keeps the last data and shows the "Could not refresh" line; a 401 at any
  point returns to login; a 503 on first load shows Unavailable.
- Sign out: `POST /api/admin/logout`, then the login view, whatever the response.

## Testing

Backend (pytest), with a fixed `now = datetime(2026, 9, 23, 7, 30, tzinfo=UTC)` and seeds built
relative to it:

- Windows for `today`, `7d`, `30d`, `90d` at tz 0, +360 and -300: inclusive start, exclusive
  end, previous shifted by exactly N days, `has_previous` false when `MIN(ts)` is after the
  previous start, series length and keys, hourly nulls after the current hour, daily zero-fill.
- Each total and the funnel (nested, never growing), with multi-day visitors proving the
  visitor-day basis.
- Ports of the seven time-bombed behaviours under the new API: shape and values, conversion on a
  daily-distinct basis, platforms breakdown and ordering, sources ordering, new vs returning
  split, quality bucketing and re-aggregation. The surviving helper tests (`parse_tz`,
  `_bucket_quality`, peak rules) move to `tests/test_report.py`; `tests/test_stats.py` is deleted
  with `stats.py`.
- Countries top 10 plus an always-present unknown row; pages grouping with NULL locale; 24
  zero-filled hours; peak inside the window only; the live block.
- Endpoints: 401 without a cookie, 422 `bad_range`, 422 `bad_tz`, 503 on a store exception,
  404 when disabled; resolvers returns five fixed rows; logout sets an expired cookie with
  `Path=/api/admin`.
- Geo: a fake reader for `country()` (valid, lowercase rejected, `ZZ`, invalid IP, missing key,
  raising reader); `load()` keeps the old reader when validation fails; updater month choice
  (current, fallback to previous on 404, skip when the marker matches), caps, non-200, atomic
  replace, all through `respx` with no real network; the service passes the code and never the
  IP to the recorder.
- Locale: `EventIn` accepts en, es, hi and rejects others; the migration is idempotent on both
  stores; the recorder writes the column; download events drop it.
- Warning baseline stays 7 (8 locally on Python 3.14).

Frontend (vitest):

- `delta`, `format`, `metrics`, `range` as pure functions.
- Components from a fixture report shaped like production: tab switching, the previous line
  present and absent, tooltip rows, tile values and dashes, empty states, donut legend, segment
  shares, funnel shares, hours heading, country names, page labels.
- App flow: no login flash while checking, 401 to login, login success, wrong password shake and
  message, 429 message, sign out, range change updates the URL and refetches, page switch,
  refresh only while visible (fake timers), Unavailable and Retry, analytics-off message.
- Recharts under jsdom: stub `ResizeObserver` in the admin tests and give the chart a fixed size.
- `visitContext()` reads `lang` into `locale`.

Build checks: `npm run build` succeeds; no public HTML's script graph includes recharts or
lucide code; `admin.html` still ships the noindex meta.

Visual verification: Playwright against the Vite dev server with `/api/admin/*` intercepted and
answered from a fixture built from production aggregates (read-only, aggregate-only query in
the container). No admin password is typed anywhere. Desktop 1440px and phone 390px screenshots
of Analytics (with and without a previous period), Site, and Login, saved under
`~/Documents/ContentOS/_assets/savevidai-admin/`.

Production verification after deploy: `/admin` 200 with `X-Robots-Tag: noindex`;
`/api/admin/report` and `/api/admin/resolvers` 401 without a cookie; `compute_report` run
inside the container against the real database for all four ranges, cross-checked against
direct SQL counts, with timings; `/data/geoip/dbip-country-lite.mmdb` present with its marker;
within minutes new events carry a country (aggregate share query only); the live dashboard
viewed through the owner's signed-in Chrome if that session is still valid, read-only.

## Merge coordination

- Branch `claude/tender-heisenberg-fuk5v2` (Cloudflare header trust) also edits
  `backend/app/analytics/service.py`, replacing the header read with `client_country(request)`.
  Whichever lands second resolves the conflict to:
  `country = client_country(request) or self._lookup.country(ip)`, so a trusted Cloudflare
  country wins when the record is ever orange-clouded, and the offline lookup covers
  everything else.
- That branch also edits `Caddyfile`. The VPS checkout carries the owner's uncommitted live
  Caddyfile edits, so its deploy needs the owner to apply the Caddyfile change by hand. This
  branch touches neither `Caddyfile` nor `compose.prod.yaml`, so its own deploy is a clean
  `git pull`.

## Risks

- Recharts and React 18.3 peer ranges: checked at install, with a fallback version.
- DB-IP availability or format change: countries show as not known; nothing else is affected.
- Query cost: about 40 grouped queries per report over at most 180 days of rows (about 120k at
  current volume), all on indexed `ts` ranges. Measured on production data during verification;
  the target is under 300ms per call.
- DST: a fixed offset per request, noted above.

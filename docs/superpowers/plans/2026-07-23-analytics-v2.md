# Analytics v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three privacy-preserving visitor insights to the admin dashboard - rolling average active users/day, traffic sources, and new vs returning visitors - by adding two browser-categorized fields (`source`, `visitor_kind`) to visit events and new stats/panels.

**Architecture:** Two nullable columns on the events table (idempotent migration, same pattern as `platform`), threaded through recorder/service/router; a pure browser helper categorizes the referrer and reads a localStorage flag, sending only bucket words; `compute_stats` gains avg_active/sources/visitors; the dashboard gains tiles and panels.

**Tech Stack:** Python 3.12, FastAPI, pytest. TypeScript, Vite 6, React, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-23-analytics-v2-design.md` (read before starting).

## Global Constraints

- Privacy: `source` is one of `{direct, search, social, referral, internal}`; `visitor_kind` is `{new, returning}`. Both are decided in the browser and are the ONLY thing sent; no referrer URL and no cross-day identifier ever reaches the server. The daily-rotating visitor hash is unchanged.
- Both new columns are nullable and set only on visit events. Every query tolerates null (old rows, fetch/download rows).
- Migration is idempotent and must never crash boot (the enablement block in main.py is already try/except wrapped). Add the columns to the base CREATE TABLE too so fresh DBs never ALTER.
- No em dashes, no emoji anywhere. No new dependencies. Conventional commits.
- Backend from `backend/` with venv (`source .venv/bin/activate`); frontend from `frontend/`. Warning baseline 7.

## File structure

Backend:
- Modify `backend/app/analytics/store.py` - `source` + `visitor_kind` columns + idempotent migrations.
- Modify `backend/app/analytics/recorder.py` - record signature + _INSERT + queue tuple.
- Modify `backend/app/analytics/service.py` - thread the two fields through record_from_request.
- Modify `backend/app/analytics/router.py` - EventIn fields + validators, pass through on visit.
- Modify `backend/app/analytics/stats.py` - avg_active, sources, visitors.

Frontend:
- Modify `frontend/src/lib/analytics.ts` - opts type + `visitContext()` helper.
- Modify `frontend/src/App.tsx`, `frontend/src/tiktok/TikTokApp.tsx`, `frontend/src/reddit/RedditApp.tsx` - visit beacon spreads visitContext().
- Modify `frontend/src/admin/api.ts` - Stats type additions.
- Modify `frontend/src/admin/Admin.tsx` - avg tiles + traffic sources panel + new/returning panel.
- Modify README/CONTRIBUTING - note the new fields.

---

### Task 1: Store columns + idempotent migration

**Files:**
- Modify: `backend/app/analytics/store.py`
- Test: `backend/tests/test_store.py`

**Interfaces:**
- Produces: `events` gains `source TEXT` and `visitor_kind TEXT` in the base CREATE TABLE; `_ensure_source_column` / `_ensure_visitor_kind_column` helpers (mirror `_ensure_platform_column`) returning the ALTER when absent; both stores' `init_schema` apply them after the platform migration.

- [ ] **Step 1: Write the failing tests** (append to `backend/tests/test_store.py`, mirroring the existing platform-column + legacy-ALTER tests)

Cover: after `init_schema` (called twice - idempotent), an INSERT including `source` and `visitor_kind` round-trips; and a legacy-table test (a table created WITHOUT the two columns, then `init_schema` adds them). Read the existing `test_platform_column_present_and_idempotent` and `test_platform_column_alter_migration_on_legacy_table` and follow their shape exactly, extended for the two new columns.

- [ ] **Step 2: Run to verify failure**

Run: `python -m pytest tests/test_store.py -k "source or visitor_kind" -v`
Expected: FAIL (no such column).

- [ ] **Step 3: Implement**

Add `source TEXT` and `visitor_kind TEXT` to the `CREATE TABLE` in `SCHEMA`. Add two module helpers next to `_ensure_platform_column`:
```python
def _ensure_source_column(existing_cols: set[str]) -> list[str]:
    return [] if "source" in existing_cols else ["ALTER TABLE events ADD COLUMN source TEXT"]


def _ensure_visitor_kind_column(existing_cols: set[str]) -> list[str]:
    return [] if "visitor_kind" in existing_cols else ["ALTER TABLE events ADD COLUMN visitor_kind TEXT"]
```
In BOTH `SqliteStore.init_schema` and `TursoStore.init_schema`, after the platform migration reads `cols` via `PRAGMA table_info(events)`, apply the two new helpers with the same `cols` set (read cols once, apply all three ensure-helpers). Match the existing code's structure exactly.

- [ ] **Step 4: Run to verify pass**

Run: `python -m pytest tests/test_store.py -v && python -m pytest -q`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
ruff check . && cd .. && git add backend/app/analytics/store.py backend/tests/test_store.py && git commit -m "feat: analytics source and visitor_kind columns with idempotent migration" && cd backend
```

---

### Task 2: Recorder + service threading

**Files:**
- Modify: `backend/app/analytics/recorder.py`, `backend/app/analytics/service.py`
- Test: `backend/tests/test_recorder.py`

**Interfaces:**
- Produces: `Recorder.record(type, visitor, outcome=None, country=None, platform=None, source=None, visitor_kind=None)`; `_INSERT = "INSERT INTO events (ts, type, outcome, country, visitor, platform, source, visitor_kind) VALUES (?,?,?,?,?,?,?,?)"`; queue tuple appends the two new fields in that column order. `AnalyticsService.record_from_request(request, type, outcome, platform=None, source=None, visitor_kind=None)` passes them to `record`.

- [ ] **Step 1: Failing test** (append to `backend/tests/test_recorder.py`, mirror `test_record_writes_platform`): `r.record("visit", visitor="vh", source="search", visitor_kind="new")`, flush, assert the row's source and visitor_kind. Watch the queue-tuple positional order - the existing tests index the tuple; adding two trailing fields keeps prior indices stable (visitor at [-3] now), so update any positional assertion in this file that indexes from the end.
- [ ] **Step 2: Verify failure** (record rejects the new kwargs).
- [ ] **Step 3: Implement** the record signature, _INSERT, queue tuple (append source, visitor_kind after platform), and service.record_from_request passthrough.
- [ ] **Step 4: Green + full suite.**
- [ ] **Step 5: Commit**

```bash
ruff check . && cd .. && git add backend/app/analytics/recorder.py backend/app/analytics/service.py backend/tests/test_recorder.py && git commit -m "feat: recorder and service carry source and visitor_kind" && cd backend
```

---

### Task 3: Event endpoint fields + validation

**Files:**
- Modify: `backend/app/analytics/router.py`
- Test: `backend/tests/test_analytics_api.py`

**Interfaces:**
- Produces: `EventIn` gains `source: str | None = None` (validator: in `{direct, search, social, referral, internal}` or None) and `visitor_kind: str | None = None` (validator: in `{new, returning}` or None). The `/api/event` handler passes `source`/`visitor_kind` to `record_from_request` ONLY when `type == "visit"` (None otherwise).

- [ ] **Step 1: Failing test** (append to `backend/tests/test_analytics_api.py`, mirror the existing event tests): a visit event with `source:"search"` + `visitor_kind:"new"` returns 204 and the recorded row has them; an invalid `source:"junk"` -> 422; an invalid `visitor_kind:"maybe"` -> 422; a download event with a source is accepted (204) but the source is NOT recorded (visit-only). Reset any global state as the file's other tests do.
- [ ] **Step 2: Verify failure.**
- [ ] **Step 3: Implement** the two fields + validators (mirror the platform validator) and the visit-only passthrough in the handler.
- [ ] **Step 4: Green + full suite.**
- [ ] **Step 5: Commit**

```bash
ruff check . && cd .. && git add backend/app/analytics/router.py backend/tests/test_analytics_api.py && git commit -m "feat: event endpoint accepts source and visitor_kind on visits" && cd backend
```

---

### Task 4: Stats aggregations

**Files:**
- Modify: `backend/app/analytics/stats.py`
- Test: `backend/tests/test_stats.py`

**Interfaces:**
- Produces three new keys in `compute_stats(...)`:
  - `avg_active`: `{"d7": int, "d30": int}` - mean of daily unique-visitor counts over the last 7 / 30 days (local-time day buckets, same as the series uniques). Round to nearest int; 0 when no days. Fixed 7/30 windows regardless of the `days` argument. Compute from the same per-day distinct-visitor query the series uses (average over the days that have data within the window; if a project convention is to divide by the full window length vs days-with-data, DIVIDE BY DAYS-WITH-DATA and document it in a comment - a day with no visits contributes 0 uniques, so decide and pin it: average over the fixed window length, e.g. sum(daily uniques in last 7 days) / 7, treating missing days as 0).
  - `sources`: `[{"source": str, "count": int}]` - `type='visit' AND source IS NOT NULL` grouped by source within the window, ordered count desc.
  - `visitors`: `{"new": int, "returning": int}` - counts of `type='visit'` by `visitor_kind` within the window (missing -> 0).
- Use the same local-time `window` filter the other queries use (the file had a prior tz bug; reuse the existing `window` variable, do not build a new UTC filter).

- [ ] **Step 1: Failing tests** (append to `backend/tests/test_stats.py`): seed visit rows across days with distinct visitors + sources + visitor_kinds; assert `avg_active.d7`/`d30` equal the expected averages (pick fixtures with easy arithmetic, e.g. 3 days of 10/20/30 uniques -> d7 = 60/7 rounded); assert `sources` groups and orders correctly; assert `visitors` splits new/returning. Include a nonzero-tz case for avg_active mirroring the existing tz window tests so the day bucketing is pinned.
- [ ] **Step 2: Verify failure** (KeyError on the new keys).
- [ ] **Step 3: Implement** the three aggregations, reusing `window`. Add them to the returned dict.
- [ ] **Step 4: Green + full suite.**
- [ ] **Step 5: Commit**

```bash
ruff check . && cd .. && git add backend/app/analytics/stats.py backend/tests/test_stats.py && git commit -m "feat: stats compute avg active users, traffic sources, new vs returning" && cd backend
```

---

### Task 5: Frontend visit context + beacons

**Files:**
- Modify: `frontend/src/lib/analytics.ts`, `frontend/src/App.tsx`, `frontend/src/tiktok/TikTokApp.tsx`, `frontend/src/reddit/RedditApp.tsx`
- Test: `frontend/src/lib/analytics.test.ts`

**Interfaces:**
- Produces: `sendEvent(type, opts)` opts type = `{ quality?: string; platform?: string; source?: string; visitor_kind?: string }`. A pure exported helper `visitContext(): { source: string; visitor_kind: string }` (and an inner testable core, e.g. `classifySource(referrer: string, currentHost: string): string`, so tests can hit each branch without a real document). Each page's visit beacon becomes `sendEvent("visit", { platform: <p>, ...visitContext() })`.

**Source classification (`classifySource`)**:
- empty/whitespace referrer -> `"direct"`
- `new URL(referrer)` host (lowercased) === currentHost -> `"internal"` (wrap in try/catch -> `"direct"` on parse error)
- host endsWith any of the search list (`google.`, `bing.`, `duckduckgo.`, `yahoo.`, `ecosia.`, `baidu.`, `yandex.`, `google.com`, etc - use host-suffix checks that catch `www.google.com`, `google.co.uk`) -> `"search"`
- host endsWith any of the social list (`t.co`, `twitter.com`, `x.com`, `reddit.com`, `facebook.com`, `instagram.com`, `tiktok.com`, `youtube.com`, `youtu.be`, `linkedin.com`, `pinterest.com`) -> `"social"`
- otherwise -> `"referral"`

**visitor_kind**: read `localStorage.getItem("svai_seen")`; if present -> `"returning"`; else set it to "1" and return `"new"`. Wrap all localStorage access in try/catch; on any error return `"new"` without persisting. Keep this in `visitContext` (which reads document.referrer + location.host + localStorage) while `classifySource` stays pure for testing.

- [ ] **Step 1: Failing tests** (extend `frontend/src/lib/analytics.test.ts`): `classifySource` returns direct/internal/search/social/referral for representative referrers (empty, same-host, https://www.google.com/, https://t.co/x, https://someblog.com/); a visitContext test with a mocked localStorage returns new then returning across two calls; assert the visit beacon body (via the existing sendEvent fetch mock) includes source + visitor_kind.
- [ ] **Step 2: Verify failure.**
- [ ] **Step 3: Implement** `classifySource` (pure) + `visitContext` (guards) + widen opts type; update the three pages' visit beacons. Do NOT change the download beacons.
- [ ] **Step 4:** `npm test -- --run && npm run build`.
- [ ] **Step 5: Commit**

```bash
cd .. && git add frontend/src/lib/analytics.ts frontend/src/lib/analytics.test.ts frontend/src/App.tsx frontend/src/tiktok/TikTokApp.tsx frontend/src/reddit/RedditApp.tsx && git commit -m "feat: visit beacon reports privacy-safe source and new/returning"
```

---

### Task 6: Dashboard panels + docs

**Files:**
- Modify: `frontend/src/admin/api.ts`, `frontend/src/admin/Admin.tsx`, `README.md` (or CONTRIBUTING.md - whichever holds the analytics privacy notes)
- Test: `frontend/src/admin/Admin.test.tsx`

**Interfaces:**
- Consumes: `stats.avg_active {d7,d30}`, `stats.sources [{source,count}]`, `stats.visitors {new,returning}`.
- Produces: `Stats` type gains those three; the Dashboard renders two avg tiles, a "Traffic sources" BarList, and a "New vs returning" panel with a privacy caption.

- [ ] **Step 1: Add the types** to `frontend/src/admin/api.ts`.
- [ ] **Step 2: Failing test** (extend `Admin.test.tsx`): extend the STATS fixture with `avg_active:{d7:340,d30:300}`, `sources:[{source:"search",count:120},{source:"direct",count:90}]`, `visitors:{new:200,returning:140}`; assert the avg tiles show 340 and 300, a "Traffic sources" panel shows search/direct with counts, and a "New vs returning" panel shows both counts. (Remember the SiteControls mount fetch - flush with `await screen.findByText("Live")` as the other Dashboard tests do.)
- [ ] **Step 3: Implement** in `Admin.tsx`: add two Tiles ("Avg/day 7d", "Avg/day 30d"), a `BarList title="Traffic sources"` from `stats.sources`, and a "New vs returning" panel (two Tiles or a 2-row BarList) with a one-line muted caption like "Browser-based estimate, privacy-safe." Use existing tokens; keep the grid tidy. Update the `Stats` type default/empty handling so a backend without the new keys (older deploy) does not crash (default `avg_active` to {d7:0,d30:0}, `sources` to [], `visitors` to {new:0,returning:0} at the read site, mirroring how `platforms ?? []` is already guarded).
- [ ] **Step 4:** `npm test -- --run && npm run build`.
- [ ] **Step 5: Docs** - add a short note to the analytics section of README/CONTRIBUTING: `source` and `visitor_kind` are browser-categorized buckets (no URLs, no cross-day IDs); new/returning is a localStorage-based estimate.
- [ ] **Step 6: Commit**

```bash
cd .. && git add frontend/src/admin/api.ts frontend/src/admin/Admin.tsx frontend/src/admin/Admin.test.tsx README.md && git commit -m "feat: dashboard shows avg active, traffic sources, and new vs returning"
```

---

### Task 7: Full verification (release gate)

- [ ] **Step 1:** Backend `python -m pytest -q && ruff check .` from `backend/` venv - green, warning baseline 7.
- [ ] **Step 2:** Frontend `npm test -- --run && npm run build` from `frontend/` - green.
- [ ] **Step 3:** Local sanity: the dashboard renders the new tiles/panels from the test fixtures (no analytics DB locally, so live data needs prod). Confirm the older-deploy guard: a stats object missing the new keys does not crash the dashboard.
- [ ] **Step 4:** After merge + deploy, prod live check while logged into `/admin`: the new tiles and panels render; open the public site in a fresh tab to generate a visit and confirm (after the ~60s poll) a source and a new/returning entry appear; confirm existing analytics still load; confirm the migration added the columns without downtime (site stays up). Do not push or deploy without the owner.

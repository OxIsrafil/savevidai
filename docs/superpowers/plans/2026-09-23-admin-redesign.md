# Admin Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild SaveVid AI's owner-only `/admin` in the premium store admin's dark Apple style, with range analytics compared against the period before, countries back through an offline DB-IP Lite lookup, page language on visit events, logout, and a Site page.

**Architecture:** A new `backend/app/analytics/report.py` computes a range report from bound UTC `ts` windows with an injectable `now`, served by `GET /api/admin/report`, `GET /api/admin/resolvers` and `POST /api/admin/logout`. A new `geo.py` looks countries up in memory from a DB-IP file that a daemon thread refreshes into the analytics volume. The admin SPA (its own Vite entry) is rebuilt under `frontend/src/admin/` with admin-only Tailwind v4 tokens, Recharts and lucide-react, so public pages load nothing new.

**Tech Stack:** Python 3.12 (3.14 locally), FastAPI, httpx, SQLite (Turso-compatible SQL), maxminddb; React 18.3, Vite 6, Tailwind 4.3.2, motion 11, recharts ^3.8, lucide-react, vitest 2, Playwright for the visual check.

**Spec:** `docs/superpowers/specs/2026-09-23-admin-redesign-design.md` (rev 2). Executors read the spec and this plan together; where they disagree, the spec wins and the executor reports the mismatch.

## Global Constraints

- No em dashes (U+2014) and no emoji anywhere: code, comments, UI copy, commit messages, docs.
- Admin copy is sentence case, exactly as the spec words it (spec Decision 9). No trailing periods on titles, tile labels or tab labels.
- Privacy: the IP is used in memory for the daily hash and the country lookup only. Never stored, logged, cached, or passed to the recorder. `country` is ISO alpha-2 or NULL; `locale` is `en`, `es`, `hi` or NULL. No referrer URLs, no cross-day identifiers.
- `report.py` never uses SQLite `datetime('now')`. Windows are bound `ts >= ? AND ts < ?` parameters in the stored UTC text format `YYYY-MM-DD HH:MM:SS`.
- Admin is dark only. Tokens and palette verbatim from spec F2. System SF font stack, no webfont on the admin.
- New dependencies, and only these: backend `maxminddb>=2.6`; frontend `recharts@^3.8`, `lucide-react`, `react-is`, all imported only under `frontend/src/admin/`.
- Do NOT modify `backend/app/client_ip.py`, `Caddyfile` or `compose.prod.yaml` (owned elsewhere or carrying the owner's live edits on the VPS).
- Tests and CI never touch the network: the geo updater only starts when `GEOIP_UPDATE` is truthy, which only the Dockerfile sets.
- TDD every task. Stage files by name. One commit per task (fix commits after review are separate). Conventional prefix. Final line of every commit message exactly: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- Baselines: backend `pytest -q -p no:cacheprovider` in the main checkout: 485 passed, exactly 7 failed (all in `tests/test_stats.py`, time-bombed seeds), 7 warnings. Those 7 stay the only failures until Task 11 deletes the file; any other failure or any new warning is a finding. Frontend: `npm run lint` clean, `npx vitest run` 527 passed before Task 6, `npm run build` succeeds.
- Shells share a working directory across parallel calls: every command starts with `cd "$(git rev-parse --show-toplevel)/backend"` (then `source .venv/bin/activate`) or `cd "$(git rev-parse --show-toplevel)/frontend"`.
- Execution layout: Tasks 1 to 5 run in the main checkout on `feature/admin-redesign`. Tasks 6 to 10 run in the worktree `.claude/worktrees/admin-ui` on `feature/admin-redesign-ui` (branched from `feature/admin-redesign` after this plan is committed; `npm ci` first, since worktrees start without node_modules). The UI branch merges back into `feature/admin-redesign` before Task 11.

---

## Planner notes (read before dispatching; not part of any task brief)

### Backend notes

## File map (backend part, Tasks 1 to 5)

- Create: `backend/app/analytics/report.py` (Task 1, extended in Task 3) - range analytics with an injectable `now`: windows, totals, series, then panels, live block and resolver health. Every SQL range is a bound `ts >= ? AND ts < ?` pair; no `datetime('now')`.
- Modify: `backend/app/analytics/stats.py` (Task 1) - `parse_tz`, `_tzmod`, `_bucket_quality`, `_TIER_LADDER` move out; it imports them back so `GET /api/admin/stats` and `tests/test_stats.py` keep working until the cleanup task.
- Create: `backend/tests/test_report.py` (Task 1, extended in Task 3) - fixed clock `NOW = 2026-09-23 07:30 UTC`, seeds relative to it.
- Modify: `backend/app/analytics/router.py` (Task 2: `EventIn.locale`; Task 5: `GET /api/admin/report`, `GET /api/admin/resolvers`, `POST /api/admin/logout`).
- Modify: `backend/app/analytics/store.py` (Task 2) - `_ensure_locale_column` for both stores.
- Modify: `backend/app/analytics/recorder.py` (Task 2) - queue tuple and INSERT gain `locale`.
- Modify: `backend/app/analytics/service.py` (Task 2: `locale` passthrough; Task 4: IP computed once, hash and country, no `cf-ipcountry`, geo start).
- Modify: `scripts/migrate_analytics.py` (Task 2) - its explicit column lists gain `locale` so the one-time copy stays faithful.
- Modify: `backend/tests/test_analytics_api.py`, `backend/tests/test_store.py`, `backend/tests/test_recorder.py`, `backend/tests/test_migrate_analytics.py` (Task 2) - locale coverage.
- Modify: `frontend/src/lib/analytics.ts`, `frontend/src/lib/analytics.test.ts` (Task 2) - `visitContext()` reports `locale`.
- Create: `backend/app/analytics/geo.py` (Task 4) - `CountryLookup`, `resolve_geo_dir`, `GeoUpdater`.
- Modify: `backend/app/envutil.py`, `backend/tests/test_envutil.py` (Task 4) - `is_truthy(value)` shared by `MAINTENANCE_MODE` and `GEOIP_UPDATE`.
- Create: `backend/tests/test_geo.py`, `backend/tests/test_service_geo.py` (Task 4) - fake reader, respx, privacy invariants.
- Modify: `backend/pyproject.toml`, `Dockerfile`, `deploy/README.md`, `deploy/app.env.example` (Task 4) - `maxminddb>=2.6`, `ENV GEOIP_UPDATE=1`, data source, licence and refresh notes.
- Create: `backend/tests/test_admin_api.py` (Task 5) - the three endpoints' auth, 404, 422, 503 and cookie conventions.

Context an implementer needs but might not guess (all checked on 2026-09-23 in the main checkout: Python 3.14.6 venv, sqlite 3.53.3, ruff 0.16.0, fastapi 0.139.0, starlette 1.3.1, httpx 0.28.1, respx 0.23.1):

- The baseline before Task 1: `ruff check .` clean; `pytest -q -p no:cacheprovider` ends `7 failed, 485 passed, 7 warnings`, the 7 failures all in `tests/test_stats.py` (seeds hardcoded to July while `compute_stats` windows on `datetime('now')`). Every gate below keeps exactly those 7 failures and 7 warnings; the pass count grows per task and is stated for each.
- The repo's ruff config enables far more than ruff's default set (flake8-datetimez among them). Build datetimes with `tzinfo=UTC`; turn a stored `ts` into an aware datetime with `.replace(tzinfo=UTC)`; a naive local wall-clock datetime is fine when derived from an aware one (`now.astimezone(UTC).replace(tzinfo=None) + timedelta(...)`). Line length is 100.
- respx: register routes on the context router (`with respx.mock as mock: mock.get(...)`), the idiom in `tests/test_reddit_auth.py`. Routes registered through the module-level `respx.get()` inside a parametrized test leak into later tests (`test_reddit_auth.py::test_token_cached_across_calls` then fails).
- Events store `ts` as UTC text `YYYY-MM-DD HH:MM:SS` (`recorder.py:33`), so text comparison is chronological and `idx_events_ts` / `idx_events_type_ts` serve `ts >= ? AND ts < ?` (checked with `EXPLAIN QUERY PLAN`: `SEARCH events USING COVERING INDEX idx_events_type_ts`).
- `AnalyticsConfig("libsql://x", "t", "pw-long", "salt")` (positional, Turso mode) is what the API fixtures use. In Task 4 `resolve_geo_dir` returns `None` for it unless `GEOIP_DIR` is set, so the geo code never runs inside the API fixtures.
- Commands use the absolute-safe forms because parallel shells share one cwd: backend `cd "$(git rev-parse --show-toplevel)/backend" && source .venv/bin/activate && ...`, frontend `cd "$(git rev-parse --show-toplevel)/frontend" && ...`.
- Task order matters: Task 3's `pages` panel reads the `locale` column that Task 2 adds. Do Tasks 1, 2, 3, 4, 5 in that order.

---

### Frontend notes

## Frontend part (Tasks 6 to 10)

Runs in a separate git worktree on branch `feature/admin-redesign-ui`. A fresh worktree has no
`node_modules`: run `cd "$(git rev-parse --show-toplevel)/frontend" && npm ci` once before Task 6.
Every frontend command below is run from that directory. Facts checked on 2026-09-23 against the
installed toolchain (Node 22, Vite 6.4.3, Vitest 2.1.9, Tailwind 4.3.2, motion 11.18.2, React 18.3.1)
and the scratch install of recharts 3.10.1 / lucide-react 1.47.0 / react-is 18.3.1:

- Recharts renders a real SVG under jsdom only when the chart has explicit `width` and `height`.
  `ResponsiveContainer` (and the `responsive` prop) render no SVG there, without an error. So the
  TrendCard takes an optional `size` prop that tests pass; production omits it and uses
  `ResponsiveContainer`. The Donut is a fixed 176px box by spec, so it uses fixed dimensions
  directly and needs no `ResponsiveContainer` at all.
- `motion/react` in motion 11 exports `motion`, `AnimatePresence`, `MotionConfig`,
  `useAnimationControls` and `layoutId` works under jsdom with no `matchMedia` stub.
- Tailwind 4.3.2 compiles `@import "tailwindcss" source(none);` + `@source "./";` and, in the
  public stylesheet, `@source not "../admin";` excludes `src/admin` even though the Vite plugin adds
  the project root as an automatic source. Theme variables are emitted even when only custom CSS
  references them.
- `Intl.DisplayNames(["en"], { type: "region" }).of("BD")` is "Bangladesh" in Node 22 and
  `.of("unknown")` throws `RangeError`; the country helper wraps it in try/catch.
- `document.visibilityState` is "visible" under Vitest's jsdom and can be redefined per test
  with `Object.defineProperty(document, "visibilityState", { configurable: true, get })`.
- Tests that use fake timers follow `src/components/PhotoGrid.test.tsx`: `vi.useFakeTimers()`,
  `fireEvent` instead of `userEvent`, bounded `await act(async () => { await
  vi.advanceTimersByTimeAsync(n); })`, `vi.useRealTimers()` in `afterEach`.
- The frontend lint gate is `tsc --noEmit` over `src`, so test files must typecheck too
  (`strict`, `noUnusedLocals`).

### File map (frontend part)

- `frontend/package.json`, `frontend/package-lock.json`: add `recharts`, `lucide-react`, `react-is` (Task 6).
- `frontend/src/admin/admin.css`: Tailwind import scoped to the admin, the F2 theme tokens, base styles for `html`/`body`, the `kicker` utility and the `reveal-up` block animation (Task 6).
- `frontend/src/admin/lib/api.ts`: the Report/Resolvers/Maintenance JSON types (spec B4/B5) and every fetcher (Task 6).
- `frontend/src/admin/lib/range.ts`: range keys, labels, titles, page keys, URL state parse/build, `currentTz()` (Task 6).
- `frontend/src/admin/lib/delta.ts`: `change()` verbatim from the premium store and `compareLabel()` (Task 6).
- `frontend/src/admin/lib/format.ts`: counts, compact numbers, percents, dates, hours, spans, clocks, "N min ago", the UTC-midnight local time, and every code-to-label map (country, platform, quality, language, source, outcome) (Task 6).
- `frontend/src/admin/lib/metrics.ts`: ratio tiles, ratio and count deltas, trend rows, flat detection, peak and quiet hours, the resolver success tone (Task 6).
- `frontend/src/admin/lib/colors.ts`: the chart palette verbatim, SERIES order, `tint()`, outcome colours (Task 6).
- `frontend/src/admin/test/fixtures.ts`: `REPORT_7D`, `REPORT_TODAY`, `REPORT_90D`, `REPORTS`, `RESOLVERS`, `EMPTY_REPORT` matching the JSON contract with production-like numbers (Task 6).
- `frontend/src/admin/test/fixtures.test.ts`: contract invariants of the fixtures (Task 6).
- `frontend/src/admin/test/fakeServer.ts`: a `fetch` stub that answers every admin endpoint from the fixtures with mutable state (Task 7).
- `frontend/src/admin/test/text.ts`: a text matcher for elements whose full text is split across child spans (Task 8).
- `frontend/src/admin/main.tsx`: mounts `App`, imports `./admin.css` (Task 7).
- `frontend/admin.html`: noindex kept, no font preload, no theme script, dark colour scheme, black body (Task 7).
- `frontend/src/styles/index.css`: gains `@source not "../admin";` (Task 7).
- `frontend/src/admin/App.tsx`: phases (checking, login, off, unavailable, shell), URL state, the 30 s refresh tick, maintenance state, sign out (Task 7, extended by nothing later: pages own their data).
- `frontend/src/admin/hooks/useVisibleInterval.ts`: interval that fires only while the tab is visible and catches up on return (Task 7).
- `frontend/src/admin/hooks/useUrlState.ts`: `page` and `range` in the query string with `pushState`/`popstate` (Task 7).
- `frontend/src/admin/components/styles.ts`: `cn()`, the shared CARD and button class strings (Task 7).
- `frontend/src/admin/components/Spinner.tsx`, `Wordmark.tsx`, `Reveal.tsx`, `PageHeader.tsx`, `CheckingView.tsx`, `LoginView.tsx`, `UnavailableView.tsx` (Unavailable + Analytics-off), `Shell.tsx` (Task 7).
- `frontend/src/admin/pages/AnalyticsPage.tsx`: header stub in Task 7, real header + live strip + trend card + data loading in Task 8, tiles + panels + footnote in Task 9.
- `frontend/src/admin/pages/SitePage.tsx`: header stub in Task 7, real page in Task 10.
- `frontend/src/admin/components/Delta.tsx`, `RangeTabs.tsx`, `LiveStrip.tsx`, `TrendCard.tsx` (exports `TrendCard`, `TrendTooltip`, `METRICS`) (Task 8).
- `frontend/src/admin/components/Kpi.tsx`, `Panel.tsx`, `EmptyState.tsx`, `Funnel.tsx`, `SegmentBar.tsx`, `Donut.tsx`, `BarList.tsx`, `HoursChart.tsx`, `MiniStats.tsx`, `Footnote.tsx` (Task 9).
- `frontend/src/admin/components/MaintenanceCard.tsx`, `ResolverHealth.tsx` (Task 10).
- Old `Admin.tsx`, `SiteControls.tsx`, `api.ts` and their tests stay untouched until Task 11 deletes them; from Task 7 nothing imports them.

---

---

### Task 1: Report core (injectable clock, bound windows, totals, series)

**Files:**
- Create: `backend/app/analytics/report.py`
- Modify: `backend/app/analytics/stats.py:1-57` (the moved helpers; `_local` at line 58 and everything below stay)
- Test: `backend/tests/test_report.py` (new)

**Interfaces:**
- Consumes: `Store.query(sql: str, args: list) -> list[dict]` from `backend/app/analytics/store.py`; the `events` columns `ts, type, outcome, country, visitor, platform, source, visitor_kind`.
- Produces, in `backend/app/analytics/report.py`: `RANGES = {"today": 1, "7d": 7, "30d": 30, "90d": 90}`; `DEFAULT_RANGE = "7d"`; `parse_range(raw: str | None) -> str` (None or "" gives "7d", anything else not in RANGES raises `ValueError`); `parse_tz(raw) -> int`; `_tzmod(tz: int) -> str`; `_bucket_quality(label: str) -> str`; `_TIER_LADDER`; `Window` (frozen dataclass with naive local `start`, `end` and `tz`, properties `start_utc`, `end_utc`, `last_midnight_utc`, `first_date`, `last_date`); `windows(range_key: str, tz: int, now: datetime) -> tuple[Window, Window]`; `has_previous(store, previous: Window) -> bool`; `totals(store, window: Window, n: int) -> dict` with exactly the 12 keys `visitors, page_views, fetches, ok_fetches, failed_fetches, upstream_errors, downloads, downloaded_visitors, new_visitors, returning_visitors, complete_days, complete_day_visitors`; `series(store, current, previous, n, bucket, with_previous) -> list[dict]`; `_visitor_days(store, tz, start_utc, end_utc) -> dict` (Task 3 reuses it for the funnel); `compute_report(store, range_key: str, tz: int, now: datetime) -> dict` with keys `range, tz, bucket, has_previous, window, totals, previous, series` (Task 3 adds the panels and `live` to this same dict). `stats.py` re-exports `parse_tz`, `_tzmod`, `_bucket_quality`, `_TIER_LADDER`, which `router.py` and `tests/test_stats.py` keep importing from it.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_report.py` with exactly this content (the window table is worked from `NOW = 2026-09-23 07:30 UTC`; tz +360 makes local 13:30 with local midnight at 2026-09-22 18:00 UTC, tz -300 makes local 02:30 with local midnight at 2026-09-23 05:00 UTC):

```python
"""Report tests run against a FIXED clock: NOW = 2026-09-23 07:30 UTC. Every
seed is written relative to it (absolute UTC text or the at() helper), so the
numbers below never drift with the calendar."""
import inspect
from datetime import UTC, datetime, timedelta

import pytest

from app.analytics import report
from app.analytics.report import (
    RANGES,
    Window,
    _bucket_quality,
    compute_report,
    has_previous,
    parse_range,
    parse_tz,
    windows,
)
from app.analytics.store import SqliteStore

NOW = datetime(2026, 9, 23, 7, 30, tzinfo=UTC)

COLS = ("ts", "type", "outcome", "country", "visitor", "platform", "source", "visitor_kind")
_INSERT = f"INSERT INTO events ({', '.join(COLS)}) VALUES ({', '.join('?' * len(COLS))})"

TOTAL_KEYS = {
    "visitors", "page_views", "fetches", "ok_fetches", "failed_fetches", "upstream_errors",
    "downloads", "downloaded_visitors", "new_visitors", "returning_visitors", "complete_days",
    "complete_day_visitors",
}


def at(**delta) -> str:
    """UTC text of NOW shifted by timedelta(**delta), e.g. at(minutes=-4)."""
    return (NOW + timedelta(**delta)).strftime("%Y-%m-%d %H:%M:%S")


def seeded(rows) -> SqliteStore:
    """Rows are tuples in COLS order; short tuples are padded with NULLs."""
    s = SqliteStore(":memory:")
    s.init_schema()
    s.execute_many([(_INSERT, list(r) + [None] * (len(COLS) - len(r))) for r in rows])
    return s


def zeros() -> dict:
    return {"visitors": 0, "fetches": 0, "downloads": 0, "failed_fetches": 0}


# ---- helpers ported from tests/test_stats.py ---------------------------------

def test_parse_tz_valid():
    assert parse_tz("360") == 360
    assert parse_tz(-300) == -300
    assert parse_tz(0) == 0


def test_parse_tz_rejects():
    for bad in ["abc", "841", "-841", "1); DROP TABLE events;--", None, ""]:
        with pytest.raises(ValueError):
            parse_tz(bad)


def test_parse_tz_rejects_non_integer_float():
    # A non-HTTP caller could pass a real float; int(3.5) would silently
    # truncate to 3 instead of rejecting it. String "3.5" already raises
    # via int(), this covers the float-arrives-directly path.
    with pytest.raises(ValueError):
        parse_tz(3.5)
    with pytest.raises(ValueError):
        parse_tz(-3.5)


def test_parse_tz_boundary_inclusive():
    assert parse_tz(840) == 840
    assert parse_tz(-840) == -840
    assert parse_tz("840") == 840
    assert parse_tz("-840") == -840


def test_bucket_quality_snaps_heights_to_nearest_standard_tier():
    # Raw pixel-height labels (fxtwitter/reddit emit `{height}p` verbatim, so
    # portrait/odd-aspect videos produce values like 1124p, 1054p, 680p) snap to
    # the nearest standard rung on the ladder.
    assert _bucket_quality("1124p") == "1080p"
    assert _bucket_quality("1054p") == "1080p"
    assert _bucket_quality("680p") == "720p"
    assert _bucket_quality("500p") == "480p"
    assert _bucket_quality("400p") == "360p"
    # Exact standard tiers are unchanged.
    assert _bucket_quality("1080p") == "1080p"
    assert _bucket_quality("360p") == "360p"
    # A genuine hi-res video is not squashed into 1080p.
    assert _bucket_quality("1440p") == "1440p"
    assert _bucket_quality("2100p") == "2160p"
    # Exact midpoint ties resolve to the lower (guaranteed) tier.
    assert _bucket_quality("600p") == "480p"


def test_bucket_quality_passes_named_labels_through():
    # TikTok emits named labels; they are not heights and must survive verbatim.
    for label in ("hd", "sd", "video", "photo", "album", "sound"):
        assert _bucket_quality(label) == label


def test_parse_range_defaults_and_rejects():
    assert parse_range(None) == "7d"
    assert parse_range("") == "7d"
    for key in RANGES:
        assert parse_range(key) == key
    for bad in ("7", "week", "1d", "TODAY", "365d", "7d "):
        with pytest.raises(ValueError):
            parse_range(bad)


def test_report_never_reads_the_database_clock():
    # Every bound is a parameter computed from `now`; the SQLite clock would
    # make the numbers depend on wall time and defeat the index.
    src = inspect.getsource(report)
    assert "datetime('now'" not in src
    assert 'datetime("now"' not in src


# ---- windows (spec B2) --------------------------------------------------------

# (tz, range) -> ((current start, current end), (previous start, previous end)) as
# UTC text. Worked from NOW = 2026-09-23 07:30 UTC:
#   tz 0:    L = 07:30, M0 = 2026-09-23 00:00
#   tz +360: L = 13:30, M0 = 2026-09-23 00:00 local = 2026-09-22 18:00 UTC
#   tz -300: L = 02:30, M0 = 2026-09-23 00:00 local = 2026-09-23 05:00 UTC
BOUNDS = {
    (0, "today"): (("2026-09-23 00:00:00", "2026-09-23 07:30:00"),
                   ("2026-09-22 00:00:00", "2026-09-22 07:30:00")),
    (0, "7d"): (("2026-09-17 00:00:00", "2026-09-23 07:30:00"),
                ("2026-09-10 00:00:00", "2026-09-16 07:30:00")),
    (0, "30d"): (("2026-08-25 00:00:00", "2026-09-23 07:30:00"),
                 ("2026-07-26 00:00:00", "2026-08-24 07:30:00")),
    (0, "90d"): (("2026-06-26 00:00:00", "2026-09-23 07:30:00"),
                 ("2026-03-28 00:00:00", "2026-06-25 07:30:00")),
    (360, "today"): (("2026-09-22 18:00:00", "2026-09-23 07:30:00"),
                     ("2026-09-21 18:00:00", "2026-09-22 07:30:00")),
    (360, "7d"): (("2026-09-16 18:00:00", "2026-09-23 07:30:00"),
                  ("2026-09-09 18:00:00", "2026-09-16 07:30:00")),
    (360, "30d"): (("2026-08-24 18:00:00", "2026-09-23 07:30:00"),
                   ("2026-07-25 18:00:00", "2026-08-24 07:30:00")),
    (360, "90d"): (("2026-06-25 18:00:00", "2026-09-23 07:30:00"),
                   ("2026-03-27 18:00:00", "2026-06-25 07:30:00")),
    (-300, "today"): (("2026-09-23 05:00:00", "2026-09-23 07:30:00"),
                      ("2026-09-22 05:00:00", "2026-09-22 07:30:00")),
    (-300, "7d"): (("2026-09-17 05:00:00", "2026-09-23 07:30:00"),
                   ("2026-09-10 05:00:00", "2026-09-16 07:30:00")),
    (-300, "30d"): (("2026-08-25 05:00:00", "2026-09-23 07:30:00"),
                    ("2026-07-26 05:00:00", "2026-08-24 07:30:00")),
    (-300, "90d"): (("2026-06-26 05:00:00", "2026-09-23 07:30:00"),
                    ("2026-03-28 05:00:00", "2026-06-25 07:30:00")),
}


@pytest.mark.parametrize(("tz", "range_key"), sorted(BOUNDS))
def test_windows_utc_bounds(tz, range_key):
    current, previous = windows(range_key, tz, NOW)
    (cs, ce), (ps, pe) = BOUNDS[(tz, range_key)]
    assert (current.start_utc, current.end_utc) == (cs, ce)
    assert (previous.start_utc, previous.end_utc) == (ps, pe)
    # The previous window is the current one shifted back by exactly N days.
    n = RANGES[range_key]
    assert current.start - previous.start == timedelta(days=n)
    assert current.end - previous.end == timedelta(days=n)


def test_windows_require_an_aware_now():
    with pytest.raises(ValueError):
        windows("7d", 0, NOW.replace(tzinfo=None))


def test_window_dates_and_bucket_per_range():
    empty = seeded([])
    expected = {
        "today": ("2026-09-23", "2026-09-23", "hour", 1),
        "7d": ("2026-09-17", "2026-09-23", "day", 7),
        "30d": ("2026-08-25", "2026-09-23", "day", 30),
        "90d": ("2026-06-26", "2026-09-23", "day", 90),
    }
    for range_key, (start, end, bucket, length) in expected.items():
        out = compute_report(empty, range_key, 360, NOW)
        assert out["range"] == range_key
        assert out["tz"] == 360
        assert out["window"] == {"start": start, "end": end}
        assert out["bucket"] == bucket
        assert len(out["series"]) == (24 if bucket == "hour" else length)
        assert out["totals"]["complete_days"] == length - 1


def test_last_midnight_is_the_complete_days_cut():
    current, previous = windows("7d", 360, NOW)
    assert current.last_midnight_utc == "2026-09-22 18:00:00"
    assert previous.last_midnight_utc == "2026-09-15 18:00:00"
    today, yesterday = windows("today", -300, NOW)
    assert today.last_midnight_utc == today.start_utc == "2026-09-23 05:00:00"
    assert yesterday.last_midnight_utc == "2026-09-22 05:00:00"
    assert isinstance(today, Window)


def test_bounds_are_inclusive_start_exclusive_end_with_a_gap_between_windows():
    # tz +360, 7d: previous [09-09 18:00, 09-16 07:30), current [09-16 18:00, now).
    # The previous window is cut at the same time of day, so the rest of local
    # 09-16 (07:30 to 18:00 UTC) belongs to neither window.
    s = seeded([
        ("2026-09-09 18:00:00", "visit", None, None, "p-start", "twitter", "direct", "new"),
        ("2026-09-16 07:29:59", "fetch", "ok", None, "p-last", "twitter"),
        ("2026-09-16 07:30:00", "fetch", "ok", None, "gap-1", "twitter"),
        ("2026-09-16 17:59:59", "fetch", "ok", None, "gap-2", "twitter"),
        ("2026-09-16 18:00:00", "fetch", "ok", None, "c-start", "twitter"),
        ("2026-09-23 07:29:59", "fetch", "ok", None, "c-last", "twitter"),
        ("2026-09-23 07:30:00", "fetch", "ok", None, "c-end", "twitter"),
    ])
    out = compute_report(s, "7d", 360, NOW)
    assert out["has_previous"] is True
    assert out["totals"]["fetches"] == 2
    assert out["totals"]["visitors"] == 2
    assert out["previous"]["fetches"] == 1
    assert out["previous"]["page_views"] == 1
    assert out["previous"]["visitors"] == 2


# ---- has_previous -------------------------------------------------------------

def test_has_previous_false_on_an_empty_store():
    out = compute_report(seeded([]), "7d", 0, NOW)
    assert out["has_previous"] is False
    assert out["previous"] is None
    assert all(row["prev"] is None for row in out["series"])


def test_has_previous_needs_the_oldest_event_at_or_before_the_previous_start():
    _, previous = windows("7d", 0, NOW)
    assert previous.start_utc == "2026-09-10 00:00:00"
    after = seeded([("2026-09-10 00:00:01", "visit", None, None, "v", "twitter")])
    assert has_previous(after, previous) is False
    at_start = seeded([("2026-09-10 00:00:00", "visit", None, None, "v", "twitter")])
    assert has_previous(at_start, previous) is True
    before = seeded([("2026-09-01 00:00:00", "visit", None, None, "v", "twitter")])
    assert has_previous(before, previous) is True


def test_has_previous_is_false_for_90d_under_90_day_retention():
    # 90d compares with the 90 days before; retention prunes at 90 days, so the
    # oldest row is never early enough. The first second of the current window
    # is 89 days back and does not qualify.
    s = seeded([("2026-06-26 00:00:00", "visit", None, None, "v", "twitter")])
    out = compute_report(s, "90d", 0, NOW)
    assert out["has_previous"] is False
    assert out["previous"] is None


# ---- totals (spec B3) ---------------------------------------------------------

def _seed_week() -> SqliteStore:
    """tz 0, 7d. Previous window [09-10 00:00, 09-16 07:30), gap until 09-17
    00:00, current window [09-17 00:00, 09-23 07:30)."""
    return seeded([
        # previous window, starting on its very first second (has_previous)
        ("2026-09-10 00:00:00", "visit", None, "BD", "vOld", "twitter", "direct", "new"),
        ("2026-09-15 12:00:00", "visit", None, "US", "vP", "tiktok", "search", "returning"),
        ("2026-09-15 12:01:00", "fetch", "ok", "US", "vP", "tiktok"),
        # the gap: after the previous end, before the current start
        ("2026-09-16 12:00:00", "fetch", "ok", "US", "vG", "reddit"),
        # current window
        ("2026-09-20 10:00:00", "visit", None, "BD", "v1", "twitter", "search", "new"),
        ("2026-09-20 10:01:00", "fetch", "ok", "BD", "v1", "twitter"),
        ("2026-09-20 10:02:00", "download", "1080p", "BD", "v1", "twitter"),
        ("2026-09-20 11:00:00", "visit", None, "US", "v2", "tiktok", "direct", "returning"),
        ("2026-09-20 11:01:00", "fetch", "no_video", "US", "v2", "tiktok"),
        ("2026-09-21 09:00:00", "fetch", "ok", "BD", "v1", "twitter"),
        ("2026-09-22 05:00:00", "fetch", "upstream_error", None, "v3", "reddit"),
        ("2026-09-22 05:01:00", "fetch", "ok", None, "v3", "reddit"),
        ("2026-09-22 05:02:00", "download", "hd", None, "v3", "reddit"),
        ("2026-09-23 07:00:00", "visit", None, "ES", "v4", "instagram", "social", "new"),
        ("2026-09-23 07:29:59", "download", "720p", "ES", "v5", "reddit"),
        # exactly `now`: outside the half-open window
        ("2026-09-23 07:30:00", "fetch", "ok", "ES", "vX", "facebook"),
    ])


def test_totals_every_key_for_the_current_window():
    out = compute_report(_seed_week(), "7d", 0, NOW)
    assert set(out["totals"]) == TOTAL_KEYS
    assert out["totals"] == {
        # visitor-days: (09-20 v1) (09-20 v2) (09-21 v1) (09-22 v3) (09-23 v4) (09-23 v5)
        "visitors": 6,
        "page_views": 3,
        "fetches": 5,
        "ok_fetches": 3,
        "failed_fetches": 2,
        "upstream_errors": 1,
        "downloads": 3,
        # ok fetch AND download on the same visitor-day: (09-20 v1), (09-22 v3);
        # v5 downloaded without an ok fetch and does not count
        "downloaded_visitors": 2,
        "new_visitors": 2,
        "returning_visitors": 1,
        "complete_days": 6,
        # visitor-days before local 09-23 00:00
        "complete_day_visitors": 4,
    }


def test_totals_for_the_previous_window_use_its_own_cuts():
    out = compute_report(_seed_week(), "7d", 0, NOW)
    assert out["has_previous"] is True
    assert set(out["previous"]) == TOTAL_KEYS
    assert out["previous"] == {
        "visitors": 2,
        "page_views": 2,
        "fetches": 1,
        "ok_fetches": 1,
        "failed_fetches": 0,
        "upstream_errors": 0,
        "downloads": 0,
        "downloaded_visitors": 0,
        "new_visitors": 1,
        "returning_visitors": 1,
        "complete_days": 6,
        # both previous visitor-days fall before local 09-16 00:00
        "complete_day_visitors": 2,
    }


def test_visitors_are_visitor_days_not_distinct_hashes():
    # The same hash on two local days is two visitor-days (hashes rotate daily
    # in production, so this is the only consistent reading).
    s = seeded([
        ("2026-09-20 10:00:00", "visit", None, "BD", "v1", "twitter", "direct", "new"),
        ("2026-09-21 10:00:00", "visit", None, "BD", "v1", "twitter", "direct", "returning"),
        ("2026-09-21 10:05:00", "fetch", "ok", "BD", "v1", "twitter"),
    ])
    out = compute_report(s, "7d", 0, NOW)
    assert out["totals"]["visitors"] == 2
    assert out["totals"]["new_visitors"] == 1
    assert out["totals"]["returning_visitors"] == 0


def test_downloaded_visitors_needs_an_ok_fetch_and_a_download_on_one_visitor_day():
    s = seeded([
        # a: ok fetch and download the same day -> counts
        ("2026-09-20 10:00:00", "fetch", "ok", None, "a", "twitter"),
        ("2026-09-20 10:01:00", "download", "1080p", None, "a", "twitter"),
        # b: ok fetch one day, download the next -> neither day counts
        ("2026-09-20 11:00:00", "fetch", "ok", None, "b", "twitter"),
        ("2026-09-21 11:00:00", "download", "1080p", None, "b", "twitter"),
        # c: failed fetch then a download -> no
        ("2026-09-21 12:00:00", "fetch", "no_video", None, "c", "tiktok"),
        ("2026-09-21 12:01:00", "download", "hd", None, "c", "tiktok"),
        # d fetched ok, e downloaded: different people -> no
        ("2026-09-22 09:00:00", "fetch", "ok", None, "d", "reddit"),
        ("2026-09-22 09:01:00", "download", "720p", None, "e", "reddit"),
    ])
    out = compute_report(s, "7d", 0, NOW)
    assert out["totals"]["downloaded_visitors"] == 1
    assert out["totals"]["downloads"] == 4


def test_new_vs_returning_split_counts_people_not_events():
    # visitors count DISTINCT people, not page-load events, and the two
    # buckets are non-overlapping: a brand-new visitor who browses multiple
    # pages fires one 'new' and one-or-more 'returning' events on the SAME
    # daily hash, yet must count as new only.
    s = seeded([
        ("2026-09-20 10:00:00", "visit", None, "BD", "vA", None, None, "new"),
        ("2026-09-20 10:01:00", "visit", None, "BD", "vA", None, None, "returning"),
        ("2026-09-20 10:02:00", "visit", None, "US", "vB", None, None, "returning"),
        ("2026-09-20 10:03:00", "visit", None, "US", "vB", None, None, "returning"),
        ("2026-09-20 10:04:00", "visit", None, "US", "vC", None, None, "new"),
        # non-visit rows carry no visitor_kind and must be ignored
        ("2026-09-20 10:05:00", "fetch", "ok", "US", "vA", None, None, None),
    ])
    out = compute_report(s, "7d", 0, NOW)
    assert out["totals"]["new_visitors"] == 2
    assert out["totals"]["returning_visitors"] == 1
    assert out["totals"]["page_views"] == 5


def test_today_has_no_complete_days():
    out = compute_report(_seed_week(), "today", 0, NOW)
    assert out["totals"]["complete_days"] == 0
    assert out["totals"]["complete_day_visitors"] == 0
    # today at tz 0 is [09-23 00:00, 07:30): v4 and v5 only
    assert out["totals"]["visitors"] == 2
    assert out["totals"]["downloads"] == 1


# ---- series ---------------------------------------------------------------------

def test_daily_series_keys_values_and_zero_fill():
    out = compute_report(_seed_week(), "7d", 0, NOW)
    rows = out["series"]
    assert [r["key"] for r in rows] == [
        "2026-09-17", "2026-09-18", "2026-09-19", "2026-09-20", "2026-09-21", "2026-09-22",
        "2026-09-23",
    ]
    assert [r["prev_key"] for r in rows] == [
        "2026-09-10", "2026-09-11", "2026-09-12", "2026-09-13", "2026-09-14", "2026-09-15",
        "2026-09-16",
    ]
    by_key = {r["key"]: r for r in rows}
    assert by_key["2026-09-17"]["cur"] == zeros()
    assert by_key["2026-09-20"]["cur"] == {"visitors": 2, "fetches": 2, "downloads": 1,
                                           "failed_fetches": 1}
    assert by_key["2026-09-21"]["cur"] == {"visitors": 1, "fetches": 1, "downloads": 0,
                                           "failed_fetches": 0}
    assert by_key["2026-09-22"]["cur"] == {"visitors": 1, "fetches": 2, "downloads": 1,
                                           "failed_fetches": 1}
    assert by_key["2026-09-23"]["cur"] == {"visitors": 2, "fetches": 0, "downloads": 1,
                                           "failed_fetches": 0}
    # previous series: vOld on 09-10, vP on 09-15, and the gap event on 09-16
    # sits after that day's 07:30 cut so the last previous bucket stays empty
    assert by_key["2026-09-17"]["prev"] == {"visitors": 1, "fetches": 0, "downloads": 0,
                                            "failed_fetches": 0}
    assert by_key["2026-09-22"]["prev"] == {"visitors": 1, "fetches": 1, "downloads": 0,
                                            "failed_fetches": 0}
    assert by_key["2026-09-23"]["prev"] == zeros()
    assert by_key["2026-09-18"]["prev"] == zeros()


def test_daily_series_buckets_by_local_day_at_tz_360():
    # current window at +360 is UTC [09-16 18:00, 09-23 07:30)
    s = seeded([
        # local 09-16 23:59:59: in the gap (previous ended at 09-16 07:30 UTC)
        ("2026-09-16 17:59:59", "fetch", "ok", None, "gap", "twitter"),
        # local 09-17 00:00:00: first second of the window
        ("2026-09-16 18:00:00", "visit", None, None, "first", "twitter", "direct", "new"),
        # local 09-23 02:00: today
        ("2026-09-22 20:00:00", "fetch", "ok", None, "late", "reddit"),
    ])
    out = compute_report(s, "7d", 360, NOW)
    assert out["has_previous"] is False
    by_key = {r["key"]: r for r in out["series"]}
    assert list(by_key) == ["2026-09-17", "2026-09-18", "2026-09-19", "2026-09-20",
                            "2026-09-21", "2026-09-22", "2026-09-23"]
    assert by_key["2026-09-17"]["cur"] == {"visitors": 1, "fetches": 0, "downloads": 0,
                                           "failed_fetches": 0}
    assert by_key["2026-09-23"]["cur"] == {"visitors": 1, "fetches": 1, "downloads": 0,
                                           "failed_fetches": 0}
    assert all(r["prev"] is None for r in out["series"])
    assert out["totals"]["fetches"] == 1


def test_hourly_series_today_at_minus_300_with_nulls_after_the_current_hour():
    # local now is 02:30 (hour 2); current [09-23 05:00, 07:30) UTC, previous
    # [09-22 05:00, 07:30) UTC.
    s = seeded([
        ("2026-09-22 05:00:00", "fetch", "ok", None, "v8", "twitter"),
        ("2026-09-22 06:00:00", "visit", None, None, "v7", "twitter", "direct", "new"),
        # local 09-22 23:59:59: neither window
        ("2026-09-23 04:59:59", "fetch", "ok", None, "v9", "twitter"),
        ("2026-09-23 05:00:00", "visit", None, None, "v1", "twitter", "direct", "new"),
        ("2026-09-23 06:10:00", "fetch", "ok", None, "v1", "twitter"),
        ("2026-09-23 07:29:59", "fetch", "ok", None, "v2", "tiktok"),
    ])
    out = compute_report(s, "today", -300, NOW)
    assert out["bucket"] == "hour"
    assert out["has_previous"] is True
    assert out["window"] == {"start": "2026-09-23", "end": "2026-09-23"}
    rows = out["series"]
    assert len(rows) == 24
    assert [r["key"] for r in rows] == list(range(24))
    assert [r["prev_key"] for r in rows] == list(range(24))
    assert rows[0]["cur"] == {"visitors": 1, "fetches": 0, "downloads": 0, "failed_fetches": 0}
    assert rows[0]["prev"] == {"visitors": 1, "fetches": 1, "downloads": 0, "failed_fetches": 0}
    assert rows[1]["cur"] == {"visitors": 1, "fetches": 1, "downloads": 0, "failed_fetches": 0}
    assert rows[1]["prev"] == {"visitors": 1, "fetches": 0, "downloads": 0, "failed_fetches": 0}
    assert rows[2]["cur"] == {"visitors": 1, "fetches": 1, "downloads": 0, "failed_fetches": 0}
    assert rows[2]["prev"] == zeros()
    for row in rows[3:]:
        assert row["cur"] is None and row["prev"] is None
    # v1 is active in hours 0 and 1 (counted in both buckets) but is one
    # visitor-day in the totals
    assert out["totals"]["visitors"] == 2
    assert out["totals"]["fetches"] == 2
    assert out["previous"]["visitors"] == 2
    assert out["previous"]["fetches"] == 1


def test_hourly_series_today_at_plus_360_cuts_after_hour_13():
    out = compute_report(seeded([]), "today", 360, NOW)
    rows = out["series"]
    assert [r["cur"] for r in rows[:14]] == [zeros()] * 14
    assert all(r["cur"] is None for r in rows[14:])
    # no previous period: prev is null in every bucket, not only after now
    assert all(r["prev"] is None for r in rows)
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd "$(git rev-parse --show-toplevel)/backend" && source .venv/bin/activate && pytest tests/test_report.py -q -p no:cacheprovider
```

Expected: a collection error, `ModuleNotFoundError: No module named 'app.analytics.report'` (`1 error`).

- [ ] **Step 3: Create report.py**

Create `backend/app/analytics/report.py` with exactly this content:

```python
"""Range analytics for the admin dashboard.

Every window bound is computed in Python from an injected `now` and the
owner's tz offset, then handed to SQLite as bound `ts >= ? AND ts < ?`
parameters in the stored UTC text format. Nothing here calls the database
clock: the same `now` always gives the same numbers, which is what makes the
report testable with a fixed clock and lets `idx_events_ts` serve every range.

Local-time grouping (days, hours) uses `datetime(ts, '<+/-N minutes>')` with
the validated integer offset inlined, as the old stats module did.
"""
import re
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from .store import Store

RANGES = {"today": 1, "7d": 7, "30d": 30, "90d": 90}
DEFAULT_RANGE = "7d"
_TS_FORMAT = "%Y-%m-%d %H:%M:%S"
_MAX_TZ = 840  # +/- 14 hours

# Standard resolution ladder (pixel heights). fxtwitter and reddit emit the raw
# source height as the quality label (`{height}p`), so odd-aspect / portrait
# videos produce non-standard values like 1124p or 1054p that would otherwise
# each become their own row in the qualities panel. We snap each raw height to
# the nearest rung for display; named labels (hd/sd/photo/... from TikTok) are
# not heights and pass through untouched.
# Note: the label is the source HEIGHT, so tall portrait clips bias upward (a
# 720x1280 portrait video is height 1280 and snaps to 1440p, not 1080p). That is
# inherent to bucketing by height, not a snapping bug.
_TIER_LADDER = (144, 240, 360, 480, 720, 1080, 1440, 2160)
_HEIGHT_LABEL = re.compile(r"^(\d+)p$")


def _bucket_quality(label: str) -> str:
    """Snap a `{height}p` quality label to the nearest standard tier; return any
    non-height label (hd, sd, video, photo, album, sound, ...) unchanged. Exact
    midpoint ties resolve to the lower tier (the quality actually guaranteed)."""
    m = _HEIGHT_LABEL.match(label)
    if not m:
        return label
    h = int(m.group(1))
    # min() scans the ascending ladder and keeps the FIRST minimal difference,
    # so an exact tie lands on the lower rung.
    tier = min(_TIER_LADDER, key=lambda t: abs(t - h))
    return f"{tier}p"


def parse_tz(raw) -> int:
    """Validate the timezone offset (minutes east of UTC). Must be an integer in
    [-840, 840]; anything else raises ValueError (guards the SQL modifier)."""
    if raw is None or raw == "":
        raise ValueError("tz required")
    if isinstance(raw, float) and not raw.is_integer():
        # int(3.5) would silently truncate to 3 instead of rejecting; a real
        # (non-HTTP) caller could pass a fractional float directly.
        raise ValueError("tz must be an integer")
    try:
        tz = int(raw)
    except (TypeError, ValueError) as exc:
        raise ValueError("tz must be an integer") from exc
    if tz < -_MAX_TZ or tz > _MAX_TZ:
        raise ValueError("tz out of range")
    return tz


def parse_range(raw: str | None) -> str:
    """An omitted or empty range means the default (7d); anything not in RANGES
    raises ValueError so the router can answer 422 bad_range."""
    if raw is None or raw == "":
        return DEFAULT_RANGE
    if raw not in RANGES:
        raise ValueError("bad range")
    return raw


def _tzmod(tz: int) -> str:
    # tz is a validated int, safe to inline into the SQLite datetime modifier.
    sign = "+" if tz >= 0 else "-"
    return f"{sign}{abs(tz)} minutes"


def _local(tz: int) -> str:
    return f"datetime(ts, '{_tzmod(tz)}')"


def _fmt(dt: datetime) -> str:
    return dt.strftime(_TS_FORMAT)


def _utc_text(local: datetime, tz: int) -> str:
    """A naive local wall-clock instant as stored UTC text."""
    return _fmt(local - timedelta(minutes=tz))


def _local_now(now: datetime, tz: int) -> datetime:
    """`now` (aware) as naive local wall time: L = now + tz minutes."""
    if now.tzinfo is None:
        raise ValueError("now must be timezone-aware")
    return now.astimezone(UTC).replace(tzinfo=None) + timedelta(minutes=tz)


@dataclass(frozen=True)
class Window:
    """A half-open local-time window [start, end) and its UTC text bounds.

    `start` and `end` are naive local wall-clock datetimes; the SQL bounds are
    the same instants converted back to UTC text, so `ts >= start_utc AND
    ts < end_utc` selects exactly the events inside the local window."""

    start: datetime
    end: datetime
    tz: int

    @property
    def start_utc(self) -> str:
        return _utc_text(self.start, self.tz)

    @property
    def end_utc(self) -> str:
        return _utc_text(self.end, self.tz)

    @property
    def last_midnight_utc(self) -> str:
        """UTC text of local midnight on the window's last day: the complete
        days are [start, last midnight), the partial day is the rest."""
        midnight = self.end.replace(hour=0, minute=0, second=0, microsecond=0)
        return _utc_text(midnight, self.tz)

    @property
    def first_date(self) -> str:
        return self.start.date().isoformat()

    @property
    def last_date(self) -> str:
        return self.end.date().isoformat()


def windows(range_key: str, tz: int, now: datetime) -> tuple[Window, Window]:
    """Current and previous windows for a range (spec B2).

    With L = now + tz minutes and M0 = local midnight of L's date, the current
    window is local [M0 - (N-1) days, L) and the previous one is the current
    window shifted back by exactly N days: same length, same time-of-day cut."""
    n = RANGES[range_key]
    local_now = _local_now(now, tz)
    m0 = local_now.replace(hour=0, minute=0, second=0, microsecond=0)
    current = Window(m0 - timedelta(days=n - 1), local_now, tz)
    previous = Window(current.start - timedelta(days=n), local_now - timedelta(days=n), tz)
    return current, previous


def has_previous(store: Store, previous: Window) -> bool:
    """True only when the oldest retained event is at or before the previous
    window's start, so a delta never compares against a half-covered period."""
    rows = store.query("SELECT MIN(ts) AS m FROM events", [])
    oldest = rows[0]["m"] if rows else None
    return oldest is not None and oldest <= previous.start_utc


# ---- totals ----------------------------------------------------------------

_COUNTS_SQL = (
    "SELECT "
    "COALESCE(SUM(CASE WHEN type='visit' THEN 1 ELSE 0 END), 0) AS page_views, "
    "COALESCE(SUM(CASE WHEN type='fetch' THEN 1 ELSE 0 END), 0) AS fetches, "
    "COALESCE(SUM(CASE WHEN type='fetch' AND outcome='ok' THEN 1 ELSE 0 END), 0) AS ok_fetches, "
    "COALESCE(SUM(CASE WHEN type='fetch' AND outcome IS NOT NULL AND outcome != 'ok' "
    "THEN 1 ELSE 0 END), 0) AS failed_fetches, "
    "COALESCE(SUM(CASE WHEN type='fetch' AND outcome='upstream_error' THEN 1 ELSE 0 END), 0) "
    "AS upstream_errors, "
    "COALESCE(SUM(CASE WHEN type='download' THEN 1 ELSE 0 END), 0) AS downloads "
    "FROM events WHERE ts >= ? AND ts < ?"
)

_KINDS_SQL = (
    "SELECT "
    "COALESCE(SUM(CASE WHEN n > 0 THEN 1 ELSE 0 END), 0) AS new_visitors, "
    "COALESCE(SUM(CASE WHEN n = 0 AND r > 0 THEN 1 ELSE 0 END), 0) AS returning_visitors "
    "FROM (SELECT visitor, "
    "SUM(CASE WHEN visitor_kind='new' THEN 1 ELSE 0 END) AS n, "
    "SUM(CASE WHEN visitor_kind='returning' THEN 1 ELSE 0 END) AS r "
    "FROM events WHERE ts >= ? AND ts < ? AND type='visit' GROUP BY visitor)"
)


def _visitor_days(store: Store, tz: int, start_utc: str, end_utc: str) -> dict:
    """Visitor-day summary of a UTC text range: one row per distinct (local day,
    visitor) with what that person did that day, then nested counts. `visitors`
    is the sum over local days of COUNT(DISTINCT visitor); `downloaded` needs an
    ok fetch AND a download on the same visitor-day."""
    local = _local(tz)
    rows = store.query(
        "SELECT COUNT(*) AS visitors, "
        "COALESCE(SUM(f), 0) AS fetched, "
        "COALESCE(SUM(o), 0) AS got_result, "
        "COALESCE(SUM(CASE WHEN o = 1 AND d = 1 THEN 1 ELSE 0 END), 0) AS downloaded "
        f"FROM (SELECT date({local}) AS day, visitor, "
        "MAX(CASE WHEN type='fetch' THEN 1 ELSE 0 END) AS f, "
        "MAX(CASE WHEN type='fetch' AND outcome='ok' THEN 1 ELSE 0 END) AS o, "
        "MAX(CASE WHEN type='download' THEN 1 ELSE 0 END) AS d "
        "FROM events WHERE ts >= ? AND ts < ? GROUP BY day, visitor)",
        [start_utc, end_utc],
    )
    return rows[0]


def totals(store: Store, window: Window, n: int) -> dict:
    """The totals block (spec B3) for one window. `n` is the range length in
    days: complete days are the N-1 before the partial last day (0 for today)."""
    counts = store.query(_COUNTS_SQL, [window.start_utc, window.end_utc])[0]
    days = _visitor_days(store, window.tz, window.start_utc, window.end_utc)
    kinds = store.query(_KINDS_SQL, [window.start_utc, window.end_utc])[0]
    complete_days = n - 1
    if complete_days:
        complete = _visitor_days(store, window.tz, window.start_utc, window.last_midnight_utc)
        complete_day_visitors = complete["visitors"]
    else:
        complete_day_visitors = 0
    return {
        "visitors": days["visitors"],
        "page_views": counts["page_views"],
        "fetches": counts["fetches"],
        "ok_fetches": counts["ok_fetches"],
        "failed_fetches": counts["failed_fetches"],
        "upstream_errors": counts["upstream_errors"],
        "downloads": counts["downloads"],
        "downloaded_visitors": days["downloaded"],
        "new_visitors": kinds["new_visitors"],
        "returning_visitors": kinds["returning_visitors"],
        "complete_days": complete_days,
        "complete_day_visitors": complete_day_visitors,
    }


# ---- series ----------------------------------------------------------------

_SERIES_VALUES = (
    "COUNT(DISTINCT visitor) AS visitors, "
    "COALESCE(SUM(CASE WHEN type='fetch' THEN 1 ELSE 0 END), 0) AS fetches, "
    "COALESCE(SUM(CASE WHEN type='download' THEN 1 ELSE 0 END), 0) AS downloads, "
    "COALESCE(SUM(CASE WHEN type='fetch' AND outcome IS NOT NULL AND outcome != 'ok' "
    "THEN 1 ELSE 0 END), 0) AS failed_fetches"
)


def _zero_point() -> dict:
    return {"visitors": 0, "fetches": 0, "downloads": 0, "failed_fetches": 0}


def _point(row: dict) -> dict:
    return {
        "visitors": row["visitors"],
        "fetches": row["fetches"],
        "downloads": row["downloads"],
        "failed_fetches": row["failed_fetches"],
    }


def _daily_points(store: Store, window: Window) -> dict[str, dict]:
    local = _local(window.tz)
    rows = store.query(
        f"SELECT date({local}) AS key, {_SERIES_VALUES} "
        "FROM events WHERE ts >= ? AND ts < ? GROUP BY key",
        [window.start_utc, window.end_utc],
    )
    return {r["key"]: _point(r) for r in rows}


def _hourly_points(store: Store, window: Window) -> dict[int, dict]:
    local = _local(window.tz)
    rows = store.query(
        f"SELECT CAST(strftime('%H', {local}) AS INTEGER) AS key, {_SERIES_VALUES} "
        "FROM events WHERE ts >= ? AND ts < ? GROUP BY key",
        [window.start_utc, window.end_utc],
    )
    return {int(r["key"]): _point(r) for r in rows}


def series(store: Store, current: Window, previous: Window, n: int, bucket: str,
           with_previous: bool) -> list[dict]:
    """One row per bucket (spec B2 buckets). Hourly for today: integer keys
    0..23, null values after the current local hour in both series. Daily
    otherwise: N local dates oldest first, zero-filled; bucket i of the previous
    series is local day M0 - (2N-1) + i."""
    if bucket == "hour":
        cur = _hourly_points(store, current)
        prev = _hourly_points(store, previous) if with_previous else {}
        last_hour = current.end.hour
        out = []
        for h in range(24):
            if h > last_hour:
                out.append({"key": h, "prev_key": h, "cur": None, "prev": None})
                continue
            out.append({
                "key": h,
                "prev_key": h,
                "cur": cur.get(h, _zero_point()),
                "prev": prev.get(h, _zero_point()) if with_previous else None,
            })
        return out
    cur = _daily_points(store, current)
    prev = _daily_points(store, previous) if with_previous else {}
    out = []
    for i in range(n):
        key = (current.start.date() + timedelta(days=i)).isoformat()
        prev_key = (previous.start.date() + timedelta(days=i)).isoformat()
        out.append({
            "key": key,
            "prev_key": prev_key,
            "cur": cur.get(key, _zero_point()),
            "prev": prev.get(prev_key, _zero_point()) if with_previous else None,
        })
    return out


# ---- entry point -----------------------------------------------------------

def compute_report(store: Store, range_key: str, tz: int, now: datetime) -> dict:
    """The report core (spec B4 minus the panels, which Task 3 adds to this
    same dict). `range_key` must come from parse_range and `tz` from parse_tz;
    `now` is an aware datetime (the router passes datetime.now(UTC))."""
    n = RANGES[range_key]
    current, previous = windows(range_key, tz, now)
    bucket = "hour" if range_key == "today" else "day"
    with_previous = has_previous(store, previous)
    return {
        "range": range_key,
        "tz": tz,
        "bucket": bucket,
        "has_previous": with_previous,
        "window": {"start": current.first_date, "end": current.last_date},
        "totals": totals(store, current, n),
        "previous": totals(store, previous, n) if with_previous else None,
        "series": series(store, current, previous, n, bucket, with_previous),
    }
```

- [ ] **Step 4: Make stats.py import the moved helpers back**

In `backend/app/analytics/stats.py`, delete everything above `def _local(tz: int) -> str:` (lines 1 to 57: `import re`, the `_MAX_TZ` line, the ladder comment block, `_TIER_LADDER`, `_HEIGHT_LABEL`, `_bucket_quality`, `parse_tz`, `_tzmod` and the two blank lines after it) and put this block in its place; its two trailing blank lines become the only ones before `def _local`. `def _local` (old line 58) and everything below it stay exactly as they are.

```python
from .report import _TIER_LADDER, _bucket_quality, _tzmod, parse_tz  # noqa: F401
from .store import Store

# parse_tz, _tzmod, _bucket_quality and _TIER_LADDER moved to report.py and are
# re-exported here (hence the noqa) so router.py and tests/test_stats.py keep
# importing them from this module until the cleanup task deletes it.


```

The file must now start with those two imports, the comment, two blank lines, then `def _local(tz: int) -> str:`. `router.py` still does `from .stats import compute_stats, parse_tz` and keeps working through the re-export; Task 5 switches it to `.report`.

- [ ] **Step 5: Run the tests to verify they pass**

```bash
cd "$(git rev-parse --show-toplevel)/backend" && source .venv/bin/activate && pytest tests/test_report.py -q -p no:cacheprovider
```

Expected: `37 passed`.

- [ ] **Step 6: Run the task gate**

```bash
cd "$(git rev-parse --show-toplevel)/backend" && source .venv/bin/activate && ruff check . && pytest -q -p no:cacheprovider
```

Expected: `All checks passed!`, then `7 failed, 522 passed, 7 warnings`. The 7 failures are all `tests/test_stats.py::...` (the known baseline); nothing else fails.

- [ ] **Step 7: Commit**

```bash
cd "$(git rev-parse --show-toplevel)" && git add backend/app/analytics/report.py backend/app/analytics/stats.py backend/tests/test_report.py && git commit -m "feat(admin): report core with an injectable clock and bound windows

compute_report(store, range, tz, now) computes every window bound in
Python and binds it as ts >= ? AND ts < ?. parse_tz, _tzmod and
_bucket_quality move to report.py; stats.py imports them back.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Page language on visit events

**Files:**
- Modify: `backend/app/analytics/router.py:31-36` (`EventIn` fields), `:66-71` (add the `locale` validator after `_visitor_kind`), `:96-105` (`event()`)
- Modify: `backend/app/analytics/store.py:34-36` (add `_ensure_locale_column`), `:59-63` and `:121-125` (both migration lists)
- Modify: `backend/app/analytics/recorder.py` (whole file, 83 lines)
- Modify: `backend/app/analytics/service.py:30-44` (`record_from_request` signature and the `record` call)
- Modify: `scripts/migrate_analytics.py:20-31` (column lists)
- Modify: `frontend/src/lib/analytics.ts` (whole file, 108 lines)
- Test: `backend/tests/test_analytics_api.py` (append), `backend/tests/test_store.py` (append), `backend/tests/test_recorder.py` (append, plus one index edit at lines 91-93), `backend/tests/test_migrate_analytics.py:67-71` (expected row), `frontend/src/lib/analytics.test.ts` (append)

**Interfaces:**
- Consumes: `Recorder.record(...)` and `AnalyticsService.record_from_request(...)` as they are today; `_ensure_platform_column` style migrations in `store.py`; `visitContext()` in `frontend/src/lib/analytics.ts`.
- Produces: `EventIn.locale: str | None` accepting only `en`, `es`, `hi` (422 otherwise), kept for `visit` events and dropped for `download`; `_ensure_locale_column(existing_cols: set[str]) -> list[str]`; a `locale TEXT` column in the `events` table on both stores; `Recorder.record(type, visitor, outcome=None, country=None, platform=None, source=None, visitor_kind=None, locale=None)` writing a 9-value row `(ts, type, outcome, country, visitor, platform, source, visitor_kind, locale)`; `AnalyticsService.record_from_request(request, type, outcome, platform=None, source=None, visitor_kind=None, locale=None)`; `visitContext(): { source: string; visitor_kind: string; locale?: string }` and `sendEvent` accepting `locale`. Task 3's `pages` panel and Task 4's service rewrite depend on these.

- [ ] **Step 1: Write the failing backend tests**

Append to the end of `backend/tests/test_analytics_api.py`, two blank lines after its last line (the `enabled_client` fixture at the top of that file is reused):

```python
def test_visit_event_records_locale(enabled_client):
    client, svc, store = enabled_client
    for locale in ("en", "es", "hi"):
        r = client.post("/api/event", json={"type": "visit", "locale": locale})
        assert r.status_code == 204, locale
    svc.recorder().flush()
    rows = store.query("SELECT locale FROM events WHERE type='visit' ORDER BY id", [])
    assert [r["locale"] for r in rows] == ["en", "es", "hi"]


def test_visit_event_without_locale_stores_null(enabled_client):
    client, svc, store = enabled_client
    assert client.post("/api/event", json={"type": "visit"}).status_code == 204
    svc.recorder().flush()
    assert store.query("SELECT locale FROM events", []) == [{"locale": None}]


def test_visit_event_rejects_bad_locale(enabled_client):
    client, *_ = enabled_client
    for bad in ("fr", "EN", "en-US", "", "es "):
        r = client.post("/api/event", json={"type": "visit", "locale": bad})
        assert r.status_code == 422, bad


def test_download_event_drops_locale(enabled_client):
    client, svc, store = enabled_client
    r = client.post(
        "/api/event", json={"type": "download", "quality": "hd", "platform": "tiktok", "locale": "es"}
    )
    assert r.status_code == 204
    svc.recorder().flush()
    rows = store.query("SELECT locale FROM events WHERE type='download'", [])
    assert rows == [{"locale": None}]
```

Append to the end of `backend/tests/test_store.py`, two blank lines after its last line (`SqliteStore` and `TursoStore` are already imported there):

```python
def test_ensure_locale_column_is_a_pure_migration_step():
    from app.analytics.store import _ensure_locale_column
    assert _ensure_locale_column({"id", "ts", "locale"}) == []
    assert _ensure_locale_column({"id", "ts"}) == ["ALTER TABLE events ADD COLUMN locale TEXT"]


def test_locale_column_present_and_idempotent():
    s = SqliteStore(":memory:")
    s.init_schema()
    s.init_schema()  # second call must not raise (migration idempotent)
    s.execute_many([(
        ("INSERT INTO events (ts, type, outcome, country, visitor, source, visitor_kind, locale) "
         "VALUES (?,?,?,?,?,?,?,?)"),
        ["2026-09-20 10:00:00", "visit", None, None, "vh", "direct", "new", "hi"],
    )])
    rows = s.query("SELECT locale FROM events", [])
    assert rows[0]["locale"] == "hi"


def test_locale_alter_migration_on_legacy_table():
    # Simulate the production table from before this change: every column
    # except locale. init_schema must ALTER it in, idempotently.
    s = SqliteStore(":memory:")
    s._conn.execute("""CREATE TABLE events (
        id      INTEGER PRIMARY KEY AUTOINCREMENT,
        ts      TEXT NOT NULL,
        type    TEXT NOT NULL,
        outcome TEXT,
        country TEXT,
        visitor TEXT NOT NULL,
        platform TEXT,
        source TEXT,
        visitor_kind TEXT
    )""")
    s._conn.commit()

    cols_before = {r[1] for r in s._conn.execute("PRAGMA table_info(events)")}
    assert "locale" not in cols_before

    s.init_schema()  # exercises the ALTER TABLE ... ADD COLUMN path
    cols_after = {r[1] for r in s._conn.execute("PRAGMA table_info(events)")}
    assert "locale" in cols_after

    s.init_schema()  # second call must be idempotent, no raise

    s.execute_many([(
        "INSERT INTO events (ts, type, outcome, country, visitor, locale) VALUES (?,?,?,?,?,?)",
        ["2026-09-20 11:00:00", "visit", None, None, "vl", "es"],
    )])
    assert s.query("SELECT locale FROM events", [])[0]["locale"] == "es"


LEGACY_COLS = ("id", "ts", "type", "outcome", "country", "visitor", "platform", "source",
               "visitor_kind")


def _turso_with_fake_pipeline(monkeypatch, cols):
    # TursoStore.init_schema talks HTTP; stand the pipeline in with a recorder
    # and answer the PRAGMA through query() so no network is involved.
    store = TursoStore("libsql://db.turso.io", "tok")
    pipelines: list[list[str]] = []
    monkeypatch.setattr(store, "_pipeline", lambda stmts: pipelines.append([s for s, _ in stmts]))
    monkeypatch.setattr(store, "query", lambda sql, args: [{"name": c} for c in cols])
    return store, pipelines


def test_turso_init_schema_adds_the_locale_column_when_missing(monkeypatch):
    store, pipelines = _turso_with_fake_pipeline(monkeypatch, LEGACY_COLS)
    store.init_schema()
    assert pipelines[-1] == ["ALTER TABLE events ADD COLUMN locale TEXT"]


def test_turso_init_schema_is_idempotent_once_locale_exists(monkeypatch):
    store, pipelines = _turso_with_fake_pipeline(monkeypatch, LEGACY_COLS + ("locale",))
    store.init_schema()
    assert len(pipelines) == 1  # only the CREATE IF NOT EXISTS pipeline, no ALTER
    assert not any("locale" in sql for sql in pipelines[0])
```

Append to the end of `backend/tests/test_recorder.py`, two blank lines after its last line (`Recorder` and `SqliteStore` are already imported there):

```python
def test_record_writes_locale_and_defaults_it_to_null():
    s = SqliteStore(":memory:")
    s.init_schema()
    r = Recorder(s)
    r.record("visit", visitor="vh", source="search", visitor_kind="new", locale="hi")
    r.record("download", visitor="vh", outcome="hd", platform="tiktok")
    r.flush()
    rows = s.query("SELECT type, locale FROM events ORDER BY id", [])
    assert rows == [{"type": "visit", "locale": "hi"}, {"type": "download", "locale": None}]
```

Still in `backend/tests/test_recorder.py`, inside `test_flush_swallows_store_failure_then_recovers` (lines 91 to 93), the row grows by one value at the end, so replace

```python
    # Each statement is (_INSERT, [ts, type, outcome, country, visitor, platform,
    # source, visitor_kind]); visitor is at index -4, platform at -3.
    assert store.batches[0][0][1][-4] == "v2"
```

with

```python
    # Each statement is (_INSERT, [ts, type, outcome, country, visitor, platform,
    # source, visitor_kind, locale]); visitor is at index 4.
    assert store.batches[0][0][1][4] == "v2"
```

In `backend/tests/test_migrate_analytics.py`, the expected row in `test_copy_events_copies_everything_field_for_field` (lines 67 to 71) gains the new column. Replace

```python
        "country": "BD", "visitor": "visitor-2", "platform": None, "source": "direct",
        "visitor_kind": None,
    }
```

with

```python
        "country": "BD", "visitor": "visitor-2", "platform": None, "source": "direct",
        "visitor_kind": None, "locale": None,
    }
```

- [ ] **Step 2: Run the backend tests to verify they fail**

```bash
cd "$(git rev-parse --show-toplevel)/backend" && source .venv/bin/activate && pytest tests/test_analytics_api.py tests/test_store.py tests/test_recorder.py tests/test_migrate_analytics.py -q -p no:cacheprovider
```

Expected: `10 failed, 42 passed`. `test_visit_event_records_locale`, `test_visit_event_without_locale_stores_null` and `test_download_event_drops_locale` fail with `sqlite3.OperationalError: no such column: locale` (pydantic ignores the unknown field, so the POST is a 204 and the SELECT explodes); `test_visit_event_rejects_bad_locale` with `AssertionError: fr` (a 204 where a 422 is expected); `test_ensure_locale_column_is_a_pure_migration_step` with `ImportError: cannot import name '_ensure_locale_column'`; `test_locale_column_present_and_idempotent` with `table events has no column named locale`; `test_locale_alter_migration_on_legacy_table` with `assert 'locale' in {...}`; `test_turso_init_schema_adds_the_locale_column_when_missing` with the CREATE pipeline where the ALTER is expected; `test_record_writes_locale_and_defaults_it_to_null` with `TypeError: Recorder.record() got an unexpected keyword argument 'locale'`; `test_copy_events_copies_everything_field_for_field` with an `AssertionError` (no `locale` key). `test_turso_init_schema_is_idempotent_once_locale_exists` passes already (no ALTER is emitted either way); it pins idempotence once the migration exists. Everything else in those files still passes.

- [ ] **Step 3: Add the migration to store.py**

In `backend/app/analytics/store.py`, directly after `_ensure_visitor_kind_column` (after line 36) add:

```python


def _ensure_locale_column(existing_cols: set[str]) -> list[str]:
    """Return the ALTER statements needed to add the locale column, or []."""
    return [] if "locale" in existing_cols else ["ALTER TABLE events ADD COLUMN locale TEXT"]
```

In `SqliteStore.init_schema` replace

```python
            migrations = (
                _ensure_platform_column(cols)
                + _ensure_source_column(cols)
                + _ensure_visitor_kind_column(cols)
            )
```

with

```python
            migrations = (
                _ensure_platform_column(cols)
                + _ensure_source_column(cols)
                + _ensure_visitor_kind_column(cols)
                + _ensure_locale_column(cols)
            )
```

and in `TursoStore.init_schema` replace

```python
        migration = (
            _ensure_platform_column(cols)
            + _ensure_source_column(cols)
            + _ensure_visitor_kind_column(cols)
        )
```

with

```python
        migration = (
            _ensure_platform_column(cols)
            + _ensure_source_column(cols)
            + _ensure_visitor_kind_column(cols)
            + _ensure_locale_column(cols)
        )
```

The `SCHEMA` `CREATE TABLE` stays as it is: a fresh table gets the column through the same migration on first `init_schema`, exactly like `platform`, `source` and `visitor_kind` do today.

- [ ] **Step 4: Replace recorder.py**

Replace the entire contents of `backend/app/analytics/recorder.py` with:

```python
import logging
import threading
from collections import deque
from datetime import UTC, datetime

from .store import Store

logger = logging.getLogger("savevidai.analytics")

_INSERT = (
    "INSERT INTO events (ts, type, outcome, country, visitor, platform, source, visitor_kind, "
    "locale) VALUES (?,?,?,?,?,?,?,?,?)"
)


class Recorder:
    """Fire-and-forget event recording. record() never blocks on I/O; a background
    thread batches inserts. If the queue is full, the oldest event is dropped."""

    def __init__(self, store: Store, max_queue: int = 1000, batch_interval: float = 5.0,
                 prune_days: int = 90):
        self._store = store
        self._max = max_queue
        self._interval = batch_interval
        self._prune_days = prune_days
        self._q: deque[tuple] = deque()
        self._lock = threading.Lock()
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._cycles = 0
        self.dropped = 0

    def record(self, type: str, visitor: str, outcome: str | None = None,
               country: str | None = None, platform: str | None = None,
               source: str | None = None, visitor_kind: str | None = None,
               locale: str | None = None) -> None:
        ts = datetime.now(UTC).strftime("%Y-%m-%d %H:%M:%S")
        dropped = False
        with self._lock:
            if len(self._q) >= self._max:
                self._q.popleft()
                self.dropped += 1
                dropped = True
            self._q.append((ts, type, outcome, country, visitor, platform, source, visitor_kind,
                            locale))
        # Log outside the lock: logging can do slow I/O and must never block
        # record() while holding the lock that flush() also needs.
        if dropped:
            logger.warning("analytics queue full, dropped oldest event")

    def flush(self) -> int:
        with self._lock:
            batch = list(self._q)
            self._q.clear()
        if not batch:
            return 0
        try:
            self._store.execute_many([(_INSERT, list(row)) for row in batch])
        except Exception as exc:  # store/network failure must not propagate
            logger.warning("analytics flush failed, %d events lost: %r", len(batch), exc)
            return 0
        return len(batch)

    def prune(self) -> None:
        try:
            self._store.execute_many(
                [("DELETE FROM events WHERE ts < datetime('now', ?)", [f"-{self._prune_days} days"])]
            )
        except Exception as exc:
            logger.warning("analytics prune failed: %r", exc)

    def _loop(self) -> None:
        # Flush every interval; prune roughly hourly (720 * 5s).
        while not self._stop.wait(self._interval):
            self.flush()
            self._cycles += 1
            if self._cycles % 720 == 0:
                self.prune()

    def start(self) -> None:
        if self._thread is None:
            self._thread = threading.Thread(target=self._loop, daemon=True)
            self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        self.flush()
```

- [ ] **Step 5: Pass locale through the service**

In `backend/app/analytics/service.py` replace the `record_from_request` signature

```python
    def record_from_request(self, request: Request, type: str, outcome: str | None,
                            platform: str | None = None, source: str | None = None,
                            visitor_kind: str | None = None) -> None:
```

with

```python
    def record_from_request(self, request: Request, type: str, outcome: str | None,
                            platform: str | None = None, source: str | None = None,
                            visitor_kind: str | None = None,
                            locale: str | None = None) -> None:
```

and the `record` call

```python
            self._recorder.record(type, visitor=self._visitor(request), outcome=outcome,
                                  country=country, platform=platform, source=source,
                                  visitor_kind=visitor_kind)
```

with

```python
            self._recorder.record(type, visitor=self._visitor(request), outcome=outcome,
                                  country=country, platform=platform, source=source,
                                  visitor_kind=visitor_kind, locale=locale)
```

(Task 4 rewrites this method; this is the minimal change so the column flows today.)

- [ ] **Step 6: Accept and validate locale in the router**

In `backend/app/analytics/router.py`, in `EventIn` add the field after `visitor_kind`:

```python
    visitor_kind: str | None = None
    locale: str | None = None
```

add the validator directly after `_visitor_kind` (inside the class, one blank line after its `return v`):

```python
    @field_validator("locale")
    @classmethod
    def _locale(cls, v):
        if v is not None and v not in ("en", "es", "hi"):
            raise ValueError("bad locale")
        return v
```

and make `event()` keep it for visits only:

```python
@router.post("/api/event", status_code=204)
@limiter.limit("30/minute")
def event(request: Request, payload: EventIn) -> Response:
    _require_enabled()
    outcome = payload.quality if payload.type == "download" else None
    source = payload.source if payload.type == "visit" else None
    visitor_kind = payload.visitor_kind if payload.type == "visit" else None
    locale = payload.locale if payload.type == "visit" else None
    service.record_from_request(request, payload.type, outcome, platform=payload.platform,
                                source=source, visitor_kind=visitor_kind, locale=locale)
    return Response(status_code=204)
```

- [ ] **Step 7: Keep the migration script faithful**

In `scripts/migrate_analytics.py` replace

```python
EVENT_COLUMNS = ["id", "ts", "type", "outcome", "country", "visitor",
                 "platform", "source", "visitor_kind"]

_SELECT = (
    "SELECT id, ts, type, outcome, country, visitor, platform, source, visitor_kind "
    "FROM events ORDER BY id"
)
_INSERT = (
    "INSERT INTO events "
    "(id, ts, type, outcome, country, visitor, platform, source, visitor_kind) "
    "VALUES (?,?,?,?,?,?,?,?,?)"
)
```

with

```python
EVENT_COLUMNS = ["id", "ts", "type", "outcome", "country", "visitor",
                 "platform", "source", "visitor_kind", "locale"]

_SELECT = (
    "SELECT id, ts, type, outcome, country, visitor, platform, source, visitor_kind, locale "
    "FROM events ORDER BY id"
)
_INSERT = (
    "INSERT INTO events "
    "(id, ts, type, outcome, country, visitor, platform, source, visitor_kind, locale) "
    "VALUES (?,?,?,?,?,?,?,?,?,?)"
)
```

- [ ] **Step 8: Run the backend tests to verify they pass**

```bash
cd "$(git rev-parse --show-toplevel)/backend" && source .venv/bin/activate && pytest tests/test_analytics_api.py tests/test_store.py tests/test_recorder.py tests/test_migrate_analytics.py tests/test_report.py -q -p no:cacheprovider
```

Expected: `89 passed` (20 + 17 + 10 + 5 + 37).

- [ ] **Step 9: Write the failing frontend tests**

Append to the end of `frontend/src/lib/analytics.test.ts`, one blank line after its last line (the file already imports `afterEach, expect, test, vi` and `classifySource, sendEvent, visitContext`, and unstubs globals after each test):

```ts
function stubVisitGlobals(lang?: string) {
  const store: Record<string, string> = {};
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => {
      store[k] = v;
    },
    removeItem: (k: string) => {
      delete store[k];
    },
  });
  vi.stubGlobal(
    "document",
    lang === undefined ? { referrer: "" } : { referrer: "", documentElement: { lang } },
  );
  vi.stubGlobal("location", { hostname: "savevidai.israfill.dev" });
}

test("visitContext reads the page language from <html lang>", () => {
  for (const lang of ["en", "es", "hi"]) {
    stubVisitGlobals(lang);
    expect(visitContext()).toEqual({ source: "direct", visitor_kind: "new", locale: lang });
  }
});

test("visitContext omits locale for any other language or when lang is missing", () => {
  for (const lang of ["fr", "en-US", "EN", ""]) {
    stubVisitGlobals(lang);
    const ctx = visitContext();
    expect(ctx).toEqual({ source: "direct", visitor_kind: "new" });
    expect(ctx).not.toHaveProperty("locale");
  }
  stubVisitGlobals(undefined);
  expect(visitContext()).not.toHaveProperty("locale");
});

test("a visit beacon carries the locale next to source and visitor_kind", () => {
  stubVisitGlobals("hi");
  const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
    new Response(null, { status: 204 }),
  );
  vi.stubGlobal("fetch", fetchMock);
  sendEvent("visit", { platform: "tiktok", ...visitContext() });
  const [, init] = fetchMock.mock.calls[0];
  expect(JSON.parse(String(init?.body))).toEqual({
    type: "visit",
    platform: "tiktok",
    source: "direct",
    visitor_kind: "new",
    locale: "hi",
  });
});
```

Run them:

```bash
cd "$(git rev-parse --show-toplevel)/frontend" && npx vitest run src/lib/analytics.test.ts
```

Expected: 2 failed (`visitContext reads the page language from <html lang>` and `a visit beacon carries the locale next to source and visitor_kind`: the received object has no `locale`), 9 passed. The negative test passes already; it pins the omit rule.

- [ ] **Step 10: Report the page language from visitContext**

Replace the entire contents of `frontend/src/lib/analytics.ts` with:

```ts
type EventType = "visit" | "download";

/** Fire-and-forget analytics beacon. No personal data, never throws, never blocks. */
export function sendEvent(
  type: EventType,
  opts: {
    quality?: string;
    platform?: string;
    source?: string;
    visitor_kind?: string;
    locale?: string;
  } = {},
): void {
  try {
    const body = JSON.stringify({ type, ...opts });
    void fetch("/api/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // analytics must never affect the user
  }
}

// Search engines matched by a token contained in the host, so subdomains and
// TLD variants (www.google.com, google.co.uk, search.brave.com) all resolve.
const SEARCH_TOKENS = [
  "google.",
  "bing.",
  "duckduckgo.",
  "yahoo.",
  "ecosia.",
  "baidu.",
  "yandex.",
  "brave.",
];

// Social hosts matched by exact host or a dot-boundary suffix, so reddit.com and
// www.reddit.com match but notreddit.com does not.
const SOCIAL_HOSTS = [
  "twitter.com",
  "x.com",
  "reddit.com",
  "facebook.com",
  "instagram.com",
  "tiktok.com",
  "youtube.com",
  "youtu.be",
  "linkedin.com",
  "pinterest.com",
];

/**
 * Classify a referrer into a coarse, privacy-safe bucket. Pure: no globals.
 * Returns one of: direct, internal, search, social, referral.
 */
export function classifySource(referrer: string, currentHost: string): string {
  if (!referrer || !referrer.trim()) return "direct";

  let host: string;
  try {
    host = new URL(referrer).hostname.toLowerCase();
  } catch {
    return "direct";
  }

  if (host === currentHost.toLowerCase()) return "internal";

  if (SEARCH_TOKENS.some((token) => host.includes(token))) return "search";

  if (host === "t.co") return "social";
  if (SOCIAL_HOSTS.some((d) => host === d || host.endsWith("." + d))) {
    return "social";
  }

  return "referral";
}

// The page language as the shells set it on <html lang>. Only the three
// languages the site ships are reported; anything else omits the field.
const LOCALES = new Set(["en", "es", "hi"]);

function pageLocale(): string | undefined {
  try {
    const lang = document.documentElement?.lang;
    return typeof lang === "string" && LOCALES.has(lang) ? lang : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Read the current page context for a visit beacon. Guards every global access
 * so it never throws; falls back to a direct/new visit on any failure.
 */
export function visitContext(): { source: string; visitor_kind: string; locale?: string } {
  try {
    const source = classifySource(
      document.referrer || "",
      location.hostname,
    );

    let visitor_kind = "new";
    try {
      if (localStorage.getItem("svai_seen")) {
        visitor_kind = "returning";
      } else {
        localStorage.setItem("svai_seen", "1");
      }
    } catch {
      // private mode can throw; treat as a new visit without persisting
      visitor_kind = "new";
    }

    const locale = pageLocale();
    return locale ? { source, visitor_kind, locale } : { source, visitor_kind };
  } catch {
    return { source: "direct", visitor_kind: "new" };
  }
}
```

- [ ] **Step 11: Run the frontend tests and the type check**

```bash
cd "$(git rev-parse --show-toplevel)/frontend" && npx vitest run src/lib/analytics.test.ts && npm run lint
```

Expected: `11 passed`, then `tsc --noEmit` exits 0 with no output.

- [ ] **Step 12: Run the task gates**

```bash
cd "$(git rev-parse --show-toplevel)/backend" && source .venv/bin/activate && ruff check . && pytest -q -p no:cacheprovider
```

Expected: `All checks passed!`, then `7 failed, 532 passed, 7 warnings`, the 7 failures all in `tests/test_stats.py`.

```bash
cd "$(git rev-parse --show-toplevel)/frontend" && npm run lint && npx vitest run && npm run build
```

Expected: lint clean, `530 passed` (the brief's 527 plus this task's three; writer B's Task 6 baseline on its own branch stays 527 until the merge), build succeeds.

- [ ] **Step 13: Commit**

```bash
cd "$(git rev-parse --show-toplevel)" && git add backend/app/analytics/router.py backend/app/analytics/store.py backend/app/analytics/recorder.py backend/app/analytics/service.py scripts/migrate_analytics.py backend/tests/test_analytics_api.py backend/tests/test_store.py backend/tests/test_recorder.py backend/tests/test_migrate_analytics.py frontend/src/lib/analytics.ts frontend/src/lib/analytics.test.ts && git commit -m "feat(analytics): record the page language on visit events

EventIn.locale (en, es, hi), a locale column migrated into both stores,
the recorder row and the migration script carry it, and visitContext()
reads it from <html lang>. Downloads drop it like they drop source.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Report panels, live block and resolver health

**Files:**
- Modify: `backend/app/analytics/report.py` (add `PLATFORMS`; replace the entry point section)
- Test: `backend/tests/test_report.py` (helper edit, import edit, append)

**Interfaces:**
- Consumes: Task 1's `Window`, `windows`, `has_previous`, `totals`, `series`, `_visitor_days`, `_local`, `_fmt`, `_bucket_quality`; Task 2's `locale` column.
- Produces, in `report.py`: `PLATFORMS = ("twitter", "tiktok", "reddit", "instagram", "facebook")`; panel functions `funnel`, `outcomes`, `platforms`, `qualities`, `countries`, `pages`, `hours`, `sources`, `peak` (each `(store, window: Window)`), `live(store, now) -> dict`; `compute_report` now returns every key of spec B4: `range, tz, bucket, has_previous, window, totals, previous, series, peak, funnel, outcomes, platforms, qualities, countries, pages, hours, sources, live`; `compute_resolvers(store, tz: int, now: datetime) -> dict` returning `{"platforms": [five rows in PLATFORMS order, each {platform, fetches, ok, top_failure, last_failure_min_ago}]}` (spec B5). Task 5 calls both entry points.

- [ ] **Step 1: Write the failing tests**

In `backend/tests/test_report.py`, make three edits. First, the seed helper learns the new column: replace

```python
COLS = ("ts", "type", "outcome", "country", "visitor", "platform", "source", "visitor_kind")
```

with

```python
COLS = ("ts", "type", "outcome", "country", "visitor", "platform", "source", "visitor_kind",
        "locale")
```

Second, add `compute_resolvers` to the import block so it reads:

```python
from app.analytics.report import (
    RANGES,
    Window,
    _bucket_quality,
    compute_report,
    compute_resolvers,
    has_previous,
    parse_range,
    parse_tz,
    windows,
)
```

Third, append to the end of the file, two blank lines after its last line:

```python
# ---- Task 3: panels, live, resolvers ------------------------------------------

REPORT_KEYS = {
    "range", "tz", "bucket", "has_previous", "window", "totals", "previous", "series", "peak",
    "funnel", "outcomes", "platforms", "qualities", "countries", "pages", "hours", "sources",
    "live",
}


def test_report_carries_every_key_of_spec_b4():
    out = compute_report(_seed_week(), "7d", 0, NOW)
    assert set(out) == REPORT_KEYS
    assert set(out["live"]) == {"active_now", "fetches_last_hour", "upstream_last_hour"}
    assert set(out["funnel"]) == {"visitors", "fetched", "got_result", "downloaded"}


def test_funnel_is_nested_on_a_visitor_day_basis():
    out = compute_report(_seed_week(), "7d", 0, NOW)
    # visitor-days: 6; with a fetch: (09-20 v1) (09-20 v2) (09-21 v1) (09-22 v3);
    # with an ok fetch: (09-20 v1) (09-21 v1) (09-22 v3); downloaded: (09-20 v1) (09-22 v3)
    assert out["funnel"] == {"visitors": 6, "fetched": 4, "got_result": 3, "downloaded": 2}
    assert out["funnel"]["downloaded"] == out["totals"]["downloaded_visitors"]
    f = out["funnel"]
    assert f["visitors"] >= f["fetched"] >= f["got_result"] >= f["downloaded"]


def test_funnel_empty_window_is_all_zero():
    out = compute_report(seeded([]), "today", 0, NOW)
    assert out["funnel"] == {"visitors": 0, "fetched": 0, "got_result": 0, "downloaded": 0}


def test_outcomes_include_ok_ordered_by_count_then_name():
    out = compute_report(_seed_week(), "7d", 0, NOW)
    assert out["outcomes"] == [
        {"outcome": "ok", "count": 3},
        {"outcome": "no_video", "count": 1},
        {"outcome": "upstream_error", "count": 1},
    ]


def test_platforms_breakdown_and_ordering():
    out = compute_report(_seed_week(), "7d", 0, NOW)
    # reddit and twitter tie on fetches, so the name breaks the tie; instagram
    # only has a visit in the window and does not appear
    assert out["platforms"] == [
        {"platform": "reddit", "fetches": 2, "ok": 1, "downloads": 2},
        {"platform": "twitter", "fetches": 2, "ok": 2, "downloads": 1},
        {"platform": "tiktok", "fetches": 1, "ok": 0, "downloads": 0},
    ]


def test_platforms_ordered_by_fetches_desc():
    s = seeded([
        ("2026-09-20 10:00:00", "fetch", "ok", None, "v1", "twitter"),
        ("2026-09-20 10:01:00", "fetch", "ok", None, "v2", "tiktok"),
        ("2026-09-20 10:02:00", "fetch", "ok", None, "v3", "tiktok"),
        ("2026-09-20 10:03:00", "fetch", "ok", None, "v4", "tiktok"),
        ("2026-09-20 10:04:00", "fetch", "ok", None, "v5", "instagram"),
        ("2026-09-20 10:05:00", "fetch", "ok", None, "v6", "instagram"),
    ])
    out = compute_report(s, "7d", 0, NOW)
    assert [p["platform"] for p in out["platforms"]] == ["tiktok", "instagram", "twitter"]


def test_qualities_bucketed_and_reaggregated():
    s = seeded([
        # three distinct raw heights that all snap to 1080p -> must SUM to 3
        ("2026-09-20 03:00:00", "download", "1124p", "BD", "v1"),
        ("2026-09-20 03:01:00", "download", "1054p", "BD", "v2"),
        ("2026-09-20 03:02:00", "download", "1080p", "BD", "v3"),
        # two that snap to 720p
        ("2026-09-20 03:03:00", "download", "680p", "BD", "v4"),
        ("2026-09-20 03:04:00", "download", "720p", "BD", "v5"),
        # a named tiktok label, untouched
        ("2026-09-20 03:05:00", "download", "hd", "BD", "v6"),
        # a download whose quality was never sent -> NULL outcome, excluded
        ("2026-09-20 03:06:00", "download", None, "BD", "v7"),
    ])
    out = compute_report(s, "7d", 0, NOW)
    assert out["qualities"] == [
        {"quality": "1080p", "count": 3}, {"quality": "720p", "count": 2}, {"quality": "hd", "count": 1},
    ]


def test_countries_top_10_by_visitor_days_then_unknown_row():
    codes = ["BD", "US", "ES", "IN", "DE", "FR", "GB", "BR", "MX", "ID", "PK"]
    rows = []
    for rank, code in enumerate(codes):
        # 11 visitor-days for BD down to 1 for PK, each a different visitor on 09-20
        for i in range(11 - rank):
            rows.append(("2026-09-20 10:00:00", "visit", None, code, f"{code}-{i}", "twitter"))
    # one person seen on three days with no country: three visitor-days
    for day in ("2026-09-20", "2026-09-21", "2026-09-22"):
        rows.append((f"{day} 10:00:00", "visit", None, None, "anon", "twitter"))
        rows.append((f"{day} 10:01:00", "fetch", "ok", None, "anon", "twitter"))
    out = compute_report(seeded(rows), "7d", 0, NOW)
    assert [c["country"] for c in out["countries"]] == codes[:10] + ["unknown"]
    assert out["countries"][0] == {"country": "BD", "visitors": 11}
    assert out["countries"][-1] == {"country": "unknown", "visitors": 3}


def test_countries_unknown_row_present_at_zero_and_ties_break_by_code():
    s = seeded([
        ("2026-09-20 10:00:00", "visit", None, "US", "a", "twitter"),
        ("2026-09-20 10:01:00", "visit", None, "BD", "b", "twitter"),
        # the same BD visitor twice on one day is one visitor-day
        ("2026-09-20 10:02:00", "fetch", "ok", "BD", "b", "twitter"),
    ])
    out = compute_report(s, "7d", 0, NOW)
    assert out["countries"] == [
        {"country": "BD", "visitors": 1}, {"country": "US", "visitors": 1},
        {"country": "unknown", "visitors": 0},
    ]


def test_countries_add_up_like_the_visitors_total():
    out = compute_report(_seed_week(), "7d", 0, NOW)
    assert sum(c["visitors"] for c in out["countries"]) == out["totals"]["visitors"]


def test_pages_group_by_platform_and_locale_with_null_as_unknown():
    s = seeded([
        ("2026-09-20 10:00:00", "visit", None, None, "a", "twitter", "direct", "new", "en"),
        ("2026-09-20 10:01:00", "visit", None, None, "b", "twitter", "direct", "new", "en"),
        ("2026-09-20 10:02:00", "visit", None, None, "c", "twitter", "direct", "new", None),
        ("2026-09-20 10:03:00", "visit", None, None, "d", "instagram", "direct", "new", "hi"),
        ("2026-09-20 10:04:00", "visit", None, None, "e", "tiktok", "direct", "new", "es"),
        ("2026-09-20 10:05:00", "visit", None, None, "f", "tiktok", "direct", "new", None),
        # not a visit
        ("2026-09-20 10:06:00", "fetch", "ok", None, "f", "tiktok", None, None, "es"),
        # a visit without a platform cannot be labelled and is left out
        ("2026-09-20 10:07:00", "visit", None, None, "g", None, "direct", "new", "en"),
    ])
    out = compute_report(s, "7d", 0, NOW)
    assert out["pages"] == [
        {"platform": "twitter", "locale": "en", "views": 2},
        {"platform": "instagram", "locale": "hi", "views": 1},
        {"platform": "tiktok", "locale": "es", "views": 1},
        {"platform": "tiktok", "locale": "unknown", "views": 1},
        {"platform": "twitter", "locale": "unknown", "views": 1},
    ]


def test_pages_keep_the_top_12():
    rows = []
    combos = [(p, loc) for p in ("twitter", "tiktok", "reddit", "instagram")
              for loc in ("en", "es", "hi", None)][:13]
    for views, (platform, locale) in enumerate(combos, start=1):
        for i in range(views):
            rows.append(("2026-09-20 10:00:00", "visit", None, None, f"{platform}-{locale}-{i}",
                         platform, "direct", "new", locale))
    out = compute_report(seeded(rows), "7d", 0, NOW)
    assert len(out["pages"]) == 12
    assert out["pages"][0]["views"] == 13
    assert out["pages"][-1]["views"] == 2


def test_hours_are_24_zero_filled_local_fetch_counts():
    s = seeded([
        # 20:30 and 20:31 UTC are 02:30 and 02:31 local at +360
        ("2026-09-22 20:30:00", "fetch", "ok", None, "a", "twitter"),
        ("2026-09-22 20:31:00", "fetch", "no_video", None, "b", "twitter"),
        ("2026-09-22 21:00:00", "fetch", "ok", None, "c", "reddit"),
        # a visit is not a fetch
        ("2026-09-22 20:32:00", "visit", None, None, "d", "twitter"),
    ])
    out = compute_report(s, "7d", 360, NOW)
    assert len(out["hours"]) == 24
    assert [h["hour"] for h in out["hours"]] == list(range(24))
    assert out["hours"][2] == {"hour": 2, "fetches": 2}
    assert out["hours"][3] == {"hour": 3, "fetches": 1}
    assert sum(h["fetches"] for h in out["hours"]) == 3


def test_sources_grouped_and_ordered():
    s = seeded([
        ("2026-09-20 10:00:00", "visit", None, "BD", "v1", None, "search", None),
        ("2026-09-20 10:01:00", "visit", None, "BD", "v2", None, "search", None),
        ("2026-09-20 10:02:00", "visit", None, "US", "v3", None, "direct", None),
        ("2026-09-20 10:03:00", "visit", None, "US", "v5", None, "social", None),
        # non-visit with a source must not be counted
        ("2026-09-20 10:04:00", "fetch", "ok", "US", "v3", None, "search", None),
        # visit with NULL source must not be counted
        ("2026-09-20 10:05:00", "visit", None, "US", "v4", None, None, None),
    ])
    out = compute_report(s, "7d", 0, NOW)
    assert out["sources"] == [
        {"source": "search", "visits": 2}, {"source": "direct", "visits": 1},
        {"source": "social", "visits": 1},
    ]


def test_peak_two_visitors_in_one_tumbling_bucket_rendered_in_local_time():
    # 10:01 and 10:03 both floor to the 10:00 bucket; the record carries the
    # bucket START, shifted to the owner's tz for display.
    s = seeded([
        ("2026-09-20 10:01:00", "visit", None, "BD", "v1"),
        ("2026-09-20 10:03:00", "visit", None, "US", "v2"),
    ])
    assert compute_report(s, "7d", 0, NOW)["peak"] == {
        "count": 2, "day": "2026-09-20", "time": "10:00",
    }
    assert compute_report(s, "7d", 360, NOW)["peak"] == {
        "count": 2, "day": "2026-09-20", "time": "16:00",
    }
    assert compute_report(s, "7d", -300, NOW)["peak"] == {
        "count": 2, "day": "2026-09-20", "time": "05:00",
    }


def test_peak_is_tumbling_not_sliding_and_counts_a_person_once():
    straddle = seeded([
        ("2026-09-20 10:04:00", "visit", None, "BD", "v1"),
        ("2026-09-20 10:06:00", "visit", None, "US", "v2"),
    ])
    assert compute_report(straddle, "7d", 0, NOW)["peak"]["count"] == 1
    repeat = seeded([
        ("2026-09-20 10:01:00", "visit", None, "BD", "v1"),
        ("2026-09-20 10:02:00", "fetch", "ok", "BD", "v1"),
    ])
    assert compute_report(repeat, "7d", 0, NOW)["peak"]["count"] == 1


def test_peak_only_looks_inside_the_current_window_and_ties_go_earliest():
    s = seeded([
        # three people in one bucket, but in the previous window
        ("2026-09-15 10:00:00", "visit", None, None, "p1"),
        ("2026-09-15 10:01:00", "visit", None, None, "p2"),
        ("2026-09-15 10:02:00", "visit", None, None, "p3"),
        # two buckets of two inside the window: the earliest wins the tie
        ("2026-09-18 10:00:00", "visit", None, None, "a1"),
        ("2026-09-18 10:01:00", "visit", None, None, "a2"),
        ("2026-09-20 10:00:00", "visit", None, None, "b1"),
        ("2026-09-20 10:01:00", "visit", None, None, "b2"),
    ])
    assert compute_report(s, "7d", 0, NOW)["peak"] == {
        "count": 2, "day": "2026-09-18", "time": "10:00",
    }


def test_peak_is_null_for_an_empty_window():
    assert compute_report(seeded([]), "7d", 0, NOW)["peak"] is None
    # events exist but none inside today's window
    old = seeded([("2026-09-20 10:00:00", "visit", None, None, "v")])
    assert compute_report(old, "today", 0, NOW)["peak"] is None


def test_live_block_is_range_independent_and_uses_the_last_minutes():
    s = seeded([
        (at(minutes=-4), "visit", None, None, "a", "twitter"),
        (at(minutes=-6), "fetch", "ok", None, "b", "twitter"),
        (at(minutes=-59), "fetch", "upstream_error", None, "c", "reddit"),
        (at(minutes=-61), "fetch", "upstream_error", None, "d", "reddit"),
        # stamped in this very second: still live
        (at(), "fetch", "ok", None, "e", "tiktok"),
    ])
    expected = {"active_now": 2, "fetches_last_hour": 3, "upstream_last_hour": 1}
    for range_key in RANGES:
        assert compute_report(s, range_key, 0, NOW)["live"] == expected
    assert compute_report(s, "7d", 360, NOW)["live"] == expected


def test_live_block_zero_on_empty_store():
    assert compute_report(seeded([]), "today", 0, NOW)["live"] == {
        "active_now": 0, "fetches_last_hour": 0, "upstream_last_hour": 0,
    }


def test_resolvers_five_fixed_rows_over_the_rolling_24_hours():
    s = seeded([
        (at(minutes=-30), "fetch", "ok", None, "t1", "twitter"),
        (at(minutes=-20), "fetch", "ok", None, "t2", "twitter"),
        (at(minutes=-12, seconds=-30), "fetch", "not_found", None, "t3", "twitter"),
        (at(hours=-3), "fetch", "upstream_error", None, "r1", "reddit"),
        (at(hours=-2), "fetch", "upstream_error", None, "r2", "reddit"),
        (at(minutes=-90), "fetch", "not_found", None, "r3", "reddit"),
        (at(minutes=-61), "fetch", "not_found", None, "r4", "reddit"),
        # exactly 24 hours ago: the first second of the window
        (at(hours=-24), "fetch", "ok", None, "i1", "instagram"),
        # one second older: outside
        (at(hours=-24, seconds=-1), "fetch", "ok", None, "f1", "facebook"),
        # a fetch without a platform cannot be attributed
        (at(minutes=-5), "fetch", "not_found", None, "n1", None),
        # downloads are not lookups
        (at(minutes=-5), "download", "hd", None, "t1", "twitter"),
    ])
    out = compute_resolvers(s, 0, NOW)
    assert [r["platform"] for r in out["platforms"]] == [
        "twitter", "tiktok", "reddit", "instagram", "facebook",
    ]
    by = {r["platform"]: r for r in out["platforms"]}
    assert by["twitter"] == {"platform": "twitter", "fetches": 3, "ok": 2,
                             "top_failure": {"outcome": "not_found", "count": 1},
                             "last_failure_min_ago": 12}
    assert by["tiktok"] == {"platform": "tiktok", "fetches": 0, "ok": 0, "top_failure": None,
                            "last_failure_min_ago": None}
    # reddit: not_found and upstream_error tie at 2, the name breaks the tie;
    # the newest failure is r4, 61 minutes ago
    assert by["reddit"] == {"platform": "reddit", "fetches": 4, "ok": 0,
                            "top_failure": {"outcome": "not_found", "count": 2},
                            "last_failure_min_ago": 61}
    assert by["instagram"] == {"platform": "instagram", "fetches": 1, "ok": 1,
                               "top_failure": None, "last_failure_min_ago": None}
    assert by["facebook"]["fetches"] == 0
    # tz does not change the numbers
    assert compute_resolvers(s, 360, NOW) == out


def test_resolvers_last_failure_floors_to_whole_minutes():
    s = seeded([(at(seconds=-59), "fetch", "not_found", None, "t", "twitter")])
    row = compute_resolvers(s, 0, NOW)["platforms"][0]
    assert row["last_failure_min_ago"] == 0
    s = seeded([(at(minutes=-60, seconds=-1), "fetch", "not_found", None, "t", "twitter")])
    row = compute_resolvers(s, 0, NOW)["platforms"][0]
    assert row["last_failure_min_ago"] == 60
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd "$(git rev-parse --show-toplevel)/backend" && source .venv/bin/activate && pytest tests/test_report.py -q -p no:cacheprovider
```

Expected: a collection error, `ImportError: cannot import name 'compute_resolvers' from 'app.analytics.report'`.

- [ ] **Step 3: Add the panels, the live block and the resolvers**

In `backend/app/analytics/report.py`, directly below `DEFAULT_RANGE = "7d"` add:

```python
PLATFORMS = ("twitter", "tiktok", "reddit", "instagram", "facebook")
```

Then delete everything from the line `# ---- entry point -----------------------------------------------------------` to the end of the file (the Task 1 `compute_report`) and put this in its place:

```python
# ---- panels (current window only) ------------------------------------------

def funnel(store: Store, window: Window) -> dict:
    """Visitor-day funnel, nested so it can never grow step to step."""
    days = _visitor_days(store, window.tz, window.start_utc, window.end_utc)
    return {
        "visitors": days["visitors"],
        "fetched": days["fetched"],
        "got_result": days["got_result"],
        "downloaded": days["downloaded"],
    }


def outcomes(store: Store, window: Window) -> list[dict]:
    rows = store.query(
        "SELECT outcome, COUNT(*) AS count FROM events "
        "WHERE ts >= ? AND ts < ? AND type='fetch' AND outcome IS NOT NULL "
        "GROUP BY outcome ORDER BY count DESC, outcome ASC",
        [window.start_utc, window.end_utc],
    )
    return [{"outcome": r["outcome"], "count": r["count"]} for r in rows]


def platforms(store: Store, window: Window) -> list[dict]:
    rows = store.query(
        "SELECT platform, "
        "COALESCE(SUM(CASE WHEN type='fetch' THEN 1 ELSE 0 END), 0) AS fetches, "
        "COALESCE(SUM(CASE WHEN type='fetch' AND outcome='ok' THEN 1 ELSE 0 END), 0) AS ok, "
        "COALESCE(SUM(CASE WHEN type='download' THEN 1 ELSE 0 END), 0) AS downloads "
        "FROM events WHERE ts >= ? AND ts < ? AND platform IS NOT NULL "
        "AND type IN ('fetch', 'download') "
        "GROUP BY platform ORDER BY fetches DESC, platform ASC",
        [window.start_utc, window.end_utc],
    )
    return [{"platform": r["platform"], "fetches": r["fetches"], "ok": r["ok"],
             "downloads": r["downloads"]} for r in rows]


def qualities(store: Store, window: Window) -> list[dict]:
    # Raw heights are bucketed to standard tiers in Python (not SQL) so several
    # non-standard heights collapse into one row; re-sum and re-sort after the
    # per-outcome GROUP BY.
    rows = store.query(
        "SELECT outcome AS quality, COUNT(*) AS count FROM events "
        "WHERE ts >= ? AND ts < ? AND type='download' AND outcome IS NOT NULL "
        "GROUP BY outcome",
        [window.start_utc, window.end_utc],
    )
    counts: dict[str, int] = {}
    for r in rows:
        label = _bucket_quality(r["quality"])
        counts[label] = counts.get(label, 0) + r["count"]
    return [{"quality": q, "count": c}
            for q, c in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))]


def countries(store: Store, window: Window) -> list[dict]:
    """Top 10 countries by visitor-days, then exactly one unknown row for NULL
    country counted the same way, always present even when 0."""
    local = _local(window.tz)
    visitor_days = f"COUNT(DISTINCT date({local}) || '|' || visitor)"
    rows = store.query(
        f"SELECT country, {visitor_days} AS visitors FROM events "
        "WHERE ts >= ? AND ts < ? AND country IS NOT NULL "
        "GROUP BY country ORDER BY visitors DESC, country ASC LIMIT 10",
        [window.start_utc, window.end_utc],
    )
    out = [{"country": r["country"], "visitors": r["visitors"]} for r in rows]
    unknown = store.query(
        f"SELECT {visitor_days} AS visitors FROM events "
        "WHERE ts >= ? AND ts < ? AND country IS NULL",
        [window.start_utc, window.end_utc],
    )[0]["visitors"]
    out.append({"country": "unknown", "visitors": unknown})
    return out


def pages(store: Store, window: Window) -> list[dict]:
    rows = store.query(
        "SELECT platform, COALESCE(locale, 'unknown') AS locale, COUNT(*) AS views "
        "FROM events WHERE ts >= ? AND ts < ? AND type='visit' AND platform IS NOT NULL "
        "GROUP BY platform, COALESCE(locale, 'unknown') "
        "ORDER BY views DESC, platform ASC, locale ASC LIMIT 12",
        [window.start_utc, window.end_utc],
    )
    return [{"platform": r["platform"], "locale": r["locale"], "views": r["views"]}
            for r in rows]


def hours(store: Store, window: Window) -> list[dict]:
    local = _local(window.tz)
    rows = store.query(
        f"SELECT CAST(strftime('%H', {local}) AS INTEGER) AS hour, COUNT(*) AS fetches "
        "FROM events WHERE ts >= ? AND ts < ? AND type='fetch' GROUP BY hour",
        [window.start_utc, window.end_utc],
    )
    by_hour = {int(r["hour"]): r["fetches"] for r in rows}
    return [{"hour": h, "fetches": by_hour.get(h, 0)} for h in range(24)]


def sources(store: Store, window: Window) -> list[dict]:
    rows = store.query(
        "SELECT source, COUNT(*) AS visits FROM events "
        "WHERE ts >= ? AND ts < ? AND type='visit' AND source IS NOT NULL "
        "GROUP BY source ORDER BY visits DESC, source ASC",
        [window.start_utc, window.end_utc],
    )
    return [{"source": r["source"], "visits": r["visits"]} for r in rows]


def peak(store: Store, window: Window) -> dict | None:
    """Highest COUNT(DISTINCT visitor) in any 5-minute tumbling bucket among the
    events inside the window. Buckets are floored on UTC epoch seconds
    (bucket = epoch // 300 * 300) so concurrency itself is tz-independent; the
    bucket start is shifted to the owner's tz only to render day and time.
    Ties go to the earliest bucket. None when the window is empty."""
    rows = store.query(
        "SELECT b, COUNT(DISTINCT visitor) AS n FROM ("
        "SELECT (CAST(strftime('%s', ts) AS INTEGER) / 300) * 300 AS b, visitor "
        "FROM events WHERE ts >= ? AND ts < ?) "
        "GROUP BY b ORDER BY n DESC, b ASC LIMIT 1",
        [window.start_utc, window.end_utc],
    )
    if not rows:
        return None
    start = datetime.fromtimestamp(int(rows[0]["b"]), UTC).replace(tzinfo=None)
    local = start + timedelta(minutes=window.tz)
    return {"count": rows[0]["n"], "day": local.date().isoformat(), "time": local.strftime("%H:%M")}


def live(store: Store, now: datetime) -> dict:
    """Independent of the range: people seen in the last 5 minutes and fetches
    in the last 60. Lower bound only: the spec defines these as `ts >= now - X`,
    and an upper bound at the second-floored `now` would hide events recorded
    in the current second."""
    now_utc = now.astimezone(UTC).replace(tzinfo=None)
    five = _fmt(now_utc - timedelta(minutes=5))
    hour = _fmt(now_utc - timedelta(minutes=60))
    active = store.query(
        "SELECT COUNT(DISTINCT visitor) AS n FROM events WHERE ts >= ?", [five],
    )[0]["n"]
    row = store.query(
        "SELECT COUNT(*) AS fetches, "
        "COALESCE(SUM(CASE WHEN outcome='upstream_error' THEN 1 ELSE 0 END), 0) AS upstream "
        "FROM events WHERE ts >= ? AND type='fetch'",
        [hour],
    )[0]
    return {
        "active_now": active,
        "fetches_last_hour": row["fetches"],
        "upstream_last_hour": row["upstream"],
    }


# ---- entry points ----------------------------------------------------------

def compute_report(store: Store, range_key: str, tz: int, now: datetime) -> dict:
    """The full report (spec B4). `range_key` must come from parse_range and
    `tz` from parse_tz; `now` is an aware datetime (the router passes
    datetime.now(UTC))."""
    n = RANGES[range_key]
    current, previous = windows(range_key, tz, now)
    bucket = "hour" if range_key == "today" else "day"
    with_previous = has_previous(store, previous)
    return {
        "range": range_key,
        "tz": tz,
        "bucket": bucket,
        "has_previous": with_previous,
        "window": {"start": current.first_date, "end": current.last_date},
        "totals": totals(store, current, n),
        "previous": totals(store, previous, n) if with_previous else None,
        "series": series(store, current, previous, n, bucket, with_previous),
        "peak": peak(store, current),
        "funnel": funnel(store, current),
        "outcomes": outcomes(store, current),
        "platforms": platforms(store, current),
        "qualities": qualities(store, current),
        "countries": countries(store, current),
        "pages": pages(store, current),
        "hours": hours(store, current),
        "sources": sources(store, current),
        "live": live(store, now),
    }


def _minutes_ago(ts: str, now: datetime) -> int:
    """Whole minutes (floor) between a stored UTC text and the aware `now`,
    never negative even under clock skew."""
    then = datetime.strptime(ts, _TS_FORMAT).replace(tzinfo=UTC)
    return max(0, int((now - then).total_seconds() // 60))


def compute_resolvers(store: Store, tz: int, now: datetime) -> dict:
    """Resolver health over the rolling 24 hours [now - 24h, now), fetch events
    only (spec B5). Always the five platforms in a fixed order. `tz` is
    accepted for symmetry with the report; the response carries no clock
    times, so it does not influence the numbers."""
    now_utc = now.astimezone(UTC).replace(tzinfo=None)
    start, end = _fmt(now_utc - timedelta(hours=24)), _fmt(now_utc)
    failed = "type='fetch' AND platform IS NOT NULL AND outcome IS NOT NULL AND outcome != 'ok'"
    counts = {r["platform"]: r for r in store.query(
        "SELECT platform, COUNT(*) AS fetches, "
        "COALESCE(SUM(CASE WHEN outcome='ok' THEN 1 ELSE 0 END), 0) AS ok "
        "FROM events WHERE ts >= ? AND ts < ? AND type='fetch' AND platform IS NOT NULL "
        "GROUP BY platform",
        [start, end],
    )}
    top: dict[str, dict] = {}
    for r in store.query(
        "SELECT platform, outcome, COUNT(*) AS count FROM events "
        f"WHERE ts >= ? AND ts < ? AND {failed} "
        "GROUP BY platform, outcome ORDER BY count DESC, outcome ASC",
        [start, end],
    ):
        top.setdefault(r["platform"], {"outcome": r["outcome"], "count": r["count"]})
    last = {r["platform"]: r["last"] for r in store.query(
        f"SELECT platform, MAX(ts) AS last FROM events WHERE ts >= ? AND ts < ? AND {failed} "
        "GROUP BY platform",
        [start, end],
    )}
    rows = []
    for platform in PLATFORMS:
        c = counts.get(platform)
        last_ts = last.get(platform)
        rows.append({
            "platform": platform,
            "fetches": c["fetches"] if c else 0,
            "ok": c["ok"] if c else 0,
            "top_failure": top.get(platform),
            "last_failure_min_ago": _minutes_ago(last_ts, now) if last_ts else None,
        })
    return {"platforms": rows}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd "$(git rev-parse --show-toplevel)/backend" && source .venv/bin/activate && pytest tests/test_report.py -q -p no:cacheprovider
```

Expected: `59 passed`.

- [ ] **Step 5: Run the task gate**

```bash
cd "$(git rev-parse --show-toplevel)/backend" && source .venv/bin/activate && ruff check . && pytest -q -p no:cacheprovider
```

Expected: `All checks passed!`, then `7 failed, 554 passed, 7 warnings`, the 7 failures all in `tests/test_stats.py`.

- [ ] **Step 6: Commit**

```bash
cd "$(git rev-parse --show-toplevel)" && git add backend/app/analytics/report.py backend/tests/test_report.py && git commit -m "feat(admin): report panels, live block and resolver health

Funnel, outcomes, platforms, qualities, countries, pages, hours,
sources and peak for the current window, the range-free live block,
and compute_resolvers over the rolling 24 hours.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Country lookup (DB-IP Lite)

**Files:**
- Create: `backend/app/analytics/geo.py`
- Modify: `backend/app/analytics/service.py` (whole file, 63 lines after Task 2)
- Modify: `backend/app/envutil.py` (whole file, 9 lines)
- Modify: `backend/pyproject.toml:6-12` (dependencies)
- Modify: `Dockerfile:22` (after `ENV STATIC_DIR=/srv/static`)
- Modify: `deploy/README.md` (append a section), `deploy/app.env.example` (append a block)
- Test: `backend/tests/test_geo.py` (new), `backend/tests/test_service_geo.py` (new), `backend/tests/test_envutil.py` (append)

**Interfaces:**
- Consumes: `client_ip(request)` from `backend/app/client_ip.py` (untouched, per the spec's non-goals); `visitor_hash`, `today_utc` from `hashing.py`; `AnalyticsConfig` (`db_path`, `turso_url`, `turso_token`); Task 2's `Recorder.record(..., locale=...)`.
- Produces, in `backend/app/analytics/geo.py`: `GEO_FILENAME = "dbip-country-lite.mmdb"`, `MARKER_FILENAME = "dbip-country-lite.month"`, `DOWNLOAD_URL`, `MAX_COMPRESSED`, `MAX_UNPACKED`, `INITIAL_DELAY`, `CYCLE`; `CountryLookup(reader=None)` with `.country(ip: str) -> str | None`, `.load(path: str) -> bool`, `@staticmethod .validate(path: str) -> bool`, property `.loaded -> bool`; `resolve_geo_dir(env: Mapping[str, str], cfg: AnalyticsConfig) -> str | None`; `GeoUpdater(lookup, directory: str, *, client: httpx.Client | None = None)` with `.run_once(now: datetime) -> bool` (True only when a new file was installed), `.start()`, `.stop()`. In `backend/app/envutil.py`: `is_truthy(value: str | None) -> bool`. In `service.py`: `AnalyticsService.init(cfg, store, recorder, env: Mapping[str, str] | None = None)` (env defaults to `os.environ`; `main.py` needs no change), `record_from_request` computing the IP once for the hash and the lookup and passing only the code to the recorder; the `cf-ipcountry` read is gone.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_geo.py`:

```python
"""Country lookup and updater tests. No real network: the updater is driven
through respx, the lookup through a fake reader. An opt-in smoke test at the
bottom runs against a real DB-IP file when GEOIP_TEST_DB points at one."""
import gzip
import logging
import os
from datetime import UTC, datetime
from types import SimpleNamespace

import httpx
import pytest
import respx

from app.analytics import geo
from app.analytics.config import AnalyticsConfig
from app.analytics.geo import (
    GEO_FILENAME,
    MARKER_FILENAME,
    CountryLookup,
    GeoUpdater,
    _previous_month,
    resolve_geo_dir,
)

NOW = datetime(2026, 9, 23, 7, 30, tzinfo=UTC)
URL = "https://download.db-ip.com/free/dbip-country-lite-{month}.mmdb.gz"
BODY = b"pretend this is a 2026-09 mmdb"
GZ = gzip.compress(BODY)


class FakeReader:
    """Stands in for a maxminddb.Reader: a dict of records plus the real
    library's failure modes (ValueError quoting a bad address, None for an
    unlisted one, ValueError after close)."""

    def __init__(self, records: dict, database_type: str = "DBIP-Country-Lite"):
        self.records = records
        self.database_type = database_type
        self.closed = False

    def get(self, ip: str):
        if self.closed:
            raise ValueError("Attempt to read from a closed MaxMind DB.")
        if "." not in ip and ":" not in ip:
            raise ValueError(f"'{ip}' does not appear to be an IPv4 or IPv6 address.")
        return self.records.get(ip)

    def metadata(self):
        return SimpleNamespace(database_type=self.database_type)

    def close(self) -> None:
        self.closed = True


class RaisingReader(FakeReader):
    def get(self, ip: str):
        raise ValueError(f"'{ip}' does not appear to be an IPv4 or IPv6 address.")


class FakeLookup:
    """What the updater needs from CountryLookup: validate() and load()."""

    def __init__(self, valid: bool = True):
        self.valid = valid
        self.validated: list[str] = []
        self.loaded: list[str] = []

    def validate(self, path: str) -> bool:
        self.validated.append(path)
        return self.valid

    def load(self, path: str) -> bool:
        self.loaded.append(path)
        return True


RECORDS = {
    "203.0.113.77": {"country": {"iso_code": "US"}},
    "198.51.100.9": {"country": {"iso_code": "us"}},
    "192.0.2.1": {"country": {"iso_code": "ZZ"}},
    "192.0.2.2": {"country": {"iso_code": "XX"}},
    "192.0.2.3": {"continent": {"code": "EU"}},
    "192.0.2.4": {"country": {"iso_code": None}},
    "2001:db8::1": {"country": {"iso_code": "DE"}},
}


# ---- CountryLookup.country -------------------------------------------------------

def test_country_returns_valid_codes_only():
    lookup = CountryLookup(FakeReader(RECORDS))
    assert lookup.loaded is True
    assert lookup.country("203.0.113.77") == "US"
    assert lookup.country("2001:db8::1") == "DE"
    assert lookup.country("198.51.100.9") is None  # lowercase is not a code
    assert lookup.country("192.0.2.1") is None  # ZZ placeholder
    assert lookup.country("192.0.2.2") is None  # XX placeholder
    assert lookup.country("192.0.2.3") is None  # no country key
    assert lookup.country("192.0.2.4") is None  # null code
    assert lookup.country("10.0.0.1") is None  # no record (private range)
    assert lookup.country("not-an-ip") is None  # ValueError swallowed
    assert lookup.country("unknown") is None  # client_ip()'s fallback value


def test_country_without_a_reader_or_with_a_raising_one_is_none_and_silent(caplog):
    caplog.set_level(logging.DEBUG, logger="savevidai.analytics")
    assert CountryLookup().loaded is False
    assert CountryLookup().country("203.0.113.77") is None
    assert CountryLookup(RaisingReader({})).country("203.0.113.77") is None
    closed = FakeReader(RECORDS)
    closed.close()
    assert CountryLookup(closed).country("203.0.113.77") is None
    assert caplog.records == []
    assert not any("203.0.113.77" in r.getMessage() for r in caplog.records)


# ---- CountryLookup.validate / load -----------------------------------------------

def test_validate_requires_a_country_database_that_resolves_google_dns(monkeypatch):
    good = FakeReader({"8.8.8.8": {"country": {"iso_code": "US"}}})
    monkeypatch.setattr(geo.maxminddb, "open_database", lambda path: good)
    assert CountryLookup.validate("/x/good.mmdb") is True
    assert good.closed is True

    asn = FakeReader({"8.8.8.8": {"country": {"iso_code": "US"}}}, database_type="DBIP-ASN-Lite")
    monkeypatch.setattr(geo.maxminddb, "open_database", lambda path: asn)
    assert CountryLookup.validate("/x/asn.mmdb") is False
    assert asn.closed is True

    empty = FakeReader({})
    monkeypatch.setattr(geo.maxminddb, "open_database", lambda path: empty)
    assert CountryLookup.validate("/x/empty.mmdb") is False

    def boom(path):
        raise OSError("no such file")

    monkeypatch.setattr(geo.maxminddb, "open_database", boom)
    assert CountryLookup.validate("/x/missing.mmdb") is False


def test_load_swaps_the_reader_and_closes_the_old_one(monkeypatch):
    old = FakeReader({"203.0.113.77": {"country": {"iso_code": "BD"}}})
    new = FakeReader({"203.0.113.77": {"country": {"iso_code": "US"}}})
    lookup = CountryLookup(old)
    monkeypatch.setattr(geo.maxminddb, "open_database", lambda path: new)
    assert lookup.load("/x/new.mmdb") is True
    assert lookup.country("203.0.113.77") == "US"
    assert old.closed is True
    assert new.closed is False


def test_load_keeps_the_old_reader_on_open_failure_or_wrong_type(monkeypatch):
    old = FakeReader({"203.0.113.77": {"country": {"iso_code": "BD"}}})
    lookup = CountryLookup(old)

    def boom(path):
        raise OSError("corrupt")

    monkeypatch.setattr(geo.maxminddb, "open_database", boom)
    assert lookup.load("/x/corrupt.mmdb") is False
    assert lookup.country("203.0.113.77") == "BD"

    wrong = FakeReader({}, database_type="GeoLite2-ASN")
    monkeypatch.setattr(geo.maxminddb, "open_database", lambda path: wrong)
    assert lookup.load("/x/asn.mmdb") is False
    assert wrong.closed is True
    assert old.closed is False
    assert lookup.country("203.0.113.77") == "BD"


# ---- resolve_geo_dir -------------------------------------------------------------

def test_resolve_geo_dir_prefers_env_then_absolute_sqlite_path():
    local = AnalyticsConfig(admin_password="pw", salt="s", db_path="/data/analytics.db")
    assert resolve_geo_dir({"GEOIP_DIR": "/srv/geo"}, local) == "/srv/geo"
    assert resolve_geo_dir({"GEOIP_DIR": "  "}, local) == "/data/geoip"
    assert resolve_geo_dir({}, local) == "/data/geoip"


def test_resolve_geo_dir_is_none_for_turso_relative_or_memory_paths():
    turso = AnalyticsConfig("libsql://x", "t", "pw", "s")
    assert resolve_geo_dir({}, turso) is None
    both = AnalyticsConfig("libsql://x", "t", "pw", "s", db_path="/data/analytics.db")
    assert resolve_geo_dir({}, both) is None  # make_store picks Turso when both are set
    assert resolve_geo_dir({}, AnalyticsConfig(admin_password="pw", salt="s",
                                               db_path="analytics.db")) is None
    assert resolve_geo_dir({}, AnalyticsConfig(admin_password="pw", salt="s",
                                               db_path=":memory:")) is None
    assert resolve_geo_dir({}, AnalyticsConfig(admin_password="pw", salt="s")) is None


# ---- GeoUpdater ------------------------------------------------------------------
# Routes are registered on the context router (`with respx.mock as mock`), the
# idiom tests/test_reddit_auth.py uses: they are torn down with the context and
# never leak into another test.

def test_previous_month_wraps_the_year():
    assert _previous_month("2026-09") == "2026-08"
    assert _previous_month("2026-01") == "2025-12"
    assert _previous_month("2026-10") == "2026-09"


def test_run_once_installs_the_current_month(tmp_path, caplog):
    caplog.set_level(logging.INFO, logger="savevidai.analytics")
    directory = tmp_path / "geoip"  # does not exist yet: the updater creates it
    lookup = FakeLookup()
    with respx.mock as mock:
        route = mock.get(URL.format(month="2026-09")).mock(
            return_value=httpx.Response(200, content=GZ))
        assert GeoUpdater(lookup, str(directory)).run_once(NOW) is True
        assert route.called
    final = directory / GEO_FILENAME
    assert final.read_bytes() == BODY
    assert (directory / MARKER_FILENAME).read_text().strip() == "2026-09"
    assert lookup.loaded == [str(final)]
    assert len(lookup.validated) == 1 and lookup.validated[0].startswith(str(directory))
    assert lookup.validated[0] != str(final)  # validated the temp file, before the swap
    assert sorted(os.listdir(directory)) == sorted([GEO_FILENAME, MARKER_FILENAME])
    assert any("installed 2026-09" in r.getMessage() for r in caplog.records)


def test_run_once_skips_when_the_marker_already_says_this_month(tmp_path):
    (tmp_path / MARKER_FILENAME).write_text("2026-09\n")
    (tmp_path / GEO_FILENAME).write_bytes(b"current")
    lookup = FakeLookup()
    with respx.mock(assert_all_called=False) as mock:
        route = mock.get(URL.format(month="2026-09")).mock(
            return_value=httpx.Response(200, content=GZ))
        assert GeoUpdater(lookup, str(tmp_path)).run_once(NOW) is False
        assert not route.called
    assert lookup.loaded == []
    assert (tmp_path / GEO_FILENAME).read_bytes() == b"current"


def test_run_once_falls_back_to_the_previous_month_on_404(tmp_path):
    lookup = FakeLookup()
    with respx.mock as mock:
        current = mock.get(URL.format(month="2026-09")).mock(return_value=httpx.Response(404))
        previous = mock.get(URL.format(month="2026-08")).mock(
            return_value=httpx.Response(200, content=GZ))
        assert GeoUpdater(lookup, str(tmp_path)).run_once(NOW) is True
        assert current.called and previous.called
    assert (tmp_path / MARKER_FILENAME).read_text().strip() == "2026-08"
    assert (tmp_path / GEO_FILENAME).read_bytes() == BODY


def test_run_once_does_not_refetch_the_previous_month_it_already_has(tmp_path):
    (tmp_path / MARKER_FILENAME).write_text("2026-08\n")
    (tmp_path / GEO_FILENAME).write_bytes(b"august")
    lookup = FakeLookup()
    with respx.mock(assert_all_called=False) as mock:
        current = mock.get(URL.format(month="2026-09")).mock(return_value=httpx.Response(404))
        previous = mock.get(URL.format(month="2026-08")).mock(
            return_value=httpx.Response(200, content=GZ))
        assert GeoUpdater(lookup, str(tmp_path)).run_once(NOW) is False
        assert current.called
        assert not previous.called
    assert (tmp_path / GEO_FILENAME).read_bytes() == b"august"
    assert lookup.loaded == []


@pytest.mark.parametrize("status", [500, 302, 403])
def test_run_once_treats_anything_but_200_as_failure_without_fallback(status, tmp_path, caplog):
    lookup = FakeLookup()
    with respx.mock(assert_all_called=False) as mock:
        current = mock.get(URL.format(month="2026-09")).mock(
            return_value=httpx.Response(status, headers={"location": "https://elsewhere/x"}))
        previous = mock.get(URL.format(month="2026-08")).mock(
            return_value=httpx.Response(200, content=GZ))
        assert GeoUpdater(lookup, str(tmp_path)).run_once(NOW) is False
        assert current.called
        assert not previous.called  # only a 404 falls back
    assert os.listdir(tmp_path) == []
    assert lookup.loaded == []
    assert any(r.levelno == logging.WARNING and f"HTTP {status}" in r.getMessage()
               for r in caplog.records)


def test_run_once_network_error_logs_one_warning_without_a_traceback(tmp_path, caplog):
    with respx.mock as mock:
        mock.get(URL.format(month="2026-09")).mock(side_effect=httpx.ConnectError("down"))
        assert GeoUpdater(FakeLookup(), str(tmp_path)).run_once(NOW) is False
    warnings = [r for r in caplog.records if r.levelno == logging.WARNING]
    assert len(warnings) == 1
    assert "geoip update failed" in warnings[0].getMessage()
    assert warnings[0].exc_info is None
    assert os.listdir(tmp_path) == []


def test_run_once_aborts_over_the_compressed_cap(tmp_path, monkeypatch):
    monkeypatch.setattr(geo, "MAX_COMPRESSED", len(GZ) - 1)
    lookup = FakeLookup()
    with respx.mock as mock:
        mock.get(URL.format(month="2026-09")).mock(return_value=httpx.Response(200, content=GZ))
        assert GeoUpdater(lookup, str(tmp_path)).run_once(NOW) is False
    assert os.listdir(tmp_path) == []
    assert lookup.validated == [] and lookup.loaded == []


def test_run_once_aborts_over_the_unpacked_cap(tmp_path, monkeypatch):
    monkeypatch.setattr(geo, "MAX_UNPACKED", len(BODY) - 1)
    lookup = FakeLookup()
    with respx.mock as mock:
        mock.get(URL.format(month="2026-09")).mock(return_value=httpx.Response(200, content=GZ))
        assert GeoUpdater(lookup, str(tmp_path)).run_once(NOW) is False
    assert os.listdir(tmp_path) == []
    assert lookup.validated == [] and lookup.loaded == []


def test_run_once_rejects_a_body_that_is_not_gzip(tmp_path):
    lookup = FakeLookup()
    with respx.mock as mock:
        mock.get(URL.format(month="2026-09")).mock(
            return_value=httpx.Response(200, content=b"<html>not a gzip file</html>"))
        assert GeoUpdater(lookup, str(tmp_path)).run_once(NOW) is False
    assert os.listdir(tmp_path) == []
    assert lookup.loaded == []


def test_run_once_keeps_the_old_file_when_validation_fails(tmp_path):
    (tmp_path / GEO_FILENAME).write_bytes(b"august")
    (tmp_path / MARKER_FILENAME).write_text("2026-08\n")
    lookup = FakeLookup(valid=False)
    with respx.mock as mock:
        mock.get(URL.format(month="2026-09")).mock(return_value=httpx.Response(200, content=GZ))
        assert GeoUpdater(lookup, str(tmp_path)).run_once(NOW) is False
    assert (tmp_path / GEO_FILENAME).read_bytes() == b"august"
    assert (tmp_path / MARKER_FILENAME).read_text().strip() == "2026-08"
    assert sorted(os.listdir(tmp_path)) == sorted([GEO_FILENAME, MARKER_FILENAME])
    assert lookup.loaded == []


def test_run_once_replaces_the_file_atomically_and_reloads(tmp_path):
    (tmp_path / GEO_FILENAME).write_bytes(b"august")
    (tmp_path / MARKER_FILENAME).write_text("2026-08\n")
    lookup = FakeLookup()
    with respx.mock as mock:
        mock.get(URL.format(month="2026-09")).mock(return_value=httpx.Response(200, content=GZ))
        assert GeoUpdater(lookup, str(tmp_path)).run_once(NOW) is True
    assert (tmp_path / GEO_FILENAME).read_bytes() == BODY
    assert (tmp_path / MARKER_FILENAME).read_text().strip() == "2026-09"
    assert lookup.loaded == [str(tmp_path / GEO_FILENAME)]
    assert sorted(os.listdir(tmp_path)) == sorted([GEO_FILENAME, MARKER_FILENAME])


def test_updater_uses_a_client_with_no_redirects_and_a_60s_timeout():
    updater = GeoUpdater(FakeLookup(), "/nonexistent")
    assert updater._client.follow_redirects is False
    assert updater._client.timeout.read == 60.0


def test_start_runs_a_daemon_thread_that_stops_cleanly(tmp_path, monkeypatch):
    monkeypatch.setattr(geo, "INITIAL_DELAY", 0.01)
    updater = GeoUpdater(FakeLookup(), str(tmp_path))
    seen: list[datetime] = []

    def fake_run_once(now):
        seen.append(now)
        updater.stop()
        return False

    updater.run_once = fake_run_once
    updater.start()
    updater.start()  # idempotent
    updater._thread.join(timeout=5)
    assert not updater._thread.is_alive()
    assert updater._thread.daemon is True
    assert updater._thread.name == "geoip-updater"
    assert len(seen) == 1 and seen[0].tzinfo is UTC


# ---- optional smoke test against a real DB-IP file ------------------------------

@pytest.mark.skipif(not os.environ.get("GEOIP_TEST_DB"),
                    reason="set GEOIP_TEST_DB=/path/to/dbip-country-lite.mmdb to run")
def test_real_file_smoke():
    path = os.environ["GEOIP_TEST_DB"]
    assert CountryLookup.validate(path) is True
    lookup = CountryLookup()
    assert lookup.load(path) is True
    assert lookup.country("8.8.8.8") == "US"
    assert lookup.country("1.1.1.1") == "AU"
    assert lookup.country("2a00:1450:4001:80b::200e") == "DE"
    for ip in ("10.0.0.1", "192.168.1.1", "127.0.0.1", "0.0.0.0", "100.64.0.1", "::1",
               "not-an-ip", "unknown"):
        assert lookup.country(ip) is None, ip
```

Create `backend/tests/test_service_geo.py`:

```python
"""The service wiring for the country lookup, and the privacy invariant that
the IP never reaches the recorder or the logs."""
import logging
import os
from types import SimpleNamespace

from starlette.requests import Request

from app.analytics import service as service_mod
from app.analytics.config import AnalyticsConfig
from app.analytics.geo import GEO_FILENAME, CountryLookup
from app.analytics.store import SqliteStore

IP = "203.0.113.77"
TURSO_CFG = AnalyticsConfig("libsql://x", "t", "pw-long", "salt")


class SpyRecorder:
    def __init__(self):
        self.calls: list[tuple[str, dict]] = []

    def start(self) -> None:
        pass

    def record(self, type: str, **kwargs) -> None:
        self.calls.append((type, kwargs))


class FakeReader:
    def __init__(self, records: dict):
        self.records = records

    def get(self, ip: str):
        if "." not in ip and ":" not in ip:
            raise ValueError(f"'{ip}' does not appear to be an IPv4 or IPv6 address.")
        return self.records.get(ip)

    def metadata(self):
        return SimpleNamespace(database_type="DBIP-Country-Lite")

    def close(self) -> None:
        pass


class RaisingReader(FakeReader):
    def get(self, ip: str):
        raise ValueError(f"'{ip}' does not appear to be an IPv4 or IPv6 address.")


def _req(headers: dict, client_host: str | None = "10.0.0.1") -> Request:
    scope = {
        "type": "http",
        "headers": [(k.lower().encode(), v.encode()) for k, v in headers.items()],
        "client": (client_host, 12345) if client_host else None,
    }
    return Request(scope)


def _service(reader=None) -> tuple[service_mod.AnalyticsService, SpyRecorder]:
    svc = service_mod.AnalyticsService()
    rec = SpyRecorder()
    svc.init(TURSO_CFG, SqliteStore(":memory:"), rec, env={})
    svc._lookup = CountryLookup(reader)
    return svc, rec


def test_record_passes_the_country_code_and_never_the_ip():
    svc, rec = _service(FakeReader({IP: {"country": {"iso_code": "US"}}}))
    svc.record_from_request(_req({"CF-Connecting-IP": IP}), "visit", None, platform="twitter",
                            source="search", visitor_kind="new", locale="es")
    assert len(rec.calls) == 1
    type_, kw = rec.calls[0]
    assert type_ == "visit"
    assert kw["country"] == "US"
    assert kw["locale"] == "es"
    assert kw["platform"] == "twitter"
    assert len(kw["visitor"]) == 16
    assert IP not in repr(rec.calls)


def test_cf_ipcountry_header_is_no_longer_read():
    svc, rec = _service(reader=None)
    svc.record_from_request(_req({"CF-IPCountry": "BD", "CF-Connecting-IP": IP}), "fetch", "ok")
    assert rec.calls[0][1]["country"] is None


def test_unknown_country_stays_null_without_breaking_the_event():
    svc, rec = _service(FakeReader({}))
    svc.record_from_request(_req({"CF-Connecting-IP": "10.0.0.1"}), "fetch", "ok",
                            platform="reddit")
    assert rec.calls[0][1] == {"visitor": rec.calls[0][1]["visitor"], "outcome": "ok",
                               "country": None, "platform": "reddit", "source": None,
                               "visitor_kind": None, "locale": None}


def test_raising_reader_and_unknown_ip_leave_no_trace_in_the_logs(caplog):
    caplog.set_level(logging.DEBUG, logger="savevidai.analytics")
    svc, rec = _service(RaisingReader({}))
    svc.record_from_request(_req({"CF-Connecting-IP": IP}), "fetch", "ok")
    # no client and no headers: client_ip() answers "unknown"
    svc.record_from_request(_req({}, client_host=None), "visit", None, visitor_kind="new")
    assert [c[1]["country"] for c in rec.calls] == [None, None]
    assert caplog.records == []
    assert not any(IP in r.getMessage() or "unknown" in r.getMessage() for r in caplog.records)
    assert IP not in repr(rec.calls)


def test_init_loads_an_existing_file_and_starts_the_updater_only_when_asked(tmp_path,
                                                                            monkeypatch):
    loaded: list[str] = []
    monkeypatch.setattr(CountryLookup, "load", lambda self, path: loaded.append(path) or True)
    started: list[str] = []

    class FakeUpdater:
        def __init__(self, lookup, directory, *, client=None):
            self.directory = directory

        def start(self):
            started.append(self.directory)

    monkeypatch.setattr(service_mod, "GeoUpdater", FakeUpdater)
    (tmp_path / GEO_FILENAME).write_bytes(b"x")
    local = AnalyticsConfig(admin_password="pw-long", salt="salt",
                            db_path=str(tmp_path / "analytics.db"))

    svc = service_mod.AnalyticsService()
    svc.init(local, SqliteStore(":memory:"), SpyRecorder(),
             env={"GEOIP_DIR": str(tmp_path), "GEOIP_UPDATE": "1"})
    assert loaded == [str(tmp_path / GEO_FILENAME)]
    assert started == [str(tmp_path)]

    # no GEOIP_UPDATE: the file loads, the updater does not start
    svc = service_mod.AnalyticsService()
    svc.init(local, SqliteStore(":memory:"), SpyRecorder(), env={"GEOIP_DIR": str(tmp_path)})
    assert loaded == [str(tmp_path / GEO_FILENAME)] * 2
    assert started == [str(tmp_path)]

    # the default directory next to the SQLite file, with no file there yet
    svc = service_mod.AnalyticsService()
    svc.init(local, SqliteStore(":memory:"), SpyRecorder(), env={"GEOIP_UPDATE": "yes"})
    assert len(loaded) == 2
    assert started == [str(tmp_path), str(tmp_path / "geoip")]

    # Turso mode without GEOIP_DIR resolves nowhere: nothing loads or starts
    svc = service_mod.AnalyticsService()
    svc.init(TURSO_CFG, SqliteStore(":memory:"), SpyRecorder(), env={"GEOIP_UPDATE": "1"})
    assert len(loaded) == 2 and len(started) == 2
    assert svc.enabled is True


def test_a_geo_setup_failure_never_disables_analytics(monkeypatch, caplog):
    def boom(env, cfg):
        raise RuntimeError("bad geo dir")

    monkeypatch.setattr(service_mod, "resolve_geo_dir", boom)
    svc = service_mod.AnalyticsService()
    svc.init(TURSO_CFG, SqliteStore(":memory:"), SpyRecorder(), env={})
    assert svc.enabled is True
    assert any("country lookup setup failed" in r.getMessage() for r in caplog.records)


def test_init_reads_the_process_environment_by_default(monkeypatch):
    # init() without env uses os.environ, so the container's GEOIP_UPDATE=1
    # and the volume path reach the lookup without main.py changing.
    seen: list = []
    monkeypatch.setattr(service_mod, "resolve_geo_dir",
                        lambda env, cfg: seen.append(env) or None)
    svc = service_mod.AnalyticsService()
    svc.init(TURSO_CFG, SqliteStore(":memory:"), SpyRecorder())
    assert seen == [os.environ]
```

Append to the end of `backend/tests/test_envutil.py`, two blank lines after its last line:

```python
def test_is_truthy_parses_values_directly():
    from app.envutil import is_truthy
    assert all(is_truthy(v) for v in ("1", "true", "YES", " on "))
    assert not any(is_truthy(v) for v in ("", "0", "false", "off", "nope", None))
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd "$(git rev-parse --show-toplevel)/backend" && source .venv/bin/activate && pytest tests/test_geo.py tests/test_service_geo.py tests/test_envutil.py -q -p no:cacheprovider
```

Expected: two collection errors, `ModuleNotFoundError: No module named 'app.analytics.geo'` (both new files), and `test_is_truthy_parses_values_directly` failing with `ImportError: cannot import name 'is_truthy' from 'app.envutil'`.

- [ ] **Step 3: Add the dependency and install it**

In `backend/pyproject.toml` replace

```toml
    "pydantic>=2.7",
]
```

with

```toml
    "pydantic>=2.7",
    "maxminddb>=2.6",
]
```

then install it into the venv (the same command CI runs, `pip install -e './backend[dev]'`, from inside `backend/`):

```bash
cd "$(git rev-parse --show-toplevel)/backend" && source .venv/bin/activate && pip install -e '.[dev]' && python -c "import maxminddb; print(maxminddb.__version__)"
```

Expected: a 3.x version prints (3.2.0 on 2026-09-23).

- [ ] **Step 4: Share the truthy parser**

Replace the entire contents of `backend/app/envutil.py` with:

```python
import os

_TRUTHY = ("1", "true", "yes", "on")


def is_truthy(value: str | None) -> bool:
    """Truthy parsing shared by every feature flag: 1/true/yes/on in any case,
    surrounding whitespace ignored. None and everything else are False."""
    return (value or "").strip().lower() in _TRUTHY


def env_truthy(name: str) -> bool:
    """Shared truthy parsing for feature-flag env vars (MAINTENANCE_MODE,
    GEOIP_UPDATE). One definition so the flags cannot drift apart."""
    return is_truthy(os.environ.get(name))
```

- [ ] **Step 5: Create geo.py**

Create `backend/app/analytics/geo.py`:

```python
"""Offline country lookup (DB-IP Lite) and its monthly updater.

Privacy: an IP is looked up in memory and dropped. Nothing in this module
stores, caches or logs an address. maxminddb's ValueError text quotes the raw
address ("'not-an-ip' does not appear to be an IPv4 or IPv6 address."), so
every lookup failure is swallowed silently, never logged.
"""
import gzip
import logging
import os
import re
import tempfile
import threading
from collections.abc import Mapping
from datetime import UTC, datetime

import httpx
import maxminddb

from .config import AnalyticsConfig

logger = logging.getLogger("savevidai.analytics")

GEO_FILENAME = "dbip-country-lite.mmdb"
MARKER_FILENAME = "dbip-country-lite.month"
DOWNLOAD_URL = "https://download.db-ip.com/free/dbip-country-lite-{month}.mmdb.gz"
MAX_COMPRESSED = 32 * 1024 * 1024
MAX_UNPACKED = 256 * 1024 * 1024
INITIAL_DELAY = 10.0
CYCLE = 24 * 60 * 60.0

_CODE = re.compile(r"^[A-Z]{2}$")
_PLACEHOLDERS = frozenset({"ZZ", "XX"})
_CHUNK = 64 * 1024


class CountryLookup:
    """Holds an open maxminddb reader (or None) and answers country(ip)."""

    def __init__(self, reader=None) -> None:
        self._reader = reader

    @property
    def loaded(self) -> bool:
        return self._reader is not None

    def country(self, ip: str) -> str | None:
        """ISO 3166-1 alpha-2 code or None. Never raises and never logs: the
        catch covers a missing reader, an invalid address (ValueError, whose
        text quotes it), no record, a missing key, and a reader closed by a
        concurrent load()."""
        reader = self._reader
        if reader is None:
            return None
        try:
            code = reader.get(ip)["country"]["iso_code"]
        except Exception:
            return None
        if not isinstance(code, str) or not _CODE.match(code) or code in _PLACEHOLDERS:
            return None
        return code

    @staticmethod
    def validate(path: str) -> bool:
        """True when the file opens, says it is a Country database and resolves
        8.8.8.8 to a two-letter code. Closes the file afterwards."""
        try:
            reader = maxminddb.open_database(path)
        except Exception:
            return False
        try:
            if "Country" not in reader.metadata().database_type:
                return False
            code = reader.get("8.8.8.8")["country"]["iso_code"]
            return isinstance(code, str) and bool(_CODE.match(code))
        except Exception:
            return False
        finally:
            reader.close()

    def load(self, path: str) -> bool:
        """Open `path`, swap it in with one attribute assignment, then close the
        previous reader. A lookup racing the close raises inside country(),
        which returns None for that one event. On failure the old reader stays."""
        try:
            reader = maxminddb.open_database(path)
        except Exception as exc:
            logger.warning("geoip: could not open %s: %r", path, exc)
            return False
        try:
            is_country = "Country" in reader.metadata().database_type
        except Exception:
            is_country = False
        if not is_country:
            reader.close()
            logger.warning("geoip: %s is not a country database, keeping the current one", path)
            return False
        previous, self._reader = self._reader, reader
        if previous is not None:
            previous.close()
        return True


def resolve_geo_dir(env: Mapping[str, str], cfg: AnalyticsConfig) -> str | None:
    """GEOIP_DIR when set; else dirname(ANALYTICS_DB_PATH)/geoip when the SQLite
    backend is in use AND that path is absolute; else None (a bare filename or
    :memory: would otherwise resolve to the working directory)."""
    explicit = (env.get("GEOIP_DIR") or "").strip()
    if explicit:
        return explicit
    sqlite_in_use = bool(cfg.db_path) and not (cfg.turso_url and cfg.turso_token)
    if sqlite_in_use and os.path.isabs(cfg.db_path):
        return os.path.join(os.path.dirname(cfg.db_path), "geoip")
    return None


def _previous_month(month: str) -> str:
    year, mon = (int(part) for part in month.split("-"))
    if mon == 1:
        return f"{year - 1}-12"
    return f"{year}-{mon - 1:02d}"


def _gunzip(src: str, dest: str) -> None:
    total = 0
    with gzip.open(src, "rb") as packed, open(dest, "wb") as out:
        while True:
            chunk = packed.read(_CHUNK)
            if not chunk:
                break
            total += len(chunk)
            if total > MAX_UNPACKED:
                raise ValueError(f"unpacked database over {MAX_UNPACKED} bytes")
            out.write(chunk)


def _unlink(path: str) -> None:
    try:
        os.unlink(path)
    except FileNotFoundError:
        pass


class GeoUpdater:
    """Daemon thread that keeps the DB-IP file current: runs INITIAL_DELAY
    seconds after start(), then every CYCLE seconds. Nothing here can raise
    into request handling or block startup."""

    def __init__(self, lookup, directory: str, *, client: httpx.Client | None = None) -> None:
        self._lookup = lookup
        self._dir = directory
        self._client = client or httpx.Client(timeout=60.0, follow_redirects=False)
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        if self._thread is None:
            self._thread = threading.Thread(target=self._loop, name="geoip-updater", daemon=True)
            self._thread.start()

    def stop(self) -> None:
        self._stop.set()

    def _loop(self) -> None:
        delay = INITIAL_DELAY
        while not self._stop.wait(delay):
            self.run_once(datetime.now(UTC))
            delay = CYCLE

    def run_once(self, now: datetime) -> bool:
        """One update cycle. Returns True only when a new file was installed.
        Failures log one warning line (no traceback) and wait for the next
        cycle."""
        try:
            return self._update(now.astimezone(UTC).strftime("%Y-%m"))
        except Exception as exc:
            logger.warning("geoip update failed: %r", exc)
            return False

    def _marker(self) -> str | None:
        try:
            with open(os.path.join(self._dir, MARKER_FILENAME), encoding="utf-8") as fh:
                return fh.read().strip() or None
        except OSError:
            return None

    def _update(self, wanted: str) -> bool:
        have = self._marker()
        if have == wanted:
            return False
        os.makedirs(self._dir, exist_ok=True)
        status = self._install(wanted)
        if status == "installed":
            return True
        if status != "missing":
            return False
        # The month's file is not published yet: fall back to the previous
        # month, unless that is what we already have.
        fallback = _previous_month(wanted)
        if have == fallback:
            return False
        return self._install(fallback) == "installed"

    def _install(self, month: str) -> str:
        """Download, gunzip, validate, replace, mark, load. Returns "installed",
        "missing" (HTTP 404) or "failed". Every path removes its temp files."""
        fd, packed = tempfile.mkstemp(dir=self._dir, prefix=".dbip-", suffix=".gz.part")
        os.close(fd)
        fd, unpacked = tempfile.mkstemp(dir=self._dir, prefix=".dbip-", suffix=".mmdb.part")
        os.close(fd)
        try:
            status = self._fetch(DOWNLOAD_URL.format(month=month), packed)
            if status == 404:
                logger.warning("geoip: %s is not published yet", month)
                return "missing"
            if status != 200:
                logger.warning("geoip: download of %s returned HTTP %d", month, status)
                return "failed"
            _gunzip(packed, unpacked)
            if not self._lookup.validate(unpacked):
                logger.warning("geoip: downloaded %s failed validation", month)
                return "failed"
            final = os.path.join(self._dir, GEO_FILENAME)
            os.replace(unpacked, final)
            with open(os.path.join(self._dir, MARKER_FILENAME), "w", encoding="utf-8") as fh:
                fh.write(month + "\n")
            self._lookup.load(final)
            logger.info("geoip: installed %s", month)
            return "installed"
        finally:
            _unlink(packed)
            _unlink(unpacked)

    def _fetch(self, url: str, dest: str) -> int:
        """Stream the body to `dest` with a cap on the compressed bytes. Returns
        the HTTP status; the file is only meaningful on 200."""
        with self._client.stream("GET", url) as resp:
            if resp.status_code != 200:
                return resp.status_code
            total = 0
            with open(dest, "wb") as fh:
                for chunk in resp.iter_bytes():
                    total += len(chunk)
                    if total > MAX_COMPRESSED:
                        raise ValueError(f"compressed download over {MAX_COMPRESSED} bytes")
                    fh.write(chunk)
            return 200
```

- [ ] **Step 6: Wire the lookup into the service**

Replace the entire contents of `backend/app/analytics/service.py` with:

```python
import logging
import os
from collections.abc import Mapping

from fastapi import Request

from ..client_ip import client_ip
from ..envutil import is_truthy
from .config import AnalyticsConfig
from .geo import GEO_FILENAME, CountryLookup, GeoUpdater, resolve_geo_dir
from .hashing import today_utc, visitor_hash
from .recorder import Recorder
from .store import Store

logger = logging.getLogger("savevidai.analytics")


class AnalyticsService:
    def __init__(self) -> None:
        self.enabled = False
        self._cfg: AnalyticsConfig | None = None
        self._recorder: Recorder | None = None
        self._lookup = CountryLookup()
        self._updater: GeoUpdater | None = None

    def init(self, cfg: AnalyticsConfig, store: Store, recorder: Recorder,
             env: Mapping[str, str] | None = None) -> None:
        store.init_schema()
        recorder.start()
        self._cfg = cfg
        self._recorder = recorder
        self.enabled = True
        self._start_geo(cfg, os.environ if env is None else env)

    def _start_geo(self, cfg: AnalyticsConfig, env: Mapping[str, str]) -> None:
        # Country lookup is optional: a directory that does not resolve, a
        # missing file or an updater problem only costs the country column.
        # Nothing here may raise into init(), which main.create_app guards.
        try:
            directory = resolve_geo_dir(env, cfg)
            if directory is None:
                return
            path = os.path.join(directory, GEO_FILENAME)
            if os.path.isfile(path):
                self._lookup.load(path)
            if is_truthy(env.get("GEOIP_UPDATE")):
                self._updater = GeoUpdater(self._lookup, directory)
                self._updater.start()
        except Exception as exc:
            logger.warning("country lookup setup failed: %r", exc)

    def record_from_request(self, request: Request, type: str, outcome: str | None,
                            platform: str | None = None, source: str | None = None,
                            visitor_kind: str | None = None,
                            locale: str | None = None) -> None:
        if not self.enabled:
            return
        # Fire-and-forget: recording is called inline on request-handling paths
        # (resolve.py records every fetch outcome), so any unexpected failure
        # here must never propagate into the user-facing response.
        try:
            # The IP lives in this frame only: hashed for the daily visitor id,
            # looked up for the country, then dropped. It is never stored,
            # logged or handed to the recorder.
            ip = client_ip(request)
            visitor = visitor_hash(self._cfg.salt, ip, today_utc())
            country = self._lookup.country(ip)
            self._recorder.record(type, visitor=visitor, outcome=outcome, country=country,
                                  platform=platform, source=source, visitor_kind=visitor_kind,
                                  locale=locale)
        except Exception:
            logger.warning("analytics record_from_request failed", exc_info=True)

    def record_fetch(self, request: Request, outcome: str | None) -> None:
        self.record_from_request(request, "fetch", outcome)

    def config(self) -> AnalyticsConfig | None:
        return self._cfg

    def recorder(self) -> Recorder | None:
        return self._recorder


service = AnalyticsService()


def get_service() -> AnalyticsService:
    return service
```

- [ ] **Step 7: Run the tests to verify they pass**

```bash
cd "$(git rev-parse --show-toplevel)/backend" && source .venv/bin/activate && pytest tests/test_geo.py tests/test_service_geo.py tests/test_envutil.py -q -p no:cacheprovider
```

Expected: `32 passed, 1 skipped` (the skip is the opt-in real-file smoke test).

- [ ] **Step 8: Optional local smoke against the real file**

A real September file sits in the session scratchpad (the owner pre-approved the download; no network needed here):

```bash
cd "$(git rev-parse --show-toplevel)/backend" && source .venv/bin/activate && GEOIP_TEST_DB=/private/tmp/claude-501/-Users-israfil-projects-savevidai/33ce40e6-f9ca-4169-b668-ab73f402cbbf/scratchpad/geoip/dbip-country-lite-2026-09.mmdb pytest "tests/test_geo.py::test_real_file_smoke" -q -p no:cacheprovider
```

Expected: `1 passed` (8.8.8.8 is US, 1.1.1.1 is AU, the IPv6 address is DE, private and loopback ranges are None). Skip this step if the file is gone; the gate does not depend on it.

- [ ] **Step 9: Turn the refresh on in the image and document it**

In `Dockerfile`, directly after `ENV STATIC_DIR=/srv/static` (line 22) add:

```dockerfile
# Monthly refresh of the DB-IP country database (deploy/README.md, section 6).
# Only the image sets it, so tests and CI never touch the network.
ENV GEOIP_UPDATE=1
```

Append to the end of `deploy/README.md`:

```markdown

---

## 6. Country lookup (DB-IP Lite)

The admin's countries panel is fed by an offline lookup on the box: no header
and no third-party call per visitor. The container keeps a copy of the free
DB-IP "IP to Country Lite" database and looks each visitor's IP up in memory
while the event is recorded. Only the two-letter country code is stored; the IP
is discarded right after the daily visitor hash and the lookup, never logged.

- **Data source:** https://db-ip.com/db/download/ip-to-country-lite, fetched as
  `https://download.db-ip.com/free/dbip-country-lite-YYYY-MM.mmdb.gz` (about
  4 MB compressed, 8 MB unpacked).
- **Licence:** Creative Commons Attribution 4.0 (CC BY 4.0). DB-IP requires the
  link `<a href="https://db-ip.com">IP Geolocation by DB-IP</a>` on pages that
  display results from the database. The admin footnote carries it; the public
  pages neither display nor use the results.
- **Where it lives:** `GEOIP_DIR` when set, otherwise `<directory of
  ANALYTICS_DB_PATH>/geoip`, so production resolves to `/data/geoip` on the
  `analytics_data` volume and the file survives rebuilds. Two files:
  `dbip-country-lite.mmdb` and a marker `dbip-country-lite.month` holding the
  `YYYY-MM` it came from.
- **Refresh:** the image sets `GEOIP_UPDATE=1`, so the app checks 10 seconds
  after start and then every 24 hours. When the marker is not the current UTC
  month it downloads that month's file, falls back to the previous month while
  the new one is not published yet, validates it, swaps it in atomically and
  reloads it without a restart. Failures log one warning line and retry on the
  next cycle; the site is never affected. Set `GEOIP_UPDATE=0` in
  `deploy/app.env` to stop the network refresh (the file on disk keeps being
  used).
- **Force a refresh now:** delete the marker and restart the app:
  `docker compose -f compose.prod.yaml exec app rm -f /data/geoip/dbip-country-lite.month`
  then `docker compose -f compose.prod.yaml restart app`.
- **History:** events recorded before this lookup existed keep a NULL country
  and show up as "Not known" in the admin.
```

Append to the end of `deploy/app.env.example`:

```bash

# --- Country lookup (optional) ---
# The admin's countries panel uses an offline DB-IP Lite database kept next to
# the analytics DB (/data/geoip on the analytics_data volume). The image
# refreshes it monthly (GEOIP_UPDATE=1 is set in the Dockerfile). Override the
# directory with GEOIP_DIR, or set GEOIP_UPDATE=0 to stop the refresh. See
# deploy/README.md, section 6.
# GEOIP_DIR=
# GEOIP_UPDATE=1
```

- [ ] **Step 10: Run the task gate**

```bash
cd "$(git rev-parse --show-toplevel)/backend" && source .venv/bin/activate && ruff check . && pytest -q -p no:cacheprovider
```

Expected: `All checks passed!`, then `7 failed, 585 passed, 1 skipped, 7 warnings`, the 7 failures all in `tests/test_stats.py`.

- [ ] **Step 11: Commit**

```bash
cd "$(git rev-parse --show-toplevel)" && git add backend/app/analytics/geo.py backend/app/analytics/service.py backend/app/envutil.py backend/pyproject.toml Dockerfile deploy/README.md deploy/app.env.example backend/tests/test_geo.py backend/tests/test_service_geo.py backend/tests/test_envutil.py && git commit -m "feat(analytics): offline DB-IP country lookup with a monthly updater

CountryLookup answers country(ip) from a local mmdb, GeoUpdater keeps
the file current (10 s after start, then daily, capped, validated,
atomic), and the service hashes and looks the IP up in one frame then
drops it. The cf-ipcountry read is gone.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Report, resolvers and logout endpoints

**Files:**
- Modify: `backend/app/analytics/router.py` (whole file, 180 lines after Task 2)
- Test: `backend/tests/test_admin_api.py` (new)

**Interfaces:**
- Consumes: `compute_report`, `compute_resolvers`, `parse_range`, `parse_tz` from Task 3's `report.py`; `compute_stats` from `stats.py` (still served until the cleanup task); `COOKIE = "svid_admin"`, `verify_cookie`, `service`.
- Produces: `GET /api/admin/report?range=7d&tz=360` (range optional, default 7d; tz required) returning `compute_report(...)` as JSON; `GET /api/admin/resolvers?tz=360`; `POST /api/admin/logout` (204, expired cookie, no cookie needed). Conventions on all three: 404 when analytics is disabled, 401 `{"error":"unauthorized"}` without a valid cookie (report and resolvers), 422 `{"error":"bad_range"}`, 422 `{"error":"bad_tz"}`, 503 `{"error":"analytics_unavailable"}` on any exception. These are what `frontend/src/admin/lib/api.ts` (writer B, Task 6) calls.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_admin_api.py`:

```python
"""The admin report, resolvers and logout endpoints (spec B4, B5, B6)."""
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from app import maintenance
from app.analytics import service as service_mod
from app.analytics.config import AnalyticsConfig
from app.analytics.recorder import Recorder
from app.analytics.store import SqliteStore
from app.main import create_app

REPORT_KEYS = {
    "range", "tz", "bucket", "has_previous", "window", "totals", "previous", "series", "peak",
    "funnel", "outcomes", "platforms", "qualities", "countries", "pages", "hours", "sources",
    "live",
}
TOTAL_KEYS = {
    "visitors", "page_views", "fetches", "ok_fetches", "failed_fetches", "upstream_errors",
    "downloads", "downloaded_visitors", "new_visitors", "returning_visitors", "complete_days",
    "complete_day_visitors",
}


@pytest.fixture()
def enabled_client(monkeypatch):
    store = SqliteStore(":memory:")
    rec = Recorder(store, batch_interval=0.05)
    cfg = AnalyticsConfig("libsql://x", "t", "pw-long", "salt")
    svc = service_mod.AnalyticsService()
    svc.init(cfg, store, rec)
    monkeypatch.setattr(service_mod, "service", svc)
    monkeypatch.setattr("app.analytics.router.service", svc)
    monkeypatch.setattr("app.resolve.analytics", svc, raising=False)
    # https base_url: the admin cookie is Secure, so httpx only sends it back
    # over an https-scheme origin (matches real deployment; plain http would
    # silently drop the cookie and every post-login call would 401).
    client = TestClient(create_app(), base_url="https://testserver", raise_server_exceptions=False)
    return client, svc, store


def _login(client) -> None:
    assert client.post("/api/admin/login", json={"password": "pw-long"}).status_code == 204


def _minutes_ago(minutes: int) -> str:
    return (datetime.now(UTC) - timedelta(minutes=minutes)).strftime("%Y-%m-%d %H:%M:%S")


def _insert(store, rows) -> None:
    store.execute_many([
        ("INSERT INTO events (ts, type, outcome, country, visitor, platform) VALUES (?,?,?,?,?,?)",
         list(r))
        for r in rows
    ])


# ---- report ----------------------------------------------------------------------

def test_report_requires_a_cookie(enabled_client):
    client, *_ = enabled_client
    r = client.get("/api/admin/report?range=7d&tz=360")
    assert r.status_code == 401
    assert r.json() == {"error": "unauthorized"}


def test_report_default_range_shape_and_tz_echo(enabled_client):
    client, *_ = enabled_client
    _login(client)
    r = client.get("/api/admin/report?tz=360")
    assert r.status_code == 200
    body = r.json()
    assert set(body) == REPORT_KEYS
    assert body["range"] == "7d"
    assert body["tz"] == 360
    assert body["bucket"] == "day"
    assert set(body["totals"]) == TOTAL_KEYS
    assert len(body["series"]) == 7
    assert len(body["hours"]) == 24
    assert body["countries"][-1]["country"] == "unknown"
    assert body["has_previous"] is False and body["previous"] is None


def test_report_every_range_is_accepted(enabled_client):
    client, *_ = enabled_client
    _login(client)
    for key, length, bucket in (("today", 24, "hour"), ("7d", 7, "day"), ("30d", 30, "day"),
                                ("90d", 90, "day")):
        body = client.get(f"/api/admin/report?range={key}&tz=0").json()
        assert body["range"] == key
        assert body["bucket"] == bucket
        assert len(body["series"]) == length
    today = client.get("/api/admin/report?range=today&tz=-300").json()
    assert today["window"]["start"] == today["window"]["end"]
    # an empty range value means the default too
    assert client.get("/api/admin/report?range=&tz=0").json()["range"] == "7d"


def test_report_rejects_a_bad_range(enabled_client):
    client, *_ = enabled_client
    _login(client)
    for bad in ("week", "1d", "TODAY", "365d"):
        r = client.get(f"/api/admin/report?range={bad}&tz=0")
        assert r.status_code == 422, bad
        assert r.json() == {"error": "bad_range"}


def test_report_rejects_a_bad_or_missing_tz(enabled_client):
    client, *_ = enabled_client
    _login(client)
    for query in ("range=7d&tz=abc", "range=7d&tz=841", "range=7d&tz=-841", "range=7d&tz=",
                  "range=7d"):
        r = client.get(f"/api/admin/report?{query}")
        assert r.status_code == 422, query
        assert r.json() == {"error": "bad_tz"}


def test_report_answers_503_when_the_store_fails(enabled_client, monkeypatch):
    client, _svc, store = enabled_client
    _login(client)

    def boom(sql, args):
        raise RuntimeError("db gone")

    monkeypatch.setattr(store, "query", boom)
    r = client.get("/api/admin/report?range=7d&tz=0")
    assert r.status_code == 503
    assert r.json() == {"error": "analytics_unavailable"}


def test_report_counts_a_recent_event_in_totals_and_live(enabled_client):
    client, _svc, store = enabled_client
    _insert(store, [
        (_minutes_ago(2), "visit", None, "BD", "v1", "twitter"),
        (_minutes_ago(2), "fetch", "upstream_error", "BD", "v1", "twitter"),
    ])
    _login(client)
    body = client.get("/api/admin/report?range=7d&tz=0").json()
    assert body["totals"]["page_views"] == 1
    assert body["totals"]["fetches"] == 1
    assert body["totals"]["upstream_errors"] == 1
    assert body["totals"]["visitors"] == 1
    assert body["live"] == {"active_now": 1, "fetches_last_hour": 1, "upstream_last_hour": 1}
    assert body["funnel"] == {"visitors": 1, "fetched": 1, "got_result": 0, "downloaded": 0}
    assert body["platforms"] == [{"platform": "twitter", "fetches": 1, "ok": 0, "downloads": 0}]
    assert body["countries"] == [{"country": "BD", "visitors": 1},
                                 {"country": "unknown", "visitors": 0}]
    assert body["peak"]["count"] == 1


def test_report_is_served_during_maintenance(enabled_client):
    client, *_ = enabled_client
    _login(client)
    try:
        maintenance.set_on(True)
        assert client.get("/api/health").status_code == 200
        assert client.get("/api/admin/report?range=today&tz=0").status_code == 200
        assert client.get("/api/admin/resolvers?tz=0").status_code == 200
    finally:
        maintenance.set_on(False)


# ---- resolvers -------------------------------------------------------------------

def test_resolvers_gate_and_five_fixed_rows(enabled_client):
    client, _svc, store = enabled_client
    assert client.get("/api/admin/resolvers?tz=0").status_code == 401
    _insert(store, [
        (_minutes_ago(2), "fetch", "not_found", None, "v1", "twitter"),
        (_minutes_ago(3), "fetch", "ok", None, "v2", "twitter"),
    ])
    _login(client)
    r = client.get("/api/admin/resolvers?tz=360")
    assert r.status_code == 200
    rows = r.json()["platforms"]
    assert [row["platform"] for row in rows] == ["twitter", "tiktok", "reddit", "instagram",
                                                 "facebook"]
    assert rows[0] == {"platform": "twitter", "fetches": 2, "ok": 1,
                       "top_failure": {"outcome": "not_found", "count": 1},
                       "last_failure_min_ago": 2}
    assert rows[1] == {"platform": "tiktok", "fetches": 0, "ok": 0, "top_failure": None,
                       "last_failure_min_ago": None}


def test_resolvers_validates_tz_and_answers_503_on_store_failure(enabled_client, monkeypatch):
    client, _svc, store = enabled_client
    _login(client)
    for query in ("tz=abc", "tz=900", ""):
        r = client.get(f"/api/admin/resolvers?{query}")
        assert r.status_code == 422, query
        assert r.json() == {"error": "bad_tz"}

    def boom(sql, args):
        raise RuntimeError("db gone")

    monkeypatch.setattr(store, "query", boom)
    r = client.get("/api/admin/resolvers?tz=0")
    assert r.status_code == 503
    assert r.json() == {"error": "analytics_unavailable"}


# ---- logout ----------------------------------------------------------------------

def test_logout_expires_the_cookie_and_signs_the_client_out(enabled_client):
    client, *_ = enabled_client
    _login(client)
    assert client.get("/api/admin/maintenance").status_code == 200

    r = client.post("/api/admin/logout")
    assert r.status_code == 204
    header = r.headers["set-cookie"]
    lowered = header.lower()
    assert header.startswith('svid_admin=""')
    assert "path=/api/admin" in lowered
    assert "max-age=0" in lowered
    assert "expires=" in lowered
    assert "httponly" in lowered
    assert "secure" in lowered
    assert "samesite=strict" in lowered

    # httpx honours the expiry: the cookie is gone and the next call is a 401
    assert client.get("/api/admin/maintenance").status_code == 401
    assert client.get("/api/admin/report?range=7d&tz=0").status_code == 401


def test_logout_without_a_cookie_is_still_204(enabled_client):
    client, *_ = enabled_client
    r = client.post("/api/admin/logout")
    assert r.status_code == 204
    assert 'svid_admin=""' in r.headers["set-cookie"]


# ---- disabled ---------------------------------------------------------------------

def test_disabled_returns_404_for_every_new_route(monkeypatch):
    svc = service_mod.AnalyticsService()  # never init()'d -> disabled
    monkeypatch.setattr(service_mod, "service", svc)
    monkeypatch.setattr("app.analytics.router.service", svc)
    client = TestClient(create_app(), base_url="https://testserver", raise_server_exceptions=False)
    assert client.get("/api/admin/report?range=7d&tz=0").status_code == 404
    assert client.get("/api/admin/resolvers?tz=0").status_code == 404
    assert client.post("/api/admin/logout").status_code == 404
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd "$(git rev-parse --show-toplevel)/backend" && source .venv/bin/activate && pytest tests/test_admin_api.py -q -p no:cacheprovider
```

Expected: `12 failed, 1 passed`. The routes do not exist yet, so FastAPI answers 404 everywhere: `assert 404 == 401`, `assert 404 == 200`, `assert 404 == 204`, `assert 404 == 422`, `assert 404 == 503`, plus `KeyError: 'range'` and `KeyError: 'totals'` where a test reads the 404 body. `test_disabled_returns_404_for_every_new_route` passes already because a missing route is a 404 too; it earns its place once the routes exist.

- [ ] **Step 3: Replace the router**

Replace the entire contents of `backend/app/analytics/router.py` with (it keeps Task 2's `locale` field and validator, imports `parse_tz` from `report.py` now, and adds `_unauthorized`, `logout`, `report`, `resolvers`):

```python
import functools
import os
import re
import time
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Request, Response
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, field_validator

from ..limits import limiter
from . import auth as _auth_mod
from .auth import check_password, make_cookie, verify_cookie
from .report import compute_report, compute_resolvers, parse_range, parse_tz
from .service import service
from .stats import compute_stats

router = APIRouter()

_QUALITY_OK = re.compile(r"^(\d{2,4}p|video|hd|sd|photo|album|sound)$")
COOKIE = "svid_admin"

# Carry-forward fix from the Task 4 review: auth.make_cookie/verify_cookie call
# auth._key(password) on every invocation, re-running PBKDF2-HMAC-SHA256 with
# 100k iterations each time. /api/admin/stats is polled every 60s and calls
# verify_cookie per request, so uncached this is a CPU-amplification vector.
# The admin password is fixed for the process lifetime, so memoize the
# derivation here (auth.py's public API is unchanged; this wraps the module's
# internal deriver once, at import time, so every later call reuses the key).
_auth_mod._key = functools.lru_cache(maxsize=4)(_auth_mod._key)


class EventIn(BaseModel):
    type: str
    quality: str | None = None
    platform: str | None = None
    source: str | None = None
    visitor_kind: str | None = None
    locale: str | None = None

    @field_validator("type")
    @classmethod
    def _type(cls, v: str) -> str:
        if v not in ("visit", "download"):
            raise ValueError("bad type")
        return v

    @field_validator("quality")
    @classmethod
    def _quality(cls, v):
        if v is not None and not _QUALITY_OK.match(v):
            raise ValueError("bad quality")
        return v

    @field_validator("platform")
    @classmethod
    def _platform(cls, v):
        if v is not None and v not in ("twitter", "tiktok", "reddit", "instagram", "facebook"):
            raise ValueError("bad platform")
        return v

    @field_validator("source")
    @classmethod
    def _source(cls, v):
        if v is not None and v not in ("direct", "search", "social", "referral", "internal"):
            raise ValueError("bad source")
        return v

    @field_validator("visitor_kind")
    @classmethod
    def _visitor_kind(cls, v):
        if v is not None and v not in ("new", "returning"):
            raise ValueError("bad visitor_kind")
        return v

    @field_validator("locale")
    @classmethod
    def _locale(cls, v):
        if v is not None and v not in ("en", "es", "hi"):
            raise ValueError("bad locale")
        return v


class LoginIn(BaseModel):
    password: str


class MaintenanceIn(BaseModel):
    on: bool


def _require_enabled() -> None:
    if not service.enabled:
        raise HTTPException(status_code=404)


def _unauthorized(request: Request) -> JSONResponse | None:
    """The 401 body for a missing or bad admin cookie, None when signed in."""
    cfg = service.config()
    if verify_cookie(request.cookies.get(COOKIE, ""), cfg.admin_password, time.time()):
        return None
    return JSONResponse(status_code=401, content={"error": "unauthorized"})


def _forced_by_env() -> bool:
    return os.environ.get("MAINTENANCE_MODE", "").strip().lower() in ("1", "true", "yes", "on")


def _maintenance_state() -> dict:
    from ..maintenance import is_on
    return {"on": is_on() or _forced_by_env(), "forced_by_env": _forced_by_env()}


@router.post("/api/event", status_code=204)
@limiter.limit("30/minute")
def event(request: Request, payload: EventIn) -> Response:
    _require_enabled()
    outcome = payload.quality if payload.type == "download" else None
    source = payload.source if payload.type == "visit" else None
    visitor_kind = payload.visitor_kind if payload.type == "visit" else None
    locale = payload.locale if payload.type == "visit" else None
    service.record_from_request(request, payload.type, outcome, platform=payload.platform,
                                source=source, visitor_kind=visitor_kind, locale=locale)
    return Response(status_code=204)


@router.post("/api/admin/login", status_code=204)
@limiter.limit("5/minute")
def login(request: Request, payload: LoginIn) -> Response:
    _require_enabled()
    cfg = service.config()
    if not check_password(payload.password, cfg.admin_password):
        return JSONResponse(status_code=401, content={"error": "unauthorized"})
    resp = Response(status_code=204)
    resp.set_cookie(
        COOKIE, make_cookie(cfg.admin_password, time.time()),
        max_age=2_592_000, httponly=True, secure=True, samesite="strict", path="/api/admin",
    )
    return resp


@router.post("/api/admin/logout", status_code=204)
def logout() -> Response:
    """Clears the admin cookie in this browser (the same attributes login sets,
    so the browser matches the existing cookie). No cookie required: idempotent.
    Cookies are stateless HMACs, so every other browser stays signed in until
    ADMIN_PASSWORD changes."""
    _require_enabled()
    resp = Response(status_code=204)
    resp.delete_cookie(COOKIE, path="/api/admin", secure=True, httponly=True, samesite="strict")
    return resp


@router.get("/api/admin/stats")
def stats(request: Request, days: int = 30, tz: str = "0") -> JSONResponse:
    _require_enabled()
    cfg = service.config()
    cookie = request.cookies.get(COOKIE, "")
    if not verify_cookie(cookie, cfg.admin_password, time.time()):
        return JSONResponse(status_code=401, content={"error": "unauthorized"})
    try:
        tz_min = parse_tz(tz)
    except ValueError:
        return JSONResponse(status_code=422, content={"error": "bad_tz"})
    days = max(1, min(int(days), 365))
    store = service.recorder()._store
    try:
        return JSONResponse(compute_stats(store, days, tz_min))
    except Exception:
        return JSONResponse(status_code=503, content={"error": "analytics_unavailable"})


@router.get("/api/admin/report")
def report(request: Request, range_key: Annotated[str | None, Query(alias="range")] = None,
           tz: str | None = None) -> JSONResponse:
    _require_enabled()
    denied = _unauthorized(request)
    if denied is not None:
        return denied
    try:
        key = parse_range(range_key)
    except ValueError:
        return JSONResponse(status_code=422, content={"error": "bad_range"})
    try:
        tz_min = parse_tz(tz)
    except ValueError:
        return JSONResponse(status_code=422, content={"error": "bad_tz"})
    store = service.recorder()._store
    try:
        return JSONResponse(compute_report(store, key, tz_min, datetime.now(UTC)))
    except Exception:
        return JSONResponse(status_code=503, content={"error": "analytics_unavailable"})


@router.get("/api/admin/resolvers")
def resolvers(request: Request, tz: str | None = None) -> JSONResponse:
    _require_enabled()
    denied = _unauthorized(request)
    if denied is not None:
        return denied
    try:
        tz_min = parse_tz(tz)
    except ValueError:
        return JSONResponse(status_code=422, content={"error": "bad_tz"})
    store = service.recorder()._store
    try:
        return JSONResponse(compute_resolvers(store, tz_min, datetime.now(UTC)))
    except Exception:
        return JSONResponse(status_code=503, content={"error": "analytics_unavailable"})


@router.get("/api/admin/maintenance")
def get_maintenance(request: Request) -> JSONResponse:
    _require_enabled()
    cfg = service.config()
    if not verify_cookie(request.cookies.get(COOKIE, ""), cfg.admin_password, time.time()):
        return JSONResponse(status_code=401, content={"error": "unauthorized"})
    return JSONResponse(_maintenance_state())


@router.post("/api/admin/maintenance")
@limiter.limit("10/minute")
def set_maintenance(request: Request, payload: MaintenanceIn) -> JSONResponse:
    _require_enabled()
    cfg = service.config()
    if not verify_cookie(request.cookies.get(COOKIE, ""), cfg.admin_password, time.time()):
        return JSONResponse(status_code=401, content={"error": "unauthorized"})
    from ..maintenance import set_on
    set_on(payload.on)
    return JSONResponse(_maintenance_state())


@router.get("/admin")
def admin_page() -> FileResponse:
    static_dir = os.environ.get("STATIC_DIR", "")
    path = os.path.join(static_dir, "admin.html")
    if static_dir and os.path.isfile(path):
        # The dashboard must never be indexed. The shell carries a robots meta
        # too; the header covers crawlers that skip the body. Scoped to this
        # route only, so the five public pages stay indexable.
        return FileResponse(path, headers={"X-Robots-Tag": "noindex"})
    raise HTTPException(status_code=404)
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd "$(git rev-parse --show-toplevel)/backend" && source .venv/bin/activate && pytest tests/test_admin_api.py tests/test_analytics_api.py tests/test_maintenance_api.py -q -p no:cacheprovider
```

Expected: `39 passed` (13 + 20 + 6): the new endpoints plus the existing login, stats and maintenance flows still green.

- [ ] **Step 5: Run the task gate**

```bash
cd "$(git rev-parse --show-toplevel)/backend" && source .venv/bin/activate && ruff check . && pytest -q -p no:cacheprovider
```

Expected: `All checks passed!`, then `7 failed, 598 passed, 1 skipped, 7 warnings`, the 7 failures all in `tests/test_stats.py`.

- [ ] **Step 6: Commit**

```bash
cd "$(git rev-parse --show-toplevel)" && git add backend/app/analytics/router.py backend/tests/test_admin_api.py && git commit -m "feat(admin): report, resolvers and logout endpoints

GET /api/admin/report (range, tz) and GET /api/admin/resolvers (tz)
serve report.py with the stats endpoint's auth, 404, 422 and 503
conventions; POST /api/admin/logout expires the cookie with the
attributes login sets.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

---

### Task 6: Frontend foundations (deps, tokens, pure lib, fixtures)

**Files:**
- Modify: `frontend/package.json`, `frontend/package-lock.json`
- Create: `frontend/src/admin/admin.css`
- Create: `frontend/src/admin/lib/api.ts`, `frontend/src/admin/lib/range.ts`, `frontend/src/admin/lib/delta.ts`, `frontend/src/admin/lib/format.ts`, `frontend/src/admin/lib/metrics.ts`, `frontend/src/admin/lib/colors.ts`
- Create: `frontend/src/admin/test/fixtures.ts`
- Test: `frontend/src/admin/lib/api.test.ts`, `frontend/src/admin/lib/range.test.ts`, `frontend/src/admin/lib/delta.test.ts`, `frontend/src/admin/lib/format.test.ts`, `frontend/src/admin/lib/metrics.test.ts`, `frontend/src/admin/lib/colors.test.ts`, `frontend/src/admin/test/fixtures.test.ts`

**Interfaces:**
- Consumes: the backend JSON of spec B4/B5 (Tasks 1 to 5), nothing from the old admin.
- Produces (used by Tasks 7 to 10):
  - `lib/api.ts`: types `RangeKey`, `Bucket`, `Totals`, `SeriesValues`, `SeriesMetric`, `SeriesPoint`, `Peak`, `Funnel`, `OutcomeRow`, `PlatformRow`, `QualityRow`, `CountryRow`, `PageRow`, `HourRow`, `SourceRow`, `Live`, `Report`, `ResolverRow`, `Resolvers`, `Maintenance`, `ProbeResult`, `LoginResult`, `ApiFailure`; functions `probe(): Promise<"ok" | "unauthorized" | "off" | "error">`, `login(password: string): Promise<"ok" | "wrong" | "limited" | "error">`, `logout(): Promise<void>`, `fetchReport(range: RangeKey, tz: number): Promise<Report | "unauthorized" | "error">`, `fetchResolvers(tz: number): Promise<Resolvers | "unauthorized" | "error">`, `getMaintenance(): Promise<Maintenance | "unauthorized" | "error">`, `setMaintenance(on: boolean): Promise<Maintenance | "unauthorized" | "error">`.
  - `lib/range.ts`: `RANGE_KEYS`, `DEFAULT_RANGE`, `RANGE_LABELS`, `RANGE_TITLES`, `RANGE_DAYS`, `parseRange(raw): RangeKey`, type `Page = "analytics" | "site"`, `DEFAULT_PAGE`, `parsePage(raw): Page`, type `UrlState = { page: Page; range: RangeKey }`, `readUrlState(search: string): UrlState`, `buildSearch(state: UrlState): string`, `bucketWord(range): "hour" | "day"`, `currentTz(): number`.
  - `lib/delta.ts`: `change(current: number, previous: number | null | undefined): number | null`, `compareLabel(range: RangeKey): string`.
  - `lib/format.ts`: `formatCount`, `formatCompact`, `formatPercent`, `DASH`, `formatShare`, `formatRatio`, `formatWhole`, `formatDay`, `formatHour`, `formatHourRange`, `formatBucket`, `formatPeak`, `formatSpan`, `formatClock`, `formatAgo`, `utcMidnightLocal`, `countryName`, `PLATFORM_NAMES`, `platformName`, `qualityLabel`, `languageLabel`, `pageLabel`, `sourceLabel`, `OUTCOME_LABELS`, `outcomeLabel`.
  - `lib/metrics.ts`: `ratio`, `successRate`, `conversion`, `downloadsPerVisitor`, `visitorsADay`, `returningShare`, `viewsPerVisitor`, `ratioDelta`, `countDelta`, type `TrendRow`, `trendRows`, `isFlat`, `peakHour`, `quietHours`, `successTone`.
  - `lib/colors.ts`: `COLORS`, `ColorName`, `SERIES`, `tint(hex, alpha = 0.15)`, `OUTCOME_COLORS`, `outcomeColor`, `SURFACE`.
  - `test/fixtures.ts`: `REPORT_7D`, `REPORT_TODAY`, `REPORT_90D`, `REPORTS: Record<RangeKey, Report>`, `EMPTY_REPORT`, `RESOLVERS`.

- [ ] **Step 1: Install the admin-only dependencies**

Run:
```bash
cd "$(git rev-parse --show-toplevel)/frontend" && npm install recharts@^3.8.0 lucide-react@^1.47.0 react-is@^18.3.1
```
Expected: `package.json` `dependencies` now lists `lucide-react`, `react-is`, `recharts` next to `motion`, `react`, `react-dom`; `package-lock.json` resolves recharts 3.10.x (its peer range covers React 18 and needs `react-is`), lucide-react 1.47.x, react-is 18.3.1. No `npm audit` fixes, no other changes.

- [ ] **Step 2: Write `admin.css` (tokens from spec F2, not imported yet)**

Create `frontend/src/admin/admin.css`:

```css
@import "tailwindcss" source(none);
@source "./";

/* Admin design tokens, copied from the premium store admin (spec F2). Dark only.
   --color-*: initial drops Tailwind's default palette so only these colours exist. */
@theme {
  --color-*: initial;
  --color-white: #ffffff;
  --color-black: #000000;

  --color-bg: #000000;
  --color-surface: #1d1d1f;
  --color-elevated: #2c2c2e;
  --color-line: rgba(255, 255, 255, 0.12);
  --color-line-strong: rgba(255, 255, 255, 0.22);
  --color-text-primary: #f5f5f7;
  --color-text-secondary: #a1a1a6;
  --color-text-muted: #86868b;
  --color-brand: #0071e3;
  --color-brand-hover: #0077ed;
  --color-brand-link: #2997ff;
  --color-brand-dim: rgba(41, 151, 255, 0.16);
  --color-success: #30d158;
  --color-success-dim: rgba(48, 209, 88, 0.16);
  --color-warning: #ffd60a;
  --color-warning-dim: rgba(255, 214, 10, 0.16);
  --color-danger: #ff453a;
  --color-danger-dim: rgba(255, 69, 58, 0.16);

  /* Explicit radii: cards, tooltips, dialogs 22px; small stat tiles and empty states 28px;
     nav items and inputs 18px. Pills use rounded-full. */
  --radius-card: 22px;
  --radius-tile: 28px;
  --radius-field: 18px;

  /* Only on the login card, chart tooltips and floating bars. Cards have no shadow. */
  --shadow-raised: 0 4px 12px rgba(0, 0, 0, 0.4), 0 32px 64px -24px rgba(0, 0, 0, 0.7);

  --font-sans: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", "Segoe UI", Roboto, Inter, sans-serif;
  --font-mono: ui-monospace, "SF Mono", Menlo, "Roboto Mono", monospace;

  /* Page title. */
  --text-title: clamp(28px, 3vw, 40px);
  --text-title--line-height: 1.1;
  --text-title--letter-spacing: -0.018em;
  --text-title--font-weight: 600;

  --ease-out-quint: cubic-bezier(0.22, 1, 0.36, 1);
}

@layer base {
  html {
    background: var(--color-bg);
    font-family: var(--font-sans);
    color-scheme: dark;
    scrollbar-color: var(--color-line-strong) transparent;
  }
  body {
    margin: 0;
    background: var(--color-bg);
    color: var(--color-text-primary);
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    text-rendering: optimizeLegibility;
  }
  h1,
  h2,
  h3 {
    text-wrap: balance;
  }
  p {
    text-wrap: pretty;
  }
  button:not(:disabled) {
    cursor: pointer;
  }
  ::selection {
    background: var(--color-brand);
    color: #fff;
  }
  :focus-visible {
    outline: 2px solid var(--color-brand);
    outline-offset: 3px;
  }
}

/* "Analytics", "Site", "Admin" above a title: 12px 600 +0.06em uppercase muted. */
@utility kicker {
  font-size: 12px;
  line-height: 1;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  font-weight: 600;
  color: var(--color-text-muted);
}

/* Blocks fade in and rise 12px over 0.6s; each block sets its own delay (40ms stagger).
   Transform and opacity only. Off under reduced motion. */
.reveal-up {
  opacity: 0;
  transform: translateY(var(--reveal-distance, 12px));
  animation: reveal-up var(--reveal-duration, 0.6s) var(--ease-out-quint) forwards;
  animation-delay: var(--reveal-delay, 0s);
}
@keyframes reveal-up {
  to {
    opacity: 1;
    transform: none;
  }
}
@media (prefers-reduced-motion: reduce) {
  .reveal-up {
    animation: none;
    opacity: 1;
    transform: none;
  }
}
```

Nothing imports this file yet (Task 7 does); the old admin keeps running. Vite compiles it in Task 7's build.

- [ ] **Step 3: Write the failing lib tests**

Create `frontend/src/admin/lib/api.test.ts`:

```ts
import { afterEach, expect, test, vi } from "vitest";
import { fetchReport, fetchResolvers, getMaintenance, login, logout, probe, setMaintenance } from "./api";
import { REPORT_7D, RESOLVERS } from "../test/fixtures";

afterEach(() => {
  vi.unstubAllGlobals();
});

function respond(status: number, body?: unknown) {
  return vi.fn(async (_url: string, _init?: RequestInit) =>
    new Response(body === undefined ? null : JSON.stringify(body), { status }),
  );
}

function failing() {
  return vi.fn(async (_url: string, _init?: RequestInit): Promise<Response> => {
    throw new TypeError("Failed to fetch");
  });
}

test.each([
  [200, "ok"],
  [401, "unauthorized"],
  [404, "off"],
  [503, "error"],
] as const)("probe maps %i to %s", async (status, expected) => {
  const fetchMock = respond(status, { on: false, forced_by_env: false });
  vi.stubGlobal("fetch", fetchMock);
  expect(await probe()).toBe(expected);
  expect(String(fetchMock.mock.calls[0]?.[0])).toBe("/api/admin/maintenance");
});

test("probe reports a network failure as error", async () => {
  vi.stubGlobal("fetch", failing());
  expect(await probe()).toBe("error");
});

test.each([
  [204, "ok"],
  [401, "wrong"],
  [429, "limited"],
  [500, "error"],
] as const)("login maps %i to %s", async (status, expected) => {
  const fetchMock = respond(status);
  vi.stubGlobal("fetch", fetchMock);
  expect(await login("hunter2")).toBe(expected);
  const [url, init] = fetchMock.mock.calls[0] ?? [];
  expect(String(url)).toBe("/api/admin/login");
  expect(init?.method).toBe("POST");
  expect(String((init?.headers as Record<string, string>)["Content-Type"])).toContain("application/json");
  expect(JSON.parse(String(init?.body))).toEqual({ password: "hunter2" });
});

test("login reports a network failure as error", async () => {
  vi.stubGlobal("fetch", failing());
  expect(await login("x")).toBe("error");
});

test("logout POSTs and never throws, even on a network failure", async () => {
  const fetchMock = respond(204);
  vi.stubGlobal("fetch", fetchMock);
  await expect(logout()).resolves.toBeUndefined();
  expect(String(fetchMock.mock.calls[0]?.[0])).toBe("/api/admin/logout");
  expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("POST");
  vi.stubGlobal("fetch", failing());
  await expect(logout()).resolves.toBeUndefined();
});

test("fetchReport sends range and tz and returns the parsed report", async () => {
  const fetchMock = respond(200, REPORT_7D);
  vi.stubGlobal("fetch", fetchMock);
  const r = await fetchReport("7d", 360);
  expect(String(fetchMock.mock.calls[0]?.[0])).toBe("/api/admin/report?range=7d&tz=360");
  expect(r).toEqual(REPORT_7D);
});

test.each([
  [401, "unauthorized"],
  [422, "error"],
  [503, "error"],
] as const)("fetchReport maps %i to %s", async (status, expected) => {
  vi.stubGlobal("fetch", respond(status, { error: "x" }));
  expect(await fetchReport("today", -300)).toBe(expected);
});

test("fetchReport reports a network failure as error", async () => {
  vi.stubGlobal("fetch", failing());
  expect(await fetchReport("7d", 0)).toBe("error");
});

test("fetchResolvers sends tz and returns the five rows", async () => {
  const fetchMock = respond(200, RESOLVERS);
  vi.stubGlobal("fetch", fetchMock);
  const r = await fetchResolvers(360);
  expect(String(fetchMock.mock.calls[0]?.[0])).toBe("/api/admin/resolvers?tz=360");
  expect(r).toEqual(RESOLVERS);
  vi.stubGlobal("fetch", respond(401, { error: "unauthorized" }));
  expect(await fetchResolvers(360)).toBe("unauthorized");
});

test("getMaintenance and setMaintenance return the parsed state or a failure word", async () => {
  vi.stubGlobal("fetch", respond(200, { on: true, forced_by_env: false }));
  expect(await getMaintenance()).toEqual({ on: true, forced_by_env: false });
  const fetchMock = respond(200, { on: false, forced_by_env: false });
  vi.stubGlobal("fetch", fetchMock);
  expect(await setMaintenance(false)).toEqual({ on: false, forced_by_env: false });
  const [url, init] = fetchMock.mock.calls[0] ?? [];
  expect(String(url)).toBe("/api/admin/maintenance");
  expect(init?.method).toBe("POST");
  expect(JSON.parse(String(init?.body))).toEqual({ on: false });
  vi.stubGlobal("fetch", respond(401, { error: "unauthorized" }));
  expect(await getMaintenance()).toBe("unauthorized");
  expect(await setMaintenance(true)).toBe("unauthorized");
  vi.stubGlobal("fetch", respond(503, { error: "analytics_unavailable" }));
  expect(await getMaintenance()).toBe("error");
});
```

Create `frontend/src/admin/lib/range.test.ts`:

```ts
import { afterEach, expect, test, vi } from "vitest";
import {
  buildSearch,
  bucketWord,
  currentTz,
  DEFAULT_RANGE,
  parsePage,
  parseRange,
  RANGE_KEYS,
  RANGE_LABELS,
  RANGE_TITLES,
  readUrlState,
} from "./range";

afterEach(() => {
  vi.restoreAllMocks();
});

test("range keys, labels and titles", () => {
  expect(RANGE_KEYS).toEqual(["today", "7d", "30d", "90d"]);
  expect(DEFAULT_RANGE).toBe("7d");
  expect(RANGE_LABELS).toEqual({ today: "Today", "7d": "7 days", "30d": "30 days", "90d": "90 days" });
  expect(RANGE_TITLES).toEqual({ today: "Today", "7d": "Last 7 days", "30d": "Last 30 days", "90d": "Last 90 days" });
});

test("parseRange accepts the four keys and falls back to 7d", () => {
  expect(parseRange("today")).toBe("today");
  expect(parseRange("90d")).toBe("90d");
  expect(parseRange("14d")).toBe("7d");
  expect(parseRange("")).toBe("7d");
  expect(parseRange(null)).toBe("7d");
  expect(parseRange(undefined)).toBe("7d");
});

test("parsePage knows site and defaults to analytics", () => {
  expect(parsePage("site")).toBe("site");
  expect(parsePage("orders")).toBe("analytics");
  expect(parsePage(null)).toBe("analytics");
});

test("readUrlState reads page and range from a query string", () => {
  expect(readUrlState("")).toEqual({ page: "analytics", range: "7d" });
  expect(readUrlState("?page=site")).toEqual({ page: "site", range: "7d" });
  expect(readUrlState("?range=today")).toEqual({ page: "analytics", range: "today" });
  expect(readUrlState("?page=site&range=30d")).toEqual({ page: "site", range: "30d" });
  expect(readUrlState("?page=nope&range=nope")).toEqual({ page: "analytics", range: "7d" });
});

test("buildSearch omits defaults and round-trips through readUrlState", () => {
  expect(buildSearch({ page: "analytics", range: "7d" })).toBe("");
  expect(buildSearch({ page: "site", range: "7d" })).toBe("?page=site");
  expect(buildSearch({ page: "analytics", range: "90d" })).toBe("?range=90d");
  expect(buildSearch({ page: "site", range: "today" })).toBe("?page=site&range=today");
  for (const page of ["analytics", "site"] as const) {
    for (const range of RANGE_KEYS) {
      expect(readUrlState(buildSearch({ page, range }))).toEqual({ page, range });
    }
  }
});

test("bucketWord is hour for today and day otherwise", () => {
  expect(bucketWord("today")).toBe("hour");
  expect(bucketWord("7d")).toBe("day");
  expect(bucketWord("90d")).toBe("day");
});

test("currentTz is minutes east of UTC (the sign of getTimezoneOffset flipped)", () => {
  vi.spyOn(Date.prototype, "getTimezoneOffset").mockReturnValue(-360);
  expect(currentTz()).toBe(360);
  vi.spyOn(Date.prototype, "getTimezoneOffset").mockReturnValue(300);
  expect(currentTz()).toBe(-300);
});
```

Create `frontend/src/admin/lib/delta.test.ts`:

```ts
import { expect, test } from "vitest";
import { change, compareLabel } from "./delta";

test("change is null with no previous period", () => {
  expect(change(10, null)).toBeNull();
  expect(change(10, undefined)).toBeNull();
});

test("change against a zero previous is 0 for 0 and null otherwise", () => {
  expect(change(0, 0)).toBe(0);
  expect(change(5, 0)).toBeNull();
});

test("change is the relative difference", () => {
  expect(change(120, 100)).toBeCloseTo(0.2);
  expect(change(80, 100)).toBeCloseTo(-0.2);
  expect(change(100, 100)).toBe(0);
});

test("compareLabel reads as the spec titles", () => {
  expect(compareLabel("today")).toBe("yesterday at this time");
  expect(compareLabel("7d")).toBe("the 7 days before");
  expect(compareLabel("30d")).toBe("the 30 days before");
  expect(compareLabel("90d")).toBe("the 90 days before");
});
```

Create `frontend/src/admin/lib/format.test.ts`:

```ts
import { expect, test } from "vitest";
import {
  countryName,
  DASH,
  formatAgo,
  formatBucket,
  formatClock,
  formatCompact,
  formatCount,
  formatDay,
  formatHour,
  formatHourRange,
  formatPeak,
  formatPercent,
  formatRatio,
  formatShare,
  formatSpan,
  formatWhole,
  languageLabel,
  outcomeLabel,
  pageLabel,
  platformName,
  qualityLabel,
  sourceLabel,
  utcMidnightLocal,
} from "./format";

test("counts use thousands separators, compact only for the axis", () => {
  expect(formatCount(0)).toBe("0");
  expect(formatCount(1742)).toBe("1,742");
  expect(formatCount(1234567)).toBe("1,234,567");
  expect(formatCompact(950)).toBe("950");
  expect(formatCompact(1234)).toBe("1.2K");
  expect(formatCompact(3400000)).toBe("3.4M");
});

test("percents: one decimal below 10%, whole numbers from 10%, 0 stays 0%", () => {
  expect(formatPercent(0)).toBe("0%");
  expect(formatPercent(0.0563)).toBe("5.6%");
  expect(formatPercent(0.02)).toBe("2.0%");
  expect(formatPercent(0.0999)).toBe("10.0%");
  expect(formatPercent(0.1)).toBe("10%");
  expect(formatPercent(0.9100284)).toBe("91%");
  expect(formatPercent(0.996)).toBe("100%");
  expect(formatPercent(1)).toBe("100%");
  expect(formatPercent(Number.NaN)).toBe("0%");
});

test("a null ratio renders a dash", () => {
  expect(DASH).toBe("-");
  expect(formatShare(null)).toBe("-");
  expect(formatShare(0.2641)).toBe("26%");
  expect(formatRatio(null)).toBe("-");
  expect(formatRatio(1.326)).toBe("1.3");
  expect(formatRatio(12)).toBe("12.0");
  expect(formatWhole(null)).toBe("-");
  expect(formatWhole(261)).toBe("261");
  expect(formatWhole(1566.4)).toBe("1,566");
});

test("dates read as Sep 17, hours as 14:00, buckets pick by type", () => {
  expect(formatDay("2026-09-17")).toBe("Sep 17");
  expect(formatDay("2026-12-03")).toBe("Dec 3");
  expect(formatDay("garbage")).toBe("garbage");
  expect(formatHour(0)).toBe("00:00");
  expect(formatHour(14)).toBe("14:00");
  expect(formatHourRange(14)).toBe("14:00 to 15:00");
  expect(formatHourRange(23)).toBe("23:00 to 00:00");
  expect(formatBucket("2026-09-20")).toBe("Sep 20");
  expect(formatBucket(9)).toBe("09:00");
});

test("peak note, span line and clock", () => {
  expect(formatPeak({ day: "2026-09-20", time: "21:15" })).toBe("Sep 20 at 21:15");
  expect(formatSpan({ start: "2026-09-17", end: "2026-09-23" })).toBe("Sep 17 to Sep 23, your local time");
  expect(formatSpan({ start: "2026-09-23", end: "2026-09-23" })).toBe("Sep 23, your local time");
  expect(formatClock(new Date(2026, 8, 23, 14, 2))).toBe("14:02");
  expect(formatClock(new Date(2026, 8, 23, 9, 7))).toBe("09:07");
});

test("formatAgo: just now under 1, minutes under 60, then hours", () => {
  expect(formatAgo(0)).toBe("just now");
  expect(formatAgo(0.9)).toBe("just now");
  expect(formatAgo(1)).toBe("1 min ago");
  expect(formatAgo(12)).toBe("12 min ago");
  expect(formatAgo(59)).toBe("59 min ago");
  expect(formatAgo(60)).toBe("1 h ago");
  expect(formatAgo(190)).toBe("3 h ago");
});

test("utcMidnightLocal turns a tz offset into the local clock time of midnight UTC", () => {
  expect(utcMidnightLocal(360)).toBe("06:00");
  expect(utcMidnightLocal(0)).toBe("00:00");
  expect(utcMidnightLocal(-300)).toBe("19:00");
  expect(utcMidnightLocal(330)).toBe("05:30");
  expect(utcMidnightLocal(-570)).toBe("14:30");
});

test("countryName uses the English region name and falls back to the code", () => {
  expect(countryName("BD")).toBe("Bangladesh");
  expect(countryName("US")).toBe("United States");
  expect(countryName("unknown")).toBe("unknown");
  expect(countryName("")).toBe("");
});

test("labels for platforms, qualities, languages, pages, sources and outcomes", () => {
  expect(platformName("twitter")).toBe("X (Twitter)");
  expect(platformName("tiktok")).toBe("TikTok");
  expect(platformName("reddit")).toBe("Reddit");
  expect(platformName("instagram")).toBe("Instagram");
  expect(platformName("facebook")).toBe("Facebook");
  expect(platformName("vimeo")).toBe("vimeo");
  expect(qualityLabel("1080p")).toBe("1080p");
  expect(qualityLabel("hd")).toBe("HD");
  expect(qualityLabel("sd")).toBe("SD");
  expect(qualityLabel("photo")).toBe("Photo");
  expect(qualityLabel("album")).toBe("Album");
  expect(qualityLabel("sound")).toBe("Audio");
  expect(qualityLabel("video")).toBe("Video");
  expect(languageLabel("en")).toBe("English");
  expect(languageLabel("es")).toBe("Spanish");
  expect(languageLabel("hi")).toBe("Hindi");
  expect(languageLabel("unknown")).toBe("language not recorded");
  expect(pageLabel("twitter", "es")).toBe("X (Twitter), Spanish");
  expect(pageLabel("tiktok", "unknown")).toBe("TikTok, language not recorded");
  expect(sourceLabel("direct")).toBe("Direct");
  expect(sourceLabel("search")).toBe("Search");
  expect(sourceLabel("social")).toBe("Social");
  expect(sourceLabel("referral")).toBe("Other sites");
  expect(sourceLabel("internal")).toBe("Between pages");
  expect(outcomeLabel("ok")).toBe("Worked");
  expect(outcomeLabel("not_found")).toBe("Deleted or missing");
  expect(outcomeLabel("invalid_url")).toBe("Not a supported link");
  expect(outcomeLabel("no_video")).toBe("No video in the post");
  expect(outcomeLabel("private_or_restricted")).toBe("Private or restricted");
  expect(outcomeLabel("upstream_error")).toBe("Resolver error");
  expect(outcomeLabel("unsupported_post")).toBe("Unsupported post");
  expect(outcomeLabel("not_configured")).toBe("Not set up");
  expect(outcomeLabel("weird")).toBe("weird");
});
```

Create `frontend/src/admin/lib/metrics.test.ts`:

```ts
import { expect, test } from "vitest";
import { EMPTY_REPORT, REPORT_7D, REPORT_90D, REPORT_TODAY } from "../test/fixtures";
import {
  conversion,
  countDelta,
  downloadsPerVisitor,
  isFlat,
  peakHour,
  quietHours,
  ratio,
  ratioDelta,
  returningShare,
  successRate,
  successTone,
  trendRows,
  viewsPerVisitor,
  visitorsADay,
} from "./metrics";

const t = REPORT_7D.totals;
const p = REPORT_7D.previous!;

test("ratio is null on a zero denominator", () => {
  expect(ratio(1, 0)).toBeNull();
  expect(ratio(0, 0)).toBeNull();
  expect(ratio(1, 4)).toBe(0.25);
});

test("tile ratios from the 7d fixture", () => {
  expect(successRate(t)).toBeCloseTo(2559 / 2812);
  expect(conversion(t)).toBeCloseTo(1187 / 1742);
  expect(downloadsPerVisitor(t)).toBeCloseTo(2310 / 1742);
  expect(visitorsADay(t)).toBe(261);
  expect(returningShare(t)).toBeCloseTo(402 / 1522);
  expect(viewsPerVisitor(t)).toBeCloseTo(2236 / 1742);
});

test("today has no complete day, so visitors a day is null", () => {
  expect(visitorsADay(REPORT_TODAY.totals)).toBeNull();
});

test("ratio deltas compare the ratio itself and are null without a previous period", () => {
  expect(ratioDelta(successRate, t, p)).toBeCloseTo((2559 / 2812 - 2319 / 2590) / (2319 / 2590));
  expect(ratioDelta(successRate, t, null)).toBeNull();
  expect(ratioDelta(visitorsADay, REPORT_TODAY.totals, REPORT_TODAY.previous)).toBeNull();
  expect(ratioDelta(successRate, REPORT_90D.totals, REPORT_90D.previous)).toBeNull();
});

test("count deltas are relative and null without a previous period", () => {
  expect(countDelta((x) => x.fetches, t, p)).toBeCloseTo((2812 - 2590) / 2590);
  expect(countDelta((x) => x.fetches, t, null)).toBeNull();
});

test("trendRows label buckets and pick one metric from cur and prev", () => {
  const rows = trendRows(REPORT_7D, "fetches");
  expect(rows).toHaveLength(7);
  expect(rows[0]).toEqual({ label: "Sep 17", value: 402, prev: 372, prevLabel: "Sep 10" });
  expect(rows[6]).toEqual({ label: "Sep 23", value: 280, prev: 257, prevLabel: "Sep 16" });
  const hourly = trendRows(REPORT_TODAY, "visitors");
  expect(hourly).toHaveLength(24);
  expect(hourly[0]).toEqual({ label: "00:00", value: 9, prev: 8, prevLabel: "00:00" });
  expect(hourly[13].value).toBe(12);
  expect(hourly[14]).toEqual({ label: "14:00", value: null, prev: null, prevLabel: "14:00" });
  const noPrev = trendRows(REPORT_90D, "downloads");
  expect(noPrev).toHaveLength(90);
  expect(noPrev.every((r) => r.prev === null)).toBe(true);
});

test("isFlat is true only when every value and previous value is empty", () => {
  expect(isFlat(trendRows(EMPTY_REPORT, "fetches"))).toBe(true);
  expect(isFlat(trendRows(REPORT_7D, "fetches"))).toBe(false);
  expect(isFlat([{ label: "a", value: null, prev: 3, prevLabel: "b" }])).toBe(false);
});

test("peakHour is the busiest hour, earliest on a tie, null when empty", () => {
  expect(peakHour(REPORT_7D.hours)).toEqual({ hour: 14, fetches: 196 });
  expect(peakHour(REPORT_TODAY.hours)).toEqual({ hour: 12, fetches: 40 });
  expect(peakHour([{ hour: 0, fetches: 2 }, { hour: 1, fetches: 2 }])).toEqual({ hour: 0, fetches: 2 });
  expect(peakHour(EMPTY_REPORT.hours)).toBeNull();
});

test("quietHours counts empty hours", () => {
  expect(quietHours(REPORT_7D.hours)).toBe(0);
  expect(quietHours(REPORT_TODAY.hours)).toBe(10);
  expect(quietHours(EMPTY_REPORT.hours)).toBe(24);
});

test("successTone: green from 90%, yellow from 70%, red below, none without lookups", () => {
  expect(successTone(0, 0)).toBe("none");
  expect(successTone(100, 90)).toBe("green");
  expect(successTone(100, 89)).toBe("yellow");
  expect(successTone(100, 70)).toBe("yellow");
  expect(successTone(100, 69)).toBe("red");
});
```

Create `frontend/src/admin/lib/colors.test.ts`:

```ts
import { expect, test } from "vitest";
import { COLORS, outcomeColor, SERIES, SURFACE, tint } from "./colors";

test("the palette is verbatim from the premium store", () => {
  expect(COLORS).toEqual({
    blue: "#0a84ff",
    green: "#30d158",
    orange: "#ff9f0a",
    purple: "#bf5af2",
    teal: "#64d2ff",
    pink: "#ff375f",
    yellow: "#ffd60a",
    indigo: "#5e5ce6",
    red: "#ff453a",
    gray: "#8e8e93",
  });
  expect(SERIES).toEqual([COLORS.blue, COLORS.green, COLORS.orange, COLORS.purple, COLORS.teal, COLORS.pink, COLORS.yellow, COLORS.indigo]);
  expect(SURFACE).toBe("#1d1d1f");
});

test("tint is the colour at 15% by default", () => {
  expect(tint("#0a84ff")).toBe("rgba(10, 132, 255, 0.15)");
  expect(tint("#30d158", 0.16)).toBe("rgba(48, 209, 88, 0.16)");
  expect(tint("not-a-colour")).toBe("not-a-colour");
});

test("outcome colours follow the spec and unknown outcomes are gray", () => {
  expect(outcomeColor("ok")).toBe(COLORS.green);
  expect(outcomeColor("not_found")).toBe(COLORS.gray);
  expect(outcomeColor("invalid_url")).toBe(COLORS.orange);
  expect(outcomeColor("no_video")).toBe(COLORS.yellow);
  expect(outcomeColor("private_or_restricted")).toBe(COLORS.purple);
  expect(outcomeColor("upstream_error")).toBe(COLORS.red);
  expect(outcomeColor("unsupported_post")).toBe(COLORS.pink);
  expect(outcomeColor("not_configured")).toBe(COLORS.indigo);
  expect(outcomeColor("something_else")).toBe(COLORS.gray);
});
```

- [ ] **Step 4: Run the lib tests to verify they fail**

Run: `cd "$(git rev-parse --show-toplevel)/frontend" && npx vitest run src/admin/lib`
Expected: FAIL. Every file errors at import time with "Failed to resolve import "./api"" (or `./range`, `./delta`, `./format`, `./metrics`, `./colors`, `../test/fixtures`): the modules do not exist yet.

- [ ] **Step 5: Write the lib modules**

Create `frontend/src/admin/lib/api.ts`:

```ts
// Types mirror the backend JSON of spec B4 (report) and B5 (resolvers) exactly.
// Every fetcher maps HTTP status to a small word so views never see a Response.

export type RangeKey = "today" | "7d" | "30d" | "90d";
export type Bucket = "hour" | "day";

export type Totals = {
  visitors: number;
  page_views: number;
  fetches: number;
  ok_fetches: number;
  failed_fetches: number;
  upstream_errors: number;
  downloads: number;
  downloaded_visitors: number;
  new_visitors: number;
  returning_visitors: number;
  complete_days: number;
  complete_day_visitors: number;
};

export type SeriesValues = { visitors: number; fetches: number; downloads: number; failed_fetches: number };
export type SeriesMetric = keyof SeriesValues;

/** Hourly buckets (today) carry integer keys 0..23; daily buckets carry "YYYY-MM-DD". */
export type SeriesPoint = {
  key: string | number;
  prev_key: string | number;
  /** Null for hours after the current local hour (today only). */
  cur: SeriesValues | null;
  /** Null when has_previous is false, and for hours after the current hour. */
  prev: SeriesValues | null;
};

export type Peak = { count: number; day: string; time: string };
export type Funnel = { visitors: number; fetched: number; got_result: number; downloaded: number };
export type OutcomeRow = { outcome: string; count: number };
export type PlatformRow = { platform: string; fetches: number; ok: number; downloads: number };
export type QualityRow = { quality: string; count: number };
export type CountryRow = { country: string; visitors: number };
export type PageRow = { platform: string; locale: string; views: number };
export type HourRow = { hour: number; fetches: number };
export type SourceRow = { source: string; visits: number };
export type Live = { active_now: number; fetches_last_hour: number; upstream_last_hour: number };

export type Report = {
  range: RangeKey;
  tz: number;
  bucket: Bucket;
  has_previous: boolean;
  window: { start: string; end: string };
  totals: Totals;
  previous: Totals | null;
  series: SeriesPoint[];
  peak: Peak | null;
  funnel: Funnel;
  outcomes: OutcomeRow[];
  platforms: PlatformRow[];
  qualities: QualityRow[];
  countries: CountryRow[];
  pages: PageRow[];
  hours: HourRow[];
  sources: SourceRow[];
  live: Live;
};

export type ResolverRow = {
  platform: string;
  fetches: number;
  ok: number;
  top_failure: { outcome: string; count: number } | null;
  last_failure_min_ago: number | null;
};
export type Resolvers = { platforms: ResolverRow[] };

export type Maintenance = { on: boolean; forced_by_env: boolean };

export type ProbeResult = "ok" | "unauthorized" | "off" | "error";
export type LoginResult = "ok" | "wrong" | "limited" | "error";
export type ApiFailure = "unauthorized" | "error";

const JSON_HEADERS = { "Content-Type": "application/json" };

/** GET /api/admin/maintenance as a session probe: 200 ok, 401 unauthorized, 404 analytics off. */
export async function probe(): Promise<ProbeResult> {
  try {
    const r = await fetch("/api/admin/maintenance");
    if (r.status === 200) return "ok";
    if (r.status === 401) return "unauthorized";
    if (r.status === 404) return "off";
    return "error";
  } catch {
    return "error";
  }
}

export async function login(password: string): Promise<LoginResult> {
  try {
    const r = await fetch("/api/admin/login", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ password }),
    });
    if (r.status === 204) return "ok";
    if (r.status === 401) return "wrong";
    if (r.status === 429) return "limited";
    return "error";
  } catch {
    return "error";
  }
}

/** The login view follows whatever happens here; the cookie is httponly, so this is the only way to clear it. */
export async function logout(): Promise<void> {
  try {
    await fetch("/api/admin/logout", { method: "POST" });
  } catch {
    // Nothing to do: the caller shows the login view either way.
  }
}

async function getJson<T>(url: string, init?: RequestInit): Promise<T | ApiFailure> {
  try {
    const r = await fetch(url, init);
    if (r.status === 401) return "unauthorized";
    if (!r.ok) return "error";
    return (await r.json()) as T;
  } catch {
    return "error";
  }
}

export function fetchReport(range: RangeKey, tz: number): Promise<Report | ApiFailure> {
  return getJson<Report>(`/api/admin/report?range=${range}&tz=${tz}`);
}

export function fetchResolvers(tz: number): Promise<Resolvers | ApiFailure> {
  return getJson<Resolvers>(`/api/admin/resolvers?tz=${tz}`);
}

export function getMaintenance(): Promise<Maintenance | ApiFailure> {
  return getJson<Maintenance>("/api/admin/maintenance");
}

export function setMaintenance(on: boolean): Promise<Maintenance | ApiFailure> {
  return getJson<Maintenance>("/api/admin/maintenance", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ on }),
  });
}
```

Create `frontend/src/admin/lib/range.ts`:

```ts
import type { RangeKey } from "./api";

export const RANGE_KEYS: readonly RangeKey[] = ["today", "7d", "30d", "90d"];
export const DEFAULT_RANGE: RangeKey = "7d";
/** Tab labels. */
export const RANGE_LABELS: Record<RangeKey, string> = { today: "Today", "7d": "7 days", "30d": "30 days", "90d": "90 days" };
/** Page titles. */
export const RANGE_TITLES: Record<RangeKey, string> = { today: "Today", "7d": "Last 7 days", "30d": "Last 30 days", "90d": "Last 90 days" };
export const RANGE_DAYS: Record<RangeKey, number> = { today: 1, "7d": 7, "30d": 30, "90d": 90 };

/** Unknown or missing values fall back to the default, so a stale link never breaks the page. */
export function parseRange(raw: string | null | undefined): RangeKey {
  return raw && (RANGE_KEYS as readonly string[]).includes(raw) ? (raw as RangeKey) : DEFAULT_RANGE;
}

export type Page = "analytics" | "site";
export const DEFAULT_PAGE: Page = "analytics";

export function parsePage(raw: string | null | undefined): Page {
  return raw === "site" ? "site" : DEFAULT_PAGE;
}

export type UrlState = { page: Page; range: RangeKey };

export function readUrlState(search: string): UrlState {
  const params = new URLSearchParams(search);
  return { page: parsePage(params.get("page")), range: parseRange(params.get("range")) };
}

/** Defaults carry no parameter: the plain /admin URL is Analytics, last 7 days. */
export function buildSearch(state: UrlState): string {
  const params = new URLSearchParams();
  if (state.page !== DEFAULT_PAGE) params.set("page", state.page);
  if (state.range !== DEFAULT_RANGE) params.set("range", state.range);
  const s = params.toString();
  return s ? `?${s}` : "";
}

export function bucketWord(range: RangeKey): "hour" | "day" {
  return range === "today" ? "hour" : "day";
}

/** Minutes east of UTC, the sign the backend expects (getTimezoneOffset is UTC minus local). */
export function currentTz(): number {
  return -new Date().getTimezoneOffset();
}
```

Create `frontend/src/admin/lib/delta.ts`:

```ts
import type { RangeKey } from "./api";
import { RANGE_DAYS } from "./range";

/** Relative change, or null when there is nothing to compare with. Verbatim from the premium store. */
export function change(current: number, previous: number | null | undefined): number | null {
  if (previous == null) return null;
  if (previous === 0) return current === 0 ? 0 : null;
  return (current - previous) / previous;
}

/** The second half of a delta's title: "Compared with {compareLabel(range)}". */
export function compareLabel(range: RangeKey): string {
  if (range === "today") return "yesterday at this time";
  return `the ${RANGE_DAYS[range]} days before`;
}
```

Create `frontend/src/admin/lib/format.ts`:

```ts
// Raw values to display strings. Numbers use en-US separators everywhere; compact
// notation is only for the chart's Y axis (spec F4).

export function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}

const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

export function formatCompact(n: number): string {
  return compact.format(n);
}

/** One decimal below 10%, whole numbers from 10%. An exact zero is "0%". */
export function formatPercent(x: number): string {
  if (!Number.isFinite(x)) return "0%";
  const pct = x * 100;
  if (pct === 0) return "0%";
  return pct < 10 ? `${pct.toFixed(1)}%` : `${Math.round(pct)}%`;
}

/** What a ratio with a zero denominator renders as. */
export const DASH = "-";

export function formatShare(x: number | null): string {
  return x == null ? DASH : formatPercent(x);
}

/** "1.3", one decimal always. */
export function formatRatio(x: number | null): string {
  return x == null ? DASH : x.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export function formatWhole(x: number | null): string {
  return x == null ? DASH : formatCount(Math.round(x));
}

const DAY_FORMAT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** "2026-09-17" to "Sep 17". The key is already a local date, so it is read as UTC to avoid a shift. */
export function formatDay(key: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return key;
  return DAY_FORMAT.format(new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))));
}

export function formatHour(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

export function formatHourRange(hour: number): string {
  return `${formatHour(hour)} to ${formatHour((hour + 1) % 24)}`;
}

/** Series keys: integers are hours, strings are days. */
export function formatBucket(key: string | number): string {
  return typeof key === "number" ? formatHour(key) : formatDay(key);
}

export function formatPeak(peak: { day: string; time: string }): string {
  return `${formatDay(peak.day)} at ${peak.time}`;
}

/** The header's span line. Today has equal start and end and shows one date. */
export function formatSpan(window: { start: string; end: string }): string {
  const tail = ", your local time";
  if (window.start === window.end) return `${formatDay(window.start)}${tail}`;
  return `${formatDay(window.start)} to ${formatDay(window.end)}${tail}`;
}

/** Local wall clock "14:02" for the Updated line. */
export function formatClock(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** "just now" under 1, "12 min ago" under 60, then "3 h ago" (spec B5). */
export function formatAgo(minutes: number): string {
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${Math.floor(minutes)} min ago`;
  return `${Math.floor(minutes / 60)} h ago`;
}

/** Midnight UTC on the owner's clock, from the tz offset in minutes east of UTC. */
export function utcMidnightLocal(tz: number): string {
  const m = ((tz % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** English region name; .of() throws RangeError on bad input, so fall back to the code. */
export function countryName(code: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

export const PLATFORM_NAMES: Record<string, string> = {
  twitter: "X (Twitter)",
  tiktok: "TikTok",
  reddit: "Reddit",
  instagram: "Instagram",
  facebook: "Facebook",
};

export function platformName(platform: string): string {
  return PLATFORM_NAMES[platform] ?? platform;
}

const QUALITY_LABELS: Record<string, string> = { hd: "HD", sd: "SD", photo: "Photo", album: "Album", sound: "Audio", video: "Video" };

export function qualityLabel(quality: string): string {
  return QUALITY_LABELS[quality] ?? quality;
}

const LANGUAGE_LABELS: Record<string, string> = { en: "English", es: "Spanish", hi: "Hindi" };

export function languageLabel(locale: string): string {
  return LANGUAGE_LABELS[locale] ?? "language not recorded";
}

export function pageLabel(platform: string, locale: string): string {
  return `${platformName(platform)}, ${languageLabel(locale)}`;
}

const SOURCE_LABELS: Record<string, string> = {
  direct: "Direct",
  search: "Search",
  social: "Social",
  referral: "Other sites",
  internal: "Between pages",
};

export function sourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source;
}

export const OUTCOME_LABELS: Record<string, string> = {
  ok: "Worked",
  not_found: "Deleted or missing",
  invalid_url: "Not a supported link",
  no_video: "No video in the post",
  private_or_restricted: "Private or restricted",
  upstream_error: "Resolver error",
  unsupported_post: "Unsupported post",
  not_configured: "Not set up",
};

export function outcomeLabel(outcome: string): string {
  return OUTCOME_LABELS[outcome] ?? outcome;
}
```

Create `frontend/src/admin/lib/metrics.ts`:

```ts
import type { HourRow, Report, SeriesMetric, Totals } from "./api";
import { change } from "./delta";
import { formatBucket } from "./format";

/** Null on a zero denominator; the tile renders a dash. */
export function ratio(num: number, den: number): number | null {
  return den > 0 ? num / den : null;
}

export const successRate = (t: Totals) => ratio(t.ok_fetches, t.fetches);
export const conversion = (t: Totals) => ratio(t.downloaded_visitors, t.visitors);
export const downloadsPerVisitor = (t: Totals) => ratio(t.downloads, t.visitors);
export const visitorsADay = (t: Totals) => ratio(t.complete_day_visitors, t.complete_days);
export const returningShare = (t: Totals) => ratio(t.returning_visitors, t.new_visitors + t.returning_visitors);
export const viewsPerVisitor = (t: Totals) => ratio(t.page_views, t.visitors);

/** Relative change of a derived ratio (spec F4: ratio tiles compare the ratio itself). */
export function ratioDelta(pick: (t: Totals) => number | null, current: Totals, previous: Totals | null): number | null {
  if (!previous) return null;
  const now = pick(current);
  const before = pick(previous);
  if (now == null || before == null) return null;
  return change(now, before);
}

export function countDelta(pick: (t: Totals) => number, current: Totals, previous: Totals | null): number | null {
  return previous ? change(pick(current), pick(previous)) : null;
}

export type TrendRow = { label: string; value: number | null; prev: number | null; prevLabel: string };

/** One metric out of the series, labelled for the axis and the tooltip. */
export function trendRows(report: Report, metric: SeriesMetric): TrendRow[] {
  return report.series.map((p) => ({
    label: formatBucket(p.key),
    value: p.cur ? p.cur[metric] : null,
    prev: p.prev ? p.prev[metric] : null,
    prevLabel: formatBucket(p.prev_key),
  }));
}

/** True when there is nothing to draw in either period. */
export function isFlat(rows: TrendRow[]): boolean {
  return rows.every((r) => !r.value && !r.prev);
}

/** The busiest hour; the earliest wins a tie; null when no hour had a fetch. */
export function peakHour(hours: HourRow[]): HourRow | null {
  let best: HourRow | null = null;
  for (const h of hours) {
    if (h.fetches > 0 && (!best || h.fetches > best.fetches)) best = h;
  }
  return best;
}

export function quietHours(hours: HourRow[]): number {
  return hours.filter((h) => h.fetches === 0).length;
}

/** Resolver health colour: green at 90% and up, yellow at 70% and up, red below, none without lookups. */
export function successTone(fetches: number, ok: number): "green" | "yellow" | "red" | "none" {
  if (fetches === 0) return "none";
  const rate = ok / fetches;
  if (rate >= 0.9) return "green";
  if (rate >= 0.7) return "yellow";
  return "red";
}
```

Create `frontend/src/admin/lib/colors.ts`:

```ts
/** Apple system colours for dark mode, verbatim from premium-store/components/admin/analytics/palette.ts. */
export const COLORS = {
  blue: "#0a84ff",
  green: "#30d158",
  orange: "#ff9f0a",
  purple: "#bf5af2",
  teal: "#64d2ff",
  pink: "#ff375f",
  yellow: "#ffd60a",
  indigo: "#5e5ce6",
  red: "#ff453a",
  gray: "#8e8e93",
} as const;

export type ColorName = keyof typeof COLORS;

/** Category colours in the order they are handed out (donut slices by rank). */
export const SERIES = [COLORS.blue, COLORS.green, COLORS.orange, COLORS.purple, COLORS.teal, COLORS.pink, COLORS.yellow, COLORS.indigo];

/** The colour at 15% (icon tiles, tinted badges). Non-hex input comes back unchanged. */
export function tint(hex: string, alpha = 0.15): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** Fetch outcome colours (spec F3, outcomes panel). */
export const OUTCOME_COLORS: Record<string, string> = {
  ok: COLORS.green,
  not_found: COLORS.gray,
  invalid_url: COLORS.orange,
  no_video: COLORS.yellow,
  private_or_restricted: COLORS.purple,
  upstream_error: COLORS.red,
  unsupported_post: COLORS.pink,
  not_configured: COLORS.indigo,
};

export function outcomeColor(outcome: string): string {
  return OUTCOME_COLORS[outcome] ?? COLORS.gray;
}

/** The card surface, used as the active dot's ring so it reads as a cut-out. */
export const SURFACE = "#1d1d1f";
```

- [ ] **Step 6: Write the shared fixture module**

The fixtures are production-like: about 250 visitor-days, 400 fetches and 330 downloads a day, twitter dominating fetches, roughly 91% of fetches ok, 6% not_found, 2% invalid_url. The 7-day and today series are literal and their totals are the sums of the series; the 90-day series is generated deterministically so its 90 buckets sum to the stated totals. Keep every number below as written: later tasks' tests assert them.

Create `frontend/src/admin/test/fixtures.ts`:

```ts
import type { RangeKey, Report, Resolvers, SeriesPoint, SeriesValues } from "../lib/api";

// Fixed "now": 2026-09-23 07:30 UTC, owner at tz +360 (13:30 local). Matches the backend tests.

const LIVE = { active_now: 6, fetches_last_hour: 27, upstream_last_hour: 0 };

function values(visitors: number, fetches: number, downloads: number, failed_fetches: number): SeriesValues {
  return { visitors, fetches, downloads, failed_fetches };
}

// Sep 17 to Sep 23 (last day partial at 13:30 local): visitors, fetches, downloads, failed.
const DAYS_7: [string, SeriesValues][] = [
  ["2026-09-17", values(248, 402, 331, 37)],
  ["2026-09-18", values(255, 415, 342, 39)],
  ["2026-09-19", values(271, 438, 356, 40)],
  ["2026-09-20", values(283, 461, 379, 41)],
  ["2026-09-21", values(262, 419, 344, 38)],
  ["2026-09-22", values(247, 397, 326, 35)],
  ["2026-09-23", values(176, 280, 232, 23)],
];

// Sep 10 to Sep 16, cut at the same hour on the last day.
const DAYS_7_PREV: [string, SeriesValues][] = [
  ["2026-09-10", values(231, 372, 308, 40)],
  ["2026-09-11", values(226, 364, 302, 38)],
  ["2026-09-12", values(238, 381, 316, 41)],
  ["2026-09-13", values(252, 409, 339, 43)],
  ["2026-09-14", values(244, 396, 328, 40)],
  ["2026-09-15", values(258, 411, 340, 37)],
  ["2026-09-16", values(161, 257, 212, 32)],
];

export const REPORT_7D: Report = {
  range: "7d",
  tz: 360,
  bucket: "day",
  has_previous: true,
  window: { start: "2026-09-17", end: "2026-09-23" },
  totals: {
    visitors: 1742,
    page_views: 2236,
    fetches: 2812,
    ok_fetches: 2559,
    failed_fetches: 253,
    upstream_errors: 17,
    downloads: 2310,
    downloaded_visitors: 1187,
    new_visitors: 1120,
    returning_visitors: 402,
    complete_days: 6,
    complete_day_visitors: 1566,
  },
  previous: {
    visitors: 1610,
    page_views: 2040,
    fetches: 2590,
    ok_fetches: 2319,
    failed_fetches: 271,
    upstream_errors: 21,
    downloads: 2145,
    downloaded_visitors: 1098,
    new_visitors: 1050,
    returning_visitors: 360,
    complete_days: 6,
    complete_day_visitors: 1449,
  },
  series: DAYS_7.map(([key, cur], i) => ({ key, prev_key: DAYS_7_PREV[i][0], cur, prev: DAYS_7_PREV[i][1] })),
  peak: { count: 14, day: "2026-09-20", time: "21:15" },
  funnel: { visitors: 1742, fetched: 1388, got_result: 1296, downloaded: 1187 },
  outcomes: [
    { outcome: "ok", count: 2559 },
    { outcome: "not_found", count: 163 },
    { outcome: "invalid_url", count: 56 },
    { outcome: "upstream_error", count: 17 },
    { outcome: "private_or_restricted", count: 8 },
    { outcome: "no_video", count: 6 },
    { outcome: "unsupported_post", count: 3 },
  ],
  platforms: [
    { platform: "twitter", fetches: 1684, ok: 1552, downloads: 1389 },
    { platform: "tiktok", fetches: 612, ok: 551, downloads: 503 },
    { platform: "instagram", fetches: 298, ok: 262, downloads: 236 },
    { platform: "reddit", fetches: 141, ok: 124, downloads: 112 },
    { platform: "facebook", fetches: 77, ok: 70, downloads: 70 },
  ],
  qualities: [
    { quality: "1080p", count: 1102 },
    { quality: "720p", count: 618 },
    { quality: "hd", count: 214 },
    { quality: "photo", count: 158 },
    { quality: "sd", count: 96 },
    { quality: "480p", count: 71 },
    { quality: "album", count: 29 },
    { quality: "sound", count: 14 },
    { quality: "360p", count: 8 },
  ],
  countries: [
    { country: "US", visitors: 412 },
    { country: "IN", visitors: 298 },
    { country: "BD", visitors: 187 },
    { country: "GB", visitors: 121 },
    { country: "ID", visitors: 96 },
    { country: "PH", visitors: 84 },
    { country: "BR", visitors: 73 },
    { country: "DE", visitors: 61 },
    { country: "NG", visitors: 55 },
    { country: "CA", visitors: 41 },
    { country: "unknown", visitors: 290 },
  ],
  pages: [
    { platform: "twitter", locale: "en", views: 986 },
    { platform: "tiktok", locale: "en", views: 412 },
    { platform: "instagram", locale: "en", views: 246 },
    { platform: "twitter", locale: "es", views: 131 },
    { platform: "reddit", locale: "en", views: 118 },
    { platform: "twitter", locale: "hi", views: 97 },
    { platform: "tiktok", locale: "es", views: 62 },
    { platform: "facebook", locale: "en", views: 58 },
    { platform: "tiktok", locale: "hi", views: 41 },
    { platform: "instagram", locale: "es", views: 33 },
    { platform: "twitter", locale: "unknown", views: 22 },
    { platform: "instagram", locale: "hi", views: 19 },
  ],
  hours: [61, 48, 39, 34, 37, 52, 78, 104, 122, 141, 156, 168, 179, 188, 196, 191, 183, 171, 162, 149, 131, 108, 84, 30].map(
    (fetches, hour) => ({ hour, fetches }),
  ),
  sources: [
    { source: "search", visits: 1204 },
    { source: "direct", visits: 612 },
    { source: "social", visits: 289 },
    { source: "referral", visits: 84 },
    { source: "internal", visits: 47 },
  ],
  live: LIVE,
};

// Today, hours 0..13 (13:30 local); hours 14..23 are null in both series.
const HOURS_TODAY: SeriesValues[] = [
  values(9, 14, 11, 1),
  values(7, 10, 8, 1),
  values(5, 8, 6, 0),
  values(4, 7, 6, 1),
  values(6, 8, 7, 0),
  values(8, 12, 10, 1),
  values(12, 18, 15, 2),
  values(15, 23, 19, 2),
  values(17, 27, 22, 2),
  values(19, 31, 26, 3),
  values(22, 34, 28, 3),
  values(23, 37, 31, 3),
  values(25, 40, 33, 4),
  values(12, 11, 10, 0),
];

const HOURS_YESTERDAY: SeriesValues[] = [
  values(8, 12, 10, 1),
  values(6, 9, 7, 1),
  values(5, 7, 5, 0),
  values(4, 6, 5, 0),
  values(5, 8, 6, 1),
  values(7, 11, 9, 1),
  values(11, 16, 13, 1),
  values(13, 21, 17, 2),
  values(15, 24, 20, 2),
  values(17, 28, 23, 2),
  values(20, 32, 26, 3),
  values(21, 33, 28, 3),
  values(23, 37, 31, 3),
  values(11, 13, 12, 1),
];

export const REPORT_TODAY: Report = {
  range: "today",
  tz: 360,
  bucket: "hour",
  has_previous: true,
  window: { start: "2026-09-23", end: "2026-09-23" },
  // visitors is the visitor-day count (176); the hourly series sums to 184 because a
  // person active in two hours counts in both buckets (spec B3).
  totals: {
    visitors: 176,
    page_views: 231,
    fetches: 280,
    ok_fetches: 257,
    failed_fetches: 23,
    upstream_errors: 2,
    downloads: 232,
    downloaded_visitors: 118,
    new_visitors: 121,
    returning_visitors: 38,
    complete_days: 0,
    complete_day_visitors: 0,
  },
  previous: {
    visitors: 161,
    page_views: 208,
    fetches: 257,
    ok_fetches: 236,
    failed_fetches: 21,
    upstream_errors: 1,
    downloads: 212,
    downloaded_visitors: 106,
    new_visitors: 108,
    returning_visitors: 35,
    complete_days: 0,
    complete_day_visitors: 0,
  },
  series: Array.from({ length: 24 }, (_, hour): SeriesPoint => ({
    key: hour,
    prev_key: hour,
    cur: HOURS_TODAY[hour] ?? null,
    prev: HOURS_YESTERDAY[hour] ?? null,
  })),
  peak: { count: 9, day: "2026-09-23", time: "12:40" },
  funnel: { visitors: 176, fetched: 140, got_result: 130, downloaded: 118 },
  outcomes: [
    { outcome: "ok", count: 257 },
    { outcome: "not_found", count: 15 },
    { outcome: "invalid_url", count: 5 },
    { outcome: "upstream_error", count: 2 },
    { outcome: "no_video", count: 1 },
  ],
  platforms: [
    { platform: "twitter", fetches: 168, ok: 155, downloads: 139 },
    { platform: "tiktok", fetches: 61, ok: 56, downloads: 50 },
    { platform: "instagram", fetches: 30, ok: 27, downloads: 24 },
    { platform: "reddit", fetches: 14, ok: 12, downloads: 12 },
    { platform: "facebook", fetches: 7, ok: 7, downloads: 7 },
  ],
  qualities: [
    { quality: "1080p", count: 111 },
    { quality: "720p", count: 62 },
    { quality: "hd", count: 21 },
    { quality: "photo", count: 16 },
    { quality: "sd", count: 10 },
    { quality: "480p", count: 7 },
    { quality: "album", count: 3 },
    { quality: "sound", count: 2 },
  ],
  countries: [
    { country: "US", visitors: 41 },
    { country: "IN", visitors: 30 },
    { country: "BD", visitors: 19 },
    { country: "GB", visitors: 12 },
    { country: "ID", visitors: 10 },
    { country: "PH", visitors: 8 },
    { country: "BR", visitors: 7 },
    { country: "DE", visitors: 6 },
    { country: "NG", visitors: 5 },
    { country: "CA", visitors: 4 },
    { country: "unknown", visitors: 31 },
  ],
  pages: [
    { platform: "twitter", locale: "en", views: 102 },
    { platform: "tiktok", locale: "en", views: 43 },
    { platform: "instagram", locale: "en", views: 25 },
    { platform: "twitter", locale: "es", views: 14 },
    { platform: "reddit", locale: "en", views: 12 },
    { platform: "twitter", locale: "hi", views: 10 },
    { platform: "tiktok", locale: "es", views: 6 },
    { platform: "facebook", locale: "en", views: 6 },
    { platform: "tiktok", locale: "hi", views: 4 },
    { platform: "instagram", locale: "es", views: 3 },
    { platform: "instagram", locale: "hi", views: 2 },
    { platform: "twitter", locale: "unknown", views: 2 },
  ],
  hours: Array.from({ length: 24 }, (_, hour) => ({ hour, fetches: HOURS_TODAY[hour]?.fetches ?? 0 })),
  sources: [
    { source: "search", visits: 124 },
    { source: "direct", visits: 63 },
    { source: "social", visits: 30 },
    { source: "referral", visits: 9 },
    { source: "internal", visits: 5 },
  ],
  live: LIVE,
};

// 90 days: no previous period (retention is 90 days). The series is generated so its
// buckets sum exactly to the totals, with a weekly swing and a partial last day.
const DAY_MS = 86_400_000;
const REF = Date.UTC(2026, 8, 23);

function dayKey(daysBefore: number): string {
  return new Date(REF - daysBefore * DAY_MS).toISOString().slice(0, 10);
}

function spread(total: number, days: number, seed: number): number[] {
  const weights = Array.from({ length: days }, (_, i) => 1 + 0.12 * Math.sin(((i + seed) * 2 * Math.PI) / 7) + 0.05 * Math.cos((i * 7 + seed) * 0.9));
  weights[days - 1] *= 0.55;
  const sum = weights.reduce((a, b) => a + b, 0);
  const out = weights.map((w) => Math.floor((total * w) / sum));
  let rest = total - out.reduce((a, b) => a + b, 0);
  for (let i = 0; rest > 0; i = (i + 1) % (days - 1), rest -= 1) out[i] += 1;
  return out;
}

const N90 = 90;
const V90 = spread(22646, N90, 1);
const F90 = spread(36556, N90, 2);
const D90 = spread(30030, N90, 3);
const X90 = spread(3289, N90, 4);

function times13<T extends object, K extends keyof T>(rows: T[], key: K): T[] {
  return rows.map((r) => ({ ...r, [key]: (r[key] as number) * 13 }));
}

export const REPORT_90D: Report = {
  range: "90d",
  tz: 360,
  bucket: "day",
  has_previous: false,
  window: { start: dayKey(N90 - 1), end: "2026-09-23" },
  totals: {
    visitors: 22646,
    page_views: 29068,
    fetches: 36556,
    ok_fetches: 33267,
    failed_fetches: 3289,
    upstream_errors: 221,
    downloads: 30030,
    downloaded_visitors: 15431,
    new_visitors: 14560,
    returning_visitors: 5226,
    complete_days: 89,
    complete_day_visitors: 22646 - V90[N90 - 1],
  },
  previous: null,
  series: Array.from({ length: N90 }, (_, i): SeriesPoint => ({
    key: dayKey(N90 - 1 - i),
    prev_key: dayKey(2 * N90 - 1 - i),
    cur: values(V90[i], F90[i], D90[i], X90[i]),
    prev: null,
  })),
  peak: { count: 19, day: "2026-08-30", time: "20:35" },
  funnel: { visitors: 22646, fetched: 18044, got_result: 16848, downloaded: 15431 },
  outcomes: times13(REPORT_7D.outcomes, "count"),
  platforms: REPORT_7D.platforms.map((p) => ({ ...p, fetches: p.fetches * 13, ok: p.ok * 13, downloads: p.downloads * 13 })),
  qualities: times13(REPORT_7D.qualities, "count"),
  countries: times13(REPORT_7D.countries, "visitors"),
  pages: times13(REPORT_7D.pages, "views"),
  hours: times13(REPORT_7D.hours, "fetches"),
  sources: times13(REPORT_7D.sources, "visits"),
  live: LIVE,
};

/** A fresh install: nothing recorded yet, no previous period. */
export const EMPTY_REPORT: Report = {
  range: "7d",
  tz: 0,
  bucket: "day",
  has_previous: false,
  window: { start: "2026-09-17", end: "2026-09-23" },
  totals: {
    visitors: 0,
    page_views: 0,
    fetches: 0,
    ok_fetches: 0,
    failed_fetches: 0,
    upstream_errors: 0,
    downloads: 0,
    downloaded_visitors: 0,
    new_visitors: 0,
    returning_visitors: 0,
    complete_days: 6,
    complete_day_visitors: 0,
  },
  previous: null,
  series: DAYS_7.map(([key], i) => ({ key, prev_key: DAYS_7_PREV[i][0], cur: values(0, 0, 0, 0), prev: null })),
  peak: null,
  funnel: { visitors: 0, fetched: 0, got_result: 0, downloaded: 0 },
  outcomes: [],
  platforms: [],
  qualities: [],
  countries: [{ country: "unknown", visitors: 0 }],
  pages: [],
  hours: Array.from({ length: 24 }, (_, hour) => ({ hour, fetches: 0 })),
  sources: [],
  live: { active_now: 0, fetches_last_hour: 0, upstream_last_hour: 0 },
};

/** One report per range for the fake server. 30d is a stand-in shaped like 7d (range switching tests only). */
export const REPORTS: Record<RangeKey, Report> = {
  today: REPORT_TODAY,
  "7d": REPORT_7D,
  "30d": { ...REPORT_7D, range: "30d", window: { start: "2026-08-25", end: "2026-09-23" } },
  "90d": REPORT_90D,
};

/** Rolling 24 hours. Covers every colour band plus a platform with no lookups. */
export const RESOLVERS: Resolvers = {
  platforms: [
    { platform: "twitter", fetches: 574, ok: 531, top_failure: { outcome: "not_found", count: 31 }, last_failure_min_ago: 12 },
    { platform: "tiktok", fetches: 208, ok: 186, top_failure: { outcome: "not_found", count: 14 }, last_failure_min_ago: 27 },
    { platform: "reddit", fetches: 46, ok: 41, top_failure: { outcome: "no_video", count: 3 }, last_failure_min_ago: 190 },
    { platform: "instagram", fetches: 101, ok: 68, top_failure: { outcome: "private_or_restricted", count: 21 }, last_failure_min_ago: 0 },
    { platform: "facebook", fetches: 0, ok: 0, top_failure: null, last_failure_min_ago: null },
  ],
};
```

- [ ] **Step 7: Write the fixture contract test**

Create `frontend/src/admin/test/fixtures.test.ts`:

```ts
import { expect, test } from "vitest";
import type { Report, SeriesValues } from "../lib/api";
import { EMPTY_REPORT, REPORT_7D, REPORT_90D, REPORT_TODAY, REPORTS, RESOLVERS } from "./fixtures";

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const seriesSum = (r: Report, key: keyof SeriesValues, side: "cur" | "prev") => sum(r.series.map((p) => p[side]?.[key] ?? 0));

const TOTAL_KEYS = [
  "visitors",
  "page_views",
  "fetches",
  "ok_fetches",
  "failed_fetches",
  "upstream_errors",
  "downloads",
  "downloaded_visitors",
  "new_visitors",
  "returning_visitors",
  "complete_days",
  "complete_day_visitors",
];

function checkShape(r: Report) {
  expect(Object.keys(r.totals).sort()).toEqual([...TOTAL_KEYS].sort());
  if (r.previous) expect(Object.keys(r.previous).sort()).toEqual([...TOTAL_KEYS].sort());
  expect(r.hours).toHaveLength(24);
  expect(r.hours.map((h) => h.hour)).toEqual(Array.from({ length: 24 }, (_, i) => i));
  expect(r.countries.at(-1)?.country).toBe("unknown");
  expect(r.countries.length).toBeLessThanOrEqual(11);
  expect(r.pages.length).toBeLessThanOrEqual(12);
  expect(sum(r.outcomes.map((o) => o.count))).toBe(r.totals.fetches);
  expect(sum(r.platforms.map((p) => p.fetches))).toBe(r.totals.fetches);
  expect(sum(r.platforms.map((p) => p.ok))).toBe(r.totals.ok_fetches);
  expect(sum(r.platforms.map((p) => p.downloads))).toBe(r.totals.downloads);
  expect(sum(r.qualities.map((q) => q.count))).toBe(r.totals.downloads);
  expect(sum(r.hours.map((h) => h.fetches))).toBe(r.totals.fetches);
  expect(sum(r.sources.map((s) => s.visits))).toBeLessThanOrEqual(r.totals.page_views);
  expect(sum(r.pages.map((p) => p.views))).toBeLessThanOrEqual(r.totals.page_views);
  expect(sum(r.countries.map((c) => c.visitors))).toBeLessThanOrEqual(r.totals.visitors);
  expect(r.totals.ok_fetches + r.totals.failed_fetches).toBe(r.totals.fetches);
  expect(r.totals.downloaded_visitors).toBe(r.funnel.downloaded);
  expect(r.funnel.visitors).toBe(r.totals.visitors);
  expect(r.funnel.visitors >= r.funnel.fetched && r.funnel.fetched >= r.funnel.got_result && r.funnel.got_result >= r.funnel.downloaded).toBe(true);
  expect(r.totals.new_visitors + r.totals.returning_visitors).toBeLessThanOrEqual(r.totals.visitors);
}

test("7d: daily buckets with a previous period, totals equal the series sums", () => {
  checkShape(REPORT_7D);
  expect(REPORT_7D.bucket).toBe("day");
  expect(REPORT_7D.has_previous).toBe(true);
  expect(REPORT_7D.series).toHaveLength(7);
  expect(REPORT_7D.series[0]).toMatchObject({ key: "2026-09-17", prev_key: "2026-09-10" });
  expect(REPORT_7D.series.every((p) => typeof p.key === "string" && p.cur && p.prev)).toBe(true);
  for (const key of ["visitors", "fetches", "downloads", "failed_fetches"] as const) {
    expect(seriesSum(REPORT_7D, key, "cur")).toBe(REPORT_7D.totals[key]);
    expect(seriesSum(REPORT_7D, key, "prev")).toBe(REPORT_7D.previous![key]);
  }
  expect(REPORT_7D.totals.complete_day_visitors).toBe(1742 - 176);
  expect(REPORT_7D.qualities).toHaveLength(9);
  // Roughly production: 91% ok, 6% not_found, 2% invalid_url, twitter first.
  expect(REPORT_7D.totals.ok_fetches / REPORT_7D.totals.fetches).toBeCloseTo(0.91, 2);
  expect(REPORT_7D.outcomes[1]).toEqual({ outcome: "not_found", count: 163 });
  expect(REPORT_7D.platforms[0].platform).toBe("twitter");
});

test("today: 24 hourly buckets with integer keys, null after the current hour", () => {
  checkShape(REPORT_TODAY);
  expect(REPORT_TODAY.bucket).toBe("hour");
  expect(REPORT_TODAY.window).toEqual({ start: "2026-09-23", end: "2026-09-23" });
  expect(REPORT_TODAY.series).toHaveLength(24);
  expect(REPORT_TODAY.series.map((p) => p.key)).toEqual(Array.from({ length: 24 }, (_, i) => i));
  expect(REPORT_TODAY.series.map((p) => p.prev_key)).toEqual(Array.from({ length: 24 }, (_, i) => i));
  expect(REPORT_TODAY.series.slice(0, 14).every((p) => p.cur && p.prev)).toBe(true);
  expect(REPORT_TODAY.series.slice(14).every((p) => p.cur === null && p.prev === null)).toBe(true);
  for (const key of ["fetches", "downloads", "failed_fetches"] as const) {
    expect(seriesSum(REPORT_TODAY, key, "cur")).toBe(REPORT_TODAY.totals[key]);
    expect(seriesSum(REPORT_TODAY, key, "prev")).toBe(REPORT_TODAY.previous![key]);
  }
  expect(seriesSum(REPORT_TODAY, "visitors", "cur")).toBeGreaterThan(REPORT_TODAY.totals.visitors);
  expect(REPORT_TODAY.totals.complete_days).toBe(0);
  expect(REPORT_TODAY.hours.slice(14).every((h) => h.fetches === 0)).toBe(true);
  expect(REPORT_TODAY.qualities).toHaveLength(8);
});

test("90d: 90 daily buckets, no previous period anywhere, series sums to the totals", () => {
  checkShape(REPORT_90D);
  expect(REPORT_90D.has_previous).toBe(false);
  expect(REPORT_90D.previous).toBeNull();
  expect(REPORT_90D.series).toHaveLength(90);
  expect(REPORT_90D.series.every((p) => p.prev === null && p.cur !== null)).toBe(true);
  expect(REPORT_90D.series[0].key).toBe("2026-06-26");
  expect(REPORT_90D.series[89].key).toBe("2026-09-23");
  expect(REPORT_90D.window).toEqual({ start: "2026-06-26", end: "2026-09-23" });
  for (const key of ["visitors", "fetches", "downloads", "failed_fetches"] as const) {
    expect(seriesSum(REPORT_90D, key, "cur")).toBe(REPORT_90D.totals[key]);
  }
  expect(REPORT_90D.totals.complete_days).toBe(89);
  expect(REPORT_90D.totals.complete_day_visitors).toBe(22646 - (REPORT_90D.series[89].cur?.visitors ?? 0));
  expect(REPORT_90D.series.every((p) => (p.cur?.visitors ?? 0) > 0)).toBe(true);
});

test("the empty report is a valid fresh install", () => {
  checkShape(EMPTY_REPORT);
  expect(EMPTY_REPORT.peak).toBeNull();
  expect(EMPTY_REPORT.countries).toEqual([{ country: "unknown", visitors: 0 }]);
  expect(EMPTY_REPORT.series.every((p) => p.cur?.fetches === 0 && p.prev === null)).toBe(true);
});

test("REPORTS covers every range and RESOLVERS has the five fixed rows in order", () => {
  expect(Object.keys(REPORTS).sort()).toEqual(["30d", "7d", "90d", "today"]);
  expect(REPORTS.today.range).toBe("today");
  expect(REPORTS["30d"].range).toBe("30d");
  expect(RESOLVERS.platforms.map((p) => p.platform)).toEqual(["twitter", "tiktok", "reddit", "instagram", "facebook"]);
  expect(RESOLVERS.platforms[4]).toEqual({ platform: "facebook", fetches: 0, ok: 0, top_failure: null, last_failure_min_ago: null });
  expect(RESOLVERS.platforms.every((p) => p.ok <= p.fetches)).toBe(true);
});
```

- [ ] **Step 8: Run the lib and fixture tests to verify they pass**

Run: `cd "$(git rev-parse --show-toplevel)/frontend" && npx vitest run src/admin/lib src/admin/test`
Expected: PASS, 7 files, 51 tests (api 19 across the `test.each` rows, range 7, delta 4, format 9, metrics 10, colors 3, fixtures 5). If `formatDay` or `countryName` fail, the machine's Node lacks full ICU; the repo's Node 22 has it.

- [ ] **Step 9: Task gate**

Run:
```bash
cd "$(git rev-parse --show-toplevel)/frontend" && npm run lint && npx vitest run && npm run build
```
Expected: `tsc --noEmit` clean; vitest all green (527 baseline + 51 = 578); `vite build` succeeds (admin.css is not imported yet, so the build output is unchanged apart from nothing; the old admin still builds).

- [ ] **Step 10: Commit**

```bash
cd "$(git rev-parse --show-toplevel)" && git add frontend/package.json frontend/package-lock.json frontend/src/admin/admin.css frontend/src/admin/lib/api.ts frontend/src/admin/lib/api.test.ts frontend/src/admin/lib/range.ts frontend/src/admin/lib/range.test.ts frontend/src/admin/lib/delta.ts frontend/src/admin/lib/delta.test.ts frontend/src/admin/lib/format.ts frontend/src/admin/lib/format.test.ts frontend/src/admin/lib/metrics.ts frontend/src/admin/lib/metrics.test.ts frontend/src/admin/lib/colors.ts frontend/src/admin/lib/colors.test.ts frontend/src/admin/test/fixtures.ts frontend/src/admin/test/fixtures.test.ts && git commit -m "feat(admin): report types, tokens, pure lib and fixtures for the redesign

recharts, lucide-react and react-is are admin-only dependencies. admin.css is
written but not imported yet; the old dashboard keeps running until Task 7.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: App shell and auth flow

**Files:**
- Create: `frontend/src/admin/App.tsx`, `frontend/src/admin/hooks/useVisibleInterval.ts`, `frontend/src/admin/hooks/useUrlState.ts`, `frontend/src/admin/components/styles.ts`, `frontend/src/admin/components/Spinner.tsx`, `frontend/src/admin/components/Wordmark.tsx`, `frontend/src/admin/components/Reveal.tsx`, `frontend/src/admin/components/PageHeader.tsx`, `frontend/src/admin/components/CheckingView.tsx`, `frontend/src/admin/components/LoginView.tsx`, `frontend/src/admin/components/UnavailableView.tsx`, `frontend/src/admin/components/Shell.tsx`, `frontend/src/admin/pages/AnalyticsPage.tsx`, `frontend/src/admin/pages/SitePage.tsx`, `frontend/src/admin/test/fakeServer.ts`
- Modify: `frontend/src/admin/main.tsx`, `frontend/admin.html`, `frontend/src/styles/index.css:1-2`
- Test: `frontend/src/admin/App.test.tsx`, `frontend/src/admin/hooks/useVisibleInterval.test.tsx`, `frontend/src/admin/hooks/useUrlState.test.tsx`, `frontend/src/admin/components/Shell.test.tsx`

**Interfaces:**
- Consumes (Task 6): `probe`, `login`, `logout`, `getMaintenance`, types `Maintenance`, `RangeKey`; `currentTz`, `readUrlState`, `buildSearch`, `RANGE_TITLES`, types `Page`, `UrlState`; fixtures `REPORTS`, `RESOLVERS`.
- Produces:
  - `App` (default export none; named `App`), `REFRESH_MS = 30_000`.
  - `useVisibleInterval(fn: () => void, ms: number, enabled?: boolean): void`.
  - `useUrlState(): [UrlState, (next: Partial<UrlState>) => void]`.
  - `components/styles.ts`: `cn(...parts: Array<string | false | null | undefined>): string`, `CARD`, `PRIMARY_BUTTON`, `PILL_BUTTON`.
  - `Spinner({ className? })`, `Wordmark()`, `Reveal({ i?: number; className?: string; children })`, `PageHeader({ kicker: string; title: string; subtitle: string; note?: ReactNode; actions?: ReactNode })`, `CheckingView()`, `LoginView({ onSignedIn: () => void })`, `UnavailableView({ onRetry: () => void })`, `AnalyticsOffView()`, `Shell({ page: Page; maintenanceOn: boolean; onNavigate: (page: Page) => void; onSignOut: () => void; children })`.
  - `pages/AnalyticsPage.tsx`: `AnalyticsPage(props: AnalyticsPageProps)` with `AnalyticsPageProps = { range: RangeKey; tz: number; tick: number; maintenance: Maintenance | null; onRangeChange: (range: RangeKey) => void; onGoToSite: () => void; onUnauthorized: () => void; onUnavailable: () => void }` (Task 8 adds `chartSize?`).
  - `pages/SitePage.tsx`: `SitePage(props: SitePageProps)` with `SitePageProps = { tz: number; tick: number; maintenance: Maintenance | null; onMaintenanceChange: (m: Maintenance) => void; onUnauthorized: () => void }`.
  - `test/fakeServer.ts`: `fakeServer(overrides?: Partial<FakeState>)` returning `{ fetch, state, urls(prefix) }`; `FakeState = { authed: boolean; enabled: boolean; probeStatus: number; loginStatus: number; reportStatus: number; resolversStatus: number; maintenance: Maintenance; down: boolean }`.

- [ ] **Step 1: Write the fake server and the failing tests**

Create `frontend/src/admin/test/fakeServer.ts`:

```ts
import { vi } from "vitest";
import type { Maintenance, RangeKey } from "../lib/api";
import { REPORTS, RESOLVERS } from "./fixtures";

export type FakeState = {
  /** A valid cookie is present. Login with a 204 sets it, logout clears it. */
  authed: boolean;
  /** Analytics configured on the server; false answers 404 everywhere. */
  enabled: boolean;
  /** Status of GET /api/admin/maintenance when not 200 (the probe). */
  probeStatus: number;
  loginStatus: number;
  reportStatus: number;
  resolversStatus: number;
  maintenance: Maintenance;
  /** Every request throws, like a lost connection. */
  down: boolean;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** A fetch stub that answers every admin endpoint from the fixtures. Mutate `state` mid-test. */
export function fakeServer(overrides: Partial<FakeState> = {}) {
  const state: FakeState = {
    authed: true,
    enabled: true,
    probeStatus: 200,
    loginStatus: 204,
    reportStatus: 200,
    resolversStatus: 200,
    maintenance: { on: false, forced_by_env: false },
    down: false,
    ...overrides,
  };
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    const path = url.split("?")[0];
    const method = init?.method ?? "GET";
    if (state.down) throw new TypeError("Failed to fetch");
    if (!state.enabled) return new Response("Not Found", { status: 404 });
    if (path === "/api/admin/login") {
      if (state.loginStatus === 204) {
        state.authed = true;
        return new Response(null, { status: 204 });
      }
      return json({ error: state.loginStatus === 429 ? "rate_limited" : "unauthorized" }, state.loginStatus);
    }
    if (path === "/api/admin/logout") {
      state.authed = false;
      return new Response(null, { status: 204 });
    }
    if (!state.authed) return json({ error: "unauthorized" }, 401);
    if (path === "/api/admin/maintenance") {
      if (method === "POST") {
        state.maintenance = { ...state.maintenance, on: Boolean(JSON.parse(String(init?.body)).on) };
        return json(state.maintenance);
      }
      if (state.probeStatus !== 200) return json({ error: "analytics_unavailable" }, state.probeStatus);
      return json(state.maintenance);
    }
    if (path === "/api/admin/report") {
      if (state.reportStatus !== 200) return json({ error: "analytics_unavailable" }, state.reportStatus);
      const range = (new URL(url, "http://admin.test").searchParams.get("range") ?? "7d") as RangeKey;
      return json(REPORTS[range]);
    }
    if (path === "/api/admin/resolvers") {
      if (state.resolversStatus !== 200) return json({ error: "analytics_unavailable" }, state.resolversStatus);
      return json(RESOLVERS);
    }
    return new Response("Not Found", { status: 404 });
  });
  return {
    fetch: fetchMock,
    state,
    /** Every requested URL that starts with `prefix`, in order. */
    urls: (prefix: string) => fetchMock.mock.calls.map((c) => String(c[0])).filter((u) => u.startsWith(prefix)),
  };
}

export type FakeServer = ReturnType<typeof fakeServer>;
```

Create `frontend/src/admin/hooks/useVisibleInterval.test.tsx`:

```tsx
import { act, render } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { useVisibleInterval } from "./useVisibleInterval";

function Ticker({ fn, enabled = true }: { fn: () => void; enabled?: boolean }) {
  useVisibleInterval(fn, 30_000, enabled);
  return null;
}

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
  document.dispatchEvent(new Event("visibilitychange"));
}

afterEach(() => {
  vi.useRealTimers();
  delete (document as unknown as { visibilityState?: string }).visibilityState;
});

test("fires every 30 s while the tab is visible", () => {
  vi.useFakeTimers();
  const fn = vi.fn();
  render(<Ticker fn={fn} />);
  act(() => {
    vi.advanceTimersByTime(29_999);
  });
  expect(fn).not.toHaveBeenCalled();
  act(() => {
    vi.advanceTimersByTime(1);
  });
  expect(fn).toHaveBeenCalledTimes(1);
  act(() => {
    vi.advanceTimersByTime(60_000);
  });
  expect(fn).toHaveBeenCalledTimes(3);
});

test("skips ticks while hidden and catches up at once when the tab returns after 30 s", () => {
  vi.useFakeTimers();
  const fn = vi.fn();
  render(<Ticker fn={fn} />);
  act(() => {
    setVisibility("hidden");
  });
  act(() => {
    vi.advanceTimersByTime(90_000);
  });
  expect(fn).not.toHaveBeenCalled();
  act(() => {
    setVisibility("visible");
  });
  expect(fn).toHaveBeenCalledTimes(1);
  // Back within 30 s of the last call: nothing extra fires.
  act(() => {
    setVisibility("hidden");
    vi.advanceTimersByTime(5_000);
    setVisibility("visible");
  });
  expect(fn).toHaveBeenCalledTimes(1);
});

test("does nothing while disabled and stops on unmount", () => {
  vi.useFakeTimers();
  const fn = vi.fn();
  const { rerender, unmount } = render(<Ticker fn={fn} enabled={false} />);
  act(() => {
    vi.advanceTimersByTime(60_000);
  });
  expect(fn).not.toHaveBeenCalled();
  rerender(<Ticker fn={fn} enabled />);
  act(() => {
    vi.advanceTimersByTime(30_000);
  });
  expect(fn).toHaveBeenCalledTimes(1);
  unmount();
  act(() => {
    vi.advanceTimersByTime(60_000);
  });
  expect(fn).toHaveBeenCalledTimes(1);
});
```

Create `frontend/src/admin/hooks/useUrlState.test.tsx`:

```tsx
import { act, renderHook } from "@testing-library/react";
import { beforeEach, expect, test } from "vitest";
import { useUrlState } from "./useUrlState";

beforeEach(() => {
  window.history.replaceState(null, "", "/");
});

test("reads the initial state from the query string", () => {
  window.history.replaceState(null, "", "/?page=site&range=30d");
  const { result } = renderHook(() => useUrlState());
  expect(result.current[0]).toEqual({ page: "site", range: "30d" });
});

test("updates write the URL with pushState and keep the other key", () => {
  const { result } = renderHook(() => useUrlState());
  act(() => {
    result.current[1]({ range: "today" });
  });
  expect(result.current[0]).toEqual({ page: "analytics", range: "today" });
  expect(window.location.search).toBe("?range=today");
  act(() => {
    result.current[1]({ page: "site" });
  });
  expect(result.current[0]).toEqual({ page: "site", range: "today" });
  expect(window.location.search).toBe("?page=site&range=today");
  act(() => {
    result.current[1]({ page: "analytics", range: "7d" });
  });
  expect(window.location.search).toBe("");
});

test("popstate restores both keys from the URL", () => {
  const { result } = renderHook(() => useUrlState());
  act(() => {
    result.current[1]({ page: "site", range: "90d" });
  });
  act(() => {
    window.history.replaceState(null, "", "/?range=today");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  expect(result.current[0]).toEqual({ page: "analytics", range: "today" });
});
```

Create `frontend/src/admin/components/Shell.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { Shell } from "./Shell";

test("marks the current page, shows the On pill while maintenance is on, and wires the callbacks", async () => {
  const onNavigate = vi.fn();
  const onSignOut = vi.fn();
  render(
    <Shell page="analytics" maintenanceOn onNavigate={onNavigate} onSignOut={onSignOut}>
      <p>body</p>
    </Shell>,
  );
  expect(screen.getByText("SaveVid")).toBeInTheDocument();
  expect(screen.getByText("Admin")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Analytics" })).toHaveAttribute("aria-current", "page");
  expect(screen.getByRole("button", { name: /^Site/ })).not.toHaveAttribute("aria-current");
  expect(screen.getByText("On")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "View site" })).toHaveAttribute("href", "/");
  expect(screen.getByText("body")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: /^Site/ }));
  expect(onNavigate).toHaveBeenCalledWith("site");
  await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
  expect(onSignOut).toHaveBeenCalledTimes(1);
});

test("no On pill while the site is live; Site is current on the site page", () => {
  render(
    <Shell page="site" maintenanceOn={false} onNavigate={() => {}} onSignOut={() => {}}>
      <p>body</p>
    </Shell>,
  );
  expect(screen.queryByText("On")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Site" })).toHaveAttribute("aria-current", "page");
  expect(screen.getByRole("button", { name: "Analytics" })).not.toHaveAttribute("aria-current");
});
```

Create `frontend/src/admin/App.test.tsx`:

```tsx
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { App } from "./App";
import { fakeServer } from "./test/fakeServer";

beforeEach(() => {
  window.history.replaceState(null, "", "/");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

test("checking: no login flash, a spinner only after 400 ms, then the shell", async () => {
  vi.useFakeTimers();
  const server = fakeServer();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const real = server.fetch;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input) === "/api/admin/maintenance" && !init?.method) await gate;
      return real(input, init);
    }),
  );
  render(<App />);
  expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(399);
  });
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(screen.getByRole("status", { name: "Checking your session" })).toBeInTheDocument();
  release();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10);
  });
  expect(screen.getByRole("heading", { name: "Last 7 days" })).toBeInTheDocument();
  expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});

test("a 401 probe goes straight to the login view with the button disabled while empty", async () => {
  vi.stubGlobal("fetch", fakeServer({ authed: false }).fetch);
  render(<App />);
  expect(await screen.findByLabelText("Password")).toHaveAttribute("autocomplete", "current-password");
  expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  expect(screen.getByText("Traffic, downloads and site controls for SaveVid AI")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Sign in" })).toBeDisabled();
});

test("signing in with the right password shows the shell and never the password again", async () => {
  const server = fakeServer({ authed: false });
  vi.stubGlobal("fetch", server.fetch);
  render(<App />);
  const field = await screen.findByLabelText("Password");
  await userEvent.type(field, "hunter2");
  expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
  await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
  expect(await screen.findByRole("heading", { name: "Last 7 days" })).toBeInTheDocument();
  expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
  const loginCall = server.fetch.mock.calls.find((c) => String(c[0]) === "/api/admin/login");
  expect(JSON.parse(String(loginCall?.[1]?.body))).toEqual({ password: "hunter2" });
});

test("a wrong password says so, marks the field and stays on the login view", async () => {
  vi.stubGlobal("fetch", fakeServer({ authed: false, loginStatus: 401 }).fetch);
  render(<App />);
  const field = await screen.findByLabelText("Password");
  await userEvent.type(field, "nope");
  await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
  expect(await screen.findByText("Wrong password")).toBeInTheDocument();
  expect(field).toHaveAttribute("aria-invalid", "true");
  expect(screen.queryByRole("heading", { name: "Last 7 days" })).not.toBeInTheDocument();
});

test("too many tries shows the rate-limit line without marking the field", async () => {
  vi.stubGlobal("fetch", fakeServer({ authed: false, loginStatus: 429 }).fetch);
  render(<App />);
  const field = await screen.findByLabelText("Password");
  await userEvent.type(field, "pw");
  await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
  expect(await screen.findByText("Too many tries. Wait a minute")).toBeInTheDocument();
  expect(field).not.toHaveAttribute("aria-invalid");
});

test("a network failure while signing in says the server could not be reached", async () => {
  const server = fakeServer({ authed: false });
  vi.stubGlobal("fetch", server.fetch);
  render(<App />);
  const field = await screen.findByLabelText("Password");
  await userEvent.type(field, "pw");
  server.state.down = true;
  await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
  expect(await screen.findByText("Could not reach the server")).toBeInTheDocument();
});

test("sign out posts to logout and returns to the login view", async () => {
  const server = fakeServer();
  vi.stubGlobal("fetch", server.fetch);
  render(<App />);
  await screen.findByRole("heading", { name: "Last 7 days" });
  await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
  expect(await screen.findByLabelText("Password")).toBeInTheDocument();
  const logoutCall = server.fetch.mock.calls.find((c) => String(c[0]) === "/api/admin/logout");
  expect(logoutCall?.[1]?.method).toBe("POST");
});

test("the nav switches pages, writes the URL, and popstate restores it", async () => {
  vi.stubGlobal("fetch", fakeServer().fetch);
  render(<App />);
  await screen.findByRole("heading", { name: "Last 7 days" });
  await userEvent.click(screen.getByRole("button", { name: "Site" }));
  expect(screen.getByRole("heading", { name: "Site" })).toBeInTheDocument();
  expect(screen.getByText("Maintenance switch and resolver health")).toBeInTheDocument();
  expect(window.location.search).toBe("?page=site");
  expect(screen.getByRole("button", { name: "Site" })).toHaveAttribute("aria-current", "page");
  await userEvent.click(screen.getByRole("button", { name: "Analytics" }));
  expect(screen.getByRole("heading", { name: "Last 7 days" })).toBeInTheDocument();
  expect(window.location.search).toBe("");
  act(() => {
    window.history.replaceState(null, "", "/?page=site");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  expect(screen.getByRole("heading", { name: "Site" })).toBeInTheDocument();
});

test("?page=site on load opens the Site page", async () => {
  window.history.replaceState(null, "", "/?page=site");
  vi.stubGlobal("fetch", fakeServer().fetch);
  render(<App />);
  expect(await screen.findByRole("heading", { name: "Site" })).toBeInTheDocument();
});

test("a 404 probe explains that analytics is off and names the variables", async () => {
  vi.stubGlobal("fetch", fakeServer({ enabled: false }).fetch);
  render(<App />);
  expect(await screen.findByRole("heading", { name: "Analytics is off on this server" })).toBeInTheDocument();
  for (const name of ["ADMIN_PASSWORD", "ANALYTICS_SALT", "ANALYTICS_DB_PATH", "TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN"]) {
    expect(screen.getByText(name)).toBeInTheDocument();
  }
  expect(screen.getByText(/deploy\/app\.env/)).toBeInTheDocument();
  expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
});

test("a 503 probe shows Unavailable, and Retry recovers", async () => {
  const server = fakeServer({ probeStatus: 503 });
  vi.stubGlobal("fetch", server.fetch);
  render(<App />);
  expect(await screen.findByRole("heading", { name: "Analytics is unavailable" })).toBeInTheDocument();
  expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
  server.state.probeStatus = 200;
  await userEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(await screen.findByRole("heading", { name: "Last 7 days" })).toBeInTheDocument();
});

test("while maintenance is on, the Site nav item carries the On pill", async () => {
  vi.stubGlobal("fetch", fakeServer({ maintenance: { on: true, forced_by_env: false } }).fetch);
  render(<App />);
  expect(await screen.findByText("On")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Site On" })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `cd "$(git rev-parse --show-toplevel)/frontend" && npx vitest run src/admin/App.test.tsx src/admin/hooks src/admin/components`
Expected: FAIL at import time: "Failed to resolve import "./App"", "./useVisibleInterval", "./useUrlState", "./Shell".

- [ ] **Step 3: Write the shell, views, hooks, page stubs and App**

Create `frontend/src/admin/components/styles.ts`:

```ts
/** Joins class names, dropping falsy parts. No merge logic: keep utilities non-conflicting. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/** Cards: 22px radius, surface, faint border, no shadow (spec F2). */
export const CARD = "rounded-card border border-line/50 bg-surface";

/** The blue pill: 44px tall, full width, spinner-ready. */
export const PRIMARY_BUTTON =
  "inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-brand px-5 text-sm font-medium text-white transition-colors hover:bg-brand-hover disabled:pointer-events-none disabled:opacity-50";

/** A quiet pill button for secondary actions. */
export const PILL_BUTTON =
  "inline-flex h-9 items-center justify-center gap-2 rounded-full border border-line-strong bg-white/[0.04] px-4 text-[13px] font-medium text-text-primary transition-colors hover:bg-white/[0.08] disabled:pointer-events-none disabled:opacity-50";
```

Create `frontend/src/admin/components/Spinner.tsx`:

```tsx
import { LoaderCircle } from "lucide-react";

export function Spinner({ className = "size-4" }: { className?: string }) {
  return <LoaderCircle aria-hidden="true" className={`animate-spin ${className}`} />;
}
```

Create `frontend/src/admin/components/Wordmark.tsx`:

```tsx
import { ArrowDownToLine } from "lucide-react";

/** A 22px blue rounded square with a white download arrow, then "SaveVid". */
export function Wordmark() {
  return (
    <span className="inline-flex items-center gap-2">
      <span aria-hidden="true" className="grid size-[22px] shrink-0 place-items-center rounded-[6px] bg-brand text-white">
        <ArrowDownToLine className="size-3.5" strokeWidth={2.5} />
      </span>
      <span className="text-[15px] font-semibold tracking-[-0.01em] text-text-primary">SaveVid</span>
    </span>
  );
}
```

Create `frontend/src/admin/components/Reveal.tsx`:

```tsx
import type { CSSProperties, ReactNode } from "react";

/** Fade in and rise 12px over 0.6s, 40ms later per index. Pure CSS (admin.css .reveal-up). */
export function Reveal({ i = 0, className, children }: { i?: number; className?: string; children: ReactNode }) {
  const style = { "--reveal-delay": `${(0.04 * i).toFixed(2)}s` } as CSSProperties;
  return (
    <div className={["reveal-up", className].filter(Boolean).join(" ")} style={style}>
      {children}
    </div>
  );
}
```

Create `frontend/src/admin/components/PageHeader.tsx`:

```tsx
import type { ReactNode } from "react";
import { Reveal } from "./Reveal";

/** Kicker, big title, one muted line, an optional 12px note, and actions on the right (bottom-aligned from 640px). */
export function PageHeader({ kicker, title, subtitle, note, actions }: { kicker: string; title: string; subtitle: string; note?: ReactNode; actions?: ReactNode }) {
  return (
    <Reveal className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <p className="kicker mb-2">{kicker}</p>
        <h1 className="text-title text-text-primary">{title}</h1>
        <p className="mt-1.5 text-[13px] leading-relaxed text-text-muted">{subtitle}</p>
        {note ? <p className="mt-1 text-xs text-text-muted">{note}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center">{actions}</div> : null}
    </Reveal>
  );
}
```

Create `frontend/src/admin/components/CheckingView.tsx`:

```tsx
import { useEffect, useState } from "react";
import { Spinner } from "./Spinner";

/** Plain black while the session probe runs; a small spinner only after 400ms. */
export function CheckingView() {
  const [late, setLate] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setLate(true), 400);
    return () => clearTimeout(t);
  }, []);
  return (
    <main className="grid min-h-svh place-items-center">
      {late ? (
        <div role="status" aria-label="Checking your session" className="text-text-muted">
          <Spinner className="size-5" />
        </div>
      ) : null}
    </main>
  );
}
```

Create `frontend/src/admin/components/LoginView.tsx`:

```tsx
import { useState, type FormEvent } from "react";
import { motion, useAnimationControls } from "motion/react";
import { login, type LoginResult } from "../lib/api";
import { Spinner } from "./Spinner";
import { Wordmark } from "./Wordmark";
import { CARD, cn, PRIMARY_BUTTON } from "./styles";

const MESSAGES: Record<Exclude<LoginResult, "ok">, string> = {
  wrong: "Wrong password",
  limited: "Too many tries. Wait a minute",
  error: "Could not reach the server",
};

/** Centred 384px column: wordmark, then the sign-in card. A wrong password shakes the card. */
export function LoginView({ onSignedIn }: { onSignedIn: () => void }) {
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<Exclude<LoginResult, "ok"> | null>(null);
  const shake = useAnimationControls();

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!password || pending) return;
    setPending(true);
    setError(null);
    const result = await login(password);
    setPending(false);
    if (result === "ok") {
      setPassword("");
      onSignedIn();
      return;
    }
    setError(result);
    if (result === "wrong") void shake.start({ x: [0, -6, 6, -4, 4, 0], transition: { duration: 0.4 } });
  }

  const wrong = error === "wrong";
  return (
    <main className="grid min-h-svh place-items-center px-[clamp(20px,4vw,48px)] py-12">
      <div className="w-full max-w-sm">
        <Wordmark />
        <motion.div animate={shake} className={cn(CARD, "mt-10 p-6 shadow-raised sm:p-8")}>
          <p className="kicker mb-2">Admin</p>
          <h1 className="text-[clamp(20px,1.8vw,24px)] leading-tight font-semibold tracking-[-0.01em] text-text-primary">Sign in</h1>
          <p className="mt-1.5 text-[13px] text-text-muted">Traffic, downloads and site controls for SaveVid AI</p>
          <form onSubmit={submit} noValidate className="mt-6 flex flex-col gap-2">
            <label htmlFor="admin-password" className="text-[13px] text-text-secondary">
              Password
            </label>
            <input
              id="admin-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={wrong || undefined}
              aria-describedby="admin-password-message"
              className={cn(
                "h-11 w-full rounded-field border bg-white/[0.04] px-4 text-base text-text-primary outline-none transition-colors focus:ring-[3px] focus:ring-brand/40",
                wrong ? "border-danger" : "border-line-strong focus:border-brand",
              )}
            />
            <p id="admin-password-message" role="alert" className="min-h-5 text-xs text-danger">
              {error ? MESSAGES[error] : ""}
            </p>
            <button type="submit" disabled={!password || pending} className={cn(PRIMARY_BUTTON, "mt-2")}>
              {pending ? <Spinner /> : null}
              Sign in
            </button>
          </form>
        </motion.div>
      </div>
    </main>
  );
}
```

Create `frontend/src/admin/components/UnavailableView.tsx`:

```tsx
import type { ReactNode } from "react";
import { Wordmark } from "./Wordmark";
import { CARD, cn, PRIMARY_BUTTON } from "./styles";

function Frame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="grid min-h-svh place-items-center px-[clamp(20px,4vw,48px)] py-12">
      <div className="w-full max-w-sm">
        <Wordmark />
        <div className={cn(CARD, "mt-10 p-6 shadow-raised sm:p-8")}>
          <p className="kicker mb-2">Admin</p>
          <h1 className="text-[clamp(20px,1.8vw,24px)] leading-tight font-semibold tracking-[-0.01em] text-text-primary">{title}</h1>
          {children}
        </div>
      </div>
    </main>
  );
}

const CODE = "font-mono text-[12px] text-text-secondary";

/** The probe or the first report failed with anything but 401 or 404. */
export function UnavailableView({ onRetry }: { onRetry: () => void }) {
  return (
    <Frame title="Analytics is unavailable">
      <p className="mt-1.5 text-[13px] leading-relaxed text-text-muted">The dashboard could not reach the analytics service. The public site is not affected.</p>
      <button type="button" onClick={onRetry} className={cn(PRIMARY_BUTTON, "mt-6")}>
        Retry
      </button>
    </Frame>
  );
}

/** 404 from the admin API: analytics is not configured on this server. */
export function AnalyticsOffView() {
  return (
    <Frame title="Analytics is off on this server">
      <p className="mt-1.5 text-[13px] leading-relaxed text-text-muted">
        It needs <code className={CODE}>ADMIN_PASSWORD</code>, <code className={CODE}>ANALYTICS_SALT</code> and <code className={CODE}>ANALYTICS_DB_PATH</code> (or the{" "}
        <code className={CODE}>TURSO_DATABASE_URL</code> and <code className={CODE}>TURSO_AUTH_TOKEN</code> pair), all in deploy/app.env on the server. Set them and redeploy.
      </p>
    </Frame>
  );
}
```

Create `frontend/src/admin/components/Shell.tsx`:

```tsx
import type { ReactNode } from "react";
import { motion } from "motion/react";
import { ChartColumn, ExternalLink, LogOut, Server } from "lucide-react";
import type { Page } from "../lib/range";
import { Wordmark } from "./Wordmark";
import { cn } from "./styles";

const NAV: { page: Page; label: string; icon: typeof ChartColumn }[] = [
  { page: "analytics", label: "Analytics", icon: ChartColumn },
  { page: "site", label: "Site", icon: Server },
];

const ITEM = "relative flex shrink-0 items-center gap-3 rounded-field px-3 py-2 text-sm whitespace-nowrap transition-colors";
const QUIET = "text-text-muted hover:text-text-primary";

/**
 * From 768px: a 240px sticky sidebar with the nav and, at the bottom, View site and Sign out.
 * Below: a top block with the wordmark row, then one horizontally scrolling row of pills that
 * ends with Sign out. One DOM for both, so nothing is duplicated.
 */
export function Shell({ page, maintenanceOn, onNavigate, onSignOut, children }: { page: Page; maintenanceOn: boolean; onNavigate: (page: Page) => void; onSignOut: () => void; children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col md:flex-row">
      <aside className="flex shrink-0 flex-col border-b border-line bg-surface md:sticky md:top-0 md:h-svh md:w-60 md:self-start md:overflow-y-auto md:border-r md:border-b-0">
        <div className="flex items-center justify-between px-5 py-5">
          <Wordmark />
          <span className="rounded-full bg-brand-dim px-2 py-0.5 text-[10px] font-medium tracking-wide text-brand-link uppercase">Admin</span>
        </div>
        <nav aria-label="Admin" className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-1 md:flex-col">
          {NAV.map((item) => {
            const active = item.page === page;
            const Icon = item.icon;
            return (
              <button key={item.page} type="button" aria-current={active ? "page" : undefined} onClick={() => onNavigate(item.page)} className={cn(ITEM, active ? "text-text-primary" : QUIET)}>
                {active ? <motion.span layoutId="admin-nav" className="absolute inset-0 rounded-field bg-elevated" transition={{ type: "spring", stiffness: 380, damping: 32 }} /> : null}
                <Icon className="relative size-4" />
                <span className="relative">{item.label}</span>
                {item.page === "site" && maintenanceOn ? <span className="relative ml-auto rounded-full bg-warning-dim px-1.5 py-px text-[10px] font-semibold text-warning">On</span> : null}
              </button>
            );
          })}
          <div className="flex gap-1 md:mt-auto md:flex-col md:border-t md:border-line md:pt-3">
            <a href="/" target="_blank" rel="noreferrer" className={cn(ITEM, QUIET)}>
              <ExternalLink className="size-4" />
              View site
            </a>
            <button type="button" onClick={onSignOut} className={cn(ITEM, QUIET)}>
              <LogOut className="size-4" />
              Sign out
            </button>
          </div>
        </nav>
      </aside>
      <main className="min-w-0 flex-1 px-[clamp(20px,4vw,48px)] py-8 md:px-10">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
```

Create `frontend/src/admin/hooks/useVisibleInterval.ts`:

```ts
import { useEffect, useRef } from "react";

/**
 * Calls `fn` every `ms` while the tab is visible. When the tab becomes visible again and the
 * last call is older than `ms`, it calls at once. Nothing runs while `enabled` is false.
 */
export function useVisibleInterval(fn: () => void, ms: number, enabled = true): void {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(() => {
    if (!enabled) return;
    let last = Date.now();
    const fire = () => {
      last = Date.now();
      fnRef.current();
    };
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") fire();
    }, ms);
    const onVisibility = () => {
      if (document.visibilityState === "visible" && Date.now() - last >= ms) fire();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [ms, enabled]);
}
```

Create `frontend/src/admin/hooks/useUrlState.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from "react";
import { buildSearch, readUrlState, type UrlState } from "../lib/range";

/** `?page=` and `?range=` as state. Changes push a history entry; popstate restores both. */
export function useUrlState(): [UrlState, (next: Partial<UrlState>) => void] {
  const [state, setState] = useState<UrlState>(() => readUrlState(window.location.search));
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const onPop = () => setState(readUrlState(window.location.search));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // pushState runs outside the state updater so StrictMode's double invocation cannot push twice.
  const update = useCallback((next: Partial<UrlState>) => {
    const merged = { ...stateRef.current, ...next };
    if (merged.page === stateRef.current.page && merged.range === stateRef.current.range) return;
    window.history.pushState(null, "", `${window.location.pathname}${buildSearch(merged)}`);
    setState(merged);
  }, []);

  return [state, update];
}
```

Create `frontend/src/admin/pages/AnalyticsPage.tsx` (Task 7 stub; Task 8 rewrites it):

```tsx
import type { Maintenance, RangeKey } from "../lib/api";
import { RANGE_TITLES } from "../lib/range";
import { PageHeader } from "../components/PageHeader";

export type AnalyticsPageProps = {
  range: RangeKey;
  tz: number;
  tick: number;
  maintenance: Maintenance | null;
  onRangeChange: (range: RangeKey) => void;
  onGoToSite: () => void;
  onUnauthorized: () => void;
  onUnavailable: () => void;
};

/** The header only; Task 8 adds the data loading, live strip and trend card. */
export function AnalyticsPage({ range }: AnalyticsPageProps) {
  return <PageHeader kicker="Analytics" title={RANGE_TITLES[range]} subtitle="Your local time" />;
}
```

Create `frontend/src/admin/pages/SitePage.tsx` (Task 7 stub; Task 10 rewrites it):

```tsx
import type { Maintenance } from "../lib/api";
import { PageHeader } from "../components/PageHeader";

export type SitePageProps = {
  tz: number;
  tick: number;
  maintenance: Maintenance | null;
  onMaintenanceChange: (m: Maintenance) => void;
  onUnauthorized: () => void;
};

/** The header only; Task 10 adds the maintenance card and resolver health. */
export function SitePage(_props: SitePageProps) {
  return <PageHeader kicker="Site" title="Site" subtitle="Maintenance switch and resolver health" />;
}
```

Create `frontend/src/admin/App.tsx`:

```tsx
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { MotionConfig } from "motion/react";
import { getMaintenance, logout, probe, type Maintenance } from "./lib/api";
import { currentTz } from "./lib/range";
import { useUrlState } from "./hooks/useUrlState";
import { useVisibleInterval } from "./hooks/useVisibleInterval";
import { CheckingView } from "./components/CheckingView";
import { LoginView } from "./components/LoginView";
import { Shell } from "./components/Shell";
import { AnalyticsOffView, UnavailableView } from "./components/UnavailableView";
import { AnalyticsPage } from "./pages/AnalyticsPage";
import { SitePage } from "./pages/SitePage";

type Phase = "checking" | "login" | "off" | "unavailable" | "shell";

/** Everything refreshes on one 30 s cycle while the tab is visible (spec F5). */
export const REFRESH_MS = 30_000;

export function App() {
  const [phase, setPhase] = useState<Phase>("checking");
  const [maintenance, setMaintenance] = useState<Maintenance | null>(null);
  const [tick, setTick] = useState(0);
  const [url, setUrl] = useUrlState();
  const tz = currentTz();

  // Probe the session before showing anything, so a signed-in owner never sees the login form.
  const check = useCallback(async () => {
    setPhase("checking");
    const result = await probe();
    setPhase(result === "ok" ? "shell" : result === "unauthorized" ? "login" : result === "off" ? "off" : "unavailable");
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  const toLogin = useCallback(() => {
    setMaintenance(null);
    setPhase("login");
  }, []);
  const toUnavailable = useCallback(() => setPhase("unavailable"), []);

  useVisibleInterval(() => setTick((t) => t + 1), REFRESH_MS, phase === "shell");

  // The maintenance flag feeds the nav pill and the live strip; it rides the same cycle.
  useEffect(() => {
    if (phase !== "shell") return;
    let alive = true;
    void getMaintenance().then((m) => {
      if (!alive) return;
      if (m === "unauthorized") toLogin();
      else if (m !== "error") setMaintenance(m);
    });
    return () => {
      alive = false;
    };
  }, [phase, tick, toLogin]);

  async function signOut() {
    await logout();
    toLogin();
  }

  let body: ReactNode;
  if (phase === "checking") body = <CheckingView />;
  else if (phase === "login") body = <LoginView onSignedIn={() => setPhase("shell")} />;
  else if (phase === "off") body = <AnalyticsOffView />;
  else if (phase === "unavailable") body = <UnavailableView onRetry={() => void check()} />;
  else
    body = (
      <Shell page={url.page} maintenanceOn={maintenance?.on ?? false} onNavigate={(page) => setUrl({ page })} onSignOut={() => void signOut()}>
        {url.page === "site" ? (
          <SitePage tz={tz} tick={tick} maintenance={maintenance} onMaintenanceChange={setMaintenance} onUnauthorized={toLogin} />
        ) : (
          <AnalyticsPage
            range={url.range}
            tz={tz}
            tick={tick}
            maintenance={maintenance}
            onRangeChange={(range) => setUrl({ range })}
            onGoToSite={() => setUrl({ page: "site" })}
            onUnauthorized={toLogin}
            onUnavailable={toUnavailable}
          />
        )}
      </Shell>
    );

  return <MotionConfig reducedMotion="user">{body}</MotionConfig>;
}
```

Replace `frontend/src/admin/main.tsx` with:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./admin.css";

createRoot(document.getElementById("admin-root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

Replace `frontend/admin.html` with (noindex kept; no font preload, no theme script, no utility classes; dark colour scheme; black body so there is no white flash):

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="noindex, nofollow" />
    <meta name="color-scheme" content="dark" />
    <title>SaveVid AI admin</title>
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  </head>
  <body style="margin: 0; background: #000">
    <div id="admin-root"></div>
    <script type="module" src="/src/admin/main.tsx"></script>
  </body>
</html>
```

Edit `frontend/src/styles/index.css`: the first line stays `@import "tailwindcss";` and the second line becomes the new `@source not "../admin";` (relative to `src/styles`, so it excludes `src/admin`), before the `@font-face` comment:

```css
@import "tailwindcss";
@source not "../admin";
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd "$(git rev-parse --show-toplevel)/frontend" && npx vitest run src/admin`
Expected: PASS. New: App 12, useVisibleInterval 3, useUrlState 3, Shell 2 (20 tests). The old `Admin.test.tsx`, `SiteControls.test.tsx` and `api.test.ts` still pass untouched (they import the old files, which nothing else uses now).

- [ ] **Step 5: Task gate, plus the stylesheet split**

Run:
```bash
cd "$(git rev-parse --show-toplevel)/frontend" && npm run lint && npx vitest run && npm run build && ls dist/assets/admin-*.css && grep -c "bg-surface" dist/assets/admin-*.css && grep -c "bg-surface" dist/assets/index-*.css; grep -c 'name="robots" content="noindex' dist/admin.html && grep -c "onest" dist/admin.html
```
Expected: lint clean; vitest all green (578 + 20 = 598); build succeeds; `dist/assets/admin-*.css` exists and contains `bg-surface` (count 1 or more); the `index-*.css` grep prints `0` (the public stylesheet has no admin utilities; `grep -c` exits 1 on zero matches, which is why the chain uses `;` before the next check); `dist/admin.html` has the noindex meta (1) and no Onest preload (0).

- [ ] **Step 6: Commit**

```bash
cd "$(git rev-parse --show-toplevel)" && git add frontend/admin.html frontend/src/styles/index.css frontend/src/admin/main.tsx frontend/src/admin/App.tsx frontend/src/admin/App.test.tsx frontend/src/admin/hooks/useVisibleInterval.ts frontend/src/admin/hooks/useVisibleInterval.test.tsx frontend/src/admin/hooks/useUrlState.ts frontend/src/admin/hooks/useUrlState.test.tsx frontend/src/admin/components/styles.ts frontend/src/admin/components/Spinner.tsx frontend/src/admin/components/Wordmark.tsx frontend/src/admin/components/Reveal.tsx frontend/src/admin/components/PageHeader.tsx frontend/src/admin/components/CheckingView.tsx frontend/src/admin/components/LoginView.tsx frontend/src/admin/components/UnavailableView.tsx frontend/src/admin/components/Shell.tsx frontend/src/admin/components/Shell.test.tsx frontend/src/admin/pages/AnalyticsPage.tsx frontend/src/admin/pages/SitePage.tsx frontend/src/admin/test/fakeServer.ts && git commit -m "feat(admin): new app shell, auth flow and url state

The admin entry now mounts App with admin.css; the public stylesheet stops
scanning src/admin. Pages are header-only until Tasks 8 to 10.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Analytics page part 1 (header, range tabs, live strip, trend card, data loading)

**Files:**
- Create: `frontend/src/admin/components/Delta.tsx`, `frontend/src/admin/components/RangeTabs.tsx`, `frontend/src/admin/components/LiveStrip.tsx`, `frontend/src/admin/components/TrendCard.tsx`, `frontend/src/admin/test/text.ts`
- Modify: `frontend/src/admin/pages/AnalyticsPage.tsx` (full rewrite of the Task 7 stub), `frontend/src/admin/App.test.tsx` (append three tests)
- Test: `frontend/src/admin/components/Delta.test.tsx`, `frontend/src/admin/components/RangeTabs.test.tsx`, `frontend/src/admin/components/LiveStrip.test.tsx`, `frontend/src/admin/components/TrendCard.test.tsx`, `frontend/src/admin/pages/AnalyticsPage.test.tsx`

**Interfaces:**
- Consumes (Task 6): `fetchReport`, types `Report`, `Live`, `Maintenance`, `RangeKey`, `SeriesMetric`; `RANGE_KEYS`, `RANGE_LABELS`, `RANGE_TITLES`; `change`, `compareLabel`; `formatClock`, `formatCompact`, `formatCount`, `formatSpan`; `trendRows`, `isFlat`, type `TrendRow`; `COLORS`, `SURFACE`. (Task 7): `PageHeader`, `Reveal`, `cn`, `CARD`, `fakeServer`, `AnalyticsPageProps`.
- Produces:
  - `Delta({ value: number | null; compare?: string; invert?: boolean })`.
  - `RangeTabs({ active: RangeKey; onChange: (key: RangeKey) => void })`.
  - `LiveStrip({ live: Live; maintenance: Maintenance | null; onGoToSite: () => void })`.
  - `TrendCard({ report: Report; compare: string; size?: ChartSize })`, `TrendTooltip({ active?: boolean; payload?: ReadonlyArray<{ payload?: unknown }>; color: string; showPrev: boolean })`, `METRICS`, type `ChartSize = { width: number; height: number }`.
  - `AnalyticsPageProps` gains `chartSize?: ChartSize`; `AnalyticsPage` loads the report itself and renders the header, live strip and trend card inside an `aria-busy` body that Task 9 extends.
  - `test/text.ts`: `wholeText(text: string): Matcher`.

- [ ] **Step 1: Write the text matcher and the failing tests**

Create `frontend/src/admin/test/text.ts`:

```ts
import type { Matcher } from "@testing-library/react";

const norm = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

/**
 * Matches the smallest element whose whole text equals `text`, for pills like
 * "<span>6</span> on the site now" whose text is split across child spans.
 */
export function wholeText(text: string): Matcher {
  return (_content, node) => {
    if (!node) return false;
    if (norm(node.textContent) !== text) return false;
    return !Array.from(node.children).some((child) => norm(child.textContent) === text);
  };
}
```

Create `frontend/src/admin/components/Delta.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { Delta } from "./Delta";

test("renders nothing for null", () => {
  const { container } = render(<Delta value={null} compare="the 7 days before" />);
  expect(container).toBeEmptyDOMElement();
});

test("a rounded 0% is plain muted text without a pill, still titled", () => {
  render(<Delta value={0.004} compare="the 7 days before" />);
  const el = screen.getByText("0%");
  expect(el).toHaveAttribute("title", "Compared with the 7 days before");
  expect(el.className).not.toContain("rounded-full");
  expect(el.className).toContain("text-text-muted");
});

test("up is green with a plus, down is red, inverted flips the colours", () => {
  const { rerender } = render(<Delta value={0.123} compare="yesterday at this time" />);
  let pill = screen.getByText("+12%");
  expect(pill).toHaveAttribute("title", "Compared with yesterday at this time");
  expect(pill.className).toContain("text-success");
  expect(pill.className).toContain("rounded-full");
  rerender(<Delta value={-0.0664} />);
  pill = screen.getByText("-7%");
  expect(pill.className).toContain("text-danger");
  expect(pill).not.toHaveAttribute("title");
  rerender(<Delta value={0.2} invert />);
  expect(screen.getByText("+20%").className).toContain("text-danger");
  rerender(<Delta value={-0.2} invert />);
  expect(screen.getByText("-20%").className).toContain("text-success");
});
```

Create `frontend/src/admin/components/RangeTabs.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { RangeTabs } from "./RangeTabs";

test("four pressed-state buttons in order; clicking one reports its key", async () => {
  const onChange = vi.fn();
  render(<RangeTabs active="7d" onChange={onChange} />);
  const group = screen.getByRole("group", { name: "Date range" });
  const buttons = within(group).getAllByRole("button");
  expect(buttons.map((b) => b.textContent)).toEqual(["Today", "7 days", "30 days", "90 days"]);
  expect(screen.getByRole("button", { name: "7 days" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "Today" })).toHaveAttribute("aria-pressed", "false");
  await userEvent.click(screen.getByRole("button", { name: "30 days" }));
  expect(onChange).toHaveBeenCalledWith("30d");
});
```

Create `frontend/src/admin/components/LiveStrip.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { wholeText } from "../test/text";
import { LiveStrip } from "./LiveStrip";

test("reads the live numbers; resolver errors at 0 are neutral; the status pill links to the site page", () => {
  render(<LiveStrip live={{ active_now: 6, fetches_last_hour: 27, upstream_last_hour: 0 }} maintenance={{ on: false, forced_by_env: false }} onGoToSite={() => {}} />);
  expect(screen.getByText(wholeText("6 on the site now"))).toBeInTheDocument();
  expect(screen.getByText(wholeText("27 fetches in the last hour"))).toBeInTheDocument();
  const errors = screen.getByText(wholeText("0 resolver errors in the last hour"));
  expect(errors.className).not.toContain("bg-warning-dim");
  expect(screen.getByRole("link", { name: "Site is live" })).toHaveAttribute("href", "?page=site");
});

test("nobody on the site: gray dot and no ping; errors above 0: warning tint; maintenance on goes to the site page", async () => {
  const onGoToSite = vi.fn();
  const { container } = render(<LiveStrip live={{ active_now: 0, fetches_last_hour: 3, upstream_last_hour: 2 }} maintenance={{ on: true, forced_by_env: false }} onGoToSite={onGoToSite} />);
  expect(container.querySelector(".motion-safe\\:animate-ping")).toBeNull();
  expect(container.querySelector(".bg-text-muted")).not.toBeNull();
  expect(screen.getByText(wholeText("2 resolver errors in the last hour")).className).toContain("bg-warning-dim");
  const link = screen.getByRole("link", { name: "Maintenance is on" });
  expect(link.className).toContain("bg-warning-dim");
  await userEvent.click(link);
  expect(onGoToSite).toHaveBeenCalledTimes(1);
});

test("someone on the site shows the ping ring; an unknown maintenance state shows no status pill", () => {
  const { container } = render(<LiveStrip live={{ active_now: 1, fetches_last_hour: 0, upstream_last_hour: 0 }} maintenance={null} onGoToSite={() => {}} />);
  expect(container.querySelector(".motion-safe\\:animate-ping")).not.toBeNull();
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
});
```

Create `frontend/src/admin/components/TrendCard.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { EMPTY_REPORT, REPORT_7D, REPORT_90D, REPORT_TODAY } from "../test/fixtures";
import { TrendCard, TrendTooltip } from "./TrendCard";

const SIZE = { width: 640, height: 256 };

test("four metric tabs carry the totals and deltas; the active one is selected and names the legend", async () => {
  render(<TrendCard report={REPORT_7D} compare="the 7 days before" size={SIZE} />);
  const tabs = screen.getAllByRole("tab");
  expect(tabs).toHaveLength(4);
  expect(tabs.map((t) => t.getAttribute("aria-selected"))).toEqual(["true", "false", "false", "false"]);
  expect(within(tabs[0]).getByText("Visitors")).toBeInTheDocument();
  expect(within(tabs[0]).getByText("1,742")).toBeInTheDocument();
  expect(within(tabs[0]).getByText("+8%")).toHaveAttribute("title", "Compared with the 7 days before");
  expect(within(tabs[1]).getByText("Fetches")).toBeInTheDocument();
  expect(within(tabs[1]).getByText("2,812")).toBeInTheDocument();
  expect(within(tabs[1]).getByText("+9%")).toBeInTheDocument();
  expect(within(tabs[2]).getByText("Downloads")).toBeInTheDocument();
  expect(within(tabs[2]).getByText("2,310")).toBeInTheDocument();
  expect(within(tabs[3]).getByText("Failed fetches")).toBeInTheDocument();
  expect(within(tabs[3]).getByText("253")).toBeInTheDocument();
  // Fewer failures is good: the inverted metric shows its drop in green.
  expect(within(tabs[3]).getByText("-7%").className).toContain("text-success");
  expect(screen.getByText("Visitors per day")).toBeInTheDocument();
  await userEvent.click(tabs[1]);
  expect(tabs[1]).toHaveAttribute("aria-selected", "true");
  expect(tabs[0]).toHaveAttribute("aria-selected", "false");
  expect(screen.getByText("Fetches per day")).toBeInTheDocument();
});

test("draws the dashed previous line and its legend only with a previous period", () => {
  const { container, rerender } = render(<TrendCard report={REPORT_7D} compare="the 7 days before" size={SIZE} />);
  expect(container.querySelector("svg.recharts-surface")).not.toBeNull();
  expect(container.querySelector("[aria-hidden='true'] svg.recharts-surface")).not.toBeNull();
  expect(container.querySelectorAll("path[stroke-dasharray='4 4']").length).toBeGreaterThan(0);
  expect(screen.getByText("This period")).toBeInTheDocument();
  expect(screen.getByText("Period before")).toBeInTheDocument();
  expect(screen.queryByText("No earlier period")).not.toBeInTheDocument();
  rerender(<TrendCard report={REPORT_90D} compare="the 90 days before" size={SIZE} />);
  expect(container.querySelectorAll("path[stroke-dasharray='4 4']").length).toBe(0);
  expect(screen.queryByText("Period before")).not.toBeInTheDocument();
  expect(screen.getAllByText("No earlier period")).toHaveLength(4);
  expect(screen.getByText("22,646")).toBeInTheDocument();
});

test("today reads per hour and shows today's totals", () => {
  render(<TrendCard report={REPORT_TODAY} compare="yesterday at this time" size={SIZE} />);
  expect(screen.getByText("Visitors per hour")).toBeInTheDocument();
  const tabs = screen.getAllByRole("tab");
  expect(within(tabs[0]).getByText("176")).toBeInTheDocument();
  expect(within(tabs[1]).getByText("280")).toBeInTheDocument();
  expect(within(tabs[0]).getByText("+9%")).toHaveAttribute("title", "Compared with yesterday at this time");
});

test("the Y axis uses compact labels", () => {
  const big = { ...REPORT_7D, series: REPORT_7D.series.map((p) => ({ ...p, cur: { ...p.cur!, visitors: p.cur!.visitors * 10 }, prev: { ...p.prev!, visitors: p.prev!.visitors * 10 } })) };
  const { container } = render(<TrendCard report={big} compare="the 7 days before" size={SIZE} />);
  const labels = Array.from(container.querySelectorAll(".recharts-yAxis text")).map((t) => t.textContent ?? "");
  expect(labels.some((l) => /^\d+(\.\d)?K$/.test(l))).toBe(true);
});

test("an empty range says so over a flat chart", () => {
  render(<TrendCard report={EMPTY_REPORT} compare="the 7 days before" size={SIZE} />);
  expect(screen.getByText("Nothing in this range yet")).toBeInTheDocument();
  for (const tab of screen.getAllByRole("tab")) expect(within(tab).getByText("0")).toBeInTheDocument();
  expect(screen.getAllByText("No earlier period")).toHaveLength(4);
});

test("TrendTooltip shows this period and the earlier one from a fixed payload", () => {
  const row = { label: "Sep 20", value: 461, prev: 409, prevLabel: "Sep 13" };
  render(<TrendTooltip active payload={[{ payload: row }]} color="#0a84ff" showPrev />);
  expect(screen.getByText("Sep 20")).toBeInTheDocument();
  expect(screen.getByText("461")).toBeInTheDocument();
  expect(screen.getByText("Sep 13")).toBeInTheDocument();
  expect(screen.getByText("409")).toBeInTheDocument();
});

test("TrendTooltip hides the earlier row without a previous period and renders nothing when inactive or past now", () => {
  const row = { label: "Sep 20", value: 1234, prev: null, prevLabel: "Sep 13" };
  const { container, rerender } = render(<TrendTooltip active payload={[{ payload: row }]} color="#0a84ff" showPrev={false} />);
  expect(screen.getByText("1,234")).toBeInTheDocument();
  expect(screen.queryByText("Sep 13")).not.toBeInTheDocument();
  rerender(<TrendTooltip active={false} payload={[{ payload: row }]} color="#0a84ff" showPrev />);
  expect(container).toBeEmptyDOMElement();
  rerender(<TrendTooltip active payload={[{ payload: { label: "15:00", value: null, prev: null, prevLabel: "15:00" } }]} color="#0a84ff" showPrev />);
  expect(container).toBeEmptyDOMElement();
});
```

Create `frontend/src/admin/pages/AnalyticsPage.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { fakeServer } from "../test/fakeServer";
import { wholeText } from "../test/text";
import { AnalyticsPage, type AnalyticsPageProps } from "./AnalyticsPage";

afterEach(() => {
  vi.unstubAllGlobals();
});

const SIZE = { width: 640, height: 256 };

function props(over: Partial<AnalyticsPageProps> = {}): AnalyticsPageProps {
  return {
    range: "7d",
    tz: 360,
    tick: 0,
    maintenance: { on: false, forced_by_env: false },
    onRangeChange: vi.fn(),
    onGoToSite: vi.fn(),
    onUnauthorized: vi.fn(),
    onUnavailable: vi.fn(),
    chartSize: SIZE,
    ...over,
  };
}

test("loads the report for the range and tz, then shows the header, the live strip and the trend card", async () => {
  const server = fakeServer();
  vi.stubGlobal("fetch", server.fetch);
  render(<AnalyticsPage {...props()} />);
  expect(await screen.findByText("Sep 17 to Sep 23, your local time")).toBeInTheDocument();
  expect(server.urls("/api/admin/report")).toEqual(["/api/admin/report?range=7d&tz=360"]);
  expect(screen.getByText("Analytics")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Last 7 days" })).toBeInTheDocument();
  expect(screen.getByText(/^Updated \d\d:\d\d$/)).toBeInTheDocument();
  expect(screen.getByText(wholeText("6 on the site now"))).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Site is live" })).toBeInTheDocument();
  expect(screen.getAllByRole("tab")).toHaveLength(4);
  expect(screen.getByRole("button", { name: "7 days" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByText("Visitors per day").closest("[aria-busy]")).toHaveAttribute("aria-busy", "false");
});

test("a new range moves the pill and title at once and keeps the old numbers dimmed until the new report lands", async () => {
  const server = fakeServer();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let reportCalls = 0;
  const real = server.fetch;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).startsWith("/api/admin/report") && ++reportCalls === 2) await gate;
      return real(input, init);
    }),
  );
  const p = props();
  const { rerender } = render(<AnalyticsPage {...p} />);
  await screen.findByText("Sep 17 to Sep 23, your local time");
  rerender(<AnalyticsPage {...p} range="today" />);
  expect(screen.getByRole("heading", { name: "Today" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Today" })).toHaveAttribute("aria-pressed", "true");
  const body = screen.getByText("Visitors per day").closest("[aria-busy]") as HTMLElement;
  expect(body).toHaveAttribute("aria-busy", "true");
  expect(body.className).toContain("opacity-50");
  expect(body.className).toContain("pointer-events-none");
  expect(screen.getByText("Sep 17 to Sep 23, your local time")).toBeInTheDocument();
  release();
  expect(await screen.findByText("Sep 23, your local time")).toBeInTheDocument();
  expect(screen.getByText("Visitors per hour").closest("[aria-busy]")).toHaveAttribute("aria-busy", "false");
  expect(server.urls("/api/admin/report").at(-1)).toBe("/api/admin/report?range=today&tz=360");
});

test("a refresh tick refetches; a failed refresh keeps the numbers and says so; the next success clears the line", async () => {
  const server = fakeServer();
  vi.stubGlobal("fetch", server.fetch);
  const p = props();
  const { rerender } = render(<AnalyticsPage {...p} />);
  await screen.findByText(/^Updated/);
  server.state.reportStatus = 503;
  rerender(<AnalyticsPage {...p} tick={1} />);
  expect(await screen.findByText("Could not refresh, trying again")).toBeInTheDocument();
  expect(screen.queryByText(/^Updated/)).not.toBeInTheDocument();
  expect(screen.getByText("Sep 17 to Sep 23, your local time")).toBeInTheDocument();
  expect(screen.getByText(wholeText("6 on the site now"))).toBeInTheDocument();
  expect(p.onUnavailable).not.toHaveBeenCalled();
  server.state.reportStatus = 200;
  rerender(<AnalyticsPage {...p} tick={2} />);
  expect(await screen.findByText(/^Updated/)).toBeInTheDocument();
  expect(screen.queryByText("Could not refresh, trying again")).not.toBeInTheDocument();
  expect(server.urls("/api/admin/report")).toHaveLength(3);
});

test("a failed first load reports unavailable; a 401 reports unauthorized", async () => {
  const server = fakeServer({ reportStatus: 503 });
  vi.stubGlobal("fetch", server.fetch);
  const p = props();
  render(<AnalyticsPage {...p} />);
  await vi.waitFor(() => expect(p.onUnavailable).toHaveBeenCalledTimes(1));
  expect(p.onUnauthorized).not.toHaveBeenCalled();

  vi.stubGlobal("fetch", fakeServer({ authed: false }).fetch);
  const p2 = props();
  render(<AnalyticsPage {...p2} />);
  await vi.waitFor(() => expect(p2.onUnauthorized).toHaveBeenCalledTimes(1));
  expect(p2.onUnavailable).not.toHaveBeenCalled();
});
```

Append to `frontend/src/admin/App.test.tsx` (after the last test; the imports it needs, `act`, `fakeServer`, `screen`, `userEvent`, `vi`, are already imported there):

```tsx
test("a range tab writes the URL and refetches the report for that range", async () => {
  const server = fakeServer();
  vi.stubGlobal("fetch", server.fetch);
  render(<App />);
  await screen.findByText("Sep 17 to Sep 23, your local time");
  await userEvent.click(screen.getByRole("button", { name: "30 days" }));
  expect(window.location.search).toBe("?range=30d");
  expect(screen.getByRole("heading", { name: "Last 30 days" })).toBeInTheDocument();
  await vi.waitFor(() => expect(server.urls("/api/admin/report").at(-1)).toBe("/api/admin/report?range=30d&tz=" + String(-new Date().getTimezoneOffset())));
  act(() => {
    window.history.replaceState(null, "", "/?range=today");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  expect(screen.getByRole("heading", { name: "Today" })).toBeInTheDocument();
  expect(await screen.findByText("Sep 23, your local time")).toBeInTheDocument();
});

test("refreshes every 30 s only while the tab is visible, and catches up on return", async () => {
  vi.useFakeTimers();
  const server = fakeServer();
  vi.stubGlobal("fetch", server.fetch);
  render(<App />);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10);
  });
  expect(server.urls("/api/admin/report")).toHaveLength(1);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(30_000);
  });
  expect(server.urls("/api/admin/report")).toHaveLength(2);
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(60_000);
  });
  expect(server.urls("/api/admin/report")).toHaveLength(2);
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
  await act(async () => {
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(10);
  });
  expect(server.urls("/api/admin/report")).toHaveLength(3);
  delete (document as unknown as { visibilityState?: string }).visibilityState;
});

test("a 401 on a refresh returns to the login view", async () => {
  vi.useFakeTimers();
  const server = fakeServer();
  vi.stubGlobal("fetch", server.fetch);
  render(<App />);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10);
  });
  expect(screen.getByRole("heading", { name: "Last 7 days" })).toBeInTheDocument();
  server.state.authed = false;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(30_000);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10);
  });
  expect(screen.getByLabelText("Password")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `cd "$(git rev-parse --show-toplevel)/frontend" && npx vitest run src/admin/components src/admin/pages src/admin/App.test.tsx`
Expected: FAIL. The four component test files fail at import ("Failed to resolve import "./Delta"", `./RangeTabs`, `./LiveStrip`, `./TrendCard`); `AnalyticsPage.test.tsx` fails on "Sep 17 to Sep 23, your local time" (the stub never fetches); the three new App tests fail on the missing span text, on `server.urls("/api/admin/report")` having length 0, and on the login view not appearing.

- [ ] **Step 3: Write the components and the real AnalyticsPage**

Create `frontend/src/admin/components/Delta.tsx`:

```tsx
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "./styles";

/**
 * "+12%" in green or "-8%" in red, rounded to a whole percent. A rounded 0% is plain muted
 * text; null renders nothing. `invert` treats up as bad (failed fetches, resolver errors).
 */
export function Delta({ value, compare, invert = false }: { value: number | null; compare?: string; invert?: boolean }) {
  if (value == null) return null;
  const pct = Math.round(value * 100);
  const title = compare ? `Compared with ${compare}` : undefined;
  if (pct === 0) {
    return (
      <span title={title} className="font-mono text-[11px] text-text-muted">
        0%
      </span>
    );
  }
  const up = pct > 0;
  const good = invert ? !up : up;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span title={title} className={cn("inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-mono text-[11px] tabular-nums", good ? "bg-success-dim text-success" : "bg-danger-dim text-danger")}>
      <Icon className="size-3" strokeWidth={2.5} aria-hidden="true" />
      {up ? "+" : ""}
      {pct}%
    </span>
  );
}
```

Create `frontend/src/admin/components/RangeTabs.tsx`:

```tsx
import { motion } from "motion/react";
import type { RangeKey } from "../lib/api";
import { RANGE_KEYS, RANGE_LABELS } from "../lib/range";
import { cn } from "./styles";

/** A pill track of 32px buttons; the active pill is elevated and slides on a spring. */
export function RangeTabs({ active, onChange }: { active: RangeKey; onChange: (key: RangeKey) => void }) {
  return (
    <div role="group" aria-label="Date range" className="flex w-full rounded-full border border-line/60 bg-surface p-1 sm:inline-flex sm:w-auto">
      {RANGE_KEYS.map((key) => {
        const selected = key === active;
        return (
          <button
            key={key}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(key)}
            className={cn(
              "relative h-8 min-w-0 flex-1 rounded-full px-1.5 text-[13px] whitespace-nowrap transition-colors sm:flex-none sm:px-3.5",
              selected ? "font-medium text-text-primary" : "text-text-muted hover:text-text-primary",
            )}
          >
            {selected ? <motion.span layoutId="range-pill" className="absolute inset-0 rounded-full bg-elevated shadow-[0_1px_2px_rgba(0,0,0,0.4)]" transition={{ type: "spring", stiffness: 420, damping: 34 }} /> : null}
            <span className="relative">{RANGE_LABELS[key]}</span>
          </button>
        );
      })}
    </div>
  );
}
```

Create `frontend/src/admin/components/LiveStrip.tsx`:

```tsx
import type { Live, Maintenance } from "../lib/api";
import { formatCount } from "../lib/format";
import { cn } from "./styles";

const PILL = "inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-[13px] whitespace-nowrap";
const NEUTRAL = "border-line/60 bg-surface text-text-muted";

/** What is happening right now, whatever the selected range. The dots are decorative; the text says it all. */
export function LiveStrip({ live, maintenance, onGoToSite }: { live: Live; maintenance: Maintenance | null; onGoToSite: () => void }) {
  const active = live.active_now > 0;
  const errors = live.upstream_last_hour > 0;
  return (
    <div className="flex flex-wrap gap-2">
      <span className={cn(PILL, NEUTRAL, "gap-2.5")}>
        <span aria-hidden="true" className="relative flex size-2">
          {active ? <span className="absolute inset-0 rounded-full bg-success opacity-75 motion-safe:animate-ping" /> : null}
          <span className={cn("relative size-2 rounded-full", active ? "bg-success" : "bg-text-muted")} />
        </span>
        <span className="font-semibold text-text-primary tabular-nums">{formatCount(live.active_now)}</span> on the site now
      </span>
      <span className={cn(PILL, NEUTRAL)}>
        <span className="font-semibold text-text-secondary tabular-nums">{formatCount(live.fetches_last_hour)}</span> fetches in the last hour
      </span>
      <span className={cn(PILL, errors ? "border-warning/30 bg-warning-dim text-text-primary" : NEUTRAL)}>
        <span className={cn("font-semibold tabular-nums", errors ? "text-warning" : "text-text-secondary")}>{formatCount(live.upstream_last_hour)}</span> resolver errors in the last hour
      </span>
      {maintenance ? (
        <a
          href="?page=site"
          onClick={(e) => {
            e.preventDefault();
            onGoToSite();
          }}
          className={cn(PILL, "font-medium transition-colors hover:border-line-strong", maintenance.on ? "border-warning/30 bg-warning-dim text-warning" : "border-success/30 bg-success-dim text-success")}
        >
          {maintenance.on ? "Maintenance is on" : "Site is live"}
        </a>
      ) : null}
    </div>
  );
}
```

Create `frontend/src/admin/components/TrendCard.tsx`:

```tsx
import { useId, useState } from "react";
import { motion } from "motion/react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Report, SeriesMetric } from "../lib/api";
import { COLORS, SURFACE } from "../lib/colors";
import { change } from "../lib/delta";
import { formatCompact, formatCount } from "../lib/format";
import { isFlat, trendRows, type TrendRow } from "../lib/metrics";
import { Delta } from "./Delta";
import { CARD, cn } from "./styles";

export const METRICS: { key: SeriesMetric; label: string; color: string; invert?: boolean }[] = [
  { key: "visitors", label: "Visitors", color: COLORS.teal },
  { key: "fetches", label: "Fetches", color: COLORS.blue },
  { key: "downloads", label: "Downloads", color: COLORS.green },
  { key: "failed_fetches", label: "Failed fetches", color: COLORS.red, invert: true },
];

/** Tests pass a fixed size because ResponsiveContainer measures 0x0 under jsdom. */
export type ChartSize = { width: number; height: number };

/** The tooltip body, pure so it can be tested with a fixed payload. Recharts hands the data row as payload[0].payload. */
export function TrendTooltip({ active, payload, color, showPrev }: { active?: boolean; payload?: ReadonlyArray<{ payload?: unknown }>; color: string; showPrev: boolean }) {
  const row = active ? (payload?.[0]?.payload as TrendRow | undefined) : undefined;
  if (!row || row.value == null) return null;
  return (
    <div className="min-w-40 rounded-card border border-line/60 bg-elevated/95 px-3 py-2.5 text-xs shadow-raised backdrop-blur-md">
      <div className="flex items-center justify-between gap-6">
        <span className="flex items-center gap-1.5 text-text-secondary">
          <span aria-hidden="true" className="size-1.5 rounded-full" style={{ background: color }} />
          {row.label}
        </span>
        <span className="font-mono font-medium text-text-primary tabular-nums">{formatCount(row.value)}</span>
      </div>
      {showPrev && row.prev != null ? (
        <div className="mt-1.5 flex items-center justify-between gap-6 text-text-muted">
          <span className="flex items-center gap-1.5">
            <span aria-hidden="true" className="size-1.5 rounded-full" style={{ background: COLORS.gray }} />
            {row.prevLabel}
          </span>
          <span className="font-mono tabular-nums">{formatCount(row.prev)}</span>
        </div>
      ) : null}
    </div>
  );
}

/** Four metric tabs that double as headline numbers, over this period as a filled line and the one before dashed. */
export function TrendCard({ report, compare, size }: { report: Report; compare: string; size?: ChartSize }) {
  const [metric, setMetric] = useState<SeriesMetric>("visitors");
  const gradientId = `trend-${useId().replace(/:/g, "")}`;
  const current = METRICS.find((m) => m.key === metric) ?? METRICS[0];
  const rows = trendRows(report, metric);
  const flat = isFlat(rows);
  const hasPrev = report.has_previous;
  const totals = report.totals;
  const previous = report.previous;

  const chart = (
    <AreaChart data={rows} margin={{ left: 0, right: 8, top: 8, bottom: 0 }} width={size?.width} height={size?.height}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={current.color} stopOpacity={0.32} />
          <stop offset="100%" stopColor={current.color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.06)" />
      <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={10} minTickGap={28} tick={{ fill: COLORS.gray, fontSize: 11 }} />
      <YAxis tickLine={false} axisLine={false} width={46} allowDecimals={false} tick={{ fill: COLORS.gray, fontSize: 11 }} tickFormatter={(v: number) => formatCompact(v)} />
      <Tooltip cursor={{ stroke: "rgba(255,255,255,0.18)", strokeWidth: 1 }} content={(p) => <TrendTooltip active={p.active} payload={p.payload} color={current.color} showPrev={hasPrev} />} />
      {hasPrev ? <Area dataKey="prev" type="monotone" stroke={COLORS.gray} strokeOpacity={0.7} strokeWidth={1.5} strokeDasharray="4 4" fill="none" dot={false} activeDot={false} isAnimationActive={false} /> : null}
      <Area dataKey="value" type="monotone" stroke={current.color} strokeWidth={2.25} fill={`url(#${gradientId})`} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: SURFACE }} animationDuration={700} />
    </AreaChart>
  );

  return (
    <section className={cn(CARD, "overflow-hidden")}>
      <div role="tablist" aria-label="Metric" className="grid grid-cols-2 border-b border-line/50 sm:grid-cols-4">
        {METRICS.map((m, i) => {
          const active = m.key === metric;
          return (
            <button
              key={m.key}
              role="tab"
              type="button"
              aria-selected={active}
              onClick={() => setMetric(m.key)}
              className={cn(
                "relative flex min-w-0 flex-col items-start border-line/50 px-5 pt-4 pb-4 text-left transition-colors sm:px-6 sm:pt-5",
                i < 2 && "max-sm:border-b",
                i % 2 === 0 && "max-sm:border-r",
                i < 3 && "sm:border-r",
                active ? "bg-white/[0.03]" : "hover:bg-white/[0.02]",
              )}
            >
              <span className="flex items-center gap-2 text-[13px] text-text-secondary">
                <span aria-hidden="true" className="size-2 rounded-full transition-opacity" style={{ background: m.color, opacity: active ? 1 : 0.35 }} />
                {m.label}
              </span>
              <span className="mt-2.5 max-w-full truncate text-[22px] leading-none font-semibold tracking-[-0.025em] text-text-primary tabular-nums sm:text-[26px]">{formatCount(totals[m.key])}</span>
              <span className="mt-2.5 flex h-5 items-center">
                {previous ? <Delta value={change(totals[m.key], previous[m.key])} compare={compare} invert={m.invert} /> : <span className="text-xs text-text-muted">No earlier period</span>}
              </span>
              {active ? <motion.span layoutId="metric-bar" className="absolute inset-x-0 bottom-0 h-[2px]" style={{ background: m.color }} transition={{ type: "spring", stiffness: 420, damping: 36 }} /> : null}
            </button>
          );
        })}
      </div>

      <div className="px-3 pt-5 pb-4 sm:px-6">
        <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 px-2 text-xs text-text-muted sm:px-0">
          <span className="text-[13px] text-text-secondary">
            {current.label} per {report.bucket}
          </span>
          <span className="flex items-center gap-1.5">
            <span aria-hidden="true" className="h-[2px] w-3 rounded-full" style={{ background: current.color }} />
            This period
          </span>
          {hasPrev ? (
            <span className="flex items-center gap-1.5">
              <span aria-hidden="true" className="w-3 border-t-[1.5px] border-dashed" style={{ borderColor: COLORS.gray }} />
              Period before
            </span>
          ) : null}
        </div>
        <div className="relative">
          <div aria-hidden="true" className="h-64 w-full sm:h-72">
            {size ? (
              chart
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                {chart}
              </ResponsiveContainer>
            )}
          </div>
          {flat ? <p className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-text-muted">Nothing in this range yet</p> : null}
        </div>
      </div>
    </section>
  );
}
```

Replace `frontend/src/admin/pages/AnalyticsPage.tsx` with:

```tsx
import { useEffect, useRef, useState } from "react";
import { fetchReport, type Maintenance, type RangeKey, type Report } from "../lib/api";
import { compareLabel } from "../lib/delta";
import { formatClock, formatSpan } from "../lib/format";
import { RANGE_TITLES } from "../lib/range";
import { LiveStrip } from "../components/LiveStrip";
import { PageHeader } from "../components/PageHeader";
import { RangeTabs } from "../components/RangeTabs";
import { Reveal } from "../components/Reveal";
import { TrendCard, type ChartSize } from "../components/TrendCard";
import { cn } from "../components/styles";

export type AnalyticsPageProps = {
  range: RangeKey;
  tz: number;
  tick: number;
  maintenance: Maintenance | null;
  onRangeChange: (range: RangeKey) => void;
  onGoToSite: () => void;
  onUnauthorized: () => void;
  onUnavailable: () => void;
  /** Tests pass a fixed chart size; production measures the container. */
  chartSize?: ChartSize;
};

type Loaded = { report: Report; updatedAt: Date };

export function AnalyticsPage({ range, tz, tick, maintenance, onRangeChange, onGoToSite, onUnauthorized, onUnavailable, chartSize }: AnalyticsPageProps) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);
  const loadedRef = useRef(loaded);
  loadedRef.current = loaded;
  const handlers = useRef({ onUnauthorized, onUnavailable });
  handlers.current = { onUnauthorized, onUnavailable };

  // One fetch per range change and per refresh tick. A response that arrives after the
  // range moved on is dropped by the cleanup flag, so the page never shows the wrong range.
  useEffect(() => {
    let alive = true;
    void fetchReport(range, tz).then((result) => {
      if (!alive) return;
      if (result === "unauthorized") {
        handlers.current.onUnauthorized();
        return;
      }
      if (result === "error") {
        if (loadedRef.current === null) handlers.current.onUnavailable();
        else setFailed(true);
        return;
      }
      setLoaded({ report: result, updatedAt: new Date() });
      setFailed(false);
    });
    return () => {
      alive = false;
    };
  }, [range, tz, tick]);

  const report = loaded?.report ?? null;
  // The old numbers stay on screen at 50% until the new range arrives; the pill moved already.
  const pending = report !== null && report.range !== range;
  const note = failed ? "Could not refresh, trying again" : loaded ? `Updated ${formatClock(loaded.updatedAt)}` : undefined;

  return (
    <div>
      <PageHeader
        kicker="Analytics"
        title={RANGE_TITLES[range]}
        subtitle={report ? formatSpan(report.window) : "Your local time"}
        note={note}
        actions={<RangeTabs active={range} onChange={onRangeChange} />}
      />
      {report ? (
        <>
          <Reveal i={1} className="mt-6">
            <LiveStrip live={report.live} maintenance={maintenance} onGoToSite={onGoToSite} />
          </Reveal>
          <div aria-busy={pending} className={cn("transition-opacity duration-300", pending && "pointer-events-none opacity-50")}>
            <Reveal i={2} className="mt-6">
              <TrendCard report={report} compare={compareLabel(report.range)} size={chartSize} />
            </Reveal>
          </div>
        </>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd "$(git rev-parse --show-toplevel)/frontend" && npx vitest run src/admin`
Expected: PASS. New: Delta 3, RangeTabs 1, LiveStrip 3, TrendCard 7, AnalyticsPage 4, App +3 (21 tests). The "act" warnings printed by the fake-timer App tests are noise from responses resolving between `act` scopes, not failures; if one of those two tests reads a stale count, add one more `await act(async () => { await vi.advanceTimersByTimeAsync(10); });` before the assertion rather than switching to real timers.

- [ ] **Step 5: Task gate**

Run:
```bash
cd "$(git rev-parse --show-toplevel)/frontend" && npm run lint && npx vitest run && npm run build
```
Expected: lint clean (the recharts `content={(p) => ...}` form is contextually typed; do not annotate `p` with `TooltipContentProps<number, string>`, which fails against recharts' default generics); vitest all green (598 + 21 = 619); build succeeds and `dist/assets/` now contains a chunk with `recharts` code referenced only from `admin.html`.

- [ ] **Step 6: Commit**

```bash
cd "$(git rev-parse --show-toplevel)" && git add frontend/src/admin/components/Delta.tsx frontend/src/admin/components/Delta.test.tsx frontend/src/admin/components/RangeTabs.tsx frontend/src/admin/components/RangeTabs.test.tsx frontend/src/admin/components/LiveStrip.tsx frontend/src/admin/components/LiveStrip.test.tsx frontend/src/admin/components/TrendCard.tsx frontend/src/admin/components/TrendCard.test.tsx frontend/src/admin/pages/AnalyticsPage.tsx frontend/src/admin/pages/AnalyticsPage.test.tsx frontend/src/admin/App.test.tsx frontend/src/admin/test/text.ts && git commit -m "feat(admin): analytics header, live strip, trend card and report loading

Range changes dim the old numbers until the new report lands; refreshes ride
the 30 s tick; a failed refresh keeps the data and says so.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Analytics page part 2 (tiles, panels, footnote)

**Files:**
- Create: `frontend/src/admin/components/Kpi.tsx`, `frontend/src/admin/components/Panel.tsx`, `frontend/src/admin/components/EmptyState.tsx`, `frontend/src/admin/components/Funnel.tsx`, `frontend/src/admin/components/SegmentBar.tsx`, `frontend/src/admin/components/Donut.tsx`, `frontend/src/admin/components/BarList.tsx`, `frontend/src/admin/components/HoursChart.tsx`, `frontend/src/admin/components/MiniStats.tsx`, `frontend/src/admin/components/Footnote.tsx`
- Modify: `frontend/src/admin/pages/AnalyticsPage.tsx` (full rewrite, keeps Task 8's loading), `frontend/src/admin/pages/AnalyticsPage.test.tsx` (append four tests)
- Test: `frontend/src/admin/components/Kpi.test.tsx`, `Panel.test.tsx`, `Funnel.test.tsx`, `SegmentBar.test.tsx`, `Donut.test.tsx`, `BarList.test.tsx`, `HoursChart.test.tsx`, `MiniStats.test.tsx`, `Footnote.test.tsx` (all under `frontend/src/admin/components/`)

**Interfaces:**
- Consumes (Task 6): types `HourRow`, `Report`; `COLORS`, `SERIES`, `tint`, `outcomeColor`; `countryName`, `DASH`, `formatCount`, `formatHour`, `formatHourRange`, `formatPeak`, `formatPercent`, `formatRatio`, `formatShare`, `formatWhole`, `outcomeLabel`, `pageLabel`, `platformName`, `qualityLabel`, `sourceLabel`, `utcMidnightLocal`; `conversion`, `countDelta`, `downloadsPerVisitor`, `peakHour`, `quietHours`, `ratio`, `ratioDelta`, `returningShare`, `successRate`, `viewsPerVisitor`, `visitorsADay`; fixtures. (Task 7/8): `cn`, `CARD`, `Reveal`, `Delta`, `PageHeader`, `RangeTabs`, `LiveStrip`, `TrendCard`, `ChartSize`, `fakeServer`, `wholeText`.
- Produces:
  - `Kpi({ icon: LucideIcon; color: string; label: string; value: string; sub?: ReactNode; delta?: number | null; compare?: string; invert?: boolean })`.
  - `Panel({ title: string; hint?: ReactNode; children; className? })` rendered as a named region (`aria-label` = title).
  - `EmptyState({ text: string })`.
  - `Funnel({ steps: FunnelStep[] })`, `FunnelStep = { label: string; value: number }`.
  - `SegmentBar({ segments: Segment[]; empty: string })`, `Segment = { key: string; label: string; value: number; color: string }`.
  - `Donut({ slices: Slice[]; center: { value: string; label: string }; empty: string })`, `Slice = { key: string; label: string; value: number; color: string; display: string; hint?: string }`.
  - `BarList({ rows: BarRow[]; empty: string; color?: string; limit?: number })`, `BarRow = { key: string; label: ReactNode; hint?: ReactNode; value: number; display: ReactNode; color?: string; muted?: boolean }`.
  - `HoursChart({ hours: HourRow[]; empty: string })`, `MiniStats({ items: { label: string; value: string; tone?: string }[]; className? })`, `Footnote({ tz: number })`.

- [ ] **Step 1: Write the failing component tests**

Create `frontend/src/admin/components/Kpi.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { CircleCheck } from "lucide-react";
import { expect, test } from "vitest";
import { COLORS } from "../lib/colors";
import { Kpi } from "./Kpi";

test("label, figure, delta and note", () => {
  render(<Kpi icon={CircleCheck} color={COLORS.green} label="Success rate" value="91%" sub="links that returned media" delta={0.0164} compare="the 7 days before" />);
  expect(screen.getByText("Success rate")).toBeInTheDocument();
  expect(screen.getByText("91%")).toBeInTheDocument();
  expect(screen.getByText("+2%")).toHaveAttribute("title", "Compared with the 7 days before");
  expect(screen.getByText("links that returned media")).toBeInTheDocument();
});

test("no delta and no note when absent; an inverted rise reads bad", () => {
  const { rerender } = render(<Kpi icon={CircleCheck} color={COLORS.yellow} label="Peak at once" value="-" />);
  expect(screen.getByText("-")).toBeInTheDocument();
  expect(screen.queryByText(/%$/)).not.toBeInTheDocument();
  rerender(<Kpi icon={CircleCheck} color={COLORS.red} label="Resolver errors" value="17" sub="failures on our side" delta={0.5} invert />);
  expect(screen.getByText("+50%").className).toContain("text-danger");
});
```

Create `frontend/src/admin/components/Panel.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import { EmptyState } from "./EmptyState";
import { Panel } from "./Panel";

test("a titled region with a hint and its content; the empty state is a dashed 28px box", () => {
  render(
    <Panel title="Countries" hint="Where visitors are">
      <EmptyState text="No visitors in this range yet" />
    </Panel>,
  );
  const region = screen.getByRole("region", { name: "Countries" });
  expect(within(region).getByRole("heading", { level: 2, name: "Countries" })).toBeInTheDocument();
  expect(within(region).getByText("Where visitors are")).toBeInTheDocument();
  const empty = within(region).getByText("No visitors in this range yet");
  expect(empty.className).toContain("border-dashed");
  expect(empty.className).toContain("rounded-tile");
  expect(empty.className).toContain("min-h-24");
});
```

Create `frontend/src/admin/components/Funnel.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import { Funnel } from "./Funnel";

test("four numbered steps, the share kept from the step before, bars against step one fading 0.15 per step", () => {
  const { container } = render(
    <Funnel
      steps={[
        { label: "Visitors", value: 1742 },
        { label: "Pasted a link", value: 1388 },
        { label: "Got a result", value: 1296 },
        { label: "Downloaded", value: 1187 },
      ]}
    />,
  );
  const items = screen.getAllByRole("listitem");
  expect(items).toHaveLength(4);
  expect(within(items[0]).getByText("1")).toBeInTheDocument();
  expect(within(items[0]).getByText("Visitors")).toBeInTheDocument();
  expect(within(items[0]).getByText("1,742")).toBeInTheDocument();
  expect(within(items[0]).queryByText(/%/)).not.toBeInTheDocument();
  expect(within(items[1]).getByText("80%")).toBeInTheDocument();
  expect(within(items[2]).getByText("93%")).toBeInTheDocument();
  expect(within(items[3]).getByText("92%")).toBeInTheDocument();
  const bars = container.querySelectorAll("li > div:last-child > div");
  expect(bars).toHaveLength(4);
  expect((bars[0] as HTMLElement).style.width).toBe("100%");
  expect(parseFloat((bars[3] as HTMLElement).style.width)).toBeCloseTo((1187 / 1742) * 100, 1);
  expect(parseFloat((bars[3] as HTMLElement).style.opacity)).toBeCloseTo(0.55, 5);
});
```

Create `frontend/src/admin/components/SegmentBar.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import { SegmentBar } from "./SegmentBar";

const SEGMENTS = [
  { key: "ok", label: "Worked", value: 257, color: "#30d158" },
  { key: "not_found", label: "Deleted or missing", value: 15, color: "#8e8e93" },
  { key: "invalid_url", label: "Not a supported link", value: 5, color: "#ff9f0a" },
  { key: "no_video", label: "No video in the post", value: 0, color: "#ffd60a" },
];

test("segments by share with native titles and a 4px minimum, plus a legend with counts and percents", () => {
  const { container } = render(<SegmentBar empty="No links pasted in this range yet" segments={SEGMENTS} />);
  const bars = container.querySelectorAll("[title]");
  expect(Array.from(bars).map((b) => b.getAttribute("title"))).toEqual(["Worked: 257", "Deleted or missing: 15", "Not a supported link: 5"]);
  expect((bars[0] as HTMLElement).style.minWidth).toBe("4px");
  expect(parseFloat((bars[0] as HTMLElement).style.width)).toBeCloseTo((257 / 277) * 100, 1);
  const items = screen.getAllByRole("listitem");
  expect(items).toHaveLength(4);
  expect(within(items[0]).getByText("Worked")).toBeInTheDocument();
  expect(within(items[0]).getByText("257")).toBeInTheDocument();
  expect(within(items[0]).getByText("93%")).toBeInTheDocument();
  expect(within(items[1]).getByText("5.4%")).toBeInTheDocument();
  expect(within(items[2]).getByText("1.8%")).toBeInTheDocument();
  expect(within(items[3]).getByText("0%")).toBeInTheDocument();
});

test("empty when every segment is zero", () => {
  render(<SegmentBar empty="No links pasted in this range yet" segments={[{ key: "ok", label: "Worked", value: 0, color: "#30d158" }]} />);
  expect(screen.getByText("No links pasted in this range yet")).toBeInTheDocument();
});
```

Create `frontend/src/admin/components/Donut.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import { SERIES } from "../lib/colors";
import { formatCount, formatShare, platformName } from "../lib/format";
import { ratio } from "../lib/metrics";
import { REPORT_7D } from "../test/fixtures";
import { Donut } from "./Donut";

const SLICES = REPORT_7D.platforms.map((p, i) => ({
  key: p.platform,
  label: platformName(p.platform),
  value: p.fetches,
  color: SERIES[i],
  display: formatCount(p.fetches),
  hint: `${formatShare(ratio(p.ok, p.fetches))} worked`,
}));

test("a fixed 176px ring with the total in the centre and a legend of name, fetches, percent and worked share", () => {
  const { container } = render(<Donut slices={SLICES} center={{ value: "2,812", label: "fetches" }} empty="No links pasted in this range yet" />);
  expect(container.querySelectorAll(".recharts-pie-sector")).toHaveLength(5);
  expect(container.querySelector("svg")?.getAttribute("width")).toBe("176");
  expect(container.querySelector("[aria-hidden='true'] svg")).not.toBeNull();
  expect(screen.getByText("2,812")).toBeInTheDocument();
  expect(screen.getByText("fetches")).toBeInTheDocument();
  const items = screen.getAllByRole("listitem");
  expect(items).toHaveLength(5);
  expect(within(items[0]).getByText("X (Twitter)")).toBeInTheDocument();
  expect(within(items[0]).getByText("1,684")).toBeInTheDocument();
  expect(within(items[0]).getByText("60%")).toBeInTheDocument();
  expect(within(items[0]).getByText("92% worked")).toBeInTheDocument();
  expect(within(items[3]).getByText("5.0%")).toBeInTheDocument();
  expect(within(items[4]).getByText("2.7%")).toBeInTheDocument();
});

test("empty when there are no fetches", () => {
  render(<Donut slices={[]} center={{ value: "0", label: "fetches" }} empty="No links pasted in this range yet" />);
  expect(screen.getByText("No links pasted in this range yet")).toBeInTheDocument();
});
```

Create `frontend/src/admin/components/BarList.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { formatCount, qualityLabel } from "../lib/format";
import { REPORT_7D } from "../test/fixtures";
import { BarList } from "./BarList";

const ROWS = REPORT_7D.qualities.map((q) => ({ key: q.quality, label: qualityLabel(q.quality), value: q.count, display: formatCount(q.count) }));

test("rows with label, figure and a 6px bar sized against the largest row", () => {
  const { container } = render(<BarList rows={ROWS.slice(0, 3)} empty="Nothing saved in this range yet" color="#bf5af2" />);
  const items = screen.getAllByRole("listitem");
  expect(items).toHaveLength(3);
  expect(within(items[0]).getByText("1080p")).toBeInTheDocument();
  expect(within(items[0]).getByText("1,102")).toBeInTheDocument();
  expect(within(items[2]).getByText("HD")).toBeInTheDocument();
  const bars = container.querySelectorAll("li > div:last-child > div");
  expect((bars[0] as HTMLElement).style.width).toBe("100%");
  expect(parseFloat((bars[1] as HTMLElement).style.width)).toBeCloseTo((618 / 1102) * 100, 1);
  expect(container.querySelector("li > div:last-child")?.className).toContain("h-1.5");
});

test("folds after the limit behind Show all (n) and back", async () => {
  render(<BarList rows={ROWS} empty="Nothing saved in this range yet" limit={8} />);
  expect(screen.getAllByRole("listitem")).toHaveLength(8);
  expect(screen.queryByText("360p")).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Show all (9)" }));
  expect(screen.getAllByRole("listitem")).toHaveLength(9);
  expect(screen.getByText("360p")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Show less" }));
  expect(screen.getAllByRole("listitem")).toHaveLength(8);
});

test("no fold button at or under the limit; the empty state without rows; a muted row", () => {
  const { rerender } = render(<BarList rows={ROWS.slice(0, 8)} empty="Nothing saved in this range yet" limit={8} />);
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  rerender(<BarList rows={[]} empty="Nothing saved in this range yet" limit={8} />);
  expect(screen.getByText("Nothing saved in this range yet")).toBeInTheDocument();
  rerender(<BarList rows={[{ key: "unknown", label: "Not known", value: 290, display: "290", muted: true }]} empty="x" />);
  expect(screen.getByText("Not known").className).toContain("text-text-muted");
});
```

Create `frontend/src/admin/components/HoursChart.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { EMPTY_REPORT, REPORT_7D, REPORT_TODAY } from "../test/fixtures";
import { HoursChart } from "./HoursChart";

test("names the busiest hour, titles every bar, fades the others, and counts quiet hours", () => {
  const { container } = render(<HoursChart hours={REPORT_TODAY.hours} empty="No links pasted in this range yet" />);
  expect(screen.getByText("12:00 to 13:00")).toBeInTheDocument();
  expect(screen.getByText("busiest, 40 fetches. 10 hours had none")).toBeInTheDocument();
  const bars = container.querySelectorAll("[title]");
  expect(bars).toHaveLength(24);
  expect(bars[12].getAttribute("title")).toBe("12:00, 40 fetches");
  expect(bars[0].getAttribute("title")).toBe("00:00, 14 fetches");
  const fills = container.querySelectorAll("[title] > div");
  expect((fills[12] as HTMLElement).style.height).toBe("100%");
  expect((fills[12] as HTMLElement).style.opacity).toBe("1");
  expect(parseFloat((fills[11] as HTMLElement).style.opacity)).toBeCloseTo(0.3 + 0.5 * (37 / 40), 3);
  expect((fills[20] as HTMLElement).style.height).toBe("2.5%");
  expect((fills[20] as HTMLElement).style.opacity).toBe("1");
  expect(screen.getByText("00")).toBeInTheDocument();
  expect(screen.getByText("06")).toBeInTheDocument();
  expect(screen.getByText("23")).toBeInTheDocument();
});

test("no quiet-hours sentence when every hour had a fetch; the empty state when none did", () => {
  const { rerender } = render(<HoursChart hours={REPORT_7D.hours} empty="No links pasted in this range yet" />);
  expect(screen.getByText("14:00 to 15:00")).toBeInTheDocument();
  expect(screen.getByText("busiest, 196 fetches")).toBeInTheDocument();
  rerender(<HoursChart hours={EMPTY_REPORT.hours} empty="No links pasted in this range yet" />);
  expect(screen.getByText("No links pasted in this range yet")).toBeInTheDocument();
});
```

Create `frontend/src/admin/components/MiniStats.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { MiniStats } from "./MiniStats";

test("two or three tinted tiles with label and figure; a tone colours the figure", () => {
  const { container, rerender } = render(
    <MiniStats
      items={[
        { label: "Worked", value: "91%", tone: "#30d158" },
        { label: "Deleted or missing", value: "163" },
        { label: "Failed on our side", value: "17" },
      ]}
    />,
  );
  expect(container.querySelector("dl")?.className).toContain("grid-cols-3");
  expect(screen.getByText("Worked")).toBeInTheDocument();
  expect(screen.getByText("91%")).toHaveStyle({ color: "#30d158" });
  expect(screen.getByText("163")).not.toHaveAttribute("style");
  expect(screen.getByText("163").closest("div")?.className).toContain("rounded-tile");
  rerender(<MiniStats items={[{ label: "A", value: "1" }, { label: "B", value: "2" }]} />);
  expect(container.querySelector("dl")?.className).toContain("grid-cols-2");
});
```

Create `frontend/src/admin/components/Footnote.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { Footnote } from "./Footnote";

test("explains the daily visitor id with the local time of midnight UTC, the retention, the refresh, and the DB-IP link", () => {
  render(<Footnote tz={360} />);
  expect(screen.getByText(/Visitors are counted once a day: the anonymous ID resets at midnight UTC \(06:00 your time\), so someone active across that moment counts twice\./)).toBeInTheDocument();
  expect(screen.getByText(/Times are your local time\. Data is kept 90 days, so the 90-day range has nothing earlier to compare with\. Refreshes every 30 seconds while this tab is open\./)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "IP Geolocation by DB-IP" })).toHaveAttribute("href", "https://db-ip.com");
});
```

Append to `frontend/src/admin/pages/AnalyticsPage.test.tsx` (add `within` to the existing `@testing-library/react` import and `EMPTY_REPORT` from `"../test/fixtures"`):

```tsx
test("the eight tiles read from the 7d report", async () => {
  vi.stubGlobal("fetch", fakeServer().fetch);
  render(<AnalyticsPage {...props()} />);
  await screen.findByText("Sep 17 to Sep 23, your local time");
  const tile = (label: string) => within(screen.getByText(label).closest(".rounded-card") as HTMLElement);
  expect(tile("Success rate").getByText("91%")).toBeInTheDocument();
  expect(tile("Success rate").getByText("+2%")).toHaveAttribute("title", "Compared with the 7 days before");
  expect(tile("Success rate").getByText("links that returned media")).toBeInTheDocument();
  expect(tile("Conversion").getByText("68%")).toBeInTheDocument();
  expect(tile("Conversion").getByText("0%")).toBeInTheDocument();
  expect(tile("Conversion").getByText("visitors who downloaded")).toBeInTheDocument();
  expect(tile("Downloads per visitor").getByText("1.3")).toBeInTheDocument();
  expect(tile("Downloads per visitor").getByText("per visitor a day")).toBeInTheDocument();
  expect(tile("Visitors a day").getByText("261")).toBeInTheDocument();
  expect(tile("Visitors a day").getByText("+8%")).toBeInTheDocument();
  expect(tile("Visitors a day").getByText("average of full days")).toBeInTheDocument();
  expect(tile("Returning").getByText("26%")).toBeInTheDocument();
  expect(tile("Returning").getByText("+3%")).toBeInTheDocument();
  expect(tile("Returning").getByText("of visitors came back")).toBeInTheDocument();
  expect(tile("Page views").getByText("2,236")).toBeInTheDocument();
  expect(tile("Page views").getByText("+10%")).toBeInTheDocument();
  expect(tile("Page views").getByText("1.3 per visitor")).toBeInTheDocument();
  expect(tile("Peak at once").getByText("14")).toBeInTheDocument();
  expect(tile("Peak at once").getByText("Sep 20 at 21:15")).toBeInTheDocument();
  expect(tile("Peak at once").queryByText(/%$/)).not.toBeInTheDocument();
  expect(tile("Resolver errors").getByText("17")).toBeInTheDocument();
  expect(tile("Resolver errors").getByText("-19%").className).toContain("text-success");
  expect(tile("Resolver errors").getByText("failures on our side")).toBeInTheDocument();
});

test("today: Visitors a day shows a dash with no delta; the hours panel counts quiet hours", async () => {
  vi.stubGlobal("fetch", fakeServer().fetch);
  render(<AnalyticsPage {...props({ range: "today" })} />);
  await screen.findByText("Sep 23, your local time");
  const tile = within(screen.getByText("Visitors a day").closest(".rounded-card") as HTMLElement);
  expect(tile.getByText("-")).toBeInTheDocument();
  expect(tile.getByText("needs a full day")).toBeInTheDocument();
  expect(tile.queryByText(/%$/)).not.toBeInTheDocument();
  expect(screen.getByText("12:00 to 13:00")).toBeInTheDocument();
  expect(screen.getByText("busiest, 40 fetches. 10 hours had none")).toBeInTheDocument();
});

test("panels: funnel, outcomes, platforms, qualities, countries, pages, hours, visitors, sources and the footnote", async () => {
  vi.stubGlobal("fetch", fakeServer().fetch);
  render(<AnalyticsPage {...props()} />);
  await screen.findByText("Sep 17 to Sep 23, your local time");
  const panel = (name: string) => within(screen.getByRole("region", { name }));

  const funnel = panel("From visit to download");
  expect(funnel.getByText("Each visitor counted once a day")).toBeInTheDocument();
  expect(funnel.getByText("Pasted a link")).toBeInTheDocument();
  expect(funnel.getByText("Got a result")).toBeInTheDocument();
  expect(funnel.getByText("1,187")).toBeInTheDocument();
  expect(funnel.getByText("80%")).toBeInTheDocument();

  const outcomes = panel("Fetch outcomes");
  expect(outcomes.getByText("What happened to each link")).toBeInTheDocument();
  expect(outcomes.getAllByText("Worked")).toHaveLength(2);
  expect(outcomes.getAllByText("91%")).toHaveLength(2);
  expect(outcomes.getAllByText("Deleted or missing")).toHaveLength(2);
  expect(outcomes.getAllByText("163")).toHaveLength(2);
  expect(outcomes.getByText("Failed on our side")).toBeInTheDocument();
  expect(outcomes.getByText("Resolver error")).toBeInTheDocument();
  expect(outcomes.getByText("Unsupported post")).toBeInTheDocument();
  expect(outcomes.getByText("5.8%")).toBeInTheDocument();

  const platforms = panel("Platforms");
  expect(platforms.getByText("Where the links came from")).toBeInTheDocument();
  expect(platforms.getByText("2,812")).toBeInTheDocument();
  expect(platforms.getByText("X (Twitter)")).toBeInTheDocument();
  expect(platforms.getByText("60%")).toBeInTheDocument();
  expect(platforms.getByText("92% worked")).toBeInTheDocument();
  expect(platforms.getByText("Facebook")).toBeInTheDocument();

  const qualities = panel("Qualities");
  expect(qualities.getByText("What people saved")).toBeInTheDocument();
  expect(qualities.getByText("1080p")).toBeInTheDocument();
  expect(qualities.getByText("Photo")).toBeInTheDocument();
  expect(qualities.getByRole("button", { name: "Show all (9)" })).toBeInTheDocument();

  const countries = panel("Countries");
  expect(countries.getByText("Not known includes every visit from before country lookup came back")).toBeInTheDocument();
  expect(countries.getByText("US")).toBeInTheDocument();
  expect(countries.getByText("United States")).toBeInTheDocument();
  expect(countries.getByText("Bangladesh")).toBeInTheDocument();
  const last = countries.getAllByRole("listitem").at(-1) as HTMLElement;
  expect(within(last).getByText("Not known")).toBeInTheDocument();
  expect(within(last).getByText("290")).toBeInTheDocument();

  const pages = panel("Pages");
  expect(pages.getByText("Which pages people used")).toBeInTheDocument();
  expect(pages.getByText("X (Twitter), English")).toBeInTheDocument();
  expect(pages.getByText("986")).toBeInTheDocument();
  expect(pages.getByText("TikTok, Hindi")).toBeInTheDocument();
  expect(pages.getByText("X (Twitter), language not recorded")).toBeInTheDocument();

  const hours = panel("Busiest hours");
  expect(hours.getByText("When people use it")).toBeInTheDocument();
  expect(hours.getByText("14:00 to 15:00")).toBeInTheDocument();

  const visitors = panel("New and returning");
  expect(visitors.getByText("From the visit beacon; people who only pasted a link are not split")).toBeInTheDocument();
  expect(visitors.getByText("1,522")).toBeInTheDocument();
  expect(visitors.getByText("1,120")).toBeInTheDocument();
  expect(visitors.getByText("26%")).toBeInTheDocument();
  expect(visitors.getByText("Traffic sources")).toBeInTheDocument();
  expect(visitors.getByText("Search")).toBeInTheDocument();
  expect(visitors.getByText("1,204")).toBeInTheDocument();
  expect(visitors.getByText("Other sites")).toBeInTheDocument();
  expect(visitors.getByText("Between pages")).toBeInTheDocument();

  expect(screen.getByRole("link", { name: "IP Geolocation by DB-IP" })).toBeInTheDocument();
  expect(screen.getByText(/\(06:00 your time\)/)).toBeInTheDocument();
});

test("a fresh install shows an empty state in every panel and dashes on the ratio tiles", async () => {
  vi.stubGlobal("fetch", vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify(EMPTY_REPORT), { status: 200 })));
  render(<AnalyticsPage {...props()} />);
  await screen.findByText("Nothing in this range yet");
  expect(screen.getAllByText("No links pasted in this range yet")).toHaveLength(3);
  expect(screen.getAllByText("No visits in this range yet")).toHaveLength(2);
  expect(screen.getByText("Nothing saved in this range yet")).toBeInTheDocument();
  expect(screen.getByText("No visitors in this range yet")).toBeInTheDocument();
  expect(screen.getByText("No page views in this range yet")).toBeInTheDocument();
  expect(screen.getAllByText("-")).toHaveLength(5);
  expect(screen.getByText("- per visitor")).toBeInTheDocument();
  expect(within(screen.getByRole("region", { name: "Countries" })).getByText("Where visitors are")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `cd "$(git rev-parse --show-toplevel)/frontend" && npx vitest run src/admin/components src/admin/pages`
Expected: FAIL. The nine new component files fail at import ("Failed to resolve import "./Kpi"" and so on); the four new AnalyticsPage tests fail on "Success rate", "needs a full day", the "From visit to download" region and the empty-state texts.

- [ ] **Step 3: Write the components**

Create `frontend/src/admin/components/Kpi.tsx`:

```tsx
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { tint } from "../lib/colors";
import { Delta } from "./Delta";
import { CARD, cn } from "./styles";

/** One figure with a 28px tinted icon tile, the change against the period before and a 12px note. */
export function Kpi({ icon: Icon, color, label, value, sub, delta = null, compare, invert }: { icon: LucideIcon; color: string; label: string; value: string; sub?: ReactNode; delta?: number | null; compare?: string; invert?: boolean }) {
  return (
    <div className={cn(CARD, "flex min-w-0 flex-col p-4 sm:p-5")}>
      <div className="flex min-w-0 items-center gap-2.5">
        <span aria-hidden="true" className="grid size-7 shrink-0 place-items-center rounded-full" style={{ background: tint(color), color }}>
          <Icon className="size-3.5" strokeWidth={2.25} />
        </span>
        <p className="truncate text-[13px] text-text-secondary">{label}</p>
      </div>
      <p className="mt-4 truncate text-[24px] leading-none font-semibold tracking-[-0.025em] text-text-primary tabular-nums sm:text-[28px]">{value}</p>
      <div className="mt-2.5 flex min-w-0 items-center gap-2">
        <Delta value={delta} compare={compare} invert={invert} />
        {sub ? <p className="min-w-0 truncate text-xs text-text-muted">{sub}</p> : null}
      </div>
    </div>
  );
}
```

Create `frontend/src/admin/components/Panel.tsx`:

```tsx
import type { ReactNode } from "react";
import { CARD, cn } from "./styles";

/** A 22px card with a 15px title, a 13px muted hint and 20px before the content. Named region for tests and screen readers. */
export function Panel({ title, hint, children, className }: { title: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section aria-label={title} className={cn(CARD, "p-5 sm:p-6", className)}>
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-text-primary">{title}</h2>
        {hint ? <p className="mt-0.5 text-[13px] text-text-muted">{hint}</p> : null}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}
```

Create `frontend/src/admin/components/EmptyState.tsx`:

```tsx
/** A dashed box, at least 96px tall, 28px radius, one muted sentence. */
export function EmptyState({ text }: { text: string }) {
  return <p className="grid min-h-24 place-items-center rounded-tile border border-dashed border-line/60 px-4 text-center text-sm text-text-muted">{text}</p>;
}
```

Create `frontend/src/admin/components/Funnel.tsx`:

```tsx
import { COLORS } from "../lib/colors";
import { formatCount, formatPercent } from "../lib/format";

export type FunnelStep = { label: string; value: number };

/** Each bar against the first step, with the share kept from the step before; opacity drops 0.15 per step. */
export function Funnel({ steps }: { steps: FunnelStep[] }) {
  const top = Math.max(1, steps[0]?.value ?? 0);
  return (
    <ol className="flex flex-col gap-4">
      {steps.map((s, i) => {
        const before = i > 0 ? steps[i - 1].value : null;
        const kept = before ? s.value / before : null;
        return (
          <li key={s.label}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="flex items-baseline gap-2.5">
                <span className="w-4 text-xs text-text-muted tabular-nums">{i + 1}</span>
                <span className="text-text-primary">{s.label}</span>
              </span>
              <span className="flex items-baseline gap-3 tabular-nums">
                <span className="text-[15px] font-semibold text-text-primary">{formatCount(s.value)}</span>
                <span className="w-12 text-right text-xs text-text-muted">{kept != null ? formatPercent(kept) : ""}</span>
              </span>
            </div>
            <div className="mt-2 ml-6.5 h-2 overflow-hidden rounded-full bg-white/[0.06]">
              <div className="h-full rounded-full" style={{ width: `${Math.max(s.value > 0 ? 1.5 : 0, (s.value / top) * 100)}%`, background: COLORS.blue, opacity: 1 - i * 0.15 }} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}
```

Create `frontend/src/admin/components/SegmentBar.tsx`:

```tsx
import { formatCount, formatPercent } from "../lib/format";
import { EmptyState } from "./EmptyState";

export type Segment = { key: string; label: string; value: number; color: string };

/** One 12px bar split by share (3px gaps, 4px minimum, native titles) with a legend of counts and percents. */
export function SegmentBar({ segments, empty }: { segments: Segment[]; empty: string }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  if (total === 0) return <EmptyState text={empty} />;
  return (
    <div>
      <div className="flex h-3 w-full gap-[3px] overflow-hidden rounded-full">
        {segments
          .filter((s) => s.value > 0)
          .map((s) => (
            <div key={s.key} title={`${s.label}: ${formatCount(s.value)}`} className="h-full first:rounded-l-full last:rounded-r-full" style={{ width: `${(s.value / total) * 100}%`, background: s.color, minWidth: 4 }} />
          ))}
      </div>
      <ul className="mt-5 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        {segments.map((s) => (
          <li key={s.key} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-2.5">
              <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
              <span className="truncate text-text-primary">{s.label}</span>
            </span>
            <span className="flex shrink-0 items-baseline gap-2 tabular-nums">
              <span className="font-semibold text-text-primary">{formatCount(s.value)}</span>
              <span className="w-9 text-right text-xs text-text-muted">{formatPercent(s.value / total)}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

Create `frontend/src/admin/components/Donut.tsx`:

```tsx
import { Cell, Pie, PieChart } from "recharts";
import { formatPercent } from "../lib/format";
import { EmptyState } from "./EmptyState";

export type Slice = { key: string; label: string; value: number; color: string; display: string; hint?: string };

/**
 * A ring of shares in a fixed 176px box with the total in the middle and a legend beside it
 * (below it under 640px). The box is fixed by spec, so the chart takes its size directly and
 * renders under jsdom without a ResponsiveContainer.
 */
export function Donut({ slices, center, empty }: { slices: Slice[]; center: { value: string; label: string }; empty: string }) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  if (total === 0) return <EmptyState text={empty} />;
  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row">
      <div className="relative size-44 shrink-0">
        <div aria-hidden="true">
          <PieChart width={176} height={176}>
            <Pie data={slices} dataKey="value" nameKey="key" innerRadius={58} outerRadius={84} paddingAngle={2} cornerRadius={4} stroke="none" animationDuration={700}>
              {slices.map((s) => (
                <Cell key={s.key} fill={s.color} />
              ))}
            </Pie>
          </PieChart>
        </div>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <p className="text-[26px] leading-none font-semibold tracking-[-0.025em] text-text-primary tabular-nums">{center.value}</p>
            <p className="mt-1 text-xs text-text-muted">{center.label}</p>
          </div>
        </div>
      </div>
      <ul className="flex w-full min-w-0 flex-col gap-2.5">
        {slices.map((s) => (
          <li key={s.key} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-2.5">
              <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
              <span className="truncate text-text-primary">{s.label}</span>
            </span>
            <span className="flex shrink-0 items-baseline gap-2.5 tabular-nums">
              <span className="text-[13px] text-text-secondary">{s.display}</span>
              <span className="w-9 text-right text-xs text-text-muted">{formatPercent(s.value / total)}</span>
              {s.hint ? <span className="text-xs text-text-muted">{s.hint}</span> : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

Create `frontend/src/admin/components/BarList.tsx`:

```tsx
import { useState, type ReactNode } from "react";
import { COLORS } from "../lib/colors";
import { EmptyState } from "./EmptyState";

export type BarRow = { key: string; label: ReactNode; hint?: ReactNode; value: number; display: ReactNode; color?: string; muted?: boolean };

/** Label, figure and a 6px bar sized against the largest row. Long lists fold behind "Show all (n)". */
export function BarList({ rows, empty, color = COLORS.blue, limit }: { rows: BarRow[]; empty: string; color?: string; limit?: number }) {
  const [expanded, setExpanded] = useState(false);
  if (rows.length === 0) return <EmptyState text={empty} />;
  const max = Math.max(1, ...rows.map((r) => r.value));
  const foldable = limit !== undefined && rows.length > limit;
  const visible = foldable && !expanded ? rows.slice(0, limit) : rows;
  return (
    <div>
      <ul className="flex flex-col gap-4">
        {visible.map((r) => (
          <li key={r.key}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="flex min-w-0 items-baseline gap-2">
                <span className={r.muted ? "truncate text-text-muted" : "truncate text-text-primary"}>{r.label}</span>
                {r.hint ? <span className="shrink-0 text-xs text-text-muted">{r.hint}</span> : null}
              </span>
              <span className="shrink-0 text-[13px] text-text-secondary tabular-nums">{r.display}</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
              <div className="h-full rounded-full" style={{ width: `${Math.max(r.value > 0 ? 2 : 0, (r.value / max) * 100)}%`, background: r.color ?? color, opacity: r.muted ? 0.5 : 1 }} />
            </div>
          </li>
        ))}
      </ul>
      {foldable ? (
        <button type="button" onClick={() => setExpanded((v) => !v)} className="mt-4 text-xs text-text-muted underline decoration-dotted underline-offset-4 transition-colors hover:text-text-primary">
          {expanded ? "Show less" : `Show all (${rows.length})`}
        </button>
      ) : null}
    </div>
  );
}
```

Create `frontend/src/admin/components/HoursChart.tsx`:

```tsx
import type { HourRow } from "../lib/api";
import { COLORS } from "../lib/colors";
import { formatCount, formatHour, formatHourRange } from "../lib/format";
import { peakHour, quietHours } from "../lib/metrics";
import { EmptyState } from "./EmptyState";

/** Fetches by local hour: 24 columns in a 144px row; the busiest is solid, the rest fade with how busy they are. */
export function HoursChart({ hours, empty }: { hours: HourRow[]; empty: string }) {
  const peak = peakHour(hours);
  if (!peak) return <EmptyState text={empty} />;
  const quiet = quietHours(hours);
  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <p className="text-[22px] leading-none font-semibold tracking-[-0.02em] text-text-primary tabular-nums">{formatHourRange(peak.hour)}</p>
        <p className="text-xs text-text-muted">
          busiest, {formatCount(peak.fetches)} {peak.fetches === 1 ? "fetch" : "fetches"}
          {quiet ? `. ${quiet} ${quiet === 1 ? "hour" : "hours"} had none` : ""}
        </p>
      </div>
      <div aria-hidden="true" className="mt-6 flex h-36 items-end gap-[3px]">
        {hours.map((h) => (
          <div key={h.hour} title={`${formatHour(h.hour)}, ${formatCount(h.fetches)} ${h.fetches === 1 ? "fetch" : "fetches"}`} className="group flex h-full flex-1 items-end">
            <div
              className="w-full rounded-[4px] transition-opacity group-hover:opacity-100"
              style={{
                height: `${h.fetches > 0 ? Math.max(6, (h.fetches / peak.fetches) * 100) : 2.5}%`,
                background: h.fetches > 0 ? COLORS.blue : "rgba(255,255,255,0.08)",
                opacity: h.fetches === 0 || h.hour === peak.hour ? 1 : 0.3 + 0.5 * (h.fetches / peak.fetches),
              }}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-text-muted tabular-nums">
        <span>00</span>
        <span>06</span>
        <span>12</span>
        <span>18</span>
        <span>23</span>
      </div>
    </div>
  );
}
```

Create `frontend/src/admin/components/MiniStats.tsx`:

```tsx
import { cn } from "./styles";

/** Two or three small figures on 28px tinted tiles, for the top of a panel. */
export function MiniStats({ items, className }: { items: { label: string; value: string; tone?: string }[]; className?: string }) {
  return (
    <dl className={cn("grid gap-3", items.length === 2 ? "grid-cols-2" : "grid-cols-3", className)}>
      {items.map((s) => (
        <div key={s.label} className="min-w-0 rounded-tile bg-white/[0.04] px-3.5 py-3">
          <dt className="truncate text-xs text-text-muted">{s.label}</dt>
          <dd className="mt-1 truncate text-[20px] leading-none font-semibold tracking-[-0.02em] text-text-primary tabular-nums" style={s.tone ? { color: s.tone } : undefined}>
            {s.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
```

Create `frontend/src/admin/components/Footnote.tsx`:

```tsx
import { utcMidnightLocal } from "../lib/format";

/** The daily visitor rule with the owner's local time of midnight UTC, retention, refresh, and DB-IP's required link. */
export function Footnote({ tz }: { tz: number }) {
  return (
    <p className="mt-8 max-w-3xl text-xs leading-relaxed text-text-muted">
      Visitors are counted once a day: the anonymous ID resets at midnight UTC ({utcMidnightLocal(tz)} your time), so someone active across that moment counts twice. Times are your
      local time. Data is kept 90 days, so the 90-day range has nothing earlier to compare with. Refreshes every 30 seconds while this tab is open.{" "}
      <a href="https://db-ip.com" className="text-brand-link hover:underline">
        IP Geolocation by DB-IP
      </a>
    </p>
  );
}
```

- [ ] **Step 4: Rewrite the AnalyticsPage with the tiles, panels and footnote**

Replace `frontend/src/admin/pages/AnalyticsPage.tsx` with (the loading part is Task 8's, unchanged):

```tsx
import { useEffect, useRef, useState } from "react";
import { Activity, CircleCheck, Download, Eye, MousePointerClick, RotateCcw, TriangleAlert, Users } from "lucide-react";
import { fetchReport, type Maintenance, type RangeKey, type Report } from "../lib/api";
import { COLORS, outcomeColor, SERIES } from "../lib/colors";
import { compareLabel } from "../lib/delta";
import { countryName, DASH, formatClock, formatCount, formatPeak, formatRatio, formatShare, formatSpan, formatWhole, outcomeLabel, pageLabel, platformName, qualityLabel, sourceLabel } from "../lib/format";
import { conversion, countDelta, downloadsPerVisitor, ratio, ratioDelta, returningShare, successRate, viewsPerVisitor, visitorsADay } from "../lib/metrics";
import { RANGE_TITLES } from "../lib/range";
import { BarList } from "../components/BarList";
import { Donut } from "../components/Donut";
import { EmptyState } from "../components/EmptyState";
import { Footnote } from "../components/Footnote";
import { Funnel } from "../components/Funnel";
import { HoursChart } from "../components/HoursChart";
import { Kpi } from "../components/Kpi";
import { LiveStrip } from "../components/LiveStrip";
import { MiniStats } from "../components/MiniStats";
import { PageHeader } from "../components/PageHeader";
import { Panel } from "../components/Panel";
import { RangeTabs } from "../components/RangeTabs";
import { Reveal } from "../components/Reveal";
import { SegmentBar } from "../components/SegmentBar";
import { TrendCard, type ChartSize } from "../components/TrendCard";
import { cn } from "../components/styles";

export type AnalyticsPageProps = {
  range: RangeKey;
  tz: number;
  tick: number;
  maintenance: Maintenance | null;
  onRangeChange: (range: RangeKey) => void;
  onGoToSite: () => void;
  onUnauthorized: () => void;
  onUnavailable: () => void;
  /** Tests pass a fixed chart size; production measures the container. */
  chartSize?: ChartSize;
};

type Loaded = { report: Report; updatedAt: Date };

const NO_LINKS = "No links pasted in this range yet";
const NO_VISITS = "No visits in this range yet";

export function AnalyticsPage({ range, tz, tick, maintenance, onRangeChange, onGoToSite, onUnauthorized, onUnavailable, chartSize }: AnalyticsPageProps) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);
  const loadedRef = useRef(loaded);
  loadedRef.current = loaded;
  const handlers = useRef({ onUnauthorized, onUnavailable });
  handlers.current = { onUnauthorized, onUnavailable };

  // One fetch per range change and per refresh tick. A response that arrives after the
  // range moved on is dropped by the cleanup flag, so the page never shows the wrong range.
  useEffect(() => {
    let alive = true;
    void fetchReport(range, tz).then((result) => {
      if (!alive) return;
      if (result === "unauthorized") {
        handlers.current.onUnauthorized();
        return;
      }
      if (result === "error") {
        if (loadedRef.current === null) handlers.current.onUnavailable();
        else setFailed(true);
        return;
      }
      setLoaded({ report: result, updatedAt: new Date() });
      setFailed(false);
    });
    return () => {
      alive = false;
    };
  }, [range, tz, tick]);

  const report = loaded?.report ?? null;
  // The old numbers stay on screen at 50% until the new range arrives; the pill moved already.
  const pending = report !== null && report.range !== range;
  const note = failed ? "Could not refresh, trying again" : loaded ? `Updated ${formatClock(loaded.updatedAt)}` : undefined;

  return (
    <div>
      <PageHeader
        kicker="Analytics"
        title={RANGE_TITLES[range]}
        subtitle={report ? formatSpan(report.window) : "Your local time"}
        note={note}
        actions={<RangeTabs active={range} onChange={onRangeChange} />}
      />
      {report ? (
        <>
          <Reveal i={1} className="mt-6">
            <LiveStrip live={report.live} maintenance={maintenance} onGoToSite={onGoToSite} />
          </Reveal>
          <div aria-busy={pending} className={cn("transition-opacity duration-300", pending && "pointer-events-none opacity-50")}>
            <Reveal i={2} className="mt-6">
              <TrendCard report={report} compare={compareLabel(report.range)} size={chartSize} />
            </Reveal>
            <RangeBody report={report} compare={compareLabel(report.range)} />
          </div>
          <Footnote tz={tz} />
        </>
      ) : null}
    </div>
  );
}

function CountryChip({ code }: { code: string }) {
  return <span className="mr-2 rounded-full border border-line/60 bg-white/[0.04] px-1.5 py-0.5 font-mono text-xs text-text-secondary">{code}</span>;
}

/** The eight tiles and the four panel pairs for one report (spec F3, items 3 and 4). */
function RangeBody({ report, compare }: { report: Report; compare: string }) {
  const t = report.totals;
  const p = report.previous;
  const f = report.funnel;
  const today = report.range === "today";
  const outcomeCount = (name: string) => report.outcomes.find((o) => o.outcome === name)?.count ?? 0;
  const unknownVisitors = report.countries.find((c) => c.country === "unknown")?.visitors ?? 0;
  const anyCountry = report.countries.some((c) => c.visitors > 0);
  const splitVisitors = t.new_visitors + t.returning_visitors;

  return (
    <>
      <Reveal i={3} className="mt-4 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Kpi icon={CircleCheck} color={COLORS.green} label="Success rate" value={formatShare(successRate(t))} sub="links that returned media" delta={ratioDelta(successRate, t, p)} compare={compare} />
        <Kpi icon={MousePointerClick} color={COLORS.purple} label="Conversion" value={formatShare(conversion(t))} sub="visitors who downloaded" delta={ratioDelta(conversion, t, p)} compare={compare} />
        <Kpi icon={Download} color={COLORS.blue} label="Downloads per visitor" value={formatRatio(downloadsPerVisitor(t))} sub="per visitor a day" delta={ratioDelta(downloadsPerVisitor, t, p)} compare={compare} />
        <Kpi
          icon={Users}
          color={COLORS.teal}
          label="Visitors a day"
          value={today ? DASH : formatWhole(visitorsADay(t))}
          sub={today ? "needs a full day" : "average of full days"}
          delta={today ? null : ratioDelta(visitorsADay, t, p)}
          compare={compare}
        />
        <Kpi icon={RotateCcw} color={COLORS.orange} label="Returning" value={formatShare(returningShare(t))} sub="of visitors came back" delta={ratioDelta(returningShare, t, p)} compare={compare} />
        <Kpi icon={Eye} color={COLORS.indigo} label="Page views" value={formatCount(t.page_views)} sub={`${formatRatio(viewsPerVisitor(t))} per visitor`} delta={countDelta((x) => x.page_views, t, p)} compare={compare} />
        <Kpi icon={Activity} color={COLORS.yellow} label="Peak at once" value={report.peak ? formatCount(report.peak.count) : DASH} sub={report.peak ? formatPeak(report.peak) : undefined} />
        <Kpi icon={TriangleAlert} color={COLORS.red} label="Resolver errors" value={formatCount(t.upstream_errors)} sub="failures on our side" delta={countDelta((x) => x.upstream_errors, t, p)} compare={compare} invert />
      </Reveal>

      <Reveal i={4} className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="From visit to download" hint="Each visitor counted once a day">
          {f.visitors > 0 ? (
            <Funnel
              steps={[
                { label: "Visitors", value: f.visitors },
                { label: "Pasted a link", value: f.fetched },
                { label: "Got a result", value: f.got_result },
                { label: "Downloaded", value: f.downloaded },
              ]}
            />
          ) : (
            <EmptyState text={NO_VISITS} />
          )}
        </Panel>
        <Panel title="Fetch outcomes" hint="What happened to each link">
          {t.fetches > 0 ? (
            <>
              <MiniStats
                className="mb-6"
                items={[
                  { label: "Worked", value: formatShare(successRate(t)), tone: COLORS.green },
                  { label: "Deleted or missing", value: formatCount(outcomeCount("not_found")) },
                  { label: "Failed on our side", value: formatCount(outcomeCount("upstream_error")) },
                ]}
              />
              <SegmentBar empty={NO_LINKS} segments={report.outcomes.map((o) => ({ key: o.outcome, label: outcomeLabel(o.outcome), value: o.count, color: outcomeColor(o.outcome) }))} />
            </>
          ) : (
            <EmptyState text={NO_LINKS} />
          )}
        </Panel>
      </Reveal>

      <Reveal i={5} className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Platforms" hint="Where the links came from">
          <Donut
            empty={NO_LINKS}
            center={{ value: formatCount(t.fetches), label: t.fetches === 1 ? "fetch" : "fetches" }}
            slices={report.platforms.map((pl, i) => ({
              key: pl.platform,
              label: platformName(pl.platform),
              value: pl.fetches,
              color: SERIES[i % SERIES.length],
              display: formatCount(pl.fetches),
              hint: `${formatShare(ratio(pl.ok, pl.fetches))} worked`,
            }))}
          />
        </Panel>
        <Panel title="Qualities" hint="What people saved">
          <BarList empty="Nothing saved in this range yet" color={COLORS.purple} limit={8} rows={report.qualities.map((q) => ({ key: q.quality, label: qualityLabel(q.quality), value: q.count, display: formatCount(q.count) }))} />
        </Panel>
      </Reveal>

      <Reveal i={6} className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Countries" hint={unknownVisitors > 0 ? "Not known includes every visit from before country lookup came back" : "Where visitors are"}>
          {anyCountry ? (
            <BarList
              empty="No visitors in this range yet"
              color={COLORS.teal}
              rows={report.countries.map((c) =>
                c.country === "unknown"
                  ? { key: "unknown", label: "Not known", value: c.visitors, display: formatCount(c.visitors), muted: true }
                  : {
                      key: c.country,
                      label: (
                        <>
                          <CountryChip code={c.country} />
                          {countryName(c.country)}
                        </>
                      ),
                      value: c.visitors,
                      display: formatCount(c.visitors),
                    },
              )}
            />
          ) : (
            <EmptyState text="No visitors in this range yet" />
          )}
        </Panel>
        <Panel title="Pages" hint="Which pages people used">
          <BarList empty="No page views in this range yet" color={COLORS.blue} rows={report.pages.map((pg) => ({ key: `${pg.platform}:${pg.locale}`, label: pageLabel(pg.platform, pg.locale), value: pg.views, display: formatCount(pg.views) }))} />
        </Panel>
      </Reveal>

      <Reveal i={7} className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Busiest hours" hint="When people use it">
          <HoursChart hours={report.hours} empty={NO_LINKS} />
        </Panel>
        <Panel title="New and returning" hint="From the visit beacon; people who only pasted a link are not split">
          {splitVisitors > 0 ? (
            <>
              <MiniStats
                items={[
                  { label: "Visitors", value: formatCount(splitVisitors) },
                  { label: "New", value: formatCount(t.new_visitors) },
                  { label: "Came back", value: formatShare(returningShare(t)) },
                ]}
              />
              <p className="mt-6 mb-3 text-xs font-medium text-text-secondary">Traffic sources</p>
              <BarList empty="No page views in this range yet" color={COLORS.orange} rows={report.sources.map((s) => ({ key: s.source, label: sourceLabel(s.source), value: s.visits, display: formatCount(s.visits) }))} />
            </>
          ) : (
            <EmptyState text={NO_VISITS} />
          )}
        </Panel>
      </Reveal>
    </>
  );
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd "$(git rev-parse --show-toplevel)/frontend" && npx vitest run src/admin`
Expected: PASS. New: Kpi 2, Panel 1, Funnel 1, SegmentBar 2, Donut 2, BarList 3, HoursChart 2, MiniStats 1, Footnote 1, AnalyticsPage +4 (19 tests). Every Task 8 test still passes: the page's loading shell did not change.

- [ ] **Step 6: Task gate**

Run:
```bash
cd "$(git rev-parse --show-toplevel)/frontend" && npm run lint && npx vitest run && npm run build
```
Expected: lint clean; vitest all green (619 + 19 = 638); build succeeds.

- [ ] **Step 7: Commit**

```bash
cd "$(git rev-parse --show-toplevel)" && git add frontend/src/admin/components/Kpi.tsx frontend/src/admin/components/Kpi.test.tsx frontend/src/admin/components/Panel.tsx frontend/src/admin/components/Panel.test.tsx frontend/src/admin/components/EmptyState.tsx frontend/src/admin/components/Funnel.tsx frontend/src/admin/components/Funnel.test.tsx frontend/src/admin/components/SegmentBar.tsx frontend/src/admin/components/SegmentBar.test.tsx frontend/src/admin/components/Donut.tsx frontend/src/admin/components/Donut.test.tsx frontend/src/admin/components/BarList.tsx frontend/src/admin/components/BarList.test.tsx frontend/src/admin/components/HoursChart.tsx frontend/src/admin/components/HoursChart.test.tsx frontend/src/admin/components/MiniStats.tsx frontend/src/admin/components/MiniStats.test.tsx frontend/src/admin/components/Footnote.tsx frontend/src/admin/components/Footnote.test.tsx frontend/src/admin/pages/AnalyticsPage.tsx frontend/src/admin/pages/AnalyticsPage.test.tsx && git commit -m "feat(admin): kpi tiles, panels and footnote on the analytics page

Eight tiles, four panel pairs (funnel and outcomes, platforms and qualities,
countries and pages, busiest hours and new vs returning), the DB-IP link.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Site page (maintenance card and resolver health)

**Files:**
- Create: `frontend/src/admin/components/MaintenanceCard.tsx`, `frontend/src/admin/components/ResolverHealth.tsx`
- Modify: `frontend/src/admin/pages/SitePage.tsx` (full rewrite of the Task 7 stub), `frontend/src/admin/App.test.tsx` (append one test)
- Test: `frontend/src/admin/components/MaintenanceCard.test.tsx`, `frontend/src/admin/components/ResolverHealth.test.tsx`, `frontend/src/admin/pages/SitePage.test.tsx`

**Interfaces:**
- Consumes (Task 6): `setMaintenance`, `fetchResolvers`, types `Maintenance`, `Resolvers`; `COLORS`; `formatAgo`, `formatCount`, `formatPercent`, `outcomeLabel`, `platformName`; `successTone`; fixture `RESOLVERS`. (Task 7/9): `Spinner`, `PageHeader`, `Reveal`, `cn`, `CARD`, `PILL_BUTTON`, `Panel`, `EmptyState`, `fakeServer`, `SitePageProps`.
- Produces:
  - `MaintenanceCard({ state: Maintenance | null; onChange: (m: Maintenance) => void; onUnauthorized: () => void })`, `CONFIRM_MS = 4000`.
  - `ResolverHealth({ data: Resolvers | null; failed: boolean })`.
  - `SitePage(props: SitePageProps)` (same props as Task 7) now loads resolvers on mount and on every `tick`.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/admin/components/MaintenanceCard.test.tsx`:

```tsx
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { fakeServer } from "../test/fakeServer";
import { MaintenanceCard } from "./MaintenanceCard";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const LIVE = { on: false, forced_by_env: false };
const IN_MAINTENANCE = { on: true, forced_by_env: false };

test("live: the first tap asks to confirm, the second within 4 s turns maintenance on", async () => {
  vi.useFakeTimers();
  const server = fakeServer();
  vi.stubGlobal("fetch", server.fetch);
  const onChange = vi.fn();
  render(<MaintenanceCard state={LIVE} onChange={onChange} onUnauthorized={() => {}} />);
  expect(screen.getByText("Live")).toBeInTheDocument();
  expect(screen.getByText("Visitors can use the site")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Turn on maintenance" }));
  const confirm = screen.getByRole("button", { name: "Tap to confirm" });
  expect(confirm.className).toContain("bg-warning-dim");
  expect(server.urls("/api/admin/maintenance")).toHaveLength(0);
  fireEvent.click(confirm);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10);
  });
  const post = server.fetch.mock.calls.find((c) => c[1]?.method === "POST");
  expect(JSON.parse(String(post?.[1]?.body))).toEqual({ on: true });
  expect(onChange).toHaveBeenCalledWith({ on: true, forced_by_env: false });
});

test("the confirm state expires after 4 s without applying anything", async () => {
  vi.useFakeTimers();
  const server = fakeServer();
  vi.stubGlobal("fetch", server.fetch);
  render(<MaintenanceCard state={LIVE} onChange={() => {}} onUnauthorized={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: "Turn on maintenance" }));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3999);
  });
  expect(screen.getByRole("button", { name: "Tap to confirm" })).toBeInTheDocument();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(screen.getByRole("button", { name: "Turn on maintenance" })).toBeInTheDocument();
  expect(server.urls("/api/admin/maintenance")).toHaveLength(0);
});

test("in maintenance: Go live needs one tap and lifts the new state", async () => {
  const server = fakeServer({ maintenance: IN_MAINTENANCE });
  vi.stubGlobal("fetch", server.fetch);
  const onChange = vi.fn();
  render(<MaintenanceCard state={IN_MAINTENANCE} onChange={onChange} onUnauthorized={() => {}} />);
  expect(screen.getByText("In maintenance")).toBeInTheDocument();
  expect(screen.getByText("Visitors see the maintenance page until you go live")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Go live" }));
  await vi.waitFor(() => expect(onChange).toHaveBeenCalledWith({ on: false, forced_by_env: false }));
  const post = server.fetch.mock.calls.find((c) => c[1]?.method === "POST");
  expect(JSON.parse(String(post?.[1]?.body))).toEqual({ on: false });
});

test("forced by the environment: the button is disabled and the note says where to fix it", () => {
  render(<MaintenanceCard state={{ on: true, forced_by_env: true }} onChange={() => {}} onUnauthorized={() => {}} />);
  expect(screen.getByRole("button", { name: "Go live" })).toBeDisabled();
  expect(screen.getByText("Forced on by MAINTENANCE_MODE in deploy/app.env on the server. Remove it there and redeploy")).toBeInTheDocument();
  expect(screen.getByText("Sign out clears this browser only. To sign out everywhere, change ADMIN_PASSWORD")).toBeInTheDocument();
});

test("a failed update says so and keeps the state; a 401 reports unauthorized", async () => {
  const server = fakeServer({ maintenance: IN_MAINTENANCE });
  vi.stubGlobal("fetch", server.fetch);
  const onChange = vi.fn();
  const onUnauthorized = vi.fn();
  render(<MaintenanceCard state={IN_MAINTENANCE} onChange={onChange} onUnauthorized={onUnauthorized} />);
  server.state.down = true;
  await userEvent.click(screen.getByRole("button", { name: "Go live" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not update, try again");
  expect(onChange).not.toHaveBeenCalled();
  expect(screen.getByText("In maintenance")).toBeInTheDocument();
  server.state.down = false;
  server.state.authed = false;
  await userEvent.click(screen.getByRole("button", { name: "Go live" }));
  await vi.waitFor(() => expect(onUnauthorized).toHaveBeenCalledTimes(1));
  expect(onChange).not.toHaveBeenCalled();
});

test("before the state is known: a checking line and no button", () => {
  render(<MaintenanceCard state={null} onChange={() => {}} onUnauthorized={() => {}} />);
  expect(screen.getByText("Checking the site status")).toBeInTheDocument();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});
```

Create `frontend/src/admin/components/ResolverHealth.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import { RESOLVERS } from "../test/fixtures";
import { ResolverHealth } from "./ResolverHealth";

test("five rows with lookups, a coloured success rate, the top failure and the last failure", () => {
  render(<ResolverHealth data={RESOLVERS} failed={false} />);
  const region = screen.getByRole("region", { name: "Last 24 hours" });
  expect(within(region).getByText("Resolver errors mean the service we use failed, not the visitor's link")).toBeInTheDocument();
  const rows = within(region).getAllByRole("listitem");
  expect(rows).toHaveLength(5);
  expect(within(rows[0]).getByText("X (Twitter)")).toBeInTheDocument();
  expect(within(rows[0]).getByText("574 lookups, Deleted or missing 31, last failed 12 min ago")).toBeInTheDocument();
  expect(within(rows[0]).getByText("93%")).toHaveStyle({ color: "#30d158" });
  expect(within(rows[1]).getByText("TikTok")).toBeInTheDocument();
  expect(within(rows[1]).getByText("89%")).toHaveStyle({ color: "#ffd60a" });
  expect(within(rows[2]).getByText("46 lookups, No video in the post 3, last failed 3 h ago")).toBeInTheDocument();
  expect(within(rows[3]).getByText("67%")).toHaveStyle({ color: "#ff453a" });
  expect(within(rows[3]).getByText("101 lookups, Private or restricted 21, last failed just now")).toBeInTheDocument();
  expect(within(rows[4]).getByText("Facebook")).toBeInTheDocument();
  expect(within(rows[4]).getByText("0 lookups")).toBeInTheDocument();
  expect(within(rows[4]).getByText("No lookups")).toBeInTheDocument();
  expect(within(rows[4]).queryByText(/%$/)).not.toBeInTheDocument();
});

test("says Loading before data and Could not load resolver health after a failure", () => {
  const { rerender } = render(<ResolverHealth data={null} failed={false} />);
  expect(screen.getByText("Loading")).toBeInTheDocument();
  rerender(<ResolverHealth data={null} failed />);
  expect(screen.getByText("Could not load resolver health")).toBeInTheDocument();
  expect(screen.queryByText("Loading")).not.toBeInTheDocument();
});
```

Create `frontend/src/admin/pages/SitePage.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { fakeServer } from "../test/fakeServer";
import { SitePage, type SitePageProps } from "./SitePage";

afterEach(() => {
  vi.unstubAllGlobals();
});

function props(over: Partial<SitePageProps> = {}): SitePageProps {
  return { tz: 360, tick: 0, maintenance: { on: false, forced_by_env: false }, onMaintenanceChange: vi.fn(), onUnauthorized: vi.fn(), ...over };
}

test("fetches resolvers with the tz, shows both cards, and refetches on a tick", async () => {
  const server = fakeServer();
  vi.stubGlobal("fetch", server.fetch);
  const p = props();
  const { rerender } = render(<SitePage {...p} />);
  expect(await screen.findByText("X (Twitter)")).toBeInTheDocument();
  expect(server.urls("/api/admin/resolvers")).toEqual(["/api/admin/resolvers?tz=360"]);
  expect(screen.getByRole("heading", { name: "Site" })).toBeInTheDocument();
  expect(screen.getByText("Maintenance switch and resolver health")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Turn on maintenance" })).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Last 24 hours" })).toBeInTheDocument();
  rerender(<SitePage {...p} tick={1} />);
  await vi.waitFor(() => expect(server.urls("/api/admin/resolvers")).toHaveLength(2));
});

test("a resolver failure shows the failure line; a 401 reports unauthorized", async () => {
  vi.stubGlobal("fetch", fakeServer({ resolversStatus: 503 }).fetch);
  const p = props();
  render(<SitePage {...p} />);
  expect(await screen.findByText("Could not load resolver health")).toBeInTheDocument();
  expect(p.onUnauthorized).not.toHaveBeenCalled();

  vi.stubGlobal("fetch", fakeServer({ authed: false }).fetch);
  const p2 = props();
  render(<SitePage {...p2} />);
  await vi.waitFor(() => expect(p2.onUnauthorized).toHaveBeenCalledTimes(1));
});

test("the maintenance card lifts the new state to the app", async () => {
  vi.stubGlobal("fetch", fakeServer().fetch);
  const p = props();
  render(<SitePage {...p} />);
  await userEvent.click(await screen.findByRole("button", { name: "Turn on maintenance" }));
  await userEvent.click(screen.getByRole("button", { name: "Tap to confirm" }));
  await vi.waitFor(() => expect(p.onMaintenanceChange).toHaveBeenCalledWith({ on: true, forced_by_env: false }));
});
```

Append to `frontend/src/admin/App.test.tsx`:

```tsx
test("maintenance turned on from the Site page shows in the nav pill and the live strip, and Go live clears it", async () => {
  const server = fakeServer();
  vi.stubGlobal("fetch", server.fetch);
  render(<App />);
  await screen.findByText("Sep 17 to Sep 23, your local time");
  await userEvent.click(screen.getByRole("link", { name: "Site is live" }));
  expect(screen.getByRole("heading", { name: "Site" })).toBeInTheDocument();
  expect(window.location.search).toBe("?page=site");
  await userEvent.click(await screen.findByRole("button", { name: "Turn on maintenance" }));
  await userEvent.click(screen.getByRole("button", { name: "Tap to confirm" }));
  expect(await screen.findByText("In maintenance")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Site On" })).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Analytics" }));
  expect(await screen.findByRole("link", { name: "Maintenance is on" })).toBeInTheDocument();
  await userEvent.click(screen.getByRole("link", { name: "Maintenance is on" }));
  expect(screen.getByRole("heading", { name: "Site" })).toBeInTheDocument();
  await userEvent.click(await screen.findByRole("button", { name: "Go live" }));
  expect(await screen.findByText("Live")).toBeInTheDocument();
  expect(screen.queryByText("On")).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `cd "$(git rev-parse --show-toplevel)/frontend" && npx vitest run src/admin/components/MaintenanceCard.test.tsx src/admin/components/ResolverHealth.test.tsx src/admin/pages/SitePage.test.tsx src/admin/App.test.tsx`
Expected: FAIL. The two component files fail at import ("Failed to resolve import "./MaintenanceCard"", `./ResolverHealth`); the SitePage tests fail on "X (Twitter)" (the stub fetches nothing); the new App test fails on the missing "Turn on maintenance" button.

- [ ] **Step 3: Write the cards and the real SitePage**

Create `frontend/src/admin/components/MaintenanceCard.tsx`:

```tsx
import { useEffect, useState } from "react";
import { setMaintenance, type Maintenance } from "../lib/api";
import { Spinner } from "./Spinner";
import { CARD, cn, PILL_BUTTON } from "./styles";

/** How long the first tap's "Tap to confirm" stays armed. */
export const CONFIRM_MS = 4000;

/**
 * The maintenance switch. Turning it on is a two-tap confirm (the premium store's Deliver
 * pattern) instead of window.confirm; going live is one tap. The new state is lifted to the
 * app so the nav pill and the live strip follow at once.
 */
export function MaintenanceCard({ state, onChange, onUnauthorized }: { state: Maintenance | null; onChange: (m: Maintenance) => void; onUnauthorized: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(false), CONFIRM_MS);
    return () => clearTimeout(t);
  }, [confirming]);

  async function apply(on: boolean) {
    setBusy(true);
    setFailed(false);
    const result = await setMaintenance(on);
    setBusy(false);
    if (result === "unauthorized") {
      onUnauthorized();
      return;
    }
    if (result === "error") {
      setFailed(true);
      return;
    }
    onChange(result);
  }

  function onClick() {
    if (!state) return;
    if (state.on) {
      void apply(false);
      return;
    }
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    void apply(true);
  }

  const on = state?.on ?? false;
  const label = on ? "Go live" : confirming ? "Tap to confirm" : "Turn on maintenance";

  return (
    <section aria-label="Maintenance" className={cn(CARD, "p-5 sm:p-6")}>
      <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-text-primary">Maintenance</h2>
      {state ? (
        <>
          <div className="mt-5 flex items-center gap-2.5">
            <span aria-hidden="true" className={cn("size-2.5 rounded-full", on ? "bg-warning" : "bg-success")} />
            <p className="text-sm font-medium text-text-primary">{on ? "In maintenance" : "Live"}</p>
          </div>
          <p className="mt-1 text-[13px] text-text-muted">{on ? "Visitors see the maintenance page until you go live" : "Visitors can use the site"}</p>
          <button
            type="button"
            onClick={onClick}
            disabled={busy || state.forced_by_env}
            className={cn(PILL_BUTTON, "mt-5", confirming && "border-warning/40 bg-warning-dim text-warning hover:bg-warning-dim")}
          >
            {busy ? <Spinner /> : null}
            {label}
          </button>
          {state.forced_by_env ? <p className="mt-3 text-[13px] text-text-muted">Forced on by MAINTENANCE_MODE in deploy/app.env on the server. Remove it there and redeploy</p> : null}
          {failed ? (
            <p role="alert" className="mt-3 text-[13px] text-danger">
              Could not update, try again
            </p>
          ) : null}
        </>
      ) : (
        <p className="mt-5 text-[13px] text-text-muted">Checking the site status</p>
      )}
      <p className="mt-6 text-xs text-text-muted">Sign out clears this browser only. To sign out everywhere, change ADMIN_PASSWORD</p>
    </section>
  );
}
```

Create `frontend/src/admin/components/ResolverHealth.tsx`:

```tsx
import type { Resolvers } from "../lib/api";
import { COLORS } from "../lib/colors";
import { formatAgo, formatCount, formatPercent, outcomeLabel, platformName } from "../lib/format";
import { successTone } from "../lib/metrics";
import { EmptyState } from "./EmptyState";
import { Panel } from "./Panel";

const TONE_COLOR = { green: COLORS.green, yellow: COLORS.yellow, red: COLORS.red } as const;

/** The rolling 24 hours per resolver: lookups, success rate, the most common failure, the last failure. */
export function ResolverHealth({ data, failed }: { data: Resolvers | null; failed: boolean }) {
  return (
    <Panel title="Last 24 hours" hint="Resolver errors mean the service we use failed, not the visitor's link">
      {data ? (
        <ul className="flex flex-col divide-y divide-line/40">
          {data.platforms.map((row) => {
            const tone = successTone(row.fetches, row.ok);
            return (
              <li key={row.platform} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <div className="min-w-0">
                  <p className="text-sm text-text-primary">{platformName(row.platform)}</p>
                  <p className="text-xs text-text-muted">
                    {`${formatCount(row.fetches)} ${row.fetches === 1 ? "lookup" : "lookups"}`}
                    {row.top_failure ? `, ${outcomeLabel(row.top_failure.outcome)} ${formatCount(row.top_failure.count)}` : ""}
                    {row.last_failure_min_ago != null ? `, last failed ${formatAgo(row.last_failure_min_ago)}` : ""}
                  </p>
                </div>
                {tone === "none" ? (
                  <span className="shrink-0 text-sm text-text-muted">No lookups</span>
                ) : (
                  <span className="shrink-0 text-sm font-semibold tabular-nums" style={{ color: TONE_COLOR[tone] }}>
                    {formatPercent(row.ok / row.fetches)}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      ) : failed ? (
        <EmptyState text="Could not load resolver health" />
      ) : (
        <p className="text-[13px] text-text-muted">Loading</p>
      )}
    </Panel>
  );
}
```

Replace `frontend/src/admin/pages/SitePage.tsx` with:

```tsx
import { useEffect, useRef, useState } from "react";
import { fetchResolvers, type Maintenance, type Resolvers } from "../lib/api";
import { MaintenanceCard } from "../components/MaintenanceCard";
import { PageHeader } from "../components/PageHeader";
import { ResolverHealth } from "../components/ResolverHealth";
import { Reveal } from "../components/Reveal";

export type SitePageProps = {
  tz: number;
  tick: number;
  maintenance: Maintenance | null;
  onMaintenanceChange: (m: Maintenance) => void;
  onUnauthorized: () => void;
};

/** The maintenance switch and the resolver health card. Resolvers reload on every refresh tick. */
export function SitePage({ tz, tick, maintenance, onMaintenanceChange, onUnauthorized }: SitePageProps) {
  const [resolvers, setResolvers] = useState<Resolvers | null>(null);
  const [failed, setFailed] = useState(false);
  const unauthorized = useRef(onUnauthorized);
  unauthorized.current = onUnauthorized;

  useEffect(() => {
    let alive = true;
    void fetchResolvers(tz).then((result) => {
      if (!alive) return;
      if (result === "unauthorized") {
        unauthorized.current();
        return;
      }
      if (result === "error") {
        setFailed(true);
        return;
      }
      setResolvers(result);
      setFailed(false);
    });
    return () => {
      alive = false;
    };
  }, [tz, tick]);

  return (
    <div>
      <PageHeader kicker="Site" title="Site" subtitle="Maintenance switch and resolver health" />
      <Reveal i={1} className="mt-6 grid gap-4 lg:grid-cols-2">
        <MaintenanceCard state={maintenance} onChange={onMaintenanceChange} onUnauthorized={onUnauthorized} />
        <ResolverHealth data={resolvers} failed={failed} />
      </Reveal>
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd "$(git rev-parse --show-toplevel)/frontend" && npx vitest run src/admin`
Expected: PASS. New: MaintenanceCard 6, ResolverHealth 2, SitePage 3, App +1 (12 tests).

- [ ] **Step 5: Task gate**

Run:
```bash
cd "$(git rev-parse --show-toplevel)/frontend" && npm run lint && npx vitest run && npm run build
```
Expected: lint clean; vitest all green (638 + 12 = 650); build succeeds. The old admin files still exist and their tests still pass; Task 11 removes them.

- [ ] **Step 6: Commit**

```bash
cd "$(git rev-parse --show-toplevel)" && git add frontend/src/admin/components/MaintenanceCard.tsx frontend/src/admin/components/MaintenanceCard.test.tsx frontend/src/admin/components/ResolverHealth.tsx frontend/src/admin/components/ResolverHealth.test.tsx frontend/src/admin/pages/SitePage.tsx frontend/src/admin/pages/SitePage.test.tsx frontend/src/admin/App.test.tsx && git commit -m "feat(admin): site page with the maintenance switch and resolver health

Two-tap confirm replaces window.confirm; the new state lifts to the app so
the nav pill and the live strip follow at once.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

---

### Task 11: Cleanup, docs and the bundle isolation check

Runs in the main checkout on `feature/admin-redesign` AFTER `feature/admin-redesign-ui` is merged into it (fast-forward or a merge commit, whichever git allows; resolve nothing by hand without reporting it).

**Files:**
- Delete: `frontend/src/admin/Admin.tsx`, `frontend/src/admin/Admin.test.tsx`, `frontend/src/admin/SiteControls.tsx`, `frontend/src/admin/SiteControls.test.tsx`, `frontend/src/admin/api.ts`, `frontend/src/admin/api.test.ts`
- Delete: `backend/app/analytics/stats.py`, `backend/tests/test_stats.py`
- Modify: `backend/app/analytics/router.py` (remove `GET /api/admin/stats` and the `stats` import)
- Modify: every backend test that calls `/api/admin/stats` (find them with the grep in Step 3), porting each call to `/api/admin/report`
- Modify: `CLAUDE.md` (the "Admin dashboard (`/admin`)" section)
- Create: `frontend/scripts/check-admin-isolation.mjs`
- Test: `backend/tests/test_admin_api.py`

**Interfaces:**
- Consumes: `report.parse_tz`, `report.compute_report` (Task 1), the report/resolvers/logout routes (Task 5), the new admin App (Task 7).
- Produces: a tree with no `stats.py`, no `/api/admin/stats`, no old admin components; the isolation script for the verification step.

- [ ] **Step 1: Write the failing test that the old endpoint is gone**

Append to `backend/tests/test_admin_api.py` (Task 5 created it with the `enabled_client` fixture and the `_login(client)` helper):

```python
def test_old_stats_endpoint_is_gone(enabled_client):
    client, *_ = enabled_client
    _login(client)
    res = client.get("/api/admin/stats?days=30&tz=0")
    assert res.status_code == 404
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd "$(git rev-parse --show-toplevel)/backend" && source .venv/bin/activate && pytest -q -p no:cacheprovider tests/test_admin_api.py::test_old_stats_endpoint_is_gone`
Expected: FAIL, the route still answers 200.

- [ ] **Step 3: Find every remaining caller**

Run: `cd "$(git rev-parse --show-toplevel)" && /usr/bin/grep -rn -E 'api/admin/stats|compute_stats|from \.stats|from app\.analytics\.stats|analytics\.stats' backend frontend/src --include='*.py' --include='*.ts' --include='*.tsx'`
Expected: hits only in `router.py`, `stats.py`, `tests/test_stats.py`, the old frontend admin files being deleted, and a few backend tests. Write the list down; every hit must be gone by Step 7.

- [ ] **Step 4: Delete the old backend code and port the tests**

1. In `backend/app/analytics/router.py` delete the whole `@router.get("/api/admin/stats")` function and delete the line `from .stats import compute_stats` (after Task 5 that is the only `.stats` import; `parse_tz` already comes from `.report`). In the PBKDF2 memoization comment near the top, change "/api/admin/stats is polled every 60s" to "/api/admin/report is polled every 30s" so the comment matches the new dashboard.
2. `git rm backend/app/analytics/stats.py backend/tests/test_stats.py`
3. For every backend test from Step 3 that requests `/api/admin/stats`: change the path to `/api/admin/report?range=7d&tz=0` (keep any `tz=` value the test is checking; the report validates `tz` the same way and returns the same `bad_tz` 422 and 401 bodies). If a test asserted a stats-only key (for example `totals.fetches.today`), assert the report equivalent instead (`totals.fetches`), keeping what the test was protecting.

- [ ] **Step 5: Delete the old frontend admin files**

Run: `cd "$(git rev-parse --show-toplevel)" && git rm frontend/src/admin/Admin.tsx frontend/src/admin/Admin.test.tsx frontend/src/admin/SiteControls.tsx frontend/src/admin/SiteControls.test.tsx frontend/src/admin/api.ts frontend/src/admin/api.test.ts`

- [ ] **Step 6: Replace the CLAUDE.md admin section**

Replace everything from the line `## Admin dashboard (\`/admin\`)` up to (not including) the next line starting with `## ` with exactly this text (keep one blank line before the next heading):

```markdown
## Admin dashboard (`/admin`)

Owner-only, cookie-auth (`svid_admin`, 30 days, `Path=/api/admin`). `POST /api/admin/logout`
clears it in this browser only; changing `ADMIN_PASSWORD` signs out everywhere. Enabled by
`ADMIN_PASSWORD` + `ANALYTICS_SALT` plus a storage backend. Storage selection
(`backend/app/analytics/config.py`): `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` both set -> Turso
(legacy, still supported); else `ANALYTICS_DB_PATH` set -> local SQLite file; else disabled. LIVE
on the VPS using a LOCAL SQLite file at `/data/analytics.db` (the `analytics_data` Docker volume,
survives rebuilds). Turso was decommissioned 2026-07-25; `scripts/migrate_analytics.py` did the
one-time copy.

Redesigned 2026-09-23 after the premium store admin (spec
`docs/superpowers/specs/2026-09-23-admin-redesign-design.md`): dark only, system SF font,
sidebar with Analytics and Site, admin-only Tailwind tokens in `frontend/src/admin/admin.css`,
Recharts and lucide-react loaded by the admin entry only.
- Analytics: range tabs Today / 7 / 30 / 90 days (`?range=`), each compared with the period
  before (same length, shifted back; 90 days never has one because data is kept 90 days). Four
  metric tabs, eight tiles, funnel, fetch outcomes, platforms, qualities, countries, pages,
  busiest hours, new vs returning, traffic sources. Refreshes every 30s while the tab is visible.
- API: `GET /api/admin/report?range=&tz=` and `GET /api/admin/resolvers?tz=` (24-hour
  per-platform health), both in `backend/app/analytics/report.py` with an injectable `now`
  (never SQLite `datetime('now')`); maintenance GET/POST unchanged.
- Countries: offline DB-IP Lite lookup (`backend/app/analytics/geo.py`), the IP used in memory
  only. A daemon thread, started only when `GEOIP_UPDATE` is truthy (the Dockerfile sets it),
  refreshes `/data/geoip/dbip-country-lite.mmdb` monthly. Licence CC BY 4.0: the admin footnote
  must keep the "IP Geolocation by DB-IP" link.
- Visit events carry `locale` (en/es/hi) from the shell's `lang`, for the Pages panel.
- Site page: one-click maintenance toggle (in-memory flag; instant, fail-safe, no redeploy;
  `MAINTENANCE_MODE` env var is a hard override) and resolver health for the last 24 hours.
- Analytics stay privacy-first and aggregate-only: daily-rotating HMAC visitor hash (IP
  discarded, never stored), country code, locale, fetch/download/visit counts. NO referrer URLs,
  NO cross-day IDs; any new event field MUST stay aggregate and non-identifying.
```

- [ ] **Step 7: Write the bundle isolation check**

Create `frontend/scripts/check-admin-isolation.mjs`:

```js
// Fails when a public page can reach admin-only code through its static module graph.
// Run after `npm run build`. The markers are string literals that survive minification:
// recharts renders a "recharts-wrapper" element and lucide-react stamps "lucide-" classes.
// The admin page is checked the other way round, as a control: if its graph does NOT
// contain the markers, they are not a valid probe and the check fails loudly.
import { readFileSync, readdirSync, statSync } from "node:fs";

const DIST = new URL("../dist/", import.meta.url);
const MARKERS = ["recharts-wrapper", "lucide-"];

function htmlFiles(dirUrl) {
  const out = [];
  for (const name of readdirSync(dirUrl)) {
    const child = new URL(name, dirUrl);
    if (statSync(child).isDirectory()) out.push(...htmlFiles(new URL(name + "/", dirUrl)));
    else if (name.endsWith(".html")) out.push(child);
  }
  return out;
}

function entryScripts(html) {
  const urls = new Set();
  for (const m of html.matchAll(/<script\b[^>]*\btype="module"[^>]*\bsrc="([^"]+)"/g)) urls.add(m[1]);
  for (const m of html.matchAll(/<link\b[^>]*\brel="modulepreload"[^>]*\bhref="([^"]+)"/g)) urls.add(m[1]);
  return [...urls].filter((u) => u.startsWith("/assets/"));
}

function staticImports(js) {
  const out = new Set();
  const re = /(?:^|[;\s}])(?:import|export)\s*(?:[^'"`;]*?\bfrom\s*)?["']([^"']+\.js)["']/g;
  for (const m of js.matchAll(re)) out.add(m[1]);
  return [...out];
}

function reachable(entryUrls) {
  const seen = new Set();
  const stack = entryUrls.map((u) => new URL("." + u, DIST));
  while (stack.length) {
    const url = stack.pop();
    if (seen.has(url.href)) continue;
    seen.add(url.href);
    const js = readFileSync(url, "utf8");
    for (const spec of staticImports(js)) {
      stack.push(spec.startsWith("/") ? new URL("." + spec, DIST) : new URL(spec, url));
    }
  }
  return [...seen].map((href) => new URL(href));
}

function markersIn(urls) {
  const hits = new Set();
  for (const url of urls) {
    const js = readFileSync(url, "utf8");
    for (const m of MARKERS) if (js.includes(m)) hits.add(m);
  }
  return hits;
}

let failed = false;
let publicCount = 0;
for (const file of htmlFiles(DIST)) {
  const rel = file.pathname.slice(DIST.pathname.length);
  const graph = reachable(entryScripts(readFileSync(file, "utf8")));
  const hits = markersIn(graph);
  if (rel === "admin.html") {
    for (const m of MARKERS) {
      if (!hits.has(m)) {
        console.error(`control failed: admin.html does not reach "${m}", so the probe is invalid`);
        failed = true;
      }
    }
    continue;
  }
  if (rel === "maintenance.html" || rel.startsWith("google")) continue;
  publicCount += 1;
  if (hits.size) {
    console.error(`${rel} reaches admin-only code: ${[...hits].join(", ")}`);
    failed = true;
  }
}
if (publicCount !== 15) {
  console.error(`expected 15 public pages, found ${publicCount}`);
  failed = true;
}
if (failed) process.exit(1);
console.log(`ok: ${publicCount} public pages, none reaches admin-only code; admin.html reaches both markers`);
```

- [ ] **Step 8: Run the new test, then every gate**

Run, in order:
1. `cd "$(git rev-parse --show-toplevel)/backend" && source .venv/bin/activate && pytest -q -p no:cacheprovider tests/test_admin_api.py::test_old_stats_endpoint_is_gone` -> PASS.
2. `cd "$(git rev-parse --show-toplevel)/backend" && source .venv/bin/activate && ruff check . && pytest -q -p no:cacheprovider` -> ruff clean; ZERO failures now (the 7 time-bombed tests left with `test_stats.py`, and their behaviours live in `tests/test_report.py`); warnings 7.
3. `cd "$(git rev-parse --show-toplevel)/frontend" && npm run lint && npx vitest run && npm run build && node scripts/check-admin-isolation.mjs` -> tsc clean; 639 tests pass (658 after the UI merge, minus the 19 tests in the deleted old admin test files; report any difference and explain it); build ok; the script prints `ok: 15 public pages, ...`.
4. Sweep: `cd "$(git rev-parse --show-toplevel)" && /usr/bin/grep -rnI --exclude-dir=__pycache__ -E 'FixTweet health|Clear it in Render|All-time|compute_stats|api/admin/stats|fetchStats|ThemeToggle' frontend/src/admin backend/app backend/tests` -> exactly one hit: the URL inside `test_old_stats_endpoint_is_gone`.
5. `cd "$(git rev-parse --show-toplevel)" && git diff --cached --stat` and `git status --short` to confirm only the files in this task's list changed.

- [ ] **Step 9: Commit**

```bash
cd "$(git rev-parse --show-toplevel)"
git add backend/app/analytics/router.py backend/tests/test_admin_api.py backend/tests/test_analytics_api.py CLAUDE.md frontend/scripts/check-admin-isolation.mjs
# also stage, by name, any other test file Step 4 ported (the git rm deletions are already staged)
git commit -F - <<'MSG'
chore(admin): drop the old dashboard and stats endpoint

The new admin replaces Admin.tsx, SiteControls.tsx and GET /api/admin/stats;
their behaviours are covered by the report tests. CLAUDE.md describes the new
dashboard, and a build check proves no public page reaches recharts or lucide.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
MSG
```

---

### Task 12: Visual verification against production-shaped data

Run by the coordinator (not an implementer subagent) in the main checkout after Task 11, before the whole-branch review. It writes no product code; defects it finds go to a fix subagent and the step repeats.

- [ ] **Step 1: Build real fixtures from production, aggregate only**

Pipe the branch's `report.py` into the production container and run it read-only against the live database, for `today`, `7d`, `30d` and `90d` at the owner's tz (+360), plus `compute_resolvers`. The runner opens `file:/data/analytics.db?mode=ro` through `SqliteStore`-compatible code and prints JSON only (the report contains counts, codes and labels, never a visitor hash). Save the four reports and the resolvers payload as `frontend/src/admin/test/prod-fixtures.local.json` in the scratchpad copy of the repo only; they are NOT committed. Record each report's wall time.

- [ ] **Step 2: Serve the admin with the API intercepted**

Start the dev stack from `.claude/launch.json` (`savevidai`), then drive Playwright at `http://localhost:5173/admin.html` with `page.route("**/api/admin/**")` answering from the fixtures: maintenance `{on:false, forced_by_env:false}` for the probe, the report for the requested `range`, resolvers for the Site page, and 401 for one pass to show the login. No password is typed anywhere.

- [ ] **Step 3: Screenshots and checks**

At 1440x900 and 390x844: Analytics for 7 days (previous present) and 90 days (no previous: tabs read "No earlier period", no dashed line, no deltas), Today (hourly), Site, and Login (plus the wrong-password state by answering the login POST with 401). Save PNGs to `~/Documents/ContentOS/_assets/savevidai-admin/`. Check with the page's own DOM: no horizontal scroll at 390px, one `h1`, the DB-IP link present, the footnote's UTC-midnight time reads `06:00`, tab numbers equal the fixture totals, console free of errors.

- [ ] **Step 4: Compare with the premium store**

Put the 1440px Analytics screenshot next to the premium store's components as ported (sidebar, cards, tabs, tiles, panels) and list any visual drift in tokens, radii, type scale or spacing. Fix real drift through a fix subagent; re-run Steps 2 and 3.

---

## Rollout (coordinator)

1. Whole-branch adversarial review of `main..feature/admin-redesign` (Opus), fixes, re-gate.
2. Rebase check against `origin/main`. If `claude/tender-heisenberg-fuk5v2` has landed, resolve `backend/app/analytics/service.py` to `country = client_country(request) or self._lookup.country(ip)` (spec "Merge coordination") with a test for both paths.
3. Fast-forward `main`, push.
4. VPS: `git status --short` must show only the owner's known local edits (`Caddyfile`, `compose.prod.yaml`, backups); confirm the incoming commits touch neither file; `git pull && docker compose -f compose.prod.yaml up -d --build`.
5. Production checks from the spec: `/admin` 200 with `X-Robots-Tag: noindex`; `/api/admin/report` and `/api/admin/resolvers` 401 without a cookie; `compute_report` for all four ranges inside the container with timings under 300ms; `/data/geoip/dbip-country-lite.mmdb` and its marker present within a minute of boot; new events carry a country (aggregate share query only); public pages unchanged (15 x 200, one h1 each); the live dashboard through the owner's signed-in Chrome if the session is valid, read-only.
6. Ledger entry in `.superpowers/sdd/progress.md`.

---

## Planner self-reviews

## Self-review (backend part)

Every code block above was run before being written down: the five tasks applied to a scratch copy of `backend/` give `ruff check .` clean and `7 failed, 598 passed, 1 skipped, 7 warnings` (the 7 being the `tests/test_stats.py` baseline); the Task 1 state alone gives `7 failed, 522 passed, 7 warnings`; the frontend change gives 11/11 in `analytics.test.ts` with `tsc --noEmit` clean; the opt-in smoke passes against the real `dbip-country-lite-2026-09.mmdb` with maxminddb 3.2.0. The window table in `test_report.py` was computed independently and matches `windows()` for all 12 (tz, range) pairs.

**Spec coverage.** B1 deterministic clock and index-friendly windows: Task 1 (`windows`, `Window`, bound parameters, the "no database clock" static test). B2 ranges, windows, `has_previous`, buckets: Task 1 (`parse_range`, `windows`, `has_previous`, `series`). B3 totals: Task 1 (all 12 keys including `downloaded_visitors`, so the frontend contract is complete after Task 1); funnel, panels, live: Task 3. B4 response: Tasks 1 and 3 (shape), Task 5 (endpoint and error conventions, maintenance exemption pinned by a test). B5 resolvers: Task 3 (`compute_resolvers`), Task 5 (endpoint, tz symmetry). B6 logout: Task 5. B7 country lookup: Task 4 (module, directory rule, service wiring, dependency, Dockerfile, README licence and refresh, env example). B8 page language: Task 2 (validator, migrations on both stores, recorder, frontend `visitContext`). Decision 7 (injectable `now`): Task 1. Privacy invariants: Task 4's `test_service_geo.py` proves the recorder gets a code and never the IP and that the logs hold nothing for a raising reader or the `unknown` IP; Task 2 keeps `locale` to the three values or NULL. The spec's backend testing bullets map: windows at tz 0, +360, -300 for all four ranges (Task 1); every total and the nested funnel with multi-day visitors (Tasks 1, 3); the seven time-bombed behaviours ported (Task 1: new vs returning, visitor-day conversion basis; Task 3: shape, platforms and ordering, sources, quality bucketing, peak rules); countries top 10 plus unknown, pages with NULL locale, 24 zero-filled hours, peak inside the window, live block (Task 3); endpoint conventions, five resolver rows, expired cookie (Task 5); geo fake reader, load keeping the old reader, updater month choice, caps, non-200, atomic replace and temp cleanup through respx, no IP in the recorder or logs (Task 4); locale acceptance, idempotent migration on both stores, recorder column, downloads dropping it (Task 2); warning baseline 7 (every gate).

**Ambiguities resolved, and the rule chosen:**

1. Live block bounds: `ts >= ?` only (spec B3 defines `active_now` as `ts >= now - 5 minutes`). Every other query is `ts >= ? AND ts < ?`. An upper bound at the second-floored `now` would hide events stamped in the current second and made the endpoint test flaky; `test_live_block_is_range_independent_and_uses_the_last_minutes` pins that an event stamped in the current second counts.
2. The current window's end is `now` floored to the second, so an event stamped in that same second lands in the next refresh. Inherent to `[M0, L)` with second-resolution text; the boundary test pins the half-open ends.
3. `has_previous` on an empty table is false (there is no oldest event at or before the previous start).
4. `complete_day_visitors` for the previous window uses the previous window's own midnight cut (`Window.last_midnight_utc`), mirroring the current window; `complete_days` is N-1 for both.
5. `outcomes` excludes NULL outcomes (the UI cannot label them, and `failed_fetches` already excludes them "as today").
6. `platforms` rows come from `fetch` and `download` events only. Visit events carry a platform too, and a visit-only platform would otherwise be an all-zero legend row in the donut.
7. `pages` requires a non-null platform: every shell sends one (`App.tsx:41` and the four siblings), and a null row could not be labelled "{Platform}, {Language}". `locale` still goes through `COALESCE(locale, 'unknown')` as the spec says.
8. Fetch events without a platform count in totals, outcomes and hours but not in `platforms` or in the resolver rows (nothing to attribute them to).
9. `peak` converts the winning bucket's epoch to local day and `HH:MM` in Python from the same `tz`, instead of a second SQL modifier; same numbers, one query.
10. `tz` omitted on `/api/admin/report` or `/api/admin/resolvers` is a 422 `bad_tz` (`parse_tz` says "tz required" and the client always sends it); an omitted or empty `range` is 7d. Checks run in the order enabled, cookie, range, tz, compute, so nothing about validation leaks to an unauthenticated caller.
11. The report echoes `tz` as the parsed integer.
12. `GeoUpdater.run_once(now)` returns True only when a new file was installed: a skip (marker matches) and every failure return False, and the tests distinguish them by whether the route was called and what is on disk.
13. `CountryLookup.load()` also refuses a file whose `database_type` lacks "Country" (closing it and keeping the current reader), so a wrong file can never be swapped in even when it opens.
14. `resolve_geo_dir` treats "SQLite in use" as `db_path` set and the Turso pair not both set, mirroring `make_store`; a relative `db_path` or `:memory:` gives None.
15. `GEOIP_UPDATE` uses the same truthy rule as `MAINTENANCE_MODE`, through a new `envutil.is_truthy(value)`; `env_truthy(name)` now delegates to it (its test file grows by one test).
16. `AnalyticsService.init` gained an optional `env` mapping (default `os.environ`) so the wiring is testable without touching `main.py`.
17. `scripts/migrate_analytics.py` and its test are part of Task 2: its explicit column lists would otherwise silently drop `locale` and its field-for-field test breaks the moment the column exists.
18. `deploy/app.env.example` gets the two optional geo variables next to the README note, since CLAUDE.md names it as the full var list.
19. `_TIER_LADDER` is re-exported from `stats.py` for symmetry with the brief even though nothing imports it from there.
20. `last_failure_min_ago` clamps at 0 under clock skew.

**Left for the coordinator.** CLAUDE.md's admin section could mention `locale` and the DB-IP lookup (it lists the aggregate fields); `deploy/README.md` still opens with "All state lives in Turso" from the migration era, untouched here; `Recorder.prune` keeps its `datetime('now', ?)` (retention, not reporting, and out of this branch's scope).

## Self-review (frontend part)

**Spec sections covered by Tasks 6 to 10**

- F1 Structure: Task 6 (`admin.css` with `source(none)` + `@source "./"`, the `lib/` modules, the new dependencies) and Task 7 (`main.tsx` imports `./admin.css`, `admin.html` cleanup, `index.css` gains `@source not "../admin";`, the component set). Deleting the old files and `ThemeToggle` use is Task 11's.
- F2 Visual tokens: Task 6 `admin.css` (colours, radii 22/28/18 as named tokens with explicit px, the raised shadow only on the login card and tooltip, system font stacks, title type, focus ring, reveal-up motion, reduced motion) and `colors.ts` (palette verbatim, SERIES order, 15% tints). Springs 380/32 (nav, Task 7), 420/34 (range, Task 8), 420/36 (metric tabs, Task 8). `MotionConfig reducedMotion="user"` wraps the app (Task 7).
- F3 Checking, Login, Shell, Routing: Task 7. Analytics header, RangeTabs, LiveStrip, range body dimming, TrendCard: Task 8. Eight tiles, four panel pairs, empty states, footnote: Task 9. Site page: Task 10.
- F4 Data rules: Task 6 (`delta.ts` verbatim change rule, `format.ts` percent/count/date rules, `metrics.ts` ratio-of-ratio deltas and null on zero denominators); rendered by Tasks 8 and 9.
- F4b Accessibility: metric tabs are `role="tablist"`/`role="tab"` with `aria-selected` (Task 8); range buttons carry `aria-pressed`, nav buttons `aria-current` (Tasks 7 and 8); charts sit inside `aria-hidden` wrappers while the same numbers are text (Tasks 8, 9); the live strip's dots are `aria-hidden` (Task 8); hover styles use Tailwind's `hover:` variant, which v4 wraps in `@media (hover: hover)`.
- F5 Data flow: Task 7 (probe, one 30 s visible-only tick for the whole app, sign out), Task 8 (report per range and tick, failed refresh line, 401 to login, 503 on first load to Unavailable), Task 10 (resolvers per tick, maintenance lifted to the app).
- Testing (frontend bullets): pure lib tests (Task 6); fixture-driven component tests for tab switching, previous line present and absent, tooltip rows, tile values and dashes, empty states, donut legend, segment shares, funnel shares, hours heading, country names and page labels (Tasks 8, 9); app flow tests for no login flash, 401 to login, login success, wrong password, 429, network failure, sign out, range change updating the URL and refetching, page switch, visible-only refresh with fake timers, Unavailable and Retry, analytics-off (Tasks 7, 8, 10); recharts under jsdom through the `size` prop and the pure `TrendTooltip`. `visitContext()` locale is Task 2 (backend writer). The dist chunk check script and the Playwright screenshots belong to Task 12.

**Ambiguities resolved (rule chosen)**

1. Panel titles vs hints for the two panels the spec writes with both a quoted string and an explicit hint (`Funnel "From visit to download", hint "..."`, `Visitors "New and returning", hint "..."`): the quoted string is the panel title and the explicit hint is the hint, so the DOM titles are "From visit to download" and "New and returning". Every other panel follows the `Name "hint"` pattern (title "Platforms", hint "Where the links came from", and so on).
2. `formatPercent(0)` renders "0%", not "0.0%": the one-decimal rule is applied to values strictly between 0 and 10%. Everything else follows the rule literally (9.99% renders "10.0%").
3. "Renders a dash": the ASCII hyphen-minus "-" (`DASH`), never an en or em dash.
4. Probe and maintenance flag: the brief fixes `probe()` to a status word, so the app does one extra `GET /api/admin/maintenance` right after a successful probe to learn the flag, then refreshes it on the same 30 s tick as the report. The Site page's card receives that lifted state and writes back through `onMaintenanceChange`.
5. A range change whose fetch fails: the previous range's numbers stay on screen, still dimmed (they belong to another range), with "Could not refresh, trying again"; the next tick retries the selected range.
6. Kickers are written in sentence case in the DOM ("Analytics", "Site", "Admin") and uppercased by the `kicker` utility, like the premium store's eyebrow.
7. Sign out appears once in the DOM: the footer group (View site, Sign out) lives inside the nav flex container, so on phones it is the tail of the scrolling row (the row "ends with Sign out") and from 768px it is pushed to the sidebar's bottom with `md:mt-auto`.
8. "View site" opens in a new tab (`target="_blank" rel="noreferrer"`), as in the premium store.
9. The Donut is fixed at 176px by spec, so it uses fixed chart dimensions and needs neither `ResponsiveContainer` nor a `size` prop; only the TrendCard takes `size`. The spec lists no donut tooltip, so there is none (the legend carries every number).
10. The LiveStrip's status pill is an anchor with `href="?page=site"` and a click handler (a link to a page); the spec's `aria-pressed`/`aria-current` rule is applied to the range and nav controls.
11. Copy the spec leaves open, all sentence case with no trailing period: Unavailable ("Analytics is unavailable" / "The dashboard could not reach the analytics service. The public site is not affected." / "Retry"); analytics off ("It needs ADMIN_PASSWORD, ANALYTICS_SALT and ANALYTICS_DB_PATH (or the TURSO_DATABASE_URL and TURSO_AUTH_TOKEN pair), all in deploy/app.env on the server. Set them and redeploy."); checking spinner label "Checking your session"; header subtitle before the first report "Your local time"; the Peak tile with no peak shows a dash and no note; maintenance card lines "Visitors can use the site", "Visitors see the maintenance page until you go live", "Checking the site status", "Could not update, try again"; resolver card "Loading", "Could not load resolver health", rows "574 lookups, Deleted or missing 31, last failed 12 min ago" and "0 lookups" beside a muted "No lookups"; empty states "No visits in this range yet" (funnel, new and returning), "No links pasted in this range yet" (outcomes, platforms, busiest hours), "Nothing saved in this range yet" (qualities), "No visitors in this range yet" (countries), "No page views in this range yet" (pages, sources).
12. Busiest hours' second line pluralises: "1 hour had none", "10 hours had none"; a single fetch reads "1 fetch".
13. `Panel` renders a `<section aria-label={title}>` so every panel is a named region for tests and screen readers.
14. The Y-axis compact-label test asserts that some tick matches `/^\d+(\.\d)?K$/` rather than exact tick values, because recharts chooses the ticks.
15. The DB-IP link keeps the required `href` and text verbatim and adds a class for colour; it opens in the same tab.
16. The countries "unknown" row is labelled "Not known", muted, kept last, and never passed to `Intl.DisplayNames`; the country hint switches to the "Not known includes every visit from before country lookup came back" sentence whenever that row is above 0.
17. `REPORTS["30d"]` in the fixtures is a 7-day-shaped stand-in used only by range-switching tests; the contract test does not check it beyond its `range`.
18. `react-is` is installed as `^18.3.1` to match React 18 (the brief did not pin it); recharts' peer range accepts it.
19. The trend tooltip renders nothing for a point past "now" (`value` null), so hovering the empty tail of Today shows no box.
20. `test.each` with `as const` tuples and the generic `times13` helper were typechecked against this repo's `tsc` options in the scratch install before being written into Task 6.

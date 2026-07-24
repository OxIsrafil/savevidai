# Peak Concurrent Active Users Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "peak concurrent visitors" record tile and a per-day peak line chart to the admin analytics dashboard, computed retroactively from stored events.

**Architecture:** A new module-level helper `_peak_active(store, tz)` in `backend/app/analytics/stats.py` groups events into fixed 5-minute buckets (floored on UTC epoch seconds so concurrency is timezone-independent), counts `COUNT(DISTINCT visitor)` per bucket, and returns the record bucket (rendered in owner-local day/time) plus a per-local-day series of that day's max bucket count. `compute_stats` exposes it under a new `peak_active` key. The frontend extends the `Stats` type, renders the record in a captioned `Tile` next to the avg-active tiles, and adds a single-series `PeakChart` that follows the existing `LineChart` SVG structure.

**Tech Stack:** Backend: Python 3.12 / FastAPI / SQLite (libsql-compatible `SqliteStore`), pytest. Frontend: TypeScript / React / Vite / Vitest / Testing Library.

**Spec:** `docs/superpowers/specs/2026-07-24-peak-active-users-design.md` (approved; do not re-litigate).

## Global Constraints

- NO em dashes, NO emoji anywhere (code, comments, UI copy, commits, docs). Use hyphen/comma/colon.
- Conventional commit prefixes; end every commit message with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Backend test warning baseline is 7 (pre-existing httpx/slowapi deprecations); any NEW warning is a finding. `ruff check app tests` must be clean.
- Aggregate-only privacy: this feature reads ONLY the existing `ts` and `visitor` columns. No new event field, no new client beacon, no schema change, no migration.
- Branch is `feature/peak-active-users` (already checked out). Never commit to `main`.
- Backend commands run from `backend/` with the venv active (`source .venv/bin/activate`). Frontend commands run from `frontend/`.
- Semantics (pinned by spec): peak concurrent = highest `COUNT(DISTINCT visitor)` in any fixed 5-minute TUMBLING bucket, bucket key `(CAST(strftime('%s', ts) AS INTEGER) / 300) * 300` (UTC epoch seconds floored to bucket start). Record and series are over the whole retained window (90-day prune), NOT the `days` argument. Record day/time and series day attribution use the owner-local tz shift.

---

### Task 1: Backend `_peak_active` helper wired into `compute_stats`

**Files:**
- Modify: `backend/app/analytics/stats.py` (add `_peak_active` after `_period`, around line 76; add `"peak_active"` to the `compute_stats` return dict after `"visitors"`, around line 251)
- Test: `backend/tests/test_stats.py` (append new tests at the end of the file)

**Interfaces:**
- Consumes: `_tzmod(tz: int) -> str` (existing helper in `stats.py`, returns a SQLite datetime modifier string like `"+360 minutes"` or `"-300 minutes"`); `Store.query(sql: str, args: list) -> list` of dict-like rows (numeric cells come back as `int`); the `events` table columns `ts` (UTC text `YYYY-MM-DD HH:MM:SS`) and `visitor` (daily-rotating hash).
- Produces: `_peak_active(store: Store, tz: int) -> dict` with shape
  `{"record": {"count": int, "day": "YYYY-MM-DD", "time": "HH:MM"} | None, "series": [{"day": "YYYY-MM-DD", "peak": int}, ...]}`
  (series sorted ascending by day), exposed as `compute_stats(...)["peak_active"]`. Task 2 relies on exactly these key names and types.

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/test_stats.py` (the existing imports of `compute_stats` and `SqliteStore` at the top of the file already cover everything these tests need):

```python
def _peak_store(rows):
    s = SqliteStore(":memory:")
    s.init_schema()
    s.execute_many([
        ("INSERT INTO events (ts,type,outcome,country,visitor) VALUES (?,?,?,?,?)", list(r))
        for r in rows
    ])
    return s


def test_peak_active_two_visitors_same_bucket():
    # 03:01 and 03:03 both floor to the 03:00 bucket -> record count 2, and the
    # record carries the bucket START (03:00), not either event's timestamp.
    s = _peak_store([
        ("2026-07-17 03:01:00", "visit", None, "BD", "v1"),
        ("2026-07-17 03:03:00", "visit", None, "US", "v2"),
    ])
    stats = compute_stats(s, days=30, tz=0)
    assert stats["peak_active"]["record"] == {
        "count": 2, "day": "2026-07-17", "time": "03:00",
    }


def test_peak_active_tumbling_not_sliding():
    # The same two visitors 2 minutes apart but STRADDLING a bucket boundary
    # (03:04 -> bucket 03:00, 03:06 -> bucket 03:05). A sliding 5-minute window
    # would report 2 concurrent; the tumbling-bucket definition reports 1.
    s = _peak_store([
        ("2026-07-17 03:04:00", "visit", None, "BD", "v1"),
        ("2026-07-17 03:06:00", "visit", None, "US", "v2"),
    ])
    stats = compute_stats(s, days=30, tz=0)
    assert stats["peak_active"]["record"]["count"] == 1


def test_peak_active_repeat_visitor_counts_once():
    # Same hash twice inside one bucket (a visit then a fetch) is ONE person.
    s = _peak_store([
        ("2026-07-17 03:01:00", "visit", None, "BD", "v1"),
        ("2026-07-17 03:02:00", "fetch", "ok", "BD", "v1"),
    ])
    stats = compute_stats(s, days=30, tz=0)
    assert stats["peak_active"]["record"]["count"] == 1


def test_peak_active_series_attributes_buckets_to_local_day():
    # tz=+360 (Dhaka-style). The 20:00 UTC bucket on Jul 17 is 02:00 LOCAL on
    # Jul 18, so its 2-visitor peak must land on the 2026-07-18 series point
    # and the record must render the local day/time, not the UTC ones.
    s = _peak_store([
        ("2026-07-17 20:01:00", "visit", None, "BD", "v1"),
        ("2026-07-17 20:02:00", "visit", None, "BD", "v2"),
        # A separate 1-visitor bucket that stays on local Jul 17 (09:00 local).
        ("2026-07-17 03:00:00", "visit", None, "BD", "v3"),
    ])
    stats = compute_stats(s, days=30, tz=360)
    assert stats["peak_active"]["series"] == [
        {"day": "2026-07-17", "peak": 1},
        {"day": "2026-07-18", "peak": 2},
    ]
    assert stats["peak_active"]["record"] == {
        "count": 2, "day": "2026-07-18", "time": "02:00",
    }


def test_peak_active_empty_store():
    s = SqliteStore(":memory:")
    s.init_schema()
    stats = compute_stats(s, days=30, tz=0)
    assert stats["peak_active"] == {"record": None, "series": []}
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run:
```bash
cd /Users/israfil/projects/savevidai/backend && source .venv/bin/activate && python -m pytest tests/test_stats.py -k peak_active -v
```
Expected: 5 tests FAIL with `KeyError: 'peak_active'`.

- [ ] **Step 3: Implement `_peak_active` and wire it into `compute_stats`**

In `backend/app/analytics/stats.py`, add this helper immediately after `_period` (after line 75) and before `compute_stats`:

```python
def _peak_active(store: Store, tz: int) -> dict:
    """Peak concurrent visitors: highest COUNT(DISTINCT visitor) in any fixed
    5-minute bucket. Buckets are TUMBLING windows floored on UTC epoch seconds
    (bucket = epoch // 300 * 300) so concurrency itself is tz-independent; the
    bucket start is then shifted to the owner's tz to render the record's
    day/time and to attribute each bucket to a local calendar day for the
    series. Intentionally NOT limited by the `days` window: the record is
    "peak in the retained window" (events prune at 90 days)."""
    tzmod = _tzmod(tz)
    bucket = "(CAST(strftime('%s', ts) AS INTEGER) / 300) * 300"
    local_day = f"date(datetime(b, 'unixepoch', '{tzmod}'))"
    buckets = f"SELECT {bucket} AS b, COUNT(DISTINCT visitor) AS n FROM events GROUP BY b"

    record = None
    record_rows = store.query(
        f"SELECT {local_day} AS day, "
        f"strftime('%H:%M', datetime(b, 'unixepoch', '{tzmod}')) AS t, n "
        f"FROM ({buckets}) ORDER BY n DESC, b ASC LIMIT 1", [],
    )
    if record_rows:
        r = record_rows[0]
        record = {"count": r["n"], "day": r["day"], "time": r["t"]}

    series_rows = store.query(
        f"SELECT {local_day} AS day, MAX(n) AS peak FROM ({buckets}) "
        f"GROUP BY day ORDER BY day", [],
    )
    series = [{"day": r["day"], "peak": r["peak"]} for r in series_rows]
    return {"record": record, "series": series}
```

Notes for the implementer:
- `b` is safe to shift as a whole (a bucket is a single UTC instant, so it maps to exactly one local day; the inner GROUP BY is on the bucket, never on the local day).
- Tie-break is `ORDER BY n DESC, b ASC`: the EARLIEST bucket wins a tied record, deterministically.
- `tz` was already validated by `parse_tz` at the API boundary, so inlining `tzmod` into SQL matches the file's existing pattern (`_local`, `_tzmod` usage throughout).

Then, in the `compute_stats` return dict (currently ending at line 252), add one line after `"visitors": visitors,`:

```python
        "visitors": visitors,
        "peak_active": _peak_active(store, tz),
    }
```

- [ ] **Step 4: Run the new tests to verify they pass**

Run:
```bash
cd /Users/israfil/projects/savevidai/backend && source .venv/bin/activate && python -m pytest tests/test_stats.py -k peak_active -v
```
Expected: 5 PASSED.

- [ ] **Step 5: Run the full backend suite and lint, check the warning baseline**

Run:
```bash
cd /Users/israfil/projects/savevidai/backend && source .venv/bin/activate && python -m pytest && ruff check app tests
```
Expected: all tests pass, summary reports exactly `7 warnings` (the pre-existing baseline; any new warning is a finding to fix before committing), and ruff prints `All checks passed!`.

- [ ] **Step 6: Commit**

```bash
cd /Users/israfil/projects/savevidai && git add backend/app/analytics/stats.py backend/tests/test_stats.py && git commit -m "feat: add peak_active concurrent-visitor stats to compute_stats

Peak concurrent = highest COUNT(DISTINCT visitor) in any fixed 5-minute
bucket floored on UTC epoch seconds. Record rendered in owner-local
day/time; per-local-day peak series for the chart. Aggregate-only, reads
existing ts and visitor columns, no schema change.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Frontend Stats type, record tile, and per-day peak chart

**Files:**
- Modify: `frontend/src/admin/api.ts` (extend the `Stats` type, lines 1-17)
- Modify: `frontend/src/admin/Admin.tsx` (`Tile` gains an optional caption, `fillDays` becomes generic, new `formatClock` helper, new `PeakChart` component, `Dashboard` wiring)
- Test: `frontend/src/admin/Admin.test.tsx` (extend the `STATS` mock, tighten one existing assertion, add new tests)

**Interfaces:**
- Consumes: `compute_stats(...)["peak_active"]` from Task 1, JSON shape
  `{ record: { count: number; day: string; time: string } | null; series: Array<{ day: string; peak: number }> }`
  where `day` is `YYYY-MM-DD` and `time` is 24-hour `HH:MM`; existing `Tile`, `formatDay(day)`, `fillDays(series)`, and the `LineChart` SVG constants (width 760, height 220, left 32, right 10, top 14, bottom 24) in `Admin.tsx`.
- Produces: `Stats["peak_active"]` type; `PeakChart({ series })` component; `Tile` accepting an optional `caption?: string` prop; `formatClock(time: string): string` ("21:15" -> "9:15pm"); `fillDays<T extends { day: string }>(series: T[], zero: (day: string) => T): T[]`.

- [ ] **Step 1: Extend the `Stats` type**

In `frontend/src/admin/api.ts`, add the `peak_active` member to the `Stats` type, after `visitors` (line 15):

```ts
  visitors: { new: number; returning: number };
  peak_active: {
    record: { count: number; day: string; time: string } | null;
    series: Array<{ day: string; peak: number }>;
  };
};
```

- [ ] **Step 2: Write the failing tests**

In `frontend/src/admin/Admin.test.tsx`, make three edits.

Edit 2a - extend the `STATS` mock (after `visitors: { new: 200, returning: 140 },` on line 48) so the fixture typechecks against the extended `Stats`:

```ts
  visitors: { new: 200, returning: 140 },
  peak_active: {
    record: { count: 9, day: "2026-07-21", time: "21:15" },
    series: [
      { day: "2026-07-20", peak: 4 },
      { day: "2026-07-21", peak: 9 },
    ],
  },
};
```

Edit 2b - the existing "renders the trend chart and busiest-hours strip when data exists" test (around line 235) asserts `getByRole("img", { name: /line chart/i })`. The new peak chart's aria-label also starts with "Line chart", which would make that query throw on multiple matches. Tighten it to the specific chart:

```ts
  expect(screen.getByRole("img", { name: /line chart of daily fetches/i })).toBeInTheDocument();
```

Edit 2c - append the new tests at the end of the file:

```tsx
test("shows the peak concurrent tile with caption and the peak chart", async () => {
  render(<Dashboard stats={STATS} />);
  await screen.findByText("Live"); // flush SiteControls' mount fetch
  const tile = within(screen.getByText("Peak concurrent").closest(".panel") as HTMLElement);
  expect(tile.getByText("9")).toBeInTheDocument();
  // 21:15 renders as 9:15pm; month wording is locale-formatted, so pin only
  // the clock and the honesty caption.
  expect(tile.getByText(/9:15pm - last 90 days/)).toBeInTheDocument();
  expect(screen.getByText("Peak concurrent per day")).toBeInTheDocument();
  expect(
    screen.getByRole("img", { name: /line chart of daily peak concurrent visitors/i }),
  ).toBeInTheDocument();
});

test("peak concurrent tile shows a dash when there is no record", async () => {
  render(<Dashboard stats={{ ...STATS, peak_active: { record: null, series: [] } }} />);
  await screen.findByText("Live"); // flush SiteControls' mount fetch
  const tile = within(screen.getByText("Peak concurrent").closest(".panel") as HTMLElement);
  expect(tile.getAllByText("-").length).toBeGreaterThanOrEqual(1);
  // Empty series falls back to the shared "No data yet." empty state.
  const chartPanel = within(screen.getByText("Peak concurrent per day").closest(".panel") as HTMLElement);
  expect(chartPanel.getByText(/no data yet/i)).toBeInTheDocument();
});
```

Edit 2d - extend the existing "older-deploy stats without the new keys still render without throwing" test (around line 167). Its `legacy` payload already omits `peak_active` (it lists keys explicitly), so it now exercises the new guard for free; add one assertion after the existing `Avg/day (7d)` line:

```ts
  // Missing peak_active defaults to { record: null, series: [] }, no crash.
  expect(screen.getByText("Peak concurrent")).toBeInTheDocument();
```

- [ ] **Step 3: Run the frontend tests to verify they fail**

Run:
```bash
cd /Users/israfil/projects/savevidai/frontend && npm test -- Admin
```
Expected: the two new tests FAIL with `Unable to find an element with the text: Peak concurrent`, and the extended older-deploy test FAILS on the same missing text. Pre-existing tests still pass.

- [ ] **Step 4: Implement the Admin.tsx changes**

Five edits to `frontend/src/admin/Admin.tsx`.

Edit 4a - give `Tile` an optional caption (replace the existing `Tile`, lines 103-110):

```tsx
function Tile({ label, value, caption }: { label: string; value: string | number; caption?: string }) {
  return (
    <div className="panel p-4">
      <p className="text-sm text-[var(--muted)]">{label}</p>
      <p className="mt-1 font-mono text-2xl font-semibold">{value}</p>
      {caption && <p className="mt-1 text-xs text-[var(--faint)]">{caption}</p>}
    </div>
  );
}
```

Edit 4b - generalize `fillDays` so both charts share the gap-filling logic (replace the existing `fillDays`, lines 202-215), and update `LineChart`'s call site (line 228):

```tsx
// Missing calendar days mean zero events that day, not "no data point" - fill
// them in so the line honestly dips instead of interpolating across a gap.
function fillDays<T extends { day: string }>(series: T[], zero: (day: string) => T): T[] {
  if (series.length === 0) return [];
  const byDay = new Map(series.map((s) => [s.day, s]));
  const start = Date.parse(`${series[0]!.day}T00:00:00Z`);
  const end = Date.parse(`${series[series.length - 1]!.day}T00:00:00Z`);
  const out: T[] = [];
  for (let t = start; t <= end; t += 86_400_000) {
    const day = new Date(t).toISOString().slice(0, 10);
    out.push(byDay.get(day) ?? zero(day));
  }
  return out;
}
```

In `LineChart`, the first line becomes:

```tsx
  const points = fillDays(series, (day) => ({ day, fetch: 0, download: 0, visit: 0, uniques: 0 }));
```

Edit 4c - add `formatClock` directly below the existing `formatDay` (line 219):

```tsx
// "21:15" (owner-local 24h, from the backend) -> "9:15pm" for the tile caption.
function formatClock(time: string): string {
  const [hStr, m] = time.split(":");
  const h = Number(hStr);
  const suffix = h < 12 ? "am" : "pm";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m}${suffix}`;
}
```

Edit 4d - add `PeakChart` after the `LineChart` component (after line 305). Same SVG structure and constants as `LineChart`, single series:

```tsx
function PeakChart({ series }: { series: Stats["peak_active"]["series"] }) {
  const points = fillDays(series, (day) => ({ day, peak: 0 }));

  if (points.length === 0) {
    return (
      <div className="panel p-4 sm:col-span-2">
        <h2 className="font-semibold">Peak concurrent per day</h2>
        <p className="mt-3 text-sm text-[var(--muted)]">No data yet.</p>
      </div>
    );
  }

  const width = 760;
  const height = 220;
  const left = 32;
  const right = 10;
  const top = 14;
  const bottom = 24;
  const plotW = width - left - right;
  const plotH = height - top - bottom;
  const n = points.length;
  const max = Math.max(1, ...points.map((p) => p.peak));
  const x = (i: number) => left + (n <= 1 ? plotW / 2 : (plotW * i) / (n - 1));
  const y = (v: number) => top + plotH * (1 - v / max);
  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.peak).toFixed(1)}`)
    .join(" ");

  return (
    <div className="panel p-4 sm:col-span-2">
      <h2 className="font-semibold">Peak concurrent per day</h2>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Line chart of daily peak concurrent visitors"
        className="mt-3 h-auto w-full"
      >
        {[0, 0.5, 1].map((f) => (
          <line
            key={f}
            x1={left}
            x2={width - right}
            y1={top + plotH * f}
            y2={top + plotH * f}
            stroke="var(--line)"
            strokeWidth="1"
          />
        ))}
        <text x={left - 6} y={top + 4} textAnchor="end" fontFamily="var(--font-mono)" fontSize="10" fill="var(--faint)">
          {max}
        </text>
        <text x={left - 6} y={top + plotH + 4} textAnchor="end" fontFamily="var(--font-mono)" fontSize="10" fill="var(--faint)">
          0
        </text>
        <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={x(n - 1)} cy={y(points[n - 1]!.peak)} r="3" fill="var(--accent)" />
        <text x={left} y={height - 6} fontFamily="var(--font-mono)" fontSize="10" fill="var(--faint)">
          {formatDay(points[0]!.day)}
        </text>
        <text x={width - right} y={height - 6} textAnchor="end" fontFamily="var(--font-mono)" fontSize="10" fill="var(--faint)">
          {formatDay(points[n - 1]!.day)}
        </text>
      </svg>
    </div>
  );
}
```

Edit 4e - wire the `Dashboard` (lines 366-414). Add the defensive default next to the existing guards (after line 372):

```tsx
  const visitors = stats.visitors ?? { new: 0, returning: 0 };
  // Older backends predate peak_active; default so a stale deploy cannot crash.
  const peakActive = stats.peak_active ?? { record: null, series: [] };
```

Replace the avg-active tile row (lines 388-391) so the record tile sits beside it:

```tsx
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Tile label="Avg/day (7d)" value={avgActive.d7} />
        <Tile label="Avg/day (30d)" value={avgActive.d30} />
        <Tile
          label="Peak concurrent"
          value={peakActive.record ? peakActive.record.count : "-"}
          caption={
            peakActive.record
              ? `${formatDay(peakActive.record.day)}, ${formatClock(peakActive.record.time)} - last 90 days`
              : "-"
          }
        />
      </div>
```

Add the chart right after `<LineChart series={stats.series} />` (line 399):

```tsx
        <LineChart series={stats.series} />
        <PeakChart series={peakActive.series} />
```

- [ ] **Step 5: Run the frontend tests to verify they pass**

Run:
```bash
cd /Users/israfil/projects/savevidai/frontend && npm test -- Admin
```
Expected: all Admin tests PASS, including the two new tests, the extended older-deploy test, and the tightened trend-chart test.

- [ ] **Step 6: Run the production build**

Run:
```bash
cd /Users/israfil/projects/savevidai/frontend && npm run build
```
Expected: `tsc` typecheck and Vite build complete with no errors.

- [ ] **Step 7: Commit**

```bash
cd /Users/israfil/projects/savevidai && git add frontend/src/admin/api.ts frontend/src/admin/Admin.tsx frontend/src/admin/Admin.test.tsx && git commit -m "feat: show peak concurrent tile and per-day peak chart in admin

Record tile with owner-local day/time caption ('last 90 days' honesty
note), single-series PeakChart following the LineChart SVG structure,
defensive peak_active read so an older backend deploy cannot crash the
panel. fillDays generalized so both charts share the gap filler.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

Checked the plan against the spec with fresh eyes:

1. **Spec coverage.** Backend shape (`record` nullable, `series` per local day, ascending) - Task 1 Step 3. Bucket SQL exactly `(strftime('%s', ts) / 300) * 300` with the CAST the codebase uses - Task 1 Step 3. Tz shift reuses the validated `_tzmod` path - Task 1 Step 3. All five spec-mandated backend test cases (same-bucket 2, straddle 1, per-day series with nonzero tz boundary, empty store, DISTINCT repeat) - Task 1 Step 1. Frontend type extension - Task 2 Step 1. Captioned tile near avg-active with dash-on-null and the `?? { record: null, series: [] }` guard - Task 2 Steps 4a/4e. Single-series chart reusing the LineChart pattern with empty-state fallback - Task 2 Step 4d. Older-deploy guard test - Task 2 Step 2d. Out-of-scope items (intraday chart, best-day metric, live gauge changes) are not touched by any task.
2. **Placeholder scan.** No TBD/TODO/"similar to"; every code step shows complete code; every run step has the exact command and expected output.
3. **Type consistency.** `peak_active.record.{count,day,time}` and `series[].{day,peak}` match between Task 1's Produces, Task 2's Consumes, the `Stats` type, the mock, and the components. `fillDays(series, zero)` signature matches both call sites. One cross-task collision found and fixed during writing: the new chart's aria-label would have broken the existing `getByRole("img", { name: /line chart/i })` query, so Task 2 Step 2b tightens that assertion before the component lands.

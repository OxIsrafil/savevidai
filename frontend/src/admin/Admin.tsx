import { useEffect, useState, type FormEvent } from "react";
import { ThemeToggle } from "../components/ThemeToggle";
import { SiteControls } from "./SiteControls";
import { fetchStats, login, type Stats } from "./api";

type Period = Stats["totals"]["fetches"];
type View = { kind: "login" } | { kind: "unavailable" } | { kind: "dashboard"; stats: Stats };

export function Admin() {
  const [view, setView] = useState<View>({ kind: "login" });
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    const r = await fetchStats();
    if (r === "unauthorized") {
      setLoginError(false);
      setView({ kind: "login" });
    } else if (r === "error") {
      setView({ kind: "unavailable" });
    } else {
      setView({ kind: "dashboard", stats: r });
    }
  }

  // Silent check on mount: an existing valid session cookie skips the login
  // screen entirely. Nothing sensitive is in the page markup either way.
  useEffect(() => {
    void load();
  }, []);

  // Auto-refresh while the dashboard is visible; stop the moment it isn't
  // (session expired, analytics went down) so we don't poll a dead view.
  useEffect(() => {
    if (view.kind !== "dashboard") return;
    const t = setInterval(() => void load(), 60_000);
    return () => clearInterval(t);
  }, [view.kind]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoginError(false);
    setSubmitting(true);
    try {
      if (await login(password)) {
        setPassword("");
        await load();
      } else {
        setLoginError(true);
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (view.kind === "dashboard") return <Dashboard stats={view.stats} />;
  if (view.kind === "unavailable") return <Unavailable onRetry={() => void load()} />;

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">SaveVid AI admin</h1>
        <ThemeToggle />
      </div>
      <form onSubmit={onSubmit} className="mt-6">
        <input
          type="password"
          aria-label="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className={`cta-input w-full ${loginError ? "animate-shake" : ""}`}
        />
        <button type="submit" className="btn mt-3 w-full" disabled={submitting}>
          Sign in
        </button>
        {loginError && (
          <p role="alert" className="error-glow mt-3 text-sm text-[#ff453a]">
            Wrong password.
          </p>
        )}
      </form>
    </main>
  );
}

function Unavailable({ onRetry }: { onRetry: () => void }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Analytics unavailable</h1>
      <p className="mt-3 text-sm text-[var(--muted)]">
        The stats service isn't reachable right now. This never affects the public site, only this
        dashboard.
      </p>
      <button type="button" onClick={onRetry} className="btn mt-6 w-full">
        Retry
      </button>
    </main>
  );
}

function Tile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="panel p-4">
      <p className="text-sm text-[var(--muted)]">{label}</p>
      <p className="mt-1 font-mono text-2xl font-semibold">{value}</p>
    </div>
  );
}

function TotalsTable({ totals }: { totals: Stats["totals"] }) {
  const rows: Array<{ label: string; period: Period }> = [
    { label: "Fetches", period: totals.fetches },
    { label: "Downloads", period: totals.downloads },
    { label: "Visits", period: totals.visits },
  ];
  return (
    <div className="panel overflow-x-auto p-4">
      <h2 className="font-semibold">Traffic</h2>
      <table className="mt-3 w-full min-w-[420px] text-left font-mono text-sm">
        <thead>
          <tr className="text-[var(--muted)]">
            <th className="py-1 pr-3 font-normal" scope="col">
              <span className="sr-only">Metric</span>
            </th>
            <th className="py-1 pr-3 font-normal" scope="col">
              Today
            </th>
            <th className="py-1 pr-3 font-normal" scope="col">
              7d
            </th>
            <th className="py-1 pr-3 font-normal" scope="col">
              30d
            </th>
            <th className="py-1 font-normal" scope="col">
              All-time
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-t border-[var(--line)]">
              <th scope="row" className="py-1.5 pr-3 text-left font-sans font-medium text-[var(--fg)]">
                {r.label}
              </th>
              <td className="py-1.5 pr-3">{r.period.today}</td>
              <td className="py-1.5 pr-3">{r.period.d7}</td>
              <td className="py-1.5 pr-3">{r.period.d30}</td>
              <td className="py-1.5">{r.period.all_time}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BarList({
  title,
  rows,
  maxRows,
}: {
  title: string;
  rows: Array<{ label: string; count: number; note?: string }>;
  maxRows?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const max = Math.max(1, ...rows.map((r) => r.count));
  const collapsible = maxRows !== undefined && rows.length > maxRows;
  const visible = collapsible && !expanded ? rows.slice(0, maxRows) : rows;
  return (
    <div className="panel p-4">
      <h2 className="font-semibold">{title}</h2>
      <div className="mt-3 space-y-2">
        {rows.length === 0 && <p className="text-sm text-[var(--muted)]">No data yet.</p>}
        {visible.map((r) => (
          <div key={r.label} className="flex items-center gap-3">
            <span className="w-24 shrink-0 truncate font-mono text-sm">{r.label}</span>
            <span
              className="h-2 rounded-full bg-[var(--accent)]"
              style={{ width: `${(r.count / max) * 100}%` }}
            />
            <span className="font-mono text-xs text-[var(--muted)]">{r.count}</span>
            {r.note && <span className="shrink-0 font-mono text-xs text-[var(--faint)]">{r.note}</span>}
          </div>
        ))}
      </div>
      {collapsible && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-3 cursor-pointer font-mono text-xs text-[var(--muted)] underline decoration-dotted underline-offset-4 transition-colors hover:text-[var(--fg)]"
        >
          {expanded ? "Show less" : `Show all (${rows.length})`}
        </button>
      )}
    </div>
  );
}

// Missing calendar days mean zero events that day, not "no data point" - fill
// them in so the line honestly dips instead of interpolating across a gap.
function fillDays(series: Stats["series"]): Stats["series"] {
  if (series.length === 0) return [];
  const byDay = new Map(series.map((s) => [s.day, s]));
  const start = Date.parse(`${series[0]!.day}T00:00:00Z`);
  const end = Date.parse(`${series[series.length - 1]!.day}T00:00:00Z`);
  const out: Stats["series"] = [];
  for (let t = start; t <= end; t += 86_400_000) {
    const day = new Date(t).toISOString().slice(0, 10);
    out.push(byDay.get(day) ?? { day, fetch: 0, download: 0, visit: 0, uniques: 0 });
  }
  return out;
}

function formatDay(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const CHART_SERIES = [
  { key: "fetch" as const, label: "Fetches", color: "var(--accent)" },
  { key: "download" as const, label: "Downloads", color: "var(--chart-download)" },
  { key: "visit" as const, label: "Visits", color: "var(--chart-visit)" },
];

function LineChart({ series }: { series: Stats["series"] }) {
  const points = fillDays(series);

  if (points.length === 0) {
    return (
      <div className="panel p-4 sm:col-span-2">
        <h2 className="font-semibold">Fetches vs downloads vs visits</h2>
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
  const max = Math.max(1, ...points.flatMap((p) => [p.fetch, p.download, p.visit]));
  const x = (i: number) => left + (n <= 1 ? plotW / 2 : (plotW * i) / (n - 1));
  const y = (v: number) => top + plotH * (1 - v / max);
  const linePath = (key: "fetch" | "download" | "visit") =>
    points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`).join(" ");

  return (
    <div className="panel p-4 sm:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Fetches vs downloads vs visits</h2>
        <div className="flex gap-4">
          {CHART_SERIES.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5 font-mono text-xs text-[var(--muted)]">
              <span aria-hidden="true" className="inline-block size-2 rounded-full" style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Line chart of daily fetches, downloads, and visits"
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
        {CHART_SERIES.map((s) => (
          <path key={s.key} d={linePath(s.key)} fill="none" stroke={s.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        ))}
        {CHART_SERIES.map((s) => (
          <circle key={s.key} cx={x(n - 1)} cy={y(points[n - 1]![s.key])} r="3" fill={s.color} />
        ))}
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

function HourStrip({ hours }: { hours: Stats["hours"] }) {
  const counts = new Array(24).fill(0);
  for (const h of hours) counts[h.hour] = h.count;
  const max = Math.max(1, ...counts);
  return (
    <div className="panel p-4 sm:col-span-2">
      <h2 className="font-semibold">Busiest hours</h2>
      {hours.length === 0 ? (
        <p className="mt-3 text-sm text-[var(--muted)]">No data yet.</p>
      ) : (
        <>
          <div className="mt-4 flex h-20 items-end gap-1">
            {counts.map((c, hour) => (
              // The bar itself must be the direct flex item: a percentage
              // height on a nested child can't resolve, because items-end
              // (needed to bottom-align the bars) never gives its child a
              // definite cross-size to resolve against.
              <div
                key={hour}
                title={`${hour}:00 - ${c}`}
                className="flex-1 rounded-sm bg-[var(--accent)]"
                style={{ height: `${Math.max(4, (c / max) * 100)}%`, opacity: c === 0 ? 0.15 : 1 }}
              />
            ))}
          </div>
          <div className="mt-1.5 flex justify-between font-mono text-[10px] text-[var(--faint)]">
            <span>0:00</span>
            <span>6:00</span>
            <span>12:00</span>
            <span>18:00</span>
            <span>23:00</span>
          </div>
        </>
      )}
    </div>
  );
}

function NewVsReturning({ visitors }: { visitors: Stats["visitors"] }) {
  const cells: Array<{ label: string; value: number }> = [
    { label: "New", value: visitors.new },
    { label: "Returning", value: visitors.returning },
  ];
  return (
    <div className="panel p-4">
      <h2 className="font-semibold">New vs returning</h2>
      <div className="mt-3 grid grid-cols-2 gap-3">
        {cells.map((c) => (
          <div key={c.label}>
            <p className="text-sm text-[var(--muted)]">{c.label}</p>
            <p className="mt-1 font-mono text-2xl font-semibold">{c.value}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-[var(--faint)]">Browser-based estimate, privacy-safe.</p>
    </div>
  );
}

export function Dashboard({ stats }: { stats: Stats }) {
  const t = stats.totals;
  // Older backends predate these keys; default at the read site so a stale
  // deploy renders zeros instead of crashing (mirrors `platforms ?? []`).
  const avgActive = stats.avg_active ?? { d7: 0, d30: 0 };
  const sources = stats.sources ?? [];
  const visitors = stats.visitors ?? { new: 0, returning: 0 };
  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">SaveVid AI analytics</h1>
        <ThemeToggle />
      </div>
      <div className="mt-6">
        <SiteControls />
      </div>
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Active now" value={stats.active_now} />
        <Tile label="Unique today" value={t.unique_today} />
        <Tile label="Success rate" value={`${Math.round(t.success_rate * 100)}%`} />
        <Tile label="Conversion" value={`${Math.round(t.conversion * 100)}%`} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Tile label="Avg/day (7d)" value={avgActive.d7} />
        <Tile label="Avg/day (30d)" value={avgActive.d30} />
      </div>
      <p className="mt-2 text-xs text-[var(--faint)]">
        Average daily unique visitors over the last N complete days (today excluded).
      </p>
      <div className="mt-4">
        <TotalsTable totals={t} />
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <LineChart series={stats.series} />
        <BarList title="Top countries" rows={stats.countries.map((c) => ({ label: c.country, count: c.count }))} maxRows={8} />
        <BarList
          title="By platform"
          rows={(stats.platforms ?? []).map((p) => ({
            label: p.platform,
            count: p.fetches,
            note: `${p.downloads} downloads`,
          }))}
        />
        <BarList title="Top qualities" rows={stats.qualities.map((q) => ({ label: q.quality, count: q.count }))} maxRows={8} />
        <BarList title="Errors (FixTweet health)" rows={stats.errors.map((e) => ({ label: e.code, count: e.count }))} />
        <BarList title="Traffic sources" rows={sources.map((s) => ({ label: s.source, count: s.count }))} />
        <NewVsReturning visitors={visitors} />
        <HourStrip hours={stats.hours} />
      </div>
      <p className="mt-6 text-xs text-[var(--faint)]">Daily-unique basis · your local time · refreshes every 60s</p>
    </main>
  );
}

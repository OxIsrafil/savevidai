export type Stats = {
  totals: {
    fetches: Period; downloads: Period; visits: Period;
    unique_today: number; success_rate: number; conversion: number;
  };
  active_now: number;
  series: Array<{ day: string; fetch: number; download: number; visit: number; uniques: number }>;
  countries: Array<{ country: string; count: number }>;
  qualities: Array<{ quality: string; count: number }>;
  errors: Array<{ code: string; count: number }>;
  hours: Array<{ hour: number; count: number }>;
};
type Period = { today: number; d7: number; d30: number; all_time: number };

export async function login(password: string): Promise<boolean> {
  const r = await fetch("/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  return r.status === 204;
}

export async function fetchStats(days = 30): Promise<Stats | "unauthorized" | "error"> {
  const tz = -new Date().getTimezoneOffset();
  const r = await fetch(`/api/admin/stats?days=${days}&tz=${tz}`);
  if (r.status === 401) return "unauthorized";
  if (!r.ok) return "error";
  return (await r.json()) as Stats;
}

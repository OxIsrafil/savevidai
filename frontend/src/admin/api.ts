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
  platforms: Array<{ platform: string; fetches: number; downloads: number }>;
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

export type Maintenance = { on: boolean; forced_by_env: boolean };

export async function getMaintenance(): Promise<Maintenance> {
  const r = await fetch("/api/admin/maintenance");
  if (!r.ok) throw new Error(`maintenance fetch failed: ${r.status}`);
  return (await r.json()) as Maintenance;
}

export async function setMaintenance(on: boolean): Promise<Maintenance> {
  const r = await fetch("/api/admin/maintenance", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ on }),
  });
  if (!r.ok) throw new Error(`maintenance update failed: ${r.status}`);
  return (await r.json()) as Maintenance;
}

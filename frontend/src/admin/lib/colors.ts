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

import type { CSSProperties } from "react";

/** Joins class names, dropping falsy parts. No merge logic: keep utilities non-conflicting. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/**
 * A figure's width in em at the admin's semibold tabular digits with the figures' tracking,
 * measured on SF Pro from 11px to 28px and rounded up past the worst case (digit 0.644, comma
 * 0.317, percent 0.985), so the narrower system fonts fit too.
 */
function figureEm(value: string): number {
  let em = 0;
  for (const ch of value) em += ch === "," || ch === "." ? 0.32 : ch === "%" ? 0.99 : 0.65;
  return em;
}

/**
 * Figures are never cut. This sets --fit, the longest figure's width in em, for a group sized
 * together; a figure class like `text-[length:min(20px,calc(100cqi/var(--fit)))]` then keeps its
 * token size wherever it fits the nearest size container and steps down just enough where not.
 */
export function fitStyle(values: string[]): CSSProperties {
  return { "--fit": Math.max(1, ...values.map(figureEm)).toFixed(2) } as CSSProperties;
}

/** Cards: 22px radius, surface, faint border, no shadow (spec F2). */
export const CARD = "rounded-card border border-line/50 bg-surface";

/** The blue pill: 44px tall, full width, spinner-ready. */
export const PRIMARY_BUTTON =
  "inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-brand px-5 text-sm font-medium text-white transition-colors hover:bg-brand-hover disabled:pointer-events-none disabled:opacity-50";

/** A quiet pill button for secondary actions. */
export const PILL_BUTTON =
  "inline-flex h-9 items-center justify-center gap-2 rounded-full border border-line-strong bg-white/[0.04] px-4 text-[13px] font-medium text-text-primary transition-colors hover:bg-white/[0.08] disabled:pointer-events-none disabled:opacity-50";

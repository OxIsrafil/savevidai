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

import { cn, fitStyle } from "./styles";

/**
 * Two or three small figures on 28px tinted tiles, for the top of a panel. Labels wrap; figures sit
 * at the bottom so they line up. Figures are never cut: each tile is a size container, and every
 * figure in the strip is 20px, or smaller when the strip's longest figure would not fit a tile.
 */
export function MiniStats({ items, className }: { items: { label: string; value: string; tone?: string }[]; className?: string }) {
  return (
    <dl className={cn("grid gap-3", items.length === 2 ? "grid-cols-2" : "grid-cols-3", className)} style={fitStyle(items.map((s) => s.value))}>
      {items.map((s) => (
        <div key={s.label} className="@container flex min-w-0 flex-col justify-between gap-1 rounded-tile bg-white/[0.04] px-3.5 py-3">
          <dt className="text-xs text-text-muted">{s.label}</dt>
          <dd className="text-[length:min(20px,calc(100cqi/var(--fit)))] leading-none font-semibold tracking-[-0.02em] whitespace-nowrap text-text-primary tabular-nums" style={s.tone ? { color: s.tone } : undefined}>
            {s.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

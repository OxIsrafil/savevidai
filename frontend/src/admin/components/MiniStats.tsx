import { cn } from "./styles";

/** Two or three small figures on 28px tinted tiles, for the top of a panel. Labels wrap; figures sit at the bottom so they line up. */
export function MiniStats({ items, className }: { items: { label: string; value: string; tone?: string }[]; className?: string }) {
  return (
    <dl className={cn("grid gap-3", items.length === 2 ? "grid-cols-2" : "grid-cols-3", className)}>
      {items.map((s) => (
        <div key={s.label} className="flex min-w-0 flex-col justify-between gap-1 rounded-tile bg-white/[0.04] px-3.5 py-3">
          <dt className="text-xs text-text-muted">{s.label}</dt>
          <dd className="truncate text-[20px] leading-none font-semibold tracking-[-0.02em] text-text-primary tabular-nums" style={s.tone ? { color: s.tone } : undefined}>
            {s.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

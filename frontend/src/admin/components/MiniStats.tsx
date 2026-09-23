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

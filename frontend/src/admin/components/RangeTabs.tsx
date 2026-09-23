import { motion } from "motion/react";
import type { RangeKey } from "../lib/api";
import { RANGE_KEYS, RANGE_LABELS } from "../lib/range";
import { cn } from "./styles";

/** A pill track of 32px buttons; the active pill is elevated and slides on a spring. */
export function RangeTabs({ active, onChange }: { active: RangeKey; onChange: (key: RangeKey) => void }) {
  return (
    <div role="group" aria-label="Date range" className="flex w-full rounded-full border border-line/60 bg-surface p-1 sm:inline-flex sm:w-auto">
      {RANGE_KEYS.map((key) => {
        const selected = key === active;
        return (
          <button
            key={key}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(key)}
            className={cn(
              "relative h-8 min-w-0 flex-1 rounded-full px-1.5 text-[13px] whitespace-nowrap transition-colors sm:flex-none sm:px-3.5",
              selected ? "font-medium text-text-primary" : "text-text-muted hover:text-text-primary",
            )}
          >
            {selected ? <motion.span layoutId="range-pill" className="absolute inset-0 rounded-full bg-elevated shadow-[0_1px_2px_rgba(0,0,0,0.4)]" transition={{ type: "spring", stiffness: 420, damping: 34 }} /> : null}
            <span className="relative">{RANGE_LABELS[key]}</span>
          </button>
        );
      })}
    </div>
  );
}

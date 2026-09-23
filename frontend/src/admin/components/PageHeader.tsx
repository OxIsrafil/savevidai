import type { ReactNode } from "react";
import { Reveal } from "./Reveal";

/** Kicker, big title, one muted line, an optional 12px note, and actions on the right (bottom-aligned from 640px). */
export function PageHeader({ kicker, title, subtitle, note, actions }: { kicker: string; title: string; subtitle: string; note?: ReactNode; actions?: ReactNode }) {
  return (
    <Reveal className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <p className="kicker mb-2">{kicker}</p>
        <h1 className="text-title text-text-primary">{title}</h1>
        <p className="mt-1.5 text-[13px] leading-relaxed text-text-muted">{subtitle}</p>
        {note ? <p className="mt-1 text-xs text-text-muted">{note}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center">{actions}</div> : null}
    </Reveal>
  );
}

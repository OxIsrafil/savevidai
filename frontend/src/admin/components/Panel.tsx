import type { ReactNode } from "react";
import { CARD, cn } from "./styles";

/** A 22px card with a 15px title, a 13px muted hint and 20px before the content. Named region for tests and screen readers. */
export function Panel({ title, hint, children, className }: { title: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section aria-label={title} className={cn(CARD, "p-5 sm:p-6", className)}>
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-text-primary">{title}</h2>
        {hint ? <p className="mt-0.5 text-[13px] text-text-muted">{hint}</p> : null}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

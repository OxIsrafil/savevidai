import type { CSSProperties, ReactNode } from "react";

/** Fade in and rise 12px over 0.6s, 40ms later per index. Pure CSS (admin.css .reveal-up). */
export function Reveal({ i = 0, className, children }: { i?: number; className?: string; children: ReactNode }) {
  const style = { "--reveal-delay": `${(0.04 * i).toFixed(2)}s` } as CSSProperties;
  return (
    <div className={["reveal-up", className].filter(Boolean).join(" ")} style={style}>
      {children}
    </div>
  );
}

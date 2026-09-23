import { useEffect, useRef } from "react";

/**
 * Calls `fn` every `ms` while the tab is visible. When the tab becomes visible again and the
 * last call is older than `ms`, it calls at once. Nothing runs while `enabled` is false.
 */
export function useVisibleInterval(fn: () => void, ms: number, enabled = true): void {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(() => {
    if (!enabled) return;
    let last = Date.now();
    const fire = () => {
      last = Date.now();
      fnRef.current();
    };
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") fire();
    }, ms);
    const onVisibility = () => {
      if (document.visibilityState === "visible" && Date.now() - last >= ms) fire();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [ms, enabled]);
}

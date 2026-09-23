import { useCallback, useEffect, useRef, useState } from "react";
import { buildSearch, readUrlState, type UrlState } from "../lib/range";

/** `?page=` and `?range=` as state. Changes push a history entry; popstate restores both. */
export function useUrlState(): [UrlState, (next: Partial<UrlState>) => void] {
  const [state, setState] = useState<UrlState>(() => readUrlState(window.location.search));
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const onPop = () => setState(readUrlState(window.location.search));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // pushState runs outside the state updater so StrictMode's double invocation cannot push twice.
  const update = useCallback((next: Partial<UrlState>) => {
    const merged = { ...stateRef.current, ...next };
    if (merged.page === stateRef.current.page && merged.range === stateRef.current.range) return;
    window.history.pushState(null, "", `${window.location.pathname}${buildSearch(merged)}`);
    setState(merged);
  }, []);

  return [state, update];
}

import { useCallback, useState } from "react";
import { ApiError, resolveTweet, type ResolveResponse } from "../lib/api";
import { enShared } from "../locales/en";
import type { ErrorStrings } from "../locales/types";

export type ResolveState =
  | { status: "idle" }
  | { status: "resolving" }
  | { status: "ready"; data: ResolveResponse }
  | { status: "error"; code: string; message: string };

/**
 * @param strings client-minted error copy; pass the page's locale table. The
 * backend's own `body.message` is never replaced by these.
 */
export function useResolve(strings: ErrorStrings = enShared.errors) {
  const [state, setState] = useState<ResolveState>({ status: "idle" });

  const resolve = useCallback(
    async (url: string) => {
      setState({ status: "resolving" });
      try {
        const data = await resolveTweet(url, strings);
        setState({ status: "ready", data });
      } catch (err) {
        if (err instanceof ApiError) {
          setState({ status: "error", code: err.code, message: err.message });
        } else {
          setState({ status: "error", code: "network", message: strings.network });
        }
      }
    },
    // String tables are module constants, so this identity is stable and the
    // effects keyed on `resolve` in the apps do not re-fire.
    [strings],
  );

  const reset = useCallback(() => setState({ status: "idle" }), []);

  return { state, resolve, reset };
}

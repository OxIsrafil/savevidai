import { useEffect, useState } from "react";
import { Spinner } from "./Spinner";

/** Plain black while the session probe runs; a small spinner only after 400ms. */
export function CheckingView() {
  const [late, setLate] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setLate(true), 400);
    return () => clearTimeout(t);
  }, []);
  return (
    <main className="grid min-h-svh place-items-center">
      {late ? (
        <div role="status" aria-label="Checking your session" className="text-text-muted">
          <Spinner className="size-5" />
        </div>
      ) : null}
    </main>
  );
}

import { useEffect, useState } from "react";
import { setMaintenance, type Maintenance } from "../lib/api";
import { Spinner } from "./Spinner";
import { CARD, cn, PILL_BUTTON } from "./styles";

/** How long the first tap's "Tap to confirm" stays armed. */
export const CONFIRM_MS = 4000;

/** The armed tint. PILL_BUTTON sets its own border, background and text colours, and a plain
 *  bg-warning-dim lost to its bg-white/[0.04] on CSS order. Important wins whatever the order,
 *  hover included. */
const ARMED = "border-warning/40! bg-warning-dim! text-warning!";

/**
 * The maintenance switch. Turning it on is a two-tap confirm (the premium store's Deliver
 * pattern) instead of window.confirm; going live is one tap. The new state is lifted to the
 * app so the nav pill and the live strip follow at once.
 */
export function MaintenanceCard({ state, onChange, onUnauthorized }: { state: Maintenance | null; onChange: (m: Maintenance) => void; onUnauthorized: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(false), CONFIRM_MS);
    return () => clearTimeout(t);
  }, [confirming]);

  async function apply(on: boolean) {
    setBusy(true);
    setFailed(false);
    const result = await setMaintenance(on);
    setBusy(false);
    if (result === "unauthorized") {
      onUnauthorized();
      return;
    }
    if (result === "error") {
      setFailed(true);
      return;
    }
    onChange(result);
  }

  function onClick() {
    if (!state) return;
    if (state.on) {
      void apply(false);
      return;
    }
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    void apply(true);
  }

  const on = state?.on ?? false;
  const label = on ? "Go live" : confirming ? "Tap to confirm" : "Turn on maintenance";

  return (
    <section aria-label="Maintenance" className={cn(CARD, "p-5 sm:p-6")}>
      <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-text-primary">Maintenance</h2>
      {state ? (
        <>
          <div className="mt-5 flex items-center gap-2.5">
            <span aria-hidden="true" className={cn("size-2.5 rounded-full", on ? "bg-warning" : "bg-success")} />
            <p className="text-sm font-medium text-text-primary">{on ? "In maintenance" : "Live"}</p>
          </div>
          <p className="mt-1 text-[13px] text-text-muted">{on ? "Visitors see the maintenance page until you go live" : "Visitors can use the site"}</p>
          <button
            type="button"
            onClick={onClick}
            disabled={busy || state.forced_by_env}
            className={cn(PILL_BUTTON, "mt-5", confirming && ARMED)}
          >
            {busy ? <Spinner /> : null}
            {label}
          </button>
          {state.forced_by_env ? <p className="mt-3 text-[13px] text-text-muted">Forced on by MAINTENANCE_MODE in deploy/app.env on the server. Remove it there and redeploy</p> : null}
          {failed ? (
            <p role="alert" className="mt-3 text-[13px] text-danger">
              Could not update, try again
            </p>
          ) : null}
        </>
      ) : (
        <p className="mt-5 text-[13px] text-text-muted">Checking the site status</p>
      )}
      <p className="mt-6 text-xs text-text-muted">Sign out clears this browser only. To sign out everywhere, change ADMIN_PASSWORD</p>
    </section>
  );
}

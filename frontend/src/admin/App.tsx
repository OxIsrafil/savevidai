import { useCallback, useEffect, useState, type ReactNode } from "react";
import { MotionConfig } from "motion/react";
import { getMaintenance, logout, probe, type Maintenance } from "./lib/api";
import { currentTz } from "./lib/range";
import { useUrlState } from "./hooks/useUrlState";
import { useVisibleInterval } from "./hooks/useVisibleInterval";
import { CheckingView } from "./components/CheckingView";
import { LoginView } from "./components/LoginView";
import { Shell } from "./components/Shell";
import { AnalyticsOffView, UnavailableView } from "./components/UnavailableView";
import { AnalyticsPage } from "./pages/AnalyticsPage";
import { SitePage } from "./pages/SitePage";

type Phase = "checking" | "login" | "off" | "unavailable" | "shell";

/** Everything refreshes on one 30 s cycle while the tab is visible (spec F5). */
export const REFRESH_MS = 30_000;

export function App() {
  const [phase, setPhase] = useState<Phase>("checking");
  const [maintenance, setMaintenance] = useState<Maintenance | null>(null);
  const [tick, setTick] = useState(0);
  const [url, setUrl] = useUrlState();
  const tz = currentTz();

  // Probe the session before showing anything, so a signed-in owner never sees the login form.
  const check = useCallback(async () => {
    setPhase("checking");
    const result = await probe();
    setPhase(result === "ok" ? "shell" : result === "unauthorized" ? "login" : result === "off" ? "off" : "unavailable");
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  const toLogin = useCallback(() => {
    setMaintenance(null);
    setPhase("login");
  }, []);
  const toUnavailable = useCallback(() => setPhase("unavailable"), []);

  useVisibleInterval(() => setTick((t) => t + 1), REFRESH_MS, phase === "shell");

  // The maintenance flag feeds the nav pill and the live strip; it rides the same cycle.
  useEffect(() => {
    if (phase !== "shell") return;
    let alive = true;
    void getMaintenance().then((m) => {
      if (!alive) return;
      if (m === "unauthorized") toLogin();
      else if (m !== "error") setMaintenance(m);
    });
    return () => {
      alive = false;
    };
  }, [phase, tick, toLogin]);

  async function signOut() {
    await logout();
    toLogin();
  }

  let body: ReactNode;
  if (phase === "checking") body = <CheckingView />;
  else if (phase === "login") body = <LoginView onSignedIn={() => setPhase("shell")} />;
  else if (phase === "off") body = <AnalyticsOffView />;
  else if (phase === "unavailable") body = <UnavailableView onRetry={() => void check()} />;
  else
    body = (
      <Shell page={url.page} maintenanceOn={maintenance?.on ?? false} onNavigate={(page) => setUrl({ page })} onSignOut={() => void signOut()}>
        {url.page === "site" ? (
          <SitePage tz={tz} tick={tick} maintenance={maintenance} onMaintenanceChange={setMaintenance} onUnauthorized={toLogin} />
        ) : (
          <AnalyticsPage
            range={url.range}
            tz={tz}
            tick={tick}
            maintenance={maintenance}
            onRangeChange={(range) => setUrl({ range })}
            onGoToSite={() => setUrl({ page: "site" })}
            onUnauthorized={toLogin}
            onUnavailable={toUnavailable}
          />
        )}
      </Shell>
    );

  return <MotionConfig reducedMotion="user">{body}</MotionConfig>;
}

import type { ReactNode } from "react";
import { Panel } from "./Panel";
import { Spinner } from "./Spinner";
import { Wordmark } from "./Wordmark";
import { CARD, cn, PRIMARY_BUTTON } from "./styles";

function Frame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="grid min-h-svh place-items-center px-[clamp(20px,4vw,48px)] py-12">
      <div className="w-full max-w-sm">
        <Wordmark />
        <div className={cn(CARD, "mt-10 p-6 shadow-raised sm:p-8")}>
          <p className="kicker mb-2">Admin</p>
          <h1 className="text-[clamp(20px,1.8vw,24px)] leading-[1.2] font-semibold tracking-[-0.018em] text-text-primary">{title}</h1>
          {children}
        </div>
      </div>
    </main>
  );
}

const CODE = "font-mono text-[12px] text-text-secondary";

const UNAVAILABLE_TITLE = "Analytics is unavailable";
const UNAVAILABLE_TEXT = "The dashboard could not reach the analytics service. The public site is not affected.";

/** The probe failed with anything but 401 or 404: the session state is unknown, so there is no shell. */
export function UnavailableView({ onRetry }: { onRetry: () => void }) {
  return (
    <Frame title={UNAVAILABLE_TITLE}>
      <p className="mt-1.5 text-[13px] leading-relaxed text-text-muted">{UNAVAILABLE_TEXT}</p>
      <button type="button" onClick={onRetry} className={cn(PRIMARY_BUTTON, "mt-6")}>
        Retry
      </button>
    </Frame>
  );
}

/**
 * The first report failed after a good probe: the same message as a card inside the Analytics
 * page, so the nav, and with it the Site page's maintenance switch, stays reachable. Retry
 * refetches the report. Busy is aria-disabled, not disabled, so the button keeps keyboard focus.
 */
export function UnavailableCard({ onRetry, busy }: { onRetry: () => void; busy: boolean }) {
  return (
    <Panel title={UNAVAILABLE_TITLE} hint={UNAVAILABLE_TEXT}>
      <button type="button" onClick={onRetry} aria-disabled={busy || undefined} className={cn(PRIMARY_BUTTON, "sm:w-auto aria-disabled:pointer-events-none aria-disabled:opacity-50")}>
        {busy ? <Spinner /> : null}
        Retry
      </button>
    </Panel>
  );
}

/** 404 from the admin API: analytics is not configured on this server. */
export function AnalyticsOffView() {
  return (
    <Frame title="Analytics is off on this server">
      <p className="mt-1.5 text-[13px] leading-relaxed text-text-muted">
        It needs <code className={CODE}>ADMIN_PASSWORD</code>, <code className={CODE}>ANALYTICS_SALT</code> and <code className={CODE}>ANALYTICS_DB_PATH</code> (or the{" "}
        <code className={CODE}>TURSO_DATABASE_URL</code> and <code className={CODE}>TURSO_AUTH_TOKEN</code> pair), all in deploy/app.env on the server. Set them and redeploy.
      </p>
    </Frame>
  );
}

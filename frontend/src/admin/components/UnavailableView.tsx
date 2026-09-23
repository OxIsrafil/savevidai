import type { ReactNode } from "react";
import { Wordmark } from "./Wordmark";
import { CARD, cn, PRIMARY_BUTTON } from "./styles";

function Frame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="grid min-h-svh place-items-center px-[clamp(20px,4vw,48px)] py-12">
      <div className="w-full max-w-sm">
        <Wordmark />
        <div className={cn(CARD, "mt-10 p-6 shadow-raised sm:p-8")}>
          <p className="kicker mb-2">Admin</p>
          <h1 className="text-[clamp(20px,1.8vw,24px)] leading-tight font-semibold tracking-[-0.01em] text-text-primary">{title}</h1>
          {children}
        </div>
      </div>
    </main>
  );
}

const CODE = "font-mono text-[12px] text-text-secondary";

/** The probe or the first report failed with anything but 401 or 404. */
export function UnavailableView({ onRetry }: { onRetry: () => void }) {
  return (
    <Frame title="Analytics is unavailable">
      <p className="mt-1.5 text-[13px] leading-relaxed text-text-muted">The dashboard could not reach the analytics service. The public site is not affected.</p>
      <button type="button" onClick={onRetry} className={cn(PRIMARY_BUTTON, "mt-6")}>
        Retry
      </button>
    </Frame>
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

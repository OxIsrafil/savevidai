import { utcMidnightLocal } from "../lib/format";

/** The daily visitor rule with the owner's local time of midnight UTC, retention, refresh, and DB-IP's required link. */
export function Footnote({ tz }: { tz: number }) {
  return (
    <p className="mt-8 max-w-3xl text-xs leading-relaxed text-text-muted">
      Visitors are counted once a day: the anonymous ID resets at midnight UTC ({utcMidnightLocal(tz)} your time), so someone active across that moment counts twice. Times are your
      local time. Data is kept 90 days, so the 90-day range has nothing earlier to compare with. Refreshes every 30 seconds while this tab is open.{" "}
      <a href="https://db-ip.com" className="text-brand-link hover:underline">
        IP Geolocation by DB-IP
      </a>
    </p>
  );
}

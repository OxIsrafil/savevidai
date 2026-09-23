import type { Maintenance } from "../lib/api";
import { PageHeader } from "../components/PageHeader";

export type SitePageProps = {
  tz: number;
  tick: number;
  maintenance: Maintenance | null;
  onMaintenanceChange: (m: Maintenance) => void;
  onUnauthorized: () => void;
};

/** The header only; Task 10 adds the maintenance card and resolver health. */
export function SitePage(_props: SitePageProps) {
  return <PageHeader kicker="Site" title="Site" subtitle="Maintenance switch and resolver health" />;
}

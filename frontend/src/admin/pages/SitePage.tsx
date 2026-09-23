import { useEffect, useRef, useState } from "react";
import { fetchResolvers, type Maintenance, type Resolvers } from "../lib/api";
import { MaintenanceCard } from "../components/MaintenanceCard";
import { PageHeader } from "../components/PageHeader";
import { ResolverHealth } from "../components/ResolverHealth";
import { Reveal } from "../components/Reveal";

export type SitePageProps = {
  tz: number;
  tick: number;
  maintenance: Maintenance | null;
  onMaintenanceChange: (m: Maintenance) => void;
  onUnauthorized: () => void;
};

/** The maintenance switch and the resolver health card. Resolvers reload on every refresh tick. */
export function SitePage({ tz, tick, maintenance, onMaintenanceChange, onUnauthorized }: SitePageProps) {
  const [resolvers, setResolvers] = useState<Resolvers | null>(null);
  const [failed, setFailed] = useState(false);
  const unauthorized = useRef(onUnauthorized);
  unauthorized.current = onUnauthorized;

  useEffect(() => {
    let alive = true;
    void fetchResolvers(tz).then((result) => {
      if (!alive) return;
      if (result === "unauthorized") {
        unauthorized.current();
        return;
      }
      if (result === "error") {
        setFailed(true);
        return;
      }
      setResolvers(result);
      setFailed(false);
    });
    return () => {
      alive = false;
    };
  }, [tz, tick]);

  return (
    <div>
      <PageHeader kicker="Site" title="Site" subtitle="Maintenance switch and resolver health" />
      <Reveal i={1} className="mt-6 grid gap-4 lg:grid-cols-2">
        <MaintenanceCard state={maintenance} onChange={onMaintenanceChange} onUnauthorized={onUnauthorized} />
        <ResolverHealth data={resolvers} failed={failed} />
      </Reveal>
    </div>
  );
}

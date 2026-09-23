import type { Maintenance, RangeKey } from "../lib/api";
import { RANGE_TITLES } from "../lib/range";
import { PageHeader } from "../components/PageHeader";

export type AnalyticsPageProps = {
  range: RangeKey;
  tz: number;
  tick: number;
  maintenance: Maintenance | null;
  onRangeChange: (range: RangeKey) => void;
  onGoToSite: () => void;
  onUnauthorized: () => void;
  onUnavailable: () => void;
};

/** The header only; Task 8 adds the data loading, live strip and trend card. */
export function AnalyticsPage({ range }: AnalyticsPageProps) {
  return <PageHeader kicker="Analytics" title={RANGE_TITLES[range]} subtitle="Your local time" />;
}

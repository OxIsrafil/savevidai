/**
 * The single, passive ad slot. Off by default; enable by building with VITE_ADS_ENABLED=true.
 * Never gates or delays a download. See the spec's monetization section.
 */
export function AdSlot() {
  if (import.meta.env.VITE_ADS_ENABLED !== "true") return null;
  return (
    <aside
      aria-label="sponsor"
      className="mt-10 rounded-3xl border border-[var(--line)] p-4 text-center text-sm text-[var(--muted)]"
    >
      <div id="ad-slot" />
    </aside>
  );
}

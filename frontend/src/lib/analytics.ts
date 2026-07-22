type EventType = "visit" | "download";

/** Fire-and-forget analytics beacon. No personal data, never throws, never blocks. */
export function sendEvent(
  type: EventType,
  opts: { quality?: string; platform?: string } = {},
): void {
  try {
    const body = JSON.stringify({ type, ...opts });
    void fetch("/api/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // analytics must never affect the user
  }
}

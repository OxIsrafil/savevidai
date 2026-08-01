import { enShared } from "../locales/en";
import type { ErrorStrings } from "../locales/types";

export type Variant = {
  label: string;
  width: number | null;
  height: number | null;
  url: string;
  size_bytes: number | null;
};

export type MediaItem = {
  index: number;
  kind: "video" | "gif" | "image" | "audio";
  thumbnail: string | null;
  duration_seconds: number | null;
  variants: Variant[];
};

export type ResolveResponse = {
  id: string;
  author: string;
  handle: string;
  avatar_url: string | null;
  text: string;
  items: MediaItem[];
};

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function resolveTweet(
  url: string,
  strings: ErrorStrings = enShared.errors,
): Promise<ResolveResponse> {
  const res = await fetch("/api/resolve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    // A non-JSON 5xx means the request never reached the API (e.g. dev proxy
    // with the backend down); say that instead of a vague generic error.
    // Only the client-minted fallbacks are localized: the backend's own
    // body.message passes through untouched (English in v1, per the spec).
    const fallback = res.status >= 500 ? strings.serverUnreachable : strings.generic;
    throw new ApiError(body?.error ?? "upstream_error", body?.message ?? fallback);
  }
  return body as ResolveResponse;
}

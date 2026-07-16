export type Variant = {
  label: string;
  width: number | null;
  height: number | null;
  url: string;
  size_bytes: number | null;
};

export type MediaItem = {
  index: number;
  kind: "video" | "gif";
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

export async function resolveTweet(url: string): Promise<ResolveResponse> {
  const res = await fetch("/api/resolve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    // A non-JSON 5xx means the request never reached the API (e.g. dev proxy
    // with the backend down); say that instead of a vague generic error.
    const fallback =
      res.status >= 500
        ? "Can't reach the SaveVid server right now. Try again in a moment."
        : "Something went wrong. Try again.";
    throw new ApiError(body?.error ?? "upstream_error", body?.message ?? fallback);
  }
  return body as ResolveResponse;
}

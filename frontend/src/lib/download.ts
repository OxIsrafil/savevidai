export type Progress = { received: number; total: number | null };

// How long the direct CDN attempt may wait for response headers before we fall
// back to the proxy. The body read is never timed: a large video takes a while.
const DIRECT_HEADERS_TIMEOUT_MS = 15_000;

/**
 * `handle_id`, unless they are the same string. Instagram is metadata-light:
 * there is no author to report, so handle and id are both the shortcode, and a
 * naive join would stutter ("DbKoX9xTgPz_DbKoX9xTgPz_hd.mp4").
 */
function stem(handle: string, id: string): string {
  return handle === id ? id : `${handle}_${id}`;
}

export function buildFilename(
  handle: string,
  id: string,
  label: string,
  index: number,
  totalItems: number,
): string {
  const suffix = totalItems > 1 ? `_${index}` : "";
  return `${stem(handle, id)}${suffix}_${label}.mp4`;
}

export function buildMediaFilename(
  handle: string,
  id: string,
  kind: "photo" | "sound",
  n?: number,
): string {
  const base = stem(handle, id);
  return kind === "photo" ? `${base}_photo_${n}.jpg` : `${base}_sound.m4a`;
}

export function proxyUrl(url: string, filename: string): string {
  // Site-relative URLs are our own endpoints (e.g. /api/mux/...): already
  // same-origin, so skip the proxy and just append the download filename.
  if (url.startsWith("/")) {
    return `${url}?filename=${encodeURIComponent(filename)}`;
  }
  return `/api/proxy?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename)}`;
}

async function readBlob(res: Response, onProgress: (p: Progress) => void): Promise<Blob> {
  if (!res.ok || !res.body) throw new Error(`fetch failed: ${res.status}`);
  const total = Number(res.headers.get("content-length")) || null;
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onProgress({ received, total });
  }
  const type = res.headers.get("content-type")?.split(";")[0] || "video/mp4";
  return new Blob(chunks as BlobPart[], { type });
}

// Straight from the CDN, with no Referer (video.twimg.com refuses a third-party
// one) and no cookies. Aborts if the response headers take too long.
async function fetchDirect(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DIRECT_HEADERS_TIMEOUT_MS);
  try {
    return await fetch(url, {
      referrerPolicy: "no-referrer",
      credentials: "omit",
      mode: "cors",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

function saveBlob(blob: Blob, filename: string): void {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

/**
 * Download a variant with streaming progress and save it under a clean name.
 *
 * Direct first: the browser reads the file straight from the platform CDN.
 * video.twimg.com allows that cross-origin read but refuses a third-party
 * Referer, so the direct fetch sends no Referer. If the direct attempt fails in
 * any way (refused, non-2xx, no body, a read error, or no headers in time), the
 * server proxy re-streams the file as the fallback and progress starts again
 * from zero. A partial direct download is never saved. Only absolute https URLs
 * get the direct attempt: site-relative ones are our own endpoints (Reddit's
 * /api/mux joins video and audio on the server) and are fetched from there.
 * Nothing is stored on the server either way.
 */
export async function downloadVariant(
  url: string,
  filename: string,
  onProgress: (p: Progress) => void,
): Promise<void> {
  const fromServer = async () => readBlob(await fetch(proxyUrl(url, filename)), onProgress);
  let blob: Blob;
  if (url.startsWith("https://")) {
    try {
      blob = await readBlob(await fetchDirect(url), onProgress);
    } catch {
      onProgress({ received: 0, total: null });
      blob = await fromServer();
    }
  } else {
    blob = await fromServer();
  }
  saveBlob(blob, filename);
}

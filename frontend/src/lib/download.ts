export type Progress = { received: number; total: number | null };

export function buildFilename(
  handle: string,
  id: string,
  label: string,
  index: number,
  totalItems: number,
): string {
  const suffix = totalItems > 1 ? `_${index}` : "";
  return `${handle}_${id}${suffix}_${label}.mp4`;
}

export function buildMediaFilename(
  handle: string,
  id: string,
  kind: "photo" | "sound",
  n?: number,
): string {
  return kind === "photo" ? `${handle}_${id}_photo_${n}.jpg` : `${handle}_${id}_sound.m4a`;
}

export function proxyUrl(url: string, filename: string): string {
  return `/api/proxy?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename)}`;
}

async function fetchBlob(url: string, onProgress: (p: Progress) => void): Promise<Blob> {
  const res = await fetch(url);
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
 * Download a variant through the server proxy with streaming progress.
 *
 * We cannot fetch video.twimg.com directly from the browser: it responds 403
 * with no Access-Control-Allow-Origin, so a cross-origin fetch reads zero bytes.
 * The proxy re-streams the file (setting Content-Length), which is the only way
 * to read the bytes for an in-page progress bar and to save with a clean name.
 */
export async function downloadVariant(
  url: string,
  filename: string,
  onProgress: (p: Progress) => void,
): Promise<void> {
  const blob = await fetchBlob(proxyUrl(url, filename), onProgress);
  saveBlob(blob, filename);
}

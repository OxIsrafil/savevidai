import { afterEach, describe, expect, test, vi } from "vitest";
import { buildFilename, buildMediaFilename, downloadVariant, proxyUrl } from "./download";

afterEach(() => vi.unstubAllGlobals());

test("buildFilename single and multi", () => {
  expect(buildFilename("ada", "111", "1080p", 1, 1)).toBe("ada_111_1080p.mp4");
  expect(buildFilename("ada", "222", "720p", 2, 3)).toBe("ada_222_2_720p.mp4");
});

describe("buildMediaFilename", () => {
  test("photo filenames carry the 1-based position", () => {
    expect(buildMediaFilename("user", "730", "photo", 2)).toBe("user_730_photo_2.jpg");
  });
  test("sound filename", () => {
    expect(buildMediaFilename("user", "730", "sound")).toBe("user_730_sound.m4a");
  });
});

test("proxyUrl encodes url and filename", () => {
  const u = proxyUrl("https://video.twimg.com/v.mp4?tag=1", "a b.mp4");
  expect(u).toBe("/api/proxy?url=https%3A%2F%2Fvideo.twimg.com%2Fv.mp4%3Ftag%3D1&filename=a%20b.mp4");
});

test("downloads through the proxy and reports streaming progress", async () => {
  // Twitter's CDN 403s cross-origin fetches, so downloads must go through the
  // proxy. This asserts a single proxy request (never the raw CDN) and that
  // progress is reported per chunk with a known total.
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      calls.push(String(input));
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2, 3]));
          controller.enqueue(new Uint8Array([4, 5, 6]));
          controller.close();
        },
      });
      return new Response(stream, { status: 200, headers: { "content-length": "6" } });
    }),
  );
  const progress: Array<{ received: number; total: number | null }> = [];
  await downloadVariant("https://video.twimg.com/v.mp4?tag=1", "f.mp4", (p) => progress.push(p));
  expect(calls).toHaveLength(1);
  expect(calls[0]).toContain("/api/proxy?");
  expect(calls[0]).toContain(encodeURIComponent("https://video.twimg.com/v.mp4?tag=1"));
  expect(progress.map((p) => p.received)).toEqual([3, 6]);
  expect(progress.at(-1)?.total).toBe(6);
});

test("throws when the proxy download fails", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 502 })));
  await expect(
    downloadVariant("https://video.twimg.com/v.mp4", "f.mp4", () => {}),
  ).rejects.toThrow();
});

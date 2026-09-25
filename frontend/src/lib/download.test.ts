import { afterEach, describe, expect, test, vi } from "vitest";
import {
  buildFilename,
  buildMediaFilename,
  downloadVariant,
  proxyUrl,
  type Progress,
} from "./download";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

test("buildFilename single and multi", () => {
  expect(buildFilename("ada", "111", "1080p", 1, 1)).toBe("ada_111_1080p.mp4");
  expect(buildFilename("ada", "222", "720p", 2, 3)).toBe("ada_222_2_720p.mp4");
});

// Instagram is metadata-light: handle and id are both the shortcode, so the
// plain handle_id stem would stutter ("DbKoX9xTgPz_DbKoX9xTgPz_hd.mp4").
test("buildFilename does not repeat the stem when handle and id are the same", () => {
  expect(buildFilename("DbKoX9xTgPz", "DbKoX9xTgPz", "hd", 1, 1)).toBe("DbKoX9xTgPz_hd.mp4");
});

describe("buildMediaFilename", () => {
  test("photo filenames carry the 1-based position", () => {
    expect(buildMediaFilename("user", "730", "photo", 2)).toBe("user_730_photo_2.jpg");
  });
  test("sound filename", () => {
    expect(buildMediaFilename("user", "730", "sound")).toBe("user_730_sound.m4a");
  });
  test("does not repeat the stem when handle and id are the same", () => {
    expect(buildMediaFilename("DbKoX9xTgPz", "DbKoX9xTgPz", "photo", 1)).toBe(
      "DbKoX9xTgPz_photo_1.jpg",
    );
  });
});

test("proxyUrl encodes url and filename", () => {
  const u = proxyUrl("https://video.twimg.com/v.mp4?tag=1", "a b.mp4");
  expect(u).toBe("/api/proxy?url=https%3A%2F%2Fvideo.twimg.com%2Fv.mp4%3Ftag%3D1&filename=a%20b.mp4");
});

test("proxyUrl passes through site-relative mux urls, appending the filename", () => {
  const u = proxyUrl("/api/mux/abc12345/720.mp4", "u_1_720p.mp4");
  expect(u).toBe("/api/mux/abc12345/720.mp4?filename=u_1_720p.mp4");
});

describe("downloadVariant", () => {
  const CDN = "https://video.twimg.com/v.mp4?tag=1";
  const PROXIED = proxyUrl(CDN, "f.mp4");

  // A 200 that streams the given chunks, with a Content-Length for the total.
  function ok(...chunks: number[][]): Response {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(new Uint8Array(chunk));
        controller.close();
      },
    });
    const length = String(chunks.flat().length);
    return new Response(stream, { status: 200, headers: { "content-length": length } });
  }

  // A 200 that hands out one chunk of a 6-byte file, then fails the next read
  // the way a dropped connection does.
  function dropsAfter(chunk: number[]): Response {
    let sent = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent) return controller.error(new TypeError("network error"));
        sent = true;
        controller.enqueue(new Uint8Array(chunk));
      },
    });
    return new Response(stream, { status: 200, headers: { "content-length": "6" } });
  }

  // The CDN answers with `direct`, anything site-relative (our proxy) with `server`.
  function stubFetch(
    direct: (init?: RequestInit) => Promise<Response>,
    server: () => Promise<Response> = async () => ok([7, 8, 9, 10]),
  ) {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
      String(input).startsWith("/") ? server() : direct(init),
    );
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  const urls = (fetchMock: ReturnType<typeof stubFetch>) =>
    fetchMock.mock.calls.map(([input]) => String(input));

  // Records each save: the blob handed to the object URL and the link's filename.
  // Stubbing the click also skips jsdom's unimplemented navigation to blob: URLs.
  function captureSaves(): Array<{ blob: Blob; filename: string }> {
    const saves: Array<{ blob: Blob; filename: string }> = [];
    let blob = new Blob();
    vi.spyOn(URL, "createObjectURL").mockImplementation((obj) => {
      blob = obj as Blob;
      return "blob:mock";
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      saves.push({ blob, filename: this.download });
    });
    return saves;
  }

  // jsdom's Blob has no arrayBuffer(), so read it back through a FileReader.
  function bytesOf(blob: Blob): Promise<number[]> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve([...new Uint8Array(reader.result as ArrayBuffer)]);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(blob);
    });
  }

  test("downloads straight from the CDN with no Referer and reports streaming progress", async () => {
    const saves = captureSaves();
    const fetchMock = stubFetch(async () => ok([1, 2, 3], [4, 5, 6]));
    const progress: Progress[] = [];
    await downloadVariant(CDN, "f.mp4", (p) => progress.push(p));
    // A single request, to the raw CDN url: no proxy call.
    expect(urls(fetchMock)).toEqual([CDN]);
    const init = fetchMock.mock.calls[0]?.[1];
    expect(init).toMatchObject({ referrerPolicy: "no-referrer", credentials: "omit", mode: "cors" });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(progress).toEqual([
      { received: 3, total: 6 },
      { received: 6, total: 6 },
    ]);
    expect(saves.map((s) => s.filename)).toEqual(["f.mp4"]);
    expect(await bytesOf(saves[0].blob)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  test("a refused direct fetch falls back to the proxy, restarting progress at 0", async () => {
    const saves = captureSaves();
    // A CORS refusal or a network error rejects the fetch with a TypeError.
    const fetchMock = stubFetch(
      async () => {
        throw new TypeError("Failed to fetch");
      },
      async () => ok([1, 2, 3], [4, 5, 6]),
    );
    const progress: Progress[] = [];
    await downloadVariant(CDN, "f.mp4", (p) => progress.push(p));
    expect(urls(fetchMock)).toEqual([CDN, PROXIED]);
    expect(progress).toEqual([
      { received: 0, total: null },
      { received: 3, total: 6 },
      { received: 6, total: 6 },
    ]);
    expect(saves.map((s) => s.filename)).toEqual(["f.mp4"]);
  });

  test.each([
    ["a 403", () => new Response("forbidden", { status: 403 })],
    ["a response with no body", () => new Response(null, { status: 200 })],
  ])("%s from the CDN falls back to the proxy", async (_what, direct) => {
    const saves = captureSaves();
    const fetchMock = stubFetch(async () => direct());
    await downloadVariant(CDN, "f.mp4", () => {});
    expect(urls(fetchMock)).toEqual([CDN, PROXIED]);
    expect(saves).toHaveLength(1);
    expect(await bytesOf(saves[0].blob)).toEqual([7, 8, 9, 10]);
  });

  test("a read error mid-stream falls back to the proxy and saves only the proxy's bytes", async () => {
    const saves = captureSaves();
    const fetchMock = stubFetch(async () => dropsAfter([1, 2, 3]));
    const progress: Progress[] = [];
    await downloadVariant(CDN, "f.mp4", (p) => progress.push(p));
    expect(urls(fetchMock)).toEqual([CDN, PROXIED]);
    expect(progress).toEqual([
      { received: 3, total: 6 },
      { received: 0, total: null },
      { received: 4, total: 4 },
    ]);
    // One save, of the proxy's file alone: the partial direct bytes are dropped.
    expect(saves).toHaveLength(1);
    expect(await bytesOf(saves[0].blob)).toEqual([7, 8, 9, 10]);
  });

  test("no response headers within 15 s aborts the direct fetch and falls back", async () => {
    vi.useFakeTimers();
    const saves = captureSaves();
    let signal: AbortSignal | undefined;
    // The CDN never answers: the request only ends when it is aborted.
    const fetchMock = stubFetch(
      (init) =>
        new Promise<Response>((_resolve, reject) => {
          signal = init?.signal ?? undefined;
          signal?.addEventListener("abort", () =>
            reject(new DOMException("The operation was aborted.", "AbortError")),
          );
        }),
    );
    const done = downloadVariant(CDN, "f.mp4", () => {});
    await vi.advanceTimersByTimeAsync(14_999);
    expect(urls(fetchMock)).toEqual([CDN]);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await done;
    expect(signal?.aborted).toBe(true);
    expect(urls(fetchMock)).toEqual([CDN, PROXIED]);
    expect(saves.map((s) => s.blob.size)).toEqual([4]);
  });

  test("the 15 s limit covers only the headers: a slow body still downloads direct", async () => {
    vi.useFakeTimers();
    const saves = captureSaves();
    let finish = () => {};
    const fetchMock = stubFetch(async (init) => {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          // As with a real fetch, an abort after the headers errors the body.
          init?.signal?.addEventListener("abort", () =>
            controller.error(new DOMException("The operation was aborted.", "AbortError")),
          );
          controller.enqueue(new Uint8Array([1, 2, 3]));
          finish = () => {
            controller.enqueue(new Uint8Array([4, 5, 6]));
            controller.close();
          };
        },
      });
      return new Response(stream, { status: 200, headers: { "content-length": "6" } });
    });
    const done = downloadVariant(CDN, "f.mp4", () => {});
    await vi.advanceTimersByTimeAsync(60_000);
    finish();
    await done;
    expect(urls(fetchMock)).toEqual([CDN]);
    expect(saves.map((s) => s.blob.size)).toEqual([6]);
  });

  test("an /api/mux url makes a single request to our endpoint and no direct attempt", async () => {
    const saves = captureSaves();
    const fetchMock = stubFetch(async () => ok([1, 2, 3]));
    await downloadVariant("/api/mux/abc12345/720.mp4", "u_1_720p.mp4", () => {});
    // Exactly today's request: the mux url with the filename, and no fetch options.
    expect(fetchMock.mock.calls).toEqual([["/api/mux/abc12345/720.mp4?filename=u_1_720p.mp4"]]);
    expect(saves.map((s) => s.filename)).toEqual(["u_1_720p.mp4"]);
    expect(await bytesOf(saves[0].blob)).toEqual([7, 8, 9, 10]);
  });

  test("throws when the direct and the proxy download both fail, saving nothing", async () => {
    const saves = captureSaves();
    const fetchMock = stubFetch(
      async () => {
        throw new TypeError("Failed to fetch");
      },
      async () => new Response(null, { status: 502 }),
    );
    await expect(downloadVariant(CDN, "f.mp4", () => {})).rejects.toThrow();
    expect(urls(fetchMock)).toEqual([CDN, PROXIED]);
    expect(saves).toHaveLength(0);
  });
});

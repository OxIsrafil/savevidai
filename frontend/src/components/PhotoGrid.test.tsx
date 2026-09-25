import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import type { MediaItem } from "../lib/api";
import { proxyUrl } from "../lib/download";
import { PhotoGrid } from "./PhotoGrid";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function photo(n: number): MediaItem {
  return {
    index: n,
    kind: "image",
    thumbnail: `https://pbs.twimg.com/p${n}.jpg`,
    duration_seconds: null,
    variants: [
      { label: "orig", width: 1080, height: 1920, url: `https://pbs.twimg.com/photo${n}.jpg`, size_bytes: 3 },
    ],
  };
}

const AUDIO: MediaItem = {
  index: 99,
  kind: "audio",
  thumbnail: null,
  duration_seconds: 30,
  variants: [
    { label: "sound", width: null, height: null, url: "https://sf16.tiktok.com/track.mp3", size_bytes: 3 },
  ],
};

function threeBytes(): Response {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array([1, 2, 3]));
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { "content-length": "3" } });
}

// Mirror QualityButton.test.tsx: the CDN streams 3 bytes straight to the
// browser, everything else (the beacon) 204s.
function stubCdnAndBeacon() {
  return vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) =>
    String(input).startsWith("https://") ? threeBytes() : new Response(null, { status: 204 }),
  );
}

// Every fetch that is not the analytics beacon, in order.
function downloads(fetchMock: ReturnType<typeof stubCdnAndBeacon>): string[] {
  return fetchMock.mock.calls.map(([u]) => String(u)).filter((u) => u !== "/api/event");
}

// Records the filename of each save. Stubbing the link click also skips jsdom's
// unimplemented navigation to blob: URLs.
function captureSavedNames(): string[] {
  const names: string[] = [];
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    names.push(this.download);
  });
  return names;
}

const PHOTOS = [photo(1), photo(2), photo(3)];
const STAGGER_MS = 600; // must match PhotoGrid's stagger between sequential saves

test("renders one img per photo and a Save all button; Sound only with audio", () => {
  const { container, rerender } = render(
    <PhotoGrid photos={PHOTOS} audio={null} handle="ada" id="222" platform="tiktok" />,
  );
  // Photos are decorative (alt=""), so query the DOM directly rather than by role.
  expect(container.querySelectorAll("img")).toHaveLength(3);
  expect(screen.getByRole("button", { name: /save all/i })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /^sound$/i })).toBeNull();

  rerender(<PhotoGrid photos={PHOTOS} audio={AUDIO} handle="ada" id="222" platform="tiktok" />);
  expect(screen.getByRole("button", { name: /^sound$/i })).toBeInTheDocument();
});

test("tapping one photo fires exactly one photo beacon and one direct fetch (photo_2.jpg)", async () => {
  const fetchMock = stubCdnAndBeacon();
  vi.stubGlobal("fetch", fetchMock);
  const saved = captureSavedNames();
  render(<PhotoGrid photos={PHOTOS} audio={null} handle="ada" id="222" platform="tiktok" />);

  await userEvent.click(screen.getByRole("button", { name: /save photo 2/i }));

  const beacons = fetchMock.mock.calls.filter(([u]) => String(u) === "/api/event");
  expect(beacons).toHaveLength(1);
  expect(JSON.parse(String(beacons[0]?.[1]?.body))).toEqual({
    type: "download",
    quality: "photo",
    platform: "tiktok",
  });

  expect(downloads(fetchMock)).toEqual(["https://pbs.twimg.com/photo2.jpg"]);
  expect(saved).toEqual(["ada_222_photo_2.jpg"]);
});

test("Save all fires exactly one album beacon and one direct fetch per photo", async () => {
  vi.useFakeTimers();
  const fetchMock = stubCdnAndBeacon();
  vi.stubGlobal("fetch", fetchMock);
  render(<PhotoGrid photos={PHOTOS} audio={null} handle="ada" id="222" platform="tiktok" />);

  // fireEvent (not userEvent) so it doesn't fight the fake clock. Bounded advance
  // (not runAllTimersAsync) so motion's requestAnimationFrame loop can't spin the
  // fake clock to vitest's 10000-timer abort; STAGGER_MS * 4 covers the three
  // sequential downloads and the two 600ms staggers between them.
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /save all/i }));
    await vi.advanceTimersByTimeAsync(STAGGER_MS * 4);
  });

  const beacons = fetchMock.mock.calls.filter(([u]) => String(u) === "/api/event");
  expect(beacons).toHaveLength(1);
  expect(JSON.parse(String(beacons[0]?.[1]?.body))).toEqual({
    type: "download",
    quality: "album",
    platform: "tiktok",
  });

  expect(downloads(fetchMock)).toEqual([
    "https://pbs.twimg.com/photo1.jpg",
    "https://pbs.twimg.com/photo2.jpg",
    "https://pbs.twimg.com/photo3.jpg",
  ]);
});

// Photos stream 3 bytes straight from the CDN, except `failUrl`: the CDN refuses
// it (403) and the proxy fallback fails too (500, empty body). The beacon 204s.
// Records every download request (direct and proxy) in order.
function stubFailingPhoto(failUrl: string, order: string[]) {
  return vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = String(input);
    if (url === "/api/event") return new Response(null, { status: 204 });
    order.push(url);
    if (url === failUrl) return new Response(null, { status: 403 });
    if (url.startsWith("/api/proxy")) return new Response(null, { status: 500 });
    return threeBytes();
  });
}

test("Save all: a failed photo is marked and the sweep continues sequentially, one album beacon", async () => {
  vi.useFakeTimers();
  const order: string[] = [];
  const fetchMock = stubFailingPhoto("https://pbs.twimg.com/photo2.jpg", order);
  vi.stubGlobal("fetch", fetchMock);
  const { container } = render(
    <PhotoGrid photos={PHOTOS} audio={null} handle="ada" id="222" platform="tiktok" />,
  );

  // Kick off the sweep and let only photo 1's download resolve (advance 0ms so the
  // 600ms stagger has NOT fired yet). Sequential means photo 2 must not have started.
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /save all/i }));
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(order).toEqual(["https://pbs.twimg.com/photo1.jpg"]);

  // Advance past the first stagger: photo 2 starts, is refused, falls back to the
  // proxy (which fails too), and still nothing after it.
  await act(async () => {
    await vi.advanceTimersByTimeAsync(STAGGER_MS);
  });
  expect(order.slice(1)).toEqual([
    "https://pbs.twimg.com/photo2.jpg",
    proxyUrl("https://pbs.twimg.com/photo2.jpg", "ada_222_photo_2.jpg"),
  ]);

  // Advance past the second stagger: photo 3 completes the sweep. Bounded advance
  // (not runAllTimersAsync) so motion's requestAnimationFrame loop can't spin the
  // fake clock to vitest's 10000-timer abort.
  await act(async () => {
    await vi.advanceTimersByTimeAsync(STAGGER_MS * 4);
  });
  expect(order.slice(3)).toEqual(["https://pbs.twimg.com/photo3.jpg"]);

  // Photo 2's tile is marked failed; photos 1 and 3 saved.
  const tiles = container.querySelectorAll(".photo-tile");
  expect(tiles[0]?.getAttribute("data-state")).toBe("saved");
  expect(tiles[1]?.getAttribute("data-state")).toBe("failed");
  expect(tiles[2]?.getAttribute("data-state")).toBe("saved");

  // Exactly one album beacon for the whole batch.
  const beacons = fetchMock.mock.calls.filter(([u]) => String(u) === "/api/event");
  expect(beacons).toHaveLength(1);
  expect(JSON.parse(String(beacons[0]?.[1]?.body))).toEqual({
    type: "download",
    quality: "album",
    platform: "tiktok",
  });

  // One direct fetch per photo plus the failed one's single proxy fallback: the
  // failure didn't retry or skip.
  expect(order).toHaveLength(4);
});

test("a tile tap during Save all is ignored (no extra beacon or download)", async () => {
  vi.useFakeTimers();
  const fetchMock = stubCdnAndBeacon();
  vi.stubGlobal("fetch", fetchMock);
  render(<PhotoGrid photos={PHOTOS} audio={null} handle="ada" id="222" platform="tiktok" />);

  // Start the sweep and pause it mid-flight (after photo 1, savingAll still true).
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /save all/i }));
    await vi.advanceTimersByTimeAsync(0);
  });

  // Tap photo 3's tile while the sweep is in progress; the guard should drop it.
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /save photo 3/i }));
    await vi.advanceTimersByTimeAsync(0);
  });

  // Let the sweep finish. Bounded advance (not runAllTimersAsync) so motion's
  // requestAnimationFrame loop can't spin the fake clock forever.
  await act(async () => {
    await vi.advanceTimersByTimeAsync(STAGGER_MS * 4);
  });

  // Still just the one album beacon (no stray photo beacon from the tap).
  const beacons = fetchMock.mock.calls.filter(([u]) => String(u) === "/api/event");
  expect(beacons).toHaveLength(1);
  expect(JSON.parse(String(beacons[0]?.[1]?.body))).toMatchObject({ quality: "album" });

  // Exactly three downloads (one per photo); photo 3 was not double-downloaded.
  expect(downloads(fetchMock)).toHaveLength(3);
});

test("Sound fires one sound beacon and saves the track as sound.m4a", async () => {
  const fetchMock = stubCdnAndBeacon();
  vi.stubGlobal("fetch", fetchMock);
  const saved = captureSavedNames();
  render(<PhotoGrid photos={PHOTOS} audio={AUDIO} handle="ada" id="222" platform="tiktok" />);

  await userEvent.click(screen.getByRole("button", { name: /^sound$/i }));

  const beacons = fetchMock.mock.calls.filter(([u]) => String(u) === "/api/event");
  expect(beacons).toHaveLength(1);
  expect(JSON.parse(String(beacons[0]?.[1]?.body))).toEqual({
    type: "download",
    quality: "sound",
    platform: "tiktok",
  });

  expect(downloads(fetchMock)).toEqual(["https://sf16.tiktok.com/track.mp3"]);
  expect(saved).toEqual(["ada_222_sound.m4a"]);
});

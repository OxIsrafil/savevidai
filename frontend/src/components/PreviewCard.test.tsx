import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import type { MediaItem, ResolveResponse } from "../lib/api";
import { esShared } from "../locales/es";
import { hiShared } from "../locales/hi";
import { PreviewCard } from "./PreviewCard";

afterEach(() => vi.unstubAllGlobals());

const DATA: ResolveResponse = {
  id: "222",
  author: "Ada Lovelace",
  handle: "ada",
  avatar_url: null,
  text: "two clips",
  items: [
    { index: 1, kind: "video", thumbnail: "https://pbs.twimg.com/t1.jpg", duration_seconds: 5,
      variants: [
        { label: "720p", width: 1280, height: 720, url: "https://video.twimg.com/a.mp4", size_bytes: 2097152 },
        { label: "360p", width: 640, height: 360, url: "https://video.twimg.com/b.mp4", size_bytes: null },
      ] },
    { index: 2, kind: "gif", thumbnail: null, duration_seconds: null,
      variants: [
        { label: "480p", width: 480, height: 480, url: "https://video.twimg.com/tweet_video/c.mp4", size_bytes: 512000 },
      ] },
  ],
};

test("renders author, handle, text, and per-item sections", () => {
  render(<PreviewCard data={DATA} />);
  expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
  expect(screen.getByText("@ada")).toBeInTheDocument();
  expect(screen.getByText("two clips")).toBeInTheDocument();
  expect(screen.getByText("Video 1")).toBeInTheDocument();
  expect(screen.getByText("Video 2")).toBeInTheDocument();
  expect(screen.getByText("GIF")).toBeInTheDocument();
});

test("renders one button per variant with full dimensions, HD chip, and size", () => {
  render(<PreviewCard data={DATA} />);
  const hd = screen.getByRole("button", { name: /1280×720/ });
  expect(hd).toHaveTextContent("2.0 MB");
  expect(hd).toHaveTextContent("HD"); // height >= 720 gets the HD chip
  expect(screen.getByRole("button", { name: /640×360/ })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /480×480/ })).toBeInTheDocument();
});

// Metadata-light platforms (instagram) resolve with thumbnail: null. The
// preview must self-generate from the media file's first frame instead of
// rendering an empty box (the media element needs no CORS to display).
test("thumbnail-less video renders a first-frame video preview, not a blank box", () => {
  const data: ResolveResponse = {
    id: "DbKoX9xTgPz",
    author: "Instagram",
    handle: "DbKoX9xTgPz",
    avatar_url: null,
    text: "",
    items: [{ index: 1, kind: "video", thumbnail: null, duration_seconds: 37,
      variants: [{ label: "hd", width: null, height: null, url: "https://scontent.cdninstagram.com/x.mp4", size_bytes: null }] }],
  };
  const { container } = render(<PreviewCard data={data} platform="instagram" />);
  const video = container.querySelector("video");
  expect(video).not.toBeNull();
  expect(video).toHaveAttribute("src", "https://scontent.cdninstagram.com/x.mp4#t=0.001");
  expect(video).toHaveAttribute("preload", "metadata");
  expect(video?.muted).toBe(true);
});

test("thumbnail-bearing video keeps the img preview, no video element", () => {
  const { container } = render(<PreviewCard data={{ ...DATA, items: [DATA.items[0]] }} />);
  expect(container.querySelector("video")).toBeNull();
  expect(container.querySelector('img[src="https://pbs.twimg.com/t1.jpg"]')).not.toBeNull();
});

// The follow popup lives in QualityButton (its own tests cover the flow). These
// pin the card's side: every video and GIF save button goes through it, in the
// page's language, and the photo and sound buttons do not.
test.each([
  { locale: "es", strings: esShared, title: "Sígueme en X", download: "Descargar" },
  { locale: "hi", strings: hiShared, title: "X पर मुझे फ़ॉलो करें", download: "डाउनलोड करें" },
])("$locale video save buttons open the popup in that language", async ({ strings, title, download }) => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 204 })));
  render(<PreviewCard data={DATA} strings={strings} />);
  await userEvent.click(screen.getByRole("button", { name: /1280×720/ }));
  const dialog = screen.getByRole("dialog", { name: title });
  expect(within(dialog).getByRole("button", { name: download })).toHaveFocus();
});

test("GIF save buttons open the popup too", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 204 })));
  render(<PreviewCard data={DATA} />);
  await userEvent.click(screen.getByRole("button", { name: /480×480/ }));
  expect(screen.getByRole("dialog", { name: "Follow me on X" })).toBeInTheDocument();
});

test("photo and sound buttons stay direct: no popup, the save starts at once", async () => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    if (String(input).startsWith("https://")) {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2, 3]));
          controller.close();
        },
      });
      return new Response(stream, { status: 200, headers: { "content-length": "3" } });
    }
    return new Response(null, { status: 204 });
  });
  vi.stubGlobal("fetch", fetchMock);
  const media = (index: number, kind: "image" | "audio", url: string): MediaItem => ({
    index,
    kind,
    thumbnail: null,
    duration_seconds: null,
    variants: [{ label: kind, width: null, height: null, url, size_bytes: 3 }],
  });
  const slideshow: ResolveResponse = {
    id: "7300000000000000001",
    author: "Slides",
    handle: "slides",
    avatar_url: null,
    text: "",
    items: [
      media(1, "image", "https://p16-sign.tiktokcdn.com/p1.jpeg"),
      media(99, "audio", "https://sf16.tiktokcdn.com/track.mp3"),
    ],
  };
  render(<PreviewCard data={slideshow} platform="tiktok" />);
  const downloads = () => fetchMock.mock.calls.filter(([url]) => String(url) !== "/api/event");

  await userEvent.click(screen.getByRole("button", { name: "Save photo 1" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(downloads()).toHaveLength(1);

  await userEvent.click(screen.getByRole("button", { name: "Sound" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(downloads()).toHaveLength(2);
});

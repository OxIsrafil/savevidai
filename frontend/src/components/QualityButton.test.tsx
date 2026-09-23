import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import type { Variant } from "../lib/api";
import { QualityButton } from "./QualityButton";

afterEach(() => vi.unstubAllGlobals());

const variant: Variant = {
  label: "720p",
  width: 1280,
  height: 720,
  url: "https://video.twimg.com/v.mp4",
  size_bytes: 3,
};

function stubProxyAndBeacon() {
  return vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    if (String(input).startsWith("/api/proxy")) {
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
}

// A save click opens the follow popup; the download starts from its Download button.
async function saveThroughPopup() {
  await userEvent.click(screen.getByRole("button", { name: /1280×720/ }));
  await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Download" }));
}

test("a save click opens the follow popup and starts no download", async () => {
  const fetchMock = stubProxyAndBeacon();
  vi.stubGlobal("fetch", fetchMock);
  render(<QualityButton variant={variant} filename="f.mp4" />);
  const save = screen.getByRole("button", { name: /1280×720/ });
  expect(save).toHaveAttribute("aria-haspopup", "dialog");
  await userEvent.click(save);
  expect(screen.getByRole("dialog", { name: "Follow me on X" })).toBeInTheDocument();
  // No proxy fetch and no download beacon: nothing has started yet.
  expect(fetchMock).not.toHaveBeenCalled();
  expect(save).toHaveAttribute("data-phase", "idle");
});

test("Download closes the popup and starts exactly one download of that variant", async () => {
  const fetchMock = stubProxyAndBeacon();
  vi.stubGlobal("fetch", fetchMock);
  render(<QualityButton variant={variant} filename="f.mp4" />);
  await saveThroughPopup();
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(await screen.findByText("Saved")).toBeInTheDocument();
  const proxied = fetchMock.mock.calls.filter(([url]) => String(url).startsWith("/api/proxy"));
  expect(proxied.map(([url]) => String(url))).toEqual([
    `/api/proxy?url=${encodeURIComponent(variant.url)}&filename=f.mp4`,
  ]);
  const beacons = fetchMock.mock.calls.filter(([url]) => String(url) === "/api/event");
  expect(beacons).toHaveLength(1);
});

test("focus moves to Download on open and back to the save button after Download", async () => {
  vi.stubGlobal("fetch", stubProxyAndBeacon());
  render(<QualityButton variant={variant} filename="f.mp4" />);
  const save = screen.getByRole("button", { name: /1280×720/ });
  await userEvent.click(save);
  expect(within(screen.getByRole("dialog")).getByRole("button", { name: "Download" })).toHaveFocus();
  await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Download" }));
  expect(save).toHaveFocus();
});

test.each([
  ["Escape", async () => userEvent.keyboard("{Escape}")],
  ["the close button", async () => userEvent.click(screen.getByRole("button", { name: "Close" }))],
  ["a backdrop click", async () => userEvent.click(screen.getByTestId("follow-popup-backdrop"))],
])("%s closes the popup, downloads nothing and returns focus to the save button", async (_how, act) => {
  const fetchMock = stubProxyAndBeacon();
  vi.stubGlobal("fetch", fetchMock);
  render(<QualityButton variant={variant} filename="f.mp4" />);
  const save = screen.getByRole("button", { name: /1280×720/ });
  await userEvent.click(save);
  await act();
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(fetchMock).not.toHaveBeenCalled();
  expect(save).toHaveAttribute("data-phase", "idle");
  expect(save).toHaveFocus();
});

test("a click while the download runs does not reopen the popup", async () => {
  let finish = () => {};
  const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    if (String(input).startsWith("/api/proxy")) {
      const stream = new ReadableStream({
        start(controller) {
          finish = () => {
            controller.enqueue(new Uint8Array([1, 2, 3]));
            controller.close();
          };
        },
      });
      return new Response(stream, { status: 200, headers: { "content-length": "3" } });
    }
    return new Response(null, { status: 204 });
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<QualityButton variant={variant} filename="f.mp4" />);
  await saveThroughPopup();
  const save = screen.getByRole("button", { name: /downloading|%/ });
  expect(save).toHaveAttribute("data-phase", "downloading");
  await userEvent.click(save);
  expect(screen.queryByRole("dialog")).toBeNull();
  finish();
  expect(await screen.findByText("Saved")).toBeInTheDocument();
});

test("fires a download beacon with the quality label when the download starts", async () => {
  const fetchMock = stubProxyAndBeacon();
  vi.stubGlobal("fetch", fetchMock);
  render(<QualityButton variant={variant} filename="f.mp4" />);
  await saveThroughPopup();
  const beaconCall = fetchMock.mock.calls.find(([url]) => String(url) === "/api/event");
  expect(beaconCall).toBeTruthy();
  expect(JSON.parse(String(beaconCall?.[1]?.body))).toEqual({
    type: "download",
    quality: "720p",
    platform: "twitter",
  });
});

test("threads the platform into the download beacon", async () => {
  const fetchMock = stubProxyAndBeacon();
  vi.stubGlobal("fetch", fetchMock);
  render(<QualityButton variant={variant} filename="f.mp4" platform="tiktok" />);
  await saveThroughPopup();
  const beaconCall = fetchMock.mock.calls.find(([url]) => String(url) === "/api/event");
  expect(JSON.parse(String(beaconCall?.[1]?.body))).toEqual({
    type: "download",
    quality: "720p",
    platform: "tiktok",
  });
});

test("download beacon failure does not block or alter the download", async () => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    if (String(input).startsWith("/api/proxy")) {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2, 3]));
          controller.close();
        },
      });
      return new Response(stream, { status: 200, headers: { "content-length": "3" } });
    }
    throw new Error("blocked by ad-blocker");
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<QualityButton variant={variant} filename="f.mp4" />);
  await saveThroughPopup();
  expect(await screen.findByText("Saved")).toBeInTheDocument();
});

test("hd label without dimensions shows uppercase HD text and no redundant chip", () => {
  render(
    <QualityButton
      variant={{ label: "hd", width: null, height: null, url: "https://v16m.tiktokcdn-us.com/x.mp4", size_bytes: 1000 }}
      filename="user_1_hd.mp4"
      platform="tiktok"
    />,
  );
  // The pill text is the uppercased label, and there is no separate HD chip,
  // so "HD" appears exactly once (no doubled-up "HD HD").
  expect(screen.getAllByText("HD")).toHaveLength(1);
  // Lowercase "hd" is display-only uppercased; it must not appear.
  expect(screen.queryByText("hd")).not.toBeInTheDocument();
});

test("dimensioned hd variant shows the WxH text plus the HD chip", () => {
  render(
    <QualityButton
      variant={{ label: "1080p", width: 1920, height: 1080, url: "https://video.twimg.com/x.mp4", size_bytes: 1000 }}
      filename="v.mp4"
    />,
  );
  // Real dimensions render as text and still carry the small HD chip.
  expect(screen.getByText("1920×1080")).toBeInTheDocument();
  expect(screen.getByText("HD")).toBeInTheDocument();
});

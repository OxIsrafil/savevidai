import { render, screen } from "@testing-library/react";
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

test("fires a download beacon with the quality label when the download starts", async () => {
  const fetchMock = stubProxyAndBeacon();
  vi.stubGlobal("fetch", fetchMock);
  render(<QualityButton variant={variant} filename="f.mp4" />);
  await userEvent.click(screen.getByRole("button"));
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
  await userEvent.click(screen.getByRole("button"));
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
  await userEvent.click(screen.getByRole("button"));
  expect(await screen.findByText("Saved")).toBeInTheDocument();
});

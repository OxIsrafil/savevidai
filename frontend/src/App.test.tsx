import { StrictMode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import App from "./App";

afterEach(() => vi.unstubAllGlobals());

const BODY = {
  id: "20", author: "Jack", handle: "jack", avatar_url: null, text: "hi",
  items: [{ index: 1, kind: "video", thumbnail: null, duration_seconds: 3,
    variants: [{ label: "720p", width: 1280, height: 720, url: "https://video.twimg.com/v.mp4", size_bytes: 100 }] }],
};

test("fires exactly one visit beacon per page load, even with StrictMode's double-invoke", async () => {
  const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
    new Response(null, { status: 204 }),
  );
  vi.stubGlobal("fetch", fetchMock);
  render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  const visitCalls = fetchMock.mock.calls.filter(([url, init]) => {
    if (String(url) !== "/api/event") return false;
    const body = JSON.parse(String((init as RequestInit).body));
    return body.type === "visit";
  });
  expect(visitCalls).toHaveLength(1);
  const visitBody = JSON.parse(String((visitCalls[0][1] as RequestInit).body));
  expect(visitBody).toEqual({ type: "visit", platform: "twitter" });
});

test("links to the TikTok downloader page", () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 204 })));
  render(<App />);
  const tiktokLinks = screen
    .getAllByRole("link")
    .filter((el) => el.getAttribute("href") === "/tiktokvideodownloader");
  expect(tiktokLinks.length).toBeGreaterThan(0);
});

test("paste-to-card flow scrolls to the result and confirms on the button", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(BODY), { status: 200 })));
  const scrollSpy = vi
    .spyOn(Element.prototype, "scrollIntoView")
    .mockImplementation(() => {});
  render(<App />);
  await userEvent.type(screen.getByRole("textbox"), "https://x.com/jack/status/20");
  await userEvent.click(screen.getByRole("button", { name: /^fetch$/i }));
  expect(await screen.findByTestId("preview-card")).toBeInTheDocument();
  expect(screen.getByText("Jack")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /fetched/i })).toBeInTheDocument();
  await waitFor(() => expect(scrollSpy).toHaveBeenCalled());
  scrollSpy.mockRestore();
});

test("example chip resolves the showcase tweet and fills the input", async () => {
  const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
    new Response(JSON.stringify(BODY), { status: 200 }),
  );
  vi.stubGlobal("fetch", fetchMock);
  render(<App />);
  await userEvent.click(screen.getByRole("button", { name: /try an example/i }));
  expect(await screen.findByTestId("preview-card")).toBeInTheDocument();
  // Filter to the resolve call specifically: a visit beacon may also hit fetch
  // on mount, so the resolve request isn't guaranteed to be the first call.
  const call = fetchMock.mock.calls.find(([url]) => String(url) === "/api/resolve");
  expect(String(call?.[1]?.body)).toContain("/israfill/status/2077383034639094193");
  expect(screen.getByRole("textbox")).toHaveValue(
    "https://x.com/israfill/status/2077383034639094193",
  );
});

test("error flow shows honest message", async () => {
  vi.stubGlobal("fetch", vi.fn(async () =>
    new Response(JSON.stringify({ error: "no_video", message: "This post has no video." }), { status: 422 })));
  render(<App />);
  await userEvent.type(screen.getByRole("textbox"), "https://x.com/jack/status/21");
  await userEvent.click(screen.getByRole("button", { name: /fetch/i }));
  expect(await screen.findByRole("alert")).toHaveTextContent("no video");
});

test("ad slot is absent when flag is off", () => {
  render(<App />);
  expect(screen.queryByLabelText("sponsor")).not.toBeInTheDocument();
});

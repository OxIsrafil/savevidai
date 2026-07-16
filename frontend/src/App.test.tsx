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
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(BODY), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  render(<App />);
  await userEvent.click(screen.getByRole("button", { name: /try an example/i }));
  expect(await screen.findByTestId("preview-card")).toBeInTheDocument();
  const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  expect(String(call[1].body)).toContain("/israfill/status/2077383034639094193");
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

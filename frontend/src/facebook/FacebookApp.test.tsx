import { StrictMode } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import FacebookApp from "./FacebookApp";

afterEach(() => vi.unstubAllGlobals());

// Runs first on purpose: FacebookApp guards the visit beacon with a module-level
// flag, so it only fires on the first render of this module. Ordering this test
// ahead of any other render keeps it deterministic (mirrors InstagramApp.test.tsx).
test("fires exactly one visit beacon per page load, even with StrictMode's double-invoke", async () => {
  const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
    new Response(null, { status: 204 }),
  );
  vi.stubGlobal("fetch", fetchMock);
  render(
    <StrictMode>
      <FacebookApp />
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
  expect(visitBody).toMatchObject({ type: "visit", platform: "facebook" });
  expect(typeof visitBody.source).toBe("string");
  expect(typeof visitBody.visitor_kind).toBe("string");
});

test("renders the Facebook downloader page and marks itself active", () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 204 })));
  render(<FacebookApp />);
  expect(screen.getByRole("heading", { name: /facebook video downloader/i })).toBeInTheDocument();
  expect(screen.getByRole("textbox")).toHaveAttribute(
    "placeholder",
    expect.stringMatching(/facebook/i),
  );
  // PlatformLinks renders the active entry as a non-link span
  expect(screen.getByText("Facebook")).toHaveAttribute("aria-current", "page");
});

// Photo posts and private videos genuinely do not resolve, so the limit is
// stated in the hero, not only in the FAQ further down the page. Same wording
// as the FAQ answer in facebookvideodownloader.html.
test("states the videos-and-reels-only limit in the hero", () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 204 })));
  render(<FacebookApp />);
  expect(screen.getByText(/public videos and reels only/i)).toBeInTheDocument();
});

test("makes no watermark claim anywhere on the page", () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 204 })));
  const { container } = render(<FacebookApp />);
  expect(container.textContent).not.toMatch(/watermark/i);
});

// Exactly the shape backend/app/facebook.py returns: metadata-light, one item,
// one "hd" variant with no dimensions and no size, text carrying the og:title.
const RESOLVE_BODY = {
  id: "10153231379946729", author: "Facebook", handle: "10153231379946729",
  avatar_url: null, text: "NASA & friends",
  items: [{ index: 1, kind: "video", thumbnail: null, duration_seconds: 74,
    variants: [{ label: "hd", width: null, height: null,
      url: "https://video.fhan5-9.fna.fbcdn.net/o1/v/t2/f2/m412/clip.mp4", size_bytes: null }] }],
};

test("example chip resolves the showcase video and fills the input", async () => {
  const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
    new Response(JSON.stringify(RESOLVE_BODY), { status: 200 }),
  );
  vi.stubGlobal("fetch", fetchMock);
  render(<FacebookApp />);
  await userEvent.click(screen.getByRole("button", { name: /try an example/i }));
  expect(await screen.findByTestId("preview-card")).toBeInTheDocument();
  // Filter to the resolve call specifically: a visit beacon may also hit fetch
  // on mount, so the resolve request isn't guaranteed to be the first call.
  const call = fetchMock.mock.calls.find(([url]) => String(url) === "/api/resolve");
  expect(String(call?.[1]?.body)).toContain("/videos/10153231379946729");
  expect(screen.getByRole("textbox")).toHaveValue(
    "https://www.facebook.com/facebook/videos/10153231379946729",
  );
});

// The backend sends the post's og:title as `text`, so the card gets a real
// caption line even though facebook resolves are otherwise metadata-light.
test("renders the og:title caption and the single hd variant", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(RESOLVE_BODY), { status: 200 })));
  render(<FacebookApp />);
  await userEvent.click(screen.getByRole("button", { name: /try an example/i }));
  const card = await screen.findByTestId("preview-card");
  expect(within(card).getByText("NASA & friends")).toBeInTheDocument();
  // avatar_url is null -> initial fallback, not a broken <img>
  expect(within(card).queryByRole("img")).toBeNull();
  expect(within(card).getByText("1")).toBeInTheDocument();
  // the single hd variant falls back to its label for the button face
  expect(within(card).getByRole("button", { name: /hd/i })).toBeInTheDocument();
});

import { StrictMode } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import InstagramApp from "./InstagramApp";

afterEach(() => vi.unstubAllGlobals());

// Runs first on purpose: InstagramApp guards the visit beacon with a module-level
// flag, so it only fires on the first render of this module. Ordering this test
// ahead of any other render keeps it deterministic (mirrors TikTokApp.test.tsx).
test("fires exactly one visit beacon per page load, even with StrictMode's double-invoke", async () => {
  const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
    new Response(null, { status: 204 }),
  );
  vi.stubGlobal("fetch", fetchMock);
  render(
    <StrictMode>
      <InstagramApp />
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
  expect(visitBody).toMatchObject({ type: "visit", platform: "instagram" });
  expect(typeof visitBody.source).toBe("string");
  expect(typeof visitBody.visitor_kind).toBe("string");
});

test("renders the Instagram downloader page and marks itself active", () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 204 })));
  render(<InstagramApp />);
  expect(screen.getByRole("heading", { name: /instagram reel downloader/i })).toBeInTheDocument();
  expect(screen.getByRole("textbox")).toHaveAttribute(
    "placeholder",
    expect.stringMatching(/instagram/i),
  );
  // PlatformLinks renders the active entry as a non-link span
  expect(screen.getByText("Instagram")).toHaveAttribute("aria-current", "page");
});

// The carousel limit is real (kkinstagram has no index syntax), so it is stated
// in the hero, not only in the FAQ further down the page. Same wording as the
// FAQ answer in instagramvideodownloader.html.
test("states the carousel limit in the hero", () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 204 })));
  render(<InstagramApp />);
  expect(screen.getByText(/first photo or video only/i)).toBeInTheDocument();
});

test("makes no watermark claim anywhere on the page", () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 204 })));
  const { container } = render(<InstagramApp />);
  expect(container.textContent).not.toMatch(/watermark/i);
});

// Exactly the shape backend/app/instagram.py returns: metadata-light, one item,
// one "hd" variant with no dimensions and no size.
const RESOLVE_BODY = {
  id: "DbKoX9xTgPz", author: "Instagram", handle: "DbKoX9xTgPz", avatar_url: null, text: "",
  items: [{ index: 1, kind: "video", thumbnail: null, duration_seconds: 12,
    variants: [{ label: "hd", width: null, height: null,
      url: "https://scontent.cdninstagram.com/o1/v/t2/f2/m86/reel.mp4", size_bytes: null }] }],
};

test("example chip resolves the showcase reel and fills the input", async () => {
  const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
    new Response(JSON.stringify(RESOLVE_BODY), { status: 200 }),
  );
  vi.stubGlobal("fetch", fetchMock);
  render(<InstagramApp />);
  await userEvent.click(screen.getByRole("button", { name: /try an example/i }));
  expect(await screen.findByTestId("preview-card")).toBeInTheDocument();
  // Filter to the resolve call specifically: a visit beacon may also hit fetch
  // on mount, so the resolve request isn't guaranteed to be the first call.
  const call = fetchMock.mock.calls.find(([url]) => String(url) === "/api/resolve");
  expect(String(call?.[1]?.body)).toContain("/reel/DbKoX9xTgPz");
  expect(screen.getByRole("textbox")).toHaveValue("https://www.instagram.com/reel/DbKoX9xTgPz");
});

test("renders the metadata-light preview without an empty caption block", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(RESOLVE_BODY), { status: 200 })));
  render(<InstagramApp />);
  await userEvent.click(screen.getByRole("button", { name: /try an example/i }));
  const card = await screen.findByTestId("preview-card");
  // avatar_url is null -> initial fallback, not a broken <img>
  expect(within(card).queryByRole("img")).toBeNull();
  expect(within(card).getByText("D")).toBeInTheDocument();
  expect(within(card).getByText("@DbKoX9xTgPz")).toBeInTheDocument();
  // text is "" -> no caption paragraph at all
  expect(card.querySelector(".line-clamp-3")).toBeNull();
  // the single hd variant falls back to its label for the button face
  expect(within(card).getByRole("button", { name: /hd/i })).toBeInTheDocument();
});

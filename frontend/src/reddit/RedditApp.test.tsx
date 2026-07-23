import { StrictMode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import RedditApp from "./RedditApp";

afterEach(() => vi.unstubAllGlobals());

// Runs first on purpose: RedditApp guards the visit beacon with a module-level
// flag, so it only fires on the first render of this module. Ordering this test
// ahead of any other render keeps it deterministic (mirrors App.test.tsx).
test("fires exactly one visit beacon per page load, even with StrictMode's double-invoke", async () => {
  const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
    new Response(null, { status: 204 }),
  );
  vi.stubGlobal("fetch", fetchMock);
  render(
    <StrictMode>
      <RedditApp />
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
  expect(visitBody).toEqual({ type: "visit", platform: "reddit" });
});

test("renders the Reddit downloader page", () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 204 })));
  render(<RedditApp />);
  expect(screen.getByRole("heading", { name: /reddit video downloader/i })).toBeInTheDocument();
  expect(screen.getByRole("textbox")).toHaveAttribute("placeholder", expect.stringMatching(/reddit/i));
});

const RESOLVE_BODY = {
  id: "d8qo81", author: "user", handle: "user", avatar_url: null, text: "hi",
  items: [{ index: 1, kind: "video", thumbnail: null, duration_seconds: 3,
    variants: [{ label: "HD", width: 1280, height: 720, url: "https://v.redd.it/v.mp4", size_bytes: 100 }] }],
};

test("example chip resolves the showcase post and fills the input", async () => {
  const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
    new Response(JSON.stringify(RESOLVE_BODY), { status: 200 }),
  );
  vi.stubGlobal("fetch", fetchMock);
  render(<RedditApp />);
  await userEvent.click(screen.getByRole("button", { name: /try an example/i }));
  expect(await screen.findByTestId("preview-card")).toBeInTheDocument();
  // Filter to the resolve call specifically: a visit beacon may also hit fetch
  // on mount, so the resolve request isn't guaranteed to be the first call.
  const call = fetchMock.mock.calls.find(([url]) => String(url) === "/api/resolve");
  expect(String(call?.[1]?.body)).toContain(
    "/r/funny/comments/d8qo81/baby_crocodiles_sound_like_theyre_shooting_laser/",
  );
  expect(screen.getByRole("textbox")).toHaveValue(
    "https://www.reddit.com/r/funny/comments/d8qo81/baby_crocodiles_sound_like_theyre_shooting_laser/",
  );
});

import { cleanup, render, screen } from "@testing-library/react";
import type { ComponentType } from "react";
import App from "../App";
import TikTokApp from "../tiktok/TikTokApp";
import RedditApp from "../reddit/RedditApp";
import InstagramApp from "../instagram/InstagramApp";
import FacebookApp from "../facebook/FacebookApp";
// Raw shell sources, read straight off disk at test time (Vite's ?raw), so the
// assertions run against the files a crawler is served, not a build artifact.
import twitterShell from "../../index.html?raw";
import tiktokShell from "../../tiktokvideodownloader.html?raw";
import redditShell from "../../redditvideodownloader.html?raw";
import instagramShell from "../../instagramvideodownloader.html?raw";
import facebookShell from "../../facebookvideodownloader.html?raw";

// Every HTML shell ships a static hero snapshot inside #root so crawlers (and
// users on a slow/failed JS load) get the h1, the sub line and a working form
// without running React. React clears #root on mount and re-renders the same
// copy, so any drift between the two is a visible swap and a wrong h1 in the
// index. These pairs pin the shell copy to the component copy.
type Pair = [name: string, shell: string, Component: ComponentType];

const pairs: Pair[] = [
  ["twitter", twitterShell, App],
  ["tiktok", tiktokShell, TikTokApp],
  ["reddit", redditShell, RedditApp],
  ["instagram", instagramShell, InstagramApp],
  ["facebook", facebookShell, FacebookApp],
];

const norm = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim();

function shellRoot(shell: string) {
  const doc = new DOMParser().parseFromString(shell, "text/html");
  const root = doc.querySelector("#root");
  expect(root).not.toBeNull();
  return { doc, root: root as Element };
}

afterEach(cleanup);

test.each(pairs)("%s shell hero snapshot matches the mounted hero copy", (_name, shell, Component) => {
  const { root } = shellRoot(shell);

  const snapshot = root.querySelector(".hero-snapshot");
  expect(snapshot).not.toBeNull();
  // The container has to fill the viewport so React's mount-time swap of the
  // snapshot for the real hero shifts what is below it off-screen, never in view.
  expect((snapshot?.getAttribute("style") ?? "").replace(/\s+/g, "")).toContain("min-height:100vh");

  const snapshotH1 = root.querySelector("h1");
  const snapshotLede = root.querySelector(".lede");
  expect(snapshotH1).not.toBeNull();
  expect(snapshotLede).not.toBeNull();

  const { container } = render(<Component />);
  const mountedH1 = screen.getByRole("heading", { level: 1 });
  const mountedLede = container.querySelector(".lede");
  expect(mountedLede).not.toBeNull();

  expect(norm(snapshotH1?.textContent)).toBe(norm(mountedH1.textContent));
  expect(norm(snapshotLede?.textContent)).toBe(norm(mountedLede?.textContent));
});

test.each(pairs)("%s shell snapshot form works without JS and mirrors the React field", (_name, shell, Component) => {
  const { root } = shellRoot(shell);

  const form = root.querySelector("form");
  expect(form).not.toBeNull();
  // Pre-JS submit has to produce ?url=..., which every app resolves on boot.
  expect((form?.getAttribute("method") ?? "").toLowerCase()).toBe("get");
  // Empty action keeps that submit on the current page instead of sending the
  // link somewhere else, so the app that boots is the one that can resolve it.
  expect(form?.getAttribute("action")).toBe("");

  const input = form?.querySelector("input");
  expect(input).not.toBeNull();
  expect(input?.getAttribute("name")).toBe("url");
  expect(input?.getAttribute("type")).toBe("url");

  const submit = form?.querySelector("button");
  expect(submit?.getAttribute("type")).toBe("submit");
  expect(norm(submit?.textContent)).toBe("Fetch");

  render(<Component />);
  const mountedInput = screen.getByRole("textbox");
  expect(input?.getAttribute("placeholder")).toBe(mountedInput.getAttribute("placeholder"));
  expect(input?.getAttribute("aria-label")).toBe(mountedInput.getAttribute("aria-label"));
});

test.each(pairs)("%s shell carries exactly one h1 and no ad marker inside #root", (_name, shell) => {
  const { doc, root } = shellRoot(shell);

  // React replaces the snapshot h1, never adds a second one, so the built page
  // ships exactly one h1 both before and after mount.
  expect(doc.querySelectorAll("h1")).toHaveLength(1);
  expect(root.querySelectorAll("h1")).toHaveLength(1);

  // The ad marker line stays exactly once, outside the snapshot.
  expect(shell.split("<!--ADS-->")).toHaveLength(2);
  expect(root.innerHTML).not.toContain("<!--ADS-->");
});

import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { PlatformLinks } from "./PlatformLinks";

test("shows the active platform and links to the others", () => {
  render(<PlatformLinks active="twitter" />);
  const tiktok = screen.getByRole("link", { name: /tiktok/i });
  expect(tiktok).toHaveAttribute("href", "/tiktokvideodownloader");
  // active one is not a link
  expect(screen.queryByRole("link", { name: /twitter|x video/i })).toBeNull();
});

test("marks the active platform with aria-current and links the other way round", () => {
  render(<PlatformLinks active="tiktok" />);
  const twitter = screen.getByRole("link", { name: /twitter/i });
  expect(twitter).toHaveAttribute("href", "/");
  expect(screen.getByText(/tiktok/i)).toHaveAttribute("aria-current", "page");
});

test("renders a reddit link with the exact href from other pages", () => {
  render(<PlatformLinks active="twitter" />);
  const reddit = screen.getByRole("link", { name: /reddit/i });
  expect(reddit).toHaveAttribute("href", "/redditvideodownloader");
});

test("marks reddit active and links twitter and tiktok", () => {
  render(<PlatformLinks active="reddit" />);
  expect(screen.getByText(/reddit/i)).toHaveAttribute("aria-current", "page");
  expect(screen.getByRole("link", { name: /twitter/i })).toHaveAttribute("href", "/");
  expect(screen.getByRole("link", { name: /tiktok/i })).toHaveAttribute(
    "href",
    "/tiktokvideodownloader",
  );
});

test("renders an instagram link with the exact href on every other page", () => {
  for (const active of ["twitter", "tiktok", "reddit"] as const) {
    const { unmount } = render(<PlatformLinks active={active} />);
    expect(screen.getByRole("link", { name: /instagram/i })).toHaveAttribute(
      "href",
      "/instagramvideodownloader",
    );
    unmount();
  }
});

test("marks instagram active and links the other four", () => {
  render(<PlatformLinks active="instagram" />);
  expect(screen.getByText(/instagram/i)).toHaveAttribute("aria-current", "page");
  expect(screen.queryByRole("link", { name: /instagram/i })).toBeNull();
  expect(screen.getByRole("link", { name: /twitter/i })).toHaveAttribute("href", "/");
  expect(screen.getByRole("link", { name: /tiktok/i })).toHaveAttribute(
    "href",
    "/tiktokvideodownloader",
  );
  expect(screen.getByRole("link", { name: /reddit/i })).toHaveAttribute(
    "href",
    "/redditvideodownloader",
  );
  expect(screen.getByRole("link", { name: /facebook/i })).toHaveAttribute(
    "href",
    "/facebookvideodownloader",
  );
});

test("renders a facebook link with the exact href on every other page", () => {
  for (const active of ["twitter", "tiktok", "reddit", "instagram"] as const) {
    const { unmount } = render(<PlatformLinks active={active} />);
    expect(screen.getByRole("link", { name: /facebook/i })).toHaveAttribute(
      "href",
      "/facebookvideodownloader",
    );
    unmount();
  }
});

test("marks facebook active and links the other four", () => {
  render(<PlatformLinks active="facebook" />);
  expect(screen.getByText(/facebook/i)).toHaveAttribute("aria-current", "page");
  expect(screen.queryByRole("link", { name: /facebook/i })).toBeNull();
  expect(screen.getByRole("link", { name: /twitter/i })).toHaveAttribute("href", "/");
  expect(screen.getByRole("link", { name: /tiktok/i })).toHaveAttribute(
    "href",
    "/tiktokvideodownloader",
  );
  expect(screen.getByRole("link", { name: /reddit/i })).toHaveAttribute(
    "href",
    "/redditvideodownloader",
  );
  expect(screen.getByRole("link", { name: /instagram/i })).toHaveAttribute(
    "href",
    "/instagramvideodownloader",
  );
});

// Five platforms, no more: the nav is the full site map and a missing entry is
// a dead end for both crawlers and readers.
test("renders all five platform entries", () => {
  const { container } = render(<PlatformLinks active="facebook" />);
  expect(container.querySelectorAll(".platform-card")).toHaveLength(5);
});

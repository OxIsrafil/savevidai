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

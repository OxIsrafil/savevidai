import { render, screen } from "@testing-library/react";
import { beforeAll, expect, test } from "vitest";
import { FollowPopup } from "./FollowPopup";

// Its own file on purpose: motion reads prefers-reduced-motion once per module
// graph, and vitest gives each test file a fresh one. jsdom has no matchMedia,
// so this stands in for a browser with reduced motion switched on.
beforeAll(() => {
  window.matchMedia = (query: string) =>
    ({
      matches: query.includes("prefers-reduced-motion"),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
});

test("under prefers-reduced-motion the popup appears at once: no fade, no scale", () => {
  render(<FollowPopup onDownload={() => {}} onClose={() => {}} />);
  const dialog = screen.getByRole("dialog");
  expect(dialog.style.opacity).toBe("1");
  expect(dialog.style.transform).not.toContain("scale(0.96)");
  expect(screen.getByTestId("follow-popup-backdrop").style.opacity).toBe("1");
});

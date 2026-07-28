import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { InstagramHowToVisual } from "./InstagramHowToVisual";

test("renders the instagram how-to art", () => {
  render(<InstagramHowToVisual />);
  expect(screen.getAllByText(/instagram\.com\/reel/i).length).toBeGreaterThan(0);
  expect(screen.getAllByText(/straight from instagram/i).length).toBeGreaterThan(0);
});

test("shows only the single hd quality instagram actually returns, and claims no watermark", () => {
  const { container } = render(<InstagramHowToVisual />);
  expect(container.textContent).not.toMatch(/watermark/i);
  expect(container.textContent).not.toMatch(/\bSD\b/);
});

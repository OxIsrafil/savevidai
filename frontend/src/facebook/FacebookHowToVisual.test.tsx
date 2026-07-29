import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { FacebookHowToVisual } from "./FacebookHowToVisual";

test("renders the facebook how-to art", () => {
  render(<FacebookHowToVisual />);
  expect(screen.getAllByText(/facebook\.com\/watch/i).length).toBeGreaterThan(0);
  expect(screen.getAllByText(/straight from facebook/i).length).toBeGreaterThan(0);
});

test("shows only the single hd quality facebook actually returns, and claims no watermark", () => {
  const { container } = render(<FacebookHowToVisual />);
  expect(container.textContent).not.toMatch(/watermark/i);
  expect(container.textContent).not.toMatch(/\bSD\b/);
});

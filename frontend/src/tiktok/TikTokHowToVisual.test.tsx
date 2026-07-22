import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { TikTokHowToVisual } from "./TikTokHowToVisual";

test("renders the tiktok how-to art", () => {
  render(<TikTokHowToVisual />);
  expect(screen.getAllByText(/tiktok\.com\/@user/i).length).toBeGreaterThan(0);
  expect(screen.getAllByText(/no watermark/i).length).toBeGreaterThan(0);
});

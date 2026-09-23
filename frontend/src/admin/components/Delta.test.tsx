import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { Delta } from "./Delta";

test("renders nothing for null", () => {
  const { container } = render(<Delta value={null} compare="the 7 days before" />);
  expect(container).toBeEmptyDOMElement();
});

test("a rounded 0% is plain muted text without a pill, still titled", () => {
  render(<Delta value={0.004} compare="the 7 days before" />);
  const el = screen.getByText("0%");
  expect(el).toHaveAttribute("title", "Compared with the 7 days before");
  expect(el.className).not.toContain("rounded-full");
  expect(el.className).toContain("text-text-muted");
});

test("up is green with a plus, down is red, inverted flips the colours", () => {
  const { rerender } = render(<Delta value={0.123} compare="yesterday at this time" />);
  let pill = screen.getByText("+12%");
  expect(pill).toHaveAttribute("title", "Compared with yesterday at this time");
  expect(pill.className).toContain("text-success");
  expect(pill.className).toContain("rounded-full");
  rerender(<Delta value={-0.0664} />);
  pill = screen.getByText("-7%");
  expect(pill.className).toContain("text-danger");
  expect(pill).not.toHaveAttribute("title");
  rerender(<Delta value={0.2} invert />);
  expect(screen.getByText("+20%").className).toContain("text-danger");
  rerender(<Delta value={-0.2} invert />);
  expect(screen.getByText("-20%").className).toContain("text-success");
});

import { render, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import { SegmentBar } from "./SegmentBar";

const SEGMENTS = [
  { key: "ok", label: "Worked", value: 257, color: "#30d158" },
  { key: "not_found", label: "Deleted or missing", value: 15, color: "#8e8e93" },
  { key: "invalid_url", label: "Not a supported link", value: 5, color: "#ff9f0a" },
  { key: "no_video", label: "No video in the post", value: 0, color: "#ffd60a" },
];

test("segments by share with native titles and a 4px minimum, plus a legend with counts and percents", () => {
  const { container } = render(<SegmentBar empty="No links pasted in this range yet" segments={SEGMENTS} />);
  const bars = container.querySelectorAll("[title]");
  expect(Array.from(bars).map((b) => b.getAttribute("title"))).toEqual(["Worked: 257", "Deleted or missing: 15", "Not a supported link: 5"]);
  expect((bars[0] as HTMLElement).style.minWidth).toBe("4px");
  expect(parseFloat((bars[0] as HTMLElement).style.width)).toBeCloseTo((257 / 277) * 100, 1);
  const items = screen.getAllByRole("listitem");
  expect(items).toHaveLength(4);
  expect(within(items[0]).getByText("Worked")).toBeInTheDocument();
  expect(within(items[0]).getByText("257")).toBeInTheDocument();
  expect(within(items[0]).getByText("93%")).toBeInTheDocument();
  expect(within(items[1]).getByText("5.4%")).toBeInTheDocument();
  expect(within(items[2]).getByText("1.8%")).toBeInTheDocument();
  expect(within(items[3]).getByText("0%")).toBeInTheDocument();
});

test("empty when every segment is zero", () => {
  render(<SegmentBar empty="No links pasted in this range yet" segments={[{ key: "ok", label: "Worked", value: 0, color: "#30d158" }]} />);
  expect(screen.getByText("No links pasted in this range yet")).toBeInTheDocument();
});

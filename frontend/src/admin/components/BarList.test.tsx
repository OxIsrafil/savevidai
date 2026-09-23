import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { formatCount, qualityLabel } from "../lib/format";
import { REPORT_7D } from "../test/fixtures";
import { BarList } from "./BarList";

const ROWS = REPORT_7D.qualities.map((q) => ({ key: q.quality, label: qualityLabel(q.quality), value: q.count, display: formatCount(q.count) }));

test("rows with label, figure and a 6px bar sized against the largest row", () => {
  const { container } = render(<BarList rows={ROWS.slice(0, 3)} empty="Nothing saved in this range yet" color="#bf5af2" />);
  const items = screen.getAllByRole("listitem");
  expect(items).toHaveLength(3);
  expect(within(items[0]).getByText("1080p")).toBeInTheDocument();
  expect(within(items[0]).getByText("1,102")).toBeInTheDocument();
  expect(within(items[2]).getByText("HD")).toBeInTheDocument();
  const bars = container.querySelectorAll("li > div:last-child > div");
  expect((bars[0] as HTMLElement).style.width).toBe("100%");
  expect(parseFloat((bars[1] as HTMLElement).style.width)).toBeCloseTo((618 / 1102) * 100, 1);
  expect(container.querySelector("li > div:last-child")?.className).toContain("h-1.5");
});

test("folds after the limit behind Show all (n) and back", async () => {
  render(<BarList rows={ROWS} empty="Nothing saved in this range yet" limit={8} />);
  expect(screen.getAllByRole("listitem")).toHaveLength(8);
  expect(screen.queryByText("360p")).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Show all (9)" }));
  expect(screen.getAllByRole("listitem")).toHaveLength(9);
  expect(screen.getByText("360p")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Show less" }));
  expect(screen.getAllByRole("listitem")).toHaveLength(8);
});

test("no fold button at or under the limit; the empty state without rows; a muted row", () => {
  const { rerender } = render(<BarList rows={ROWS.slice(0, 8)} empty="Nothing saved in this range yet" limit={8} />);
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  rerender(<BarList rows={[]} empty="Nothing saved in this range yet" limit={8} />);
  expect(screen.getByText("Nothing saved in this range yet")).toBeInTheDocument();
  rerender(<BarList rows={[{ key: "unknown", label: "Not known", value: 290, display: "290", muted: true }]} empty="x" />);
  expect(screen.getByText("Not known").className).toContain("text-text-muted");
});

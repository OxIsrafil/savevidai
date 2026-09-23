import { render, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import { SERIES } from "../lib/colors";
import { formatCount, formatShare, platformName } from "../lib/format";
import { ratio } from "../lib/metrics";
import { REPORT_7D } from "../test/fixtures";
import { Donut } from "./Donut";

const SLICES = REPORT_7D.platforms.map((p, i) => ({
  key: p.platform,
  label: platformName(p.platform),
  value: p.fetches,
  color: SERIES[i],
  display: formatCount(p.fetches),
  hint: `${formatShare(ratio(p.ok, p.fetches))} worked`,
}));

test("a fixed 176px ring with the total in the centre and a legend of name, fetches, percent and worked share", () => {
  const { container } = render(<Donut slices={SLICES} center={{ value: "2,812", label: "fetches" }} empty="No links pasted in this range yet" />);
  expect(container.querySelectorAll(".recharts-pie-sector")).toHaveLength(5);
  expect(container.querySelector("svg")?.getAttribute("width")).toBe("176");
  expect(container.querySelector("[aria-hidden='true'] svg")).not.toBeNull();
  expect(screen.getByText("2,812")).toBeInTheDocument();
  expect(screen.getByText("fetches")).toBeInTheDocument();
  const items = screen.getAllByRole("listitem");
  expect(items).toHaveLength(5);
  expect(within(items[0]).getByText("X (Twitter)")).toBeInTheDocument();
  expect(within(items[0]).getByText("1,684")).toBeInTheDocument();
  expect(within(items[0]).getByText("60%")).toBeInTheDocument();
  expect(within(items[0]).getByText("92% worked")).toBeInTheDocument();
  expect(within(items[3]).getByText("5.0%")).toBeInTheDocument();
  expect(within(items[4]).getByText("2.7%")).toBeInTheDocument();
});

test("the hidden ring is no tab stop: aria-hidden content must not take focus", () => {
  const { container } = render(<Donut slices={SLICES} center={{ value: "2,812", label: "fetches" }} empty="No links pasted in this range yet" />);
  const chart = container.querySelector("[aria-hidden='true'] svg") as SVGSVGElement;
  expect(chart).not.toBeNull();
  const stops = [chart, ...Array.from(chart.querySelectorAll("[tabindex]"))]
    .filter((el) => el.hasAttribute("tabindex") && el.getAttribute("tabindex") !== "-1")
    .map((el) => `${el.tagName} tabindex=${el.getAttribute("tabindex")}`);
  expect(stops).toEqual([]);
});

test("empty when there are no fetches", () => {
  render(<Donut slices={[]} center={{ value: "0", label: "fetches" }} empty="No links pasted in this range yet" />);
  expect(screen.getByText("No links pasted in this range yet")).toBeInTheDocument();
});

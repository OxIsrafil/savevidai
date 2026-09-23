import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { EMPTY_REPORT, REPORT_7D, REPORT_TODAY } from "../test/fixtures";
import { HoursChart } from "./HoursChart";

test("names the busiest hour, titles every bar, fades the others, and counts quiet hours", () => {
  const { container } = render(<HoursChart hours={REPORT_TODAY.hours} empty="No links pasted in this range yet" />);
  expect(screen.getByText("12:00 to 13:00")).toBeInTheDocument();
  expect(screen.getByText("busiest, 40 fetches. 10 hours had none")).toBeInTheDocument();
  const bars = container.querySelectorAll("[title]");
  expect(bars).toHaveLength(24);
  expect(bars[12].getAttribute("title")).toBe("12:00, 40 fetches");
  expect(bars[0].getAttribute("title")).toBe("00:00, 14 fetches");
  const fills = container.querySelectorAll("[title] > div");
  expect((fills[12] as HTMLElement).style.height).toBe("100%");
  expect((fills[12] as HTMLElement).style.opacity).toBe("1");
  expect(parseFloat((fills[11] as HTMLElement).style.opacity)).toBeCloseTo(0.3 + 0.5 * (37 / 40), 3);
  expect((fills[20] as HTMLElement).style.height).toBe("2.5%");
  expect((fills[20] as HTMLElement).style.opacity).toBe("1");
  expect(screen.getByText("00")).toBeInTheDocument();
  expect(screen.getByText("06")).toBeInTheDocument();
  expect(screen.getByText("23")).toBeInTheDocument();
});

test("no quiet-hours sentence when every hour had a fetch; the empty state when none did", () => {
  const { rerender } = render(<HoursChart hours={REPORT_7D.hours} empty="No links pasted in this range yet" />);
  expect(screen.getByText("14:00 to 15:00")).toBeInTheDocument();
  expect(screen.getByText("busiest, 196 fetches")).toBeInTheDocument();
  rerender(<HoursChart hours={EMPTY_REPORT.hours} empty="No links pasted in this range yet" />);
  expect(screen.getByText("No links pasted in this range yet")).toBeInTheDocument();
});

test("a faded column goes solid on hover: the fade is an inline style, so the hover opacity must be important", () => {
  const { container } = render(<HoursChart hours={REPORT_TODAY.hours} empty="No links pasted in this range yet" />);
  const column = container.querySelectorAll("[title]")[11] as HTMLElement;
  const fill = column.firstElementChild as HTMLElement;
  expect(parseFloat(fill.style.opacity)).toBeLessThan(1);
  expect(column.className.split(" ")).toContain("group");
  expect(fill.className.split(" ")).toContain("group-hover:opacity-100!");
});

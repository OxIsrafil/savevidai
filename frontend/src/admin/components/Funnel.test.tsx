import { render, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import { Funnel } from "./Funnel";

test("four numbered steps, the share kept from the step before, bars against step one fading 0.15 per step", () => {
  const { container } = render(
    <Funnel
      steps={[
        { label: "Visitors", value: 1742 },
        { label: "Pasted a link", value: 1388 },
        { label: "Got a result", value: 1296 },
        { label: "Downloaded", value: 1187 },
      ]}
    />,
  );
  const items = screen.getAllByRole("listitem");
  expect(items).toHaveLength(4);
  expect(within(items[0]).getByText("1")).toBeInTheDocument();
  expect(within(items[0]).getByText("Visitors")).toBeInTheDocument();
  expect(within(items[0]).getByText("1,742")).toBeInTheDocument();
  expect(within(items[0]).queryByText(/%/)).not.toBeInTheDocument();
  expect(within(items[1]).getByText("80%")).toBeInTheDocument();
  expect(within(items[2]).getByText("93%")).toBeInTheDocument();
  expect(within(items[3]).getByText("92%")).toBeInTheDocument();
  const bars = container.querySelectorAll("li > div:last-child > div");
  expect(bars).toHaveLength(4);
  expect((bars[0] as HTMLElement).style.width).toBe("100%");
  expect(parseFloat((bars[3] as HTMLElement).style.width)).toBeCloseTo((1187 / 1742) * 100, 1);
  expect(parseFloat((bars[3] as HTMLElement).style.opacity)).toBeCloseTo(0.55, 5);
});

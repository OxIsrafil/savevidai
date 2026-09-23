import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { MiniStats } from "./MiniStats";

test("two or three tinted tiles with label and figure; a tone colours the figure", () => {
  const { container, rerender } = render(
    <MiniStats
      items={[
        { label: "Worked", value: "91%", tone: "#30d158" },
        { label: "Deleted or missing", value: "163" },
        { label: "Failed on our side", value: "17" },
      ]}
    />,
  );
  expect(container.querySelector("dl")?.className).toContain("grid-cols-3");
  expect(screen.getByText("Worked")).toBeInTheDocument();
  expect(screen.getByText("91%")).toHaveStyle({ color: "#30d158" });
  expect(screen.getByText("163")).not.toHaveAttribute("style");
  expect(screen.getByText("163").closest("div")?.className).toContain("rounded-tile");
  rerender(<MiniStats items={[{ label: "A", value: "1" }, { label: "B", value: "2" }]} />);
  expect(container.querySelector("dl")?.className).toContain("grid-cols-2");
});

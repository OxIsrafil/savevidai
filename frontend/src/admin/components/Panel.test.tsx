import { render, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import { EmptyState } from "./EmptyState";
import { Panel } from "./Panel";

test("a titled region with a hint and its content; the empty state is a dashed 28px box", () => {
  render(
    <Panel title="Countries" hint="Where visitors are">
      <EmptyState text="No visitors in this range yet" />
    </Panel>,
  );
  const region = screen.getByRole("region", { name: "Countries" });
  expect(within(region).getByRole("heading", { level: 2, name: "Countries" })).toBeInTheDocument();
  expect(within(region).getByText("Where visitors are")).toBeInTheDocument();
  const empty = within(region).getByText("No visitors in this range yet");
  expect(empty.className).toContain("border-dashed");
  expect(empty.className).toContain("rounded-tile");
  expect(empty.className).toContain("min-h-24");
});

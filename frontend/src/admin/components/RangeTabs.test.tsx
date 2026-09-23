import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { RangeTabs } from "./RangeTabs";

test("four pressed-state buttons in order; clicking one reports its key", async () => {
  const onChange = vi.fn();
  render(<RangeTabs active="7d" onChange={onChange} />);
  const group = screen.getByRole("group", { name: "Date range" });
  const buttons = within(group).getAllByRole("button");
  expect(buttons.map((b) => b.textContent)).toEqual(["Today", "7 days", "30 days", "90 days"]);
  expect(screen.getByRole("button", { name: "7 days" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "Today" })).toHaveAttribute("aria-pressed", "false");
  await userEvent.click(screen.getByRole("button", { name: "30 days" }));
  expect(onChange).toHaveBeenCalledWith("30d");
});

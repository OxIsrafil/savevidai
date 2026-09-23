import { render, screen } from "@testing-library/react";
import { CircleCheck } from "lucide-react";
import { expect, test } from "vitest";
import { COLORS } from "../lib/colors";
import { Kpi } from "./Kpi";

test("label, figure, delta and note", () => {
  render(<Kpi icon={CircleCheck} color={COLORS.green} label="Success rate" value="91%" sub="links that returned media" delta={0.0164} compare="the 7 days before" />);
  expect(screen.getByText("Success rate")).toBeInTheDocument();
  expect(screen.getByText("91%")).toBeInTheDocument();
  expect(screen.getByText("+2%")).toHaveAttribute("title", "Compared with the 7 days before");
  expect(screen.getByText("links that returned media")).toBeInTheDocument();
});

test("no delta and no note when absent; an inverted rise reads bad", () => {
  const { rerender } = render(<Kpi icon={CircleCheck} color={COLORS.yellow} label="Peak at once" value="-" />);
  expect(screen.getByText("-")).toBeInTheDocument();
  expect(screen.queryByText(/%$/)).not.toBeInTheDocument();
  rerender(<Kpi icon={CircleCheck} color={COLORS.red} label="Resolver errors" value="17" sub="failures on our side" delta={0.5} invert />);
  expect(screen.getByText("+50%").className).toContain("text-danger");
});

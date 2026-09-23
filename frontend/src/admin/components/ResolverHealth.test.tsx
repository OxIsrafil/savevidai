import { render, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import { RESOLVERS } from "../test/fixtures";
import { ResolverHealth } from "./ResolverHealth";

test("five rows with lookups, a coloured success rate, the top failure and the last failure", () => {
  render(<ResolverHealth data={RESOLVERS} failed={false} />);
  const region = screen.getByRole("region", { name: "Last 24 hours" });
  expect(within(region).getByText("Resolver errors mean the service we use failed, not the visitor's link")).toBeInTheDocument();
  const rows = within(region).getAllByRole("listitem");
  expect(rows).toHaveLength(5);
  expect(within(rows[0]).getByText("X (Twitter)")).toBeInTheDocument();
  expect(within(rows[0]).getByText("574 lookups, Deleted or missing 31, last failed 12 min ago")).toBeInTheDocument();
  expect(within(rows[0]).getByText("93%")).toHaveStyle({ color: "#30d158" });
  expect(within(rows[1]).getByText("TikTok")).toBeInTheDocument();
  expect(within(rows[1]).getByText("89%")).toHaveStyle({ color: "#ffd60a" });
  expect(within(rows[2]).getByText("46 lookups, No video in the post 3, last failed 3 h ago")).toBeInTheDocument();
  expect(within(rows[3]).getByText("67%")).toHaveStyle({ color: "#ff453a" });
  expect(within(rows[3]).getByText("101 lookups, Private or restricted 21, last failed just now")).toBeInTheDocument();
  expect(within(rows[4]).getByText("Facebook")).toBeInTheDocument();
  expect(within(rows[4]).getByText("0 lookups")).toBeInTheDocument();
  expect(within(rows[4]).getByText("No lookups")).toBeInTheDocument();
  expect(within(rows[4]).queryByText(/%$/)).not.toBeInTheDocument();
});

test("says Loading before data and Could not load resolver health after a failure", () => {
  const { rerender } = render(<ResolverHealth data={null} failed={false} />);
  expect(screen.getByText("Loading")).toBeInTheDocument();
  rerender(<ResolverHealth data={null} failed />);
  expect(screen.getByText("Could not load resolver health")).toBeInTheDocument();
  expect(screen.queryByText("Loading")).not.toBeInTheDocument();
});

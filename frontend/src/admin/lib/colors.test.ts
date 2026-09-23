import { expect, test } from "vitest";
import { COLORS, outcomeColor, SERIES, SURFACE, tint } from "./colors";

test("the palette is verbatim from the premium store", () => {
  expect(COLORS).toEqual({
    blue: "#0a84ff",
    green: "#30d158",
    orange: "#ff9f0a",
    purple: "#bf5af2",
    teal: "#64d2ff",
    pink: "#ff375f",
    yellow: "#ffd60a",
    indigo: "#5e5ce6",
    red: "#ff453a",
    gray: "#8e8e93",
  });
  expect(SERIES).toEqual([COLORS.blue, COLORS.green, COLORS.orange, COLORS.purple, COLORS.teal, COLORS.pink, COLORS.yellow, COLORS.indigo]);
  expect(SURFACE).toBe("#1d1d1f");
});

test("tint is the colour at 15% by default", () => {
  expect(tint("#0a84ff")).toBe("rgba(10, 132, 255, 0.15)");
  expect(tint("#30d158", 0.16)).toBe("rgba(48, 209, 88, 0.16)");
  expect(tint("not-a-colour")).toBe("not-a-colour");
});

test("outcome colours follow the spec and unknown outcomes are gray", () => {
  expect(outcomeColor("ok")).toBe(COLORS.green);
  expect(outcomeColor("not_found")).toBe(COLORS.gray);
  expect(outcomeColor("invalid_url")).toBe(COLORS.orange);
  expect(outcomeColor("no_video")).toBe(COLORS.yellow);
  expect(outcomeColor("private_or_restricted")).toBe(COLORS.purple);
  expect(outcomeColor("upstream_error")).toBe(COLORS.red);
  expect(outcomeColor("unsupported_post")).toBe(COLORS.pink);
  expect(outcomeColor("not_configured")).toBe(COLORS.indigo);
  expect(outcomeColor("something_else")).toBe(COLORS.gray);
});

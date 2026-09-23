import { expect, test } from "vitest";
import { change, compareLabel } from "./delta";

test("change is null with no previous period", () => {
  expect(change(10, null)).toBeNull();
  expect(change(10, undefined)).toBeNull();
});

test("change against a zero previous is 0 for 0 and null otherwise", () => {
  expect(change(0, 0)).toBe(0);
  expect(change(5, 0)).toBeNull();
});

test("change is the relative difference", () => {
  expect(change(120, 100)).toBeCloseTo(0.2);
  expect(change(80, 100)).toBeCloseTo(-0.2);
  expect(change(100, 100)).toBe(0);
});

test("compareLabel reads as the spec titles", () => {
  expect(compareLabel("today")).toBe("yesterday at this time");
  expect(compareLabel("7d")).toBe("the 7 days before");
  expect(compareLabel("30d")).toBe("the 30 days before");
  expect(compareLabel("90d")).toBe("the 90 days before");
});

import { act, renderHook } from "@testing-library/react";
import { beforeEach, expect, test } from "vitest";
import { useUrlState } from "./useUrlState";

beforeEach(() => {
  window.history.replaceState(null, "", "/");
});

test("reads the initial state from the query string", () => {
  window.history.replaceState(null, "", "/?page=site&range=30d");
  const { result } = renderHook(() => useUrlState());
  expect(result.current[0]).toEqual({ page: "site", range: "30d" });
});

test("updates write the URL with pushState and keep the other key", () => {
  const { result } = renderHook(() => useUrlState());
  act(() => {
    result.current[1]({ range: "today" });
  });
  expect(result.current[0]).toEqual({ page: "analytics", range: "today" });
  expect(window.location.search).toBe("?range=today");
  act(() => {
    result.current[1]({ page: "site" });
  });
  expect(result.current[0]).toEqual({ page: "site", range: "today" });
  expect(window.location.search).toBe("?page=site&range=today");
  act(() => {
    result.current[1]({ page: "analytics", range: "7d" });
  });
  expect(window.location.search).toBe("");
});

test("popstate restores both keys from the URL", () => {
  const { result } = renderHook(() => useUrlState());
  act(() => {
    result.current[1]({ page: "site", range: "90d" });
  });
  act(() => {
    window.history.replaceState(null, "", "/?range=today");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  expect(result.current[0]).toEqual({ page: "analytics", range: "today" });
});

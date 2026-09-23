import { act, render } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { useVisibleInterval } from "./useVisibleInterval";

function Ticker({ fn, enabled = true }: { fn: () => void; enabled?: boolean }) {
  useVisibleInterval(fn, 30_000, enabled);
  return null;
}

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
  document.dispatchEvent(new Event("visibilitychange"));
}

afterEach(() => {
  vi.useRealTimers();
  delete (document as unknown as { visibilityState?: string }).visibilityState;
});

test("fires every 30 s while the tab is visible", () => {
  vi.useFakeTimers();
  const fn = vi.fn();
  render(<Ticker fn={fn} />);
  act(() => {
    vi.advanceTimersByTime(29_999);
  });
  expect(fn).not.toHaveBeenCalled();
  act(() => {
    vi.advanceTimersByTime(1);
  });
  expect(fn).toHaveBeenCalledTimes(1);
  act(() => {
    vi.advanceTimersByTime(60_000);
  });
  expect(fn).toHaveBeenCalledTimes(3);
});

test("skips ticks while hidden and catches up at once when the tab returns after 30 s", () => {
  vi.useFakeTimers();
  const fn = vi.fn();
  render(<Ticker fn={fn} />);
  act(() => {
    setVisibility("hidden");
  });
  act(() => {
    vi.advanceTimersByTime(90_000);
  });
  expect(fn).not.toHaveBeenCalled();
  act(() => {
    setVisibility("visible");
  });
  expect(fn).toHaveBeenCalledTimes(1);
  // Back within 30 s of the last call: nothing extra fires.
  act(() => {
    setVisibility("hidden");
    vi.advanceTimersByTime(5_000);
    setVisibility("visible");
  });
  expect(fn).toHaveBeenCalledTimes(1);
});

test("does nothing while disabled and stops on unmount", () => {
  vi.useFakeTimers();
  const fn = vi.fn();
  const { rerender, unmount } = render(<Ticker fn={fn} enabled={false} />);
  act(() => {
    vi.advanceTimersByTime(60_000);
  });
  expect(fn).not.toHaveBeenCalled();
  rerender(<Ticker fn={fn} enabled />);
  act(() => {
    vi.advanceTimersByTime(30_000);
  });
  expect(fn).toHaveBeenCalledTimes(1);
  unmount();
  act(() => {
    vi.advanceTimersByTime(60_000);
  });
  expect(fn).toHaveBeenCalledTimes(1);
});

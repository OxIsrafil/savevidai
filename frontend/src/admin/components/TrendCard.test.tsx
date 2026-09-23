import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, expect, test, vi } from "vitest";
import { COLORS } from "../lib/colors";
import { EMPTY_REPORT, REPORT_7D, REPORT_90D, REPORT_TODAY } from "../test/fixtures";
import { TrendCard, TrendTooltip } from "./TrendCard";

const SIZE = { width: 640, height: 256 };

// jsdom has no matchMedia. This stand-in answers the reduced motion query from one switch and,
// like the OS setting, tells its listeners when the switch flips. motion reads the query once
// and then listens, so the stand-in is in place before the first render.
let reduceMotion = false;
const mediaListeners = new Set<() => void>();
window.matchMedia = ((query: string) => ({
  media: query,
  get matches() {
    return reduceMotion && query.startsWith("(prefers-reduced-motion");
  },
  onchange: null,
  addListener: (listener: () => void) => mediaListeners.add(listener),
  removeListener: (listener: () => void) => mediaListeners.delete(listener),
  addEventListener: (_type: string, listener: () => void) => mediaListeners.add(listener),
  removeEventListener: (_type: string, listener: () => void) => mediaListeners.delete(listener),
  dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia;

function setReducedMotion(on: boolean) {
  reduceMotion = on;
  mediaListeners.forEach((listener) => listener());
}

afterAll(() => {
  Reflect.deleteProperty(window, "matchMedia");
});

test("four metric tabs carry the totals and deltas; the active one is selected and names the legend", async () => {
  render(<TrendCard report={REPORT_7D} compare="the 7 days before" size={SIZE} />);
  const tabs = screen.getAllByRole("tab");
  expect(tabs).toHaveLength(4);
  expect(tabs.map((t) => t.getAttribute("aria-selected"))).toEqual(["true", "false", "false", "false"]);
  expect(within(tabs[0]).getByText("Visitors")).toBeInTheDocument();
  expect(within(tabs[0]).getByText("1,742")).toBeInTheDocument();
  expect(within(tabs[0]).getByText("+8%")).toHaveAttribute("title", "Compared with the 7 days before");
  expect(within(tabs[1]).getByText("Fetches")).toBeInTheDocument();
  expect(within(tabs[1]).getByText("2,812")).toBeInTheDocument();
  expect(within(tabs[1]).getByText("+9%")).toBeInTheDocument();
  expect(within(tabs[2]).getByText("Downloads")).toBeInTheDocument();
  expect(within(tabs[2]).getByText("2,310")).toBeInTheDocument();
  expect(within(tabs[3]).getByText("Failed fetches")).toBeInTheDocument();
  expect(within(tabs[3]).getByText("253")).toBeInTheDocument();
  // Fewer failures is good: the inverted metric shows its drop in green.
  expect(within(tabs[3]).getByText("-7%").className).toContain("text-success");
  expect(screen.getByText("Visitors per day")).toBeInTheDocument();
  await userEvent.click(tabs[1]);
  expect(tabs[1]).toHaveAttribute("aria-selected", "true");
  expect(tabs[0]).toHaveAttribute("aria-selected", "false");
  expect(screen.getByText("Fetches per day")).toBeInTheDocument();
});

test("the metric tabs follow the tabs keyboard pattern: arrows move and select with wrap, Home and End jump", async () => {
  render(<TrendCard report={REPORT_7D} compare="the 7 days before" size={SIZE} />);
  const tabs = screen.getAllByRole("tab");
  const selected = () => tabs.findIndex((t) => t.getAttribute("aria-selected") === "true");
  await userEvent.tab();
  expect(tabs[0]).toHaveFocus();
  await userEvent.keyboard("{ArrowRight}");
  expect(tabs[1]).toHaveFocus();
  expect(selected()).toBe(1);
  expect(screen.getByText("Fetches per day")).toBeInTheDocument();
  await userEvent.keyboard("{ArrowLeft}{ArrowLeft}");
  expect(tabs[3]).toHaveFocus();
  expect(selected()).toBe(3);
  expect(screen.getByText("Failed fetches per day")).toBeInTheDocument();
  await userEvent.keyboard("{ArrowRight}");
  expect(tabs[0]).toHaveFocus();
  expect(selected()).toBe(0);
  await userEvent.keyboard("{End}");
  expect(tabs[3]).toHaveFocus();
  expect(selected()).toBe(3);
  await userEvent.keyboard("{Home}");
  expect(tabs[0]).toHaveFocus();
  expect(selected()).toBe(0);
  expect(screen.getByText("Visitors per day")).toBeInTheDocument();
});

test("only the selected tab is in the Tab order, and every tab controls one tabpanel labelled by the selected tab", async () => {
  render(
    <>
      <button type="button">Before</button>
      <TrendCard report={REPORT_7D} compare="the 7 days before" size={SIZE} />
      <button type="button">After</button>
    </>,
  );
  const tabs = screen.getAllByRole("tab");
  expect(tabs.map((t) => t.tabIndex)).toEqual([0, -1, -1, -1]);
  await userEvent.click(tabs[2]);
  expect(tabs.map((t) => t.tabIndex)).toEqual([-1, -1, 0, -1]);
  screen.getByRole("button", { name: "Before" }).focus();
  await userEvent.tab();
  expect(tabs[2]).toHaveFocus();
  await userEvent.tab();
  expect(screen.getByRole("button", { name: "After" })).toHaveFocus();
  await userEvent.tab({ shift: true });
  expect(tabs[2]).toHaveFocus();

  const panel = screen.getByRole("tabpanel");
  expect(panel.id).not.toBe("");
  expect(new Set(tabs.map((t) => t.id)).size).toBe(4);
  for (const tab of tabs) {
    expect(tab.id).not.toBe("");
    expect(tab).toHaveAttribute("aria-controls", panel.id);
  }
  expect(panel).toHaveAttribute("aria-labelledby", tabs[2].id);
  expect(within(panel).getByText("Downloads per day")).toBeInTheDocument();
  // The chart inside the panel stays hidden from screen readers; the tabs carry its numbers.
  expect(panel).not.toHaveAttribute("aria-hidden");
  expect(panel.querySelector("[aria-hidden='true'] svg.recharts-surface")).not.toBeNull();
});

test("draws the dashed previous line and its legend only with a previous period", () => {
  const { container, rerender } = render(<TrendCard report={REPORT_7D} compare="the 7 days before" size={SIZE} />);
  expect(container.querySelector("svg.recharts-surface")).not.toBeNull();
  expect(container.querySelector("[aria-hidden='true'] svg.recharts-surface")).not.toBeNull();
  expect(container.querySelectorAll("path[stroke-dasharray='4 4']").length).toBeGreaterThan(0);
  expect(screen.getByText("This period")).toBeInTheDocument();
  expect(screen.getByText("Period before")).toBeInTheDocument();
  expect(screen.queryByText("No earlier period")).not.toBeInTheDocument();
  rerender(<TrendCard report={REPORT_90D} compare="the 90 days before" size={SIZE} />);
  expect(container.querySelectorAll("path[stroke-dasharray='4 4']").length).toBe(0);
  expect(screen.queryByText("Period before")).not.toBeInTheDocument();
  expect(screen.getAllByText("No earlier period")).toHaveLength(4);
  expect(screen.getByText("22,646")).toBeInTheDocument();
});

test("today reads per hour and shows today's totals", () => {
  render(<TrendCard report={REPORT_TODAY} compare="yesterday at this time" size={SIZE} />);
  expect(screen.getByText("Visitors per hour")).toBeInTheDocument();
  const tabs = screen.getAllByRole("tab");
  expect(within(tabs[0]).getByText("176")).toBeInTheDocument();
  expect(within(tabs[1]).getByText("280")).toBeInTheDocument();
  expect(within(tabs[0]).getByText("+9%")).toHaveAttribute("title", "Compared with yesterday at this time");
});

test("the Y axis uses compact labels", () => {
  const big = { ...REPORT_7D, series: REPORT_7D.series.map((p) => ({ ...p, cur: { ...p.cur!, visitors: p.cur!.visitors * 10 }, prev: { ...p.prev!, visitors: p.prev!.visitors * 10 } })) };
  const { container } = render(<TrendCard report={big} compare="the 7 days before" size={SIZE} />);
  const labels = Array.from(container.querySelectorAll(".recharts-yAxis-tick-labels text")).map((t) => t.textContent ?? "");
  expect(labels.some((l) => /^\d+(\.\d)?K$/.test(l))).toBe(true);
});

test("an empty range says so over a flat chart", () => {
  render(<TrendCard report={EMPTY_REPORT} compare="the 7 days before" size={SIZE} />);
  expect(screen.getByText("Nothing in this range yet")).toBeInTheDocument();
  for (const tab of screen.getAllByRole("tab")) expect(within(tab).getByText("0")).toBeInTheDocument();
  expect(screen.getAllByText("No earlier period")).toHaveLength(4);
});

test("the line draws in, except when the device asks for reduced motion", () => {
  // During the draw-in the line sits behind a reveal clip that widens from 0; without it, no clip.
  const drawsIn = (root: HTMLElement) => {
    const line = root.querySelector(`.recharts-area-curve[stroke='${COLORS.teal}']`);
    expect(line).not.toBeNull();
    return line!.closest("[clip-path]") !== null;
  };
  const moving = render(<TrendCard report={REPORT_7D} compare="the 7 days before" size={SIZE} />);
  expect(drawsIn(moving.container)).toBe(true);
  moving.unmount();
  // motion prints a one-time notice while the setting is on; that one line is expected here.
  const realWarn = console.warn;
  const warn = vi.spyOn(console, "warn").mockImplementation((...args: unknown[]) => {
    if (!String(args[0]).startsWith("You have Reduced Motion enabled")) realWarn(...args);
  });
  act(() => {
    setReducedMotion(true);
  });
  try {
    const still = render(<TrendCard report={REPORT_7D} compare="the 7 days before" size={SIZE} />);
    expect(drawsIn(still.container)).toBe(false);
    still.unmount();
  } finally {
    act(() => {
      setReducedMotion(false);
    });
    warn.mockRestore();
  }
});

test("TrendTooltip shows this period and the earlier one from a fixed payload", () => {
  const row = { label: "Sep 20", value: 461, prev: 409, prevLabel: "Sep 13" };
  render(<TrendTooltip active payload={[{ payload: row }]} color="#0a84ff" showPrev />);
  expect(screen.getByText("Sep 20")).toBeInTheDocument();
  expect(screen.getByText("461")).toBeInTheDocument();
  expect(screen.getByText("Sep 13")).toBeInTheDocument();
  expect(screen.getByText("409")).toBeInTheDocument();
});

test("TrendTooltip hides the earlier row without a previous period and renders nothing when inactive or past now", () => {
  const row = { label: "Sep 20", value: 1234, prev: null, prevLabel: "Sep 13" };
  const { container, rerender } = render(<TrendTooltip active payload={[{ payload: row }]} color="#0a84ff" showPrev={false} />);
  expect(screen.getByText("1,234")).toBeInTheDocument();
  expect(screen.queryByText("Sep 13")).not.toBeInTheDocument();
  rerender(<TrendTooltip active={false} payload={[{ payload: row }]} color="#0a84ff" showPrev />);
  expect(container).toBeEmptyDOMElement();
  rerender(<TrendTooltip active payload={[{ payload: { label: "15:00", value: null, prev: null, prevLabel: "15:00" } }]} color="#0a84ff" showPrev />);
  expect(container).toBeEmptyDOMElement();
});

test("tab figures are never cut: no ellipsis, and the four tabs size their figures by the longest total", () => {
  const { rerender } = render(<TrendCard report={REPORT_7D} compare="the 7 days before" size={SIZE} />);
  for (const figure of ["1,742", "2,812", "2,310", "253"]) expect(screen.getByText(figure).className).not.toContain("truncate");
  const fit = () => parseFloat(screen.getByRole("tablist").style.getPropertyValue("--fit"));
  const short = fit();
  expect(short).toBeGreaterThan(0);
  rerender(<TrendCard report={REPORT_90D} compare="the 90 days before" size={SIZE} />);
  expect(fit()).toBeGreaterThan(short);
});

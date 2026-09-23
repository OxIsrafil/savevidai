import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { wholeText } from "../test/text";
import { LiveStrip } from "./LiveStrip";

test("reads the live numbers; resolver errors at 0 are neutral; the status pill links to the site page", () => {
  render(<LiveStrip live={{ active_now: 6, fetches_last_hour: 27, upstream_last_hour: 0 }} maintenance={{ on: false, forced_by_env: false }} onGoToSite={() => {}} />);
  expect(screen.getByText(wholeText("6 on the site now"))).toBeInTheDocument();
  expect(screen.getByText(wholeText("27 fetches in the last hour"))).toBeInTheDocument();
  const errors = screen.getByText(wholeText("0 resolver errors in the last hour"));
  expect(errors.className).not.toContain("bg-warning-dim");
  expect(screen.getByRole("link", { name: "Site is live" })).toHaveAttribute("href", "?page=site");
});

test("nobody on the site: gray dot and no ping; errors above 0: warning tint; maintenance on goes to the site page", async () => {
  const onGoToSite = vi.fn();
  const { container } = render(<LiveStrip live={{ active_now: 0, fetches_last_hour: 3, upstream_last_hour: 2 }} maintenance={{ on: true, forced_by_env: false }} onGoToSite={onGoToSite} />);
  expect(container.querySelector(".motion-safe\\:animate-ping")).toBeNull();
  expect(container.querySelector(".bg-text-muted")).not.toBeNull();
  expect(screen.getByText(wholeText("2 resolver errors in the last hour")).className).toContain("bg-warning-dim");
  const link = screen.getByRole("link", { name: "Maintenance is on" });
  expect(link.className).toContain("bg-warning-dim");
  await userEvent.click(link);
  expect(onGoToSite).toHaveBeenCalledTimes(1);
});

test("someone on the site shows the ping ring; an unknown maintenance state shows no status pill", () => {
  const { container } = render(<LiveStrip live={{ active_now: 1, fetches_last_hour: 0, upstream_last_hour: 0 }} maintenance={null} onGoToSite={() => {}} />);
  expect(container.querySelector(".motion-safe\\:animate-ping")).not.toBeNull();
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
});

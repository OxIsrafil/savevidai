import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { Shell } from "./Shell";

test("marks the current page, shows the On pill while maintenance is on, and wires the callbacks", async () => {
  const onNavigate = vi.fn();
  const onSignOut = vi.fn();
  render(
    <Shell page="analytics" maintenanceOn onNavigate={onNavigate} onSignOut={onSignOut}>
      <p>body</p>
    </Shell>,
  );
  expect(screen.getByText("SaveVid")).toBeInTheDocument();
  expect(screen.getByText("Admin")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Analytics" })).toHaveAttribute("aria-current", "page");
  expect(screen.getByRole("button", { name: /^Site/ })).not.toHaveAttribute("aria-current");
  expect(screen.getByText("On")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "View site" })).toHaveAttribute("href", "/");
  expect(screen.getByText("body")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: /^Site/ }));
  expect(onNavigate).toHaveBeenCalledWith("site");
  await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
  expect(onSignOut).toHaveBeenCalledTimes(1);
});

test("no On pill while the site is live; Site is current on the site page", () => {
  render(
    <Shell page="site" maintenanceOn={false} onNavigate={() => {}} onSignOut={() => {}}>
      <p>body</p>
    </Shell>,
  );
  expect(screen.queryByText("On")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Site" })).toHaveAttribute("aria-current", "page");
  expect(screen.getByRole("button", { name: "Analytics" })).not.toHaveAttribute("aria-current");
});

test("a nav item that takes focus is scrolled fully into view, so the phone row never leaves one half hidden", async () => {
  // jsdom has no layout and no scrollIntoView, so record the calls instead.
  const proto = Element.prototype as unknown as { scrollIntoView?: (arg?: unknown) => void };
  const own = Object.prototype.hasOwnProperty.call(proto, "scrollIntoView");
  const real = proto.scrollIntoView;
  const calls: Array<{ text: string | null; arg: unknown }> = [];
  proto.scrollIntoView = function (this: Element, arg?: unknown) {
    calls.push({ text: this.textContent, arg });
  };
  try {
    render(
      <Shell page="analytics" maintenanceOn={false} onNavigate={() => {}} onSignOut={() => {}}>
        <p>body</p>
      </Shell>,
    );
    for (let i = 0; i < 4; i++) await userEvent.tab();
    expect(screen.getByRole("button", { name: "Sign out" })).toHaveFocus();
    expect(calls.map((c) => c.text)).toEqual(["Analytics", "Site", "View site", "Sign out"]);
    for (const c of calls) expect(c.arg).toEqual({ block: "nearest", inline: "nearest" });
  } finally {
    if (own) proto.scrollIntoView = real;
    else delete proto.scrollIntoView;
  }
});

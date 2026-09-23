import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { enShared } from "../locales/en";
import { esShared } from "../locales/es";
import { hiShared } from "../locales/hi";
import { FollowPopup } from "./FollowPopup";

// Copy, handle and URL are pinned as literals rather than read back from the
// tables or lib/social.ts, so a drifted string fails here.
const LOCALES = [
  {
    locale: "en",
    strings: enShared.followPopup,
    title: "Follow me on X",
    line: "New tools and updates, posted here first.",
    follow: "Follow @israfilv2",
    newTab: "(opens in a new tab)",
    download: "Download",
    close: "Close",
  },
  {
    locale: "es",
    strings: esShared.followPopup,
    title: "Sígueme en X",
    line: "Herramientas nuevas y novedades, primero aquí.",
    follow: "Seguir a @israfilv2",
    newTab: "(se abre en una pestaña nueva)",
    download: "Descargar",
    close: "Cerrar",
  },
  {
    locale: "hi",
    strings: hiShared.followPopup,
    title: "X पर मुझे फ़ॉलो करें",
    line: "नए टूल और अपडेट, सबसे पहले यहाँ।",
    follow: "@israfilv2 को फ़ॉलो करें",
    newTab: "(नए टैब में खुलता है)",
    download: "डाउनलोड करें",
    close: "बंद करें",
  },
];

function renderPopup(strings = enShared.followPopup) {
  const onDownload = vi.fn();
  const onClose = vi.fn();
  const utils = render(<FollowPopup strings={strings} onDownload={onDownload} onClose={onClose} />);
  return { ...utils, onDownload, onClose, dialog: screen.getByRole("dialog") };
}

test.each(LOCALES)("$locale popup renders its copy, named by its title", (c) => {
  const { dialog } = renderPopup(c.strings);
  expect(screen.getByRole("dialog", { name: c.title })).toBe(dialog);
  expect(dialog).toHaveAttribute("aria-modal", "true");
  expect(within(dialog).getByText("@israfilv2")).toBeInTheDocument();
  expect(within(dialog).getByText(c.line)).toBeInTheDocument();
  expect(within(dialog).getByRole("link", { name: `${c.follow} ${c.newTab}` })).toBeInTheDocument();
  expect(within(dialog).getByText(c.newTab)).toHaveClass("sr-only");
  expect(within(dialog).getByRole("button", { name: c.download })).toBeInTheDocument();
  expect(within(dialog).getByRole("button", { name: c.close })).toBeInTheDocument();
});

test("the Follow link opens the X profile in a new tab", () => {
  const { dialog } = renderPopup();
  const link = within(dialog).getByRole("link");
  expect(link).toHaveAttribute("href", "https://x.com/israfilv2");
  expect(link).toHaveAttribute("target", "_blank");
  expect(link).toHaveAttribute("rel", "noopener noreferrer");
});

test("the X logo is inline and decorative: no image request, nothing read aloud", () => {
  const { dialog } = renderPopup();
  expect(dialog.querySelector("img")).toBeNull();
  const logo = dialog.querySelector("svg[fill='currentColor']");
  expect(logo).not.toBeNull();
  expect(logo?.closest("[aria-hidden='true']")).not.toBeNull();
});

test("renders in a portal on document.body, outside the tree that opened it", () => {
  const { container, dialog } = renderPopup();
  expect(container).not.toContainElement(dialog);
  expect(document.body).toContainElement(dialog);
});

test("focus lands on Download when the popup opens", () => {
  renderPopup();
  expect(screen.getByRole("button", { name: "Download" })).toHaveFocus();
});

test("Tab and Shift+Tab cycle inside the dialog", async () => {
  const { dialog } = renderPopup();
  const inside = () => expect(dialog).toContainElement(document.activeElement as HTMLElement);
  const seen = new Set<Element | null>();
  for (let i = 0; i < 4; i++) {
    await userEvent.tab();
    inside();
    seen.add(document.activeElement);
  }
  // Link, Download and Close all get visited, and focus never leaves.
  expect(seen.size).toBe(3);
  for (let i = 0; i < 4; i++) {
    await userEvent.tab({ shift: true });
    inside();
  }
});

test("Download calls onDownload only; the close paths call onClose only", async () => {
  const { dialog, onDownload, onClose } = renderPopup();
  await userEvent.click(within(dialog).getByRole("button", { name: "Download" }));
  expect(onDownload).toHaveBeenCalledTimes(1);
  expect(onClose).not.toHaveBeenCalled();
});

test.each([
  ["Escape", async () => userEvent.keyboard("{Escape}")],
  ["the close button", async () => userEvent.click(screen.getByRole("button", { name: "Close" }))],
  ["a backdrop click", async () => userEvent.click(screen.getByTestId("follow-popup-backdrop"))],
])("%s closes without downloading", async (_how, act) => {
  const { onDownload, onClose } = renderPopup();
  await act();
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(onDownload).not.toHaveBeenCalled();
});

test("the second click of a double-click on a save button does not dismiss the popup", () => {
  // The first click opens the popup, so the second lands on the new backdrop.
  const { onClose } = renderPopup();
  fireEvent.click(screen.getByTestId("follow-popup-backdrop"), { detail: 2 });
  expect(onClose).not.toHaveBeenCalled();
  expect(screen.getByRole("dialog")).toBeInTheDocument();
});

test("fades and scales in when motion is allowed", () => {
  const { dialog } = renderPopup();
  expect(dialog.style.opacity).toBe("0");
  expect(dialog.style.transform).toContain("scale(0.96)");
});

test("a click inside the card does not close it", async () => {
  const { dialog, onClose } = renderPopup();
  await userEvent.click(within(dialog).getByText("@israfilv2"));
  expect(onClose).not.toHaveBeenCalled();
});

test("locks page scroll while open and restores it on close", () => {
  document.body.style.overflow = "";
  const { unmount } = renderPopup();
  expect(document.body.style.overflow).toBe("hidden");
  unmount();
  expect(document.body.style.overflow).toBe("");
});

import { cleanup, render, screen } from "@testing-library/react";
import type { ComponentType } from "react";
import App from "../App";
import TikTokApp from "../tiktok/TikTokApp";
import RedditApp from "../reddit/RedditApp";
import InstagramApp from "../instagram/InstagramApp";
import FacebookApp from "../facebook/FacebookApp";

// The HTML shells ship a static hero snapshot that React replaces on mount. If the
// hero still animated in from a hidden state, that swap would read as a visible
// vanish-and-replay flash, so the hero must paint at its final state on first render.
const apps: Array<[string, ComponentType]> = [
  ["twitter", App],
  ["tiktok", TikTokApp],
  ["reddit", RedditApp],
  ["instagram", InstagramApp],
  ["facebook", FacebookApp],
];

/** Inline style motion wrote on first render, "" when it painted nothing. */
function inlineStyle(el: Element) {
  return el.getAttribute("style") ?? "";
}

afterEach(cleanup);

test.each(apps)("%s hero paints at its final state on first render", (_name, Component) => {
  const { container } = render(<Component />);

  const heading = screen.getByRole("heading", { level: 1 });
  const words = heading.querySelectorAll("span > span");
  expect(words.length).toBeGreaterThan(0);
  for (const word of words) {
    // No rise-from-below: nothing may offset the word on the first paint.
    expect(inlineStyle(word)).not.toMatch(/translateY\(\s*(?!0)/);
    expect(inlineStyle(word)).not.toMatch(/opacity:\s*0(\D|$)/);
  }

  const lede = container.querySelector(".lede");
  expect(lede).not.toBeNull();
  expect(inlineStyle(lede as Element)).not.toMatch(/opacity:\s*0(\D|$)/);
  expect(inlineStyle(lede as Element)).not.toMatch(/translateY\(\s*(?!0)/);

  const form = screen.getByRole("textbox").closest("div.mx-auto");
  expect(form).not.toBeNull();
  expect(inlineStyle(form as Element)).not.toMatch(/opacity:\s*0(\D|$)/);
  expect(inlineStyle(form as Element)).not.toMatch(/translateY\(\s*(?!0)/);
});

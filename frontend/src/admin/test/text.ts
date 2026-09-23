import type { Matcher } from "@testing-library/react";

const norm = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

/**
 * Matches the smallest element whose whole text equals `text`, for pills like
 * "<span>6</span> on the site now" whose text is split across child spans.
 */
export function wholeText(text: string): Matcher {
  return (_content, node) => {
    if (!node) return false;
    if (norm(node.textContent) !== text) return false;
    return !Array.from(node.children).some((child) => norm(child.textContent) === text);
  };
}

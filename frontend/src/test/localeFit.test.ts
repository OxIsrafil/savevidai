/**
 * Layout-fit guards for the two places a translated string outgrew a
 * hand-authored, fixed-coordinate layout. Both were caught by the live gate,
 * not by a unit test, so these pin the fixes rather than re-derive them.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { copyLinkFontSize, COPY_LINK_FONT_SIZE, COPY_LINK_FONT_SIZE_LONG } from "../lib/svgText";
import en from "../locales/en";
import es from "../locales/es";
import hi from "../locales/hi";
import type { LocaleStrings } from "../locales/types";

const LOCALES: Record<string, LocaleStrings> = { en, es, hi };

/**
 * The share-sheet label starts at x=326 (landscape) / x=434 (stacked) and its
 * mock card ends 98 user units later. Onest's advance widths are not available
 * here, so the budget uses a deliberately pessimistic per-character estimate
 * calibrated against the browser measurements taken during the gate:
 * "Copy link" (9 chars) measured 72.0 units at 16.5, "Copiar enlace"
 * (13 chars) measured 105.2. That is ~8.0 units per character at 16.5, i.e.
 * ~0.485 units per character per size unit.
 */
const UNITS_PER_CHAR_PER_SIZE = 0.485;
const CARD_BUDGET = 98;

const estimateWidth = (label: string, fontSize: number) =>
  label.length * UNITS_PER_CHAR_PER_SIZE * fontSize;

describe("svg share-sheet label fits its mock card", () => {
  it("the estimator reproduces the two widths measured in the browser", () => {
    // Guards the estimator itself: if it drifts, the budget assertions lie.
    expect(estimateWidth("Copy link", 16.5)).toBeCloseTo(72.0, 0);
    expect(estimateWidth("Copiar enlace", 16.5)).toBeCloseTo(104.0, 0);
  });

  it("the base size is too small a budget for the Spanish label", () => {
    // Non-vacuity: proves the step-down is doing work, not decorating.
    expect(estimateWidth("Copiar enlace", COPY_LINK_FONT_SIZE)).toBeGreaterThan(CARD_BUDGET);
  });

  for (const [name, locale] of Object.entries(LOCALES)) {
    for (const page of Object.values(locale)) {
      it(`${name} ${page.platformKey} copyLink fits at its chosen size`, () => {
        const label = page.svg.copyLink;
        expect(estimateWidth(label, copyLinkFontSize(label))).toBeLessThan(CARD_BUDGET);
      });
    }
  }

  it("keeps the original size for the short labels so en and hi do not change", () => {
    expect(copyLinkFontSize("Copy link")).toBe(COPY_LINK_FONT_SIZE);
    expect(copyLinkFontSize("Copiar enlace")).toBe(COPY_LINK_FONT_SIZE_LONG);
  });
});

describe("hi headline reveal clip has room for Devanagari matras", () => {
  // Read the stylesheet off disk rather than importing it: the vitest config
  // sets css:false, so a `?raw` import of a .css file resolves to "" and every
  // assertion below would pass vacuously.
  const css = readFileSync(resolve(process.cwd(), "src/styles/index.css"), "utf8");

  it("actually loaded the stylesheet", () => {
    expect(css.length).toBeGreaterThan(1000);
  });

  it("scopes the extra clip room to the hi pages only", () => {
    expect(css).toMatch(/html\[lang="hi"\]\s+\.hero-h1\s+\.word\s*\{/);
    expect(css).toMatch(/html\[lang="hi"\]\s+\.hero-h1\s+\.small\s*\{/);
  });

  it("cancels every bit of added padding with a matching negative margin", () => {
    // If a future edit adds padding without the margin, the headline moves.
    const blocks = [...css.matchAll(/html\[lang="hi"\]\s+\.hero-h1\s+\.(word|small)\s*\{([^}]*)\}/g)];
    expect(blocks).toHaveLength(2);
    for (const [, which, body] of blocks) {
      const padTop = /padding-top:\s*0\.26em/.test(body);
      const padBottom = /padding-bottom:\s*0\.12em/.test(body);
      const marginTop =
        which === "small"
          ? /margin-top:\s*calc\(-0\.1em - 0\.26em\)/.test(body)
          : /margin-top:\s*-0\.26em/.test(body);
      const marginBottom = /margin-bottom:\s*-0\.12em/.test(body);
      expect({ which, padTop, padBottom, marginTop, marginBottom }).toEqual({
        which,
        padTop: true,
        padBottom: true,
        marginTop: true,
        marginBottom: true,
      });
    }
  });

  it("keeps the base .word clip that the rule widens", () => {
    // The fix is meaningless if .word stops clipping.
    expect(css).toMatch(/\.word\s*\{[^}]*overflow:\s*hidden/);
  });
});

describe("es headline reveal clip has room for Latin descenders", () => {
  const css = readFileSync(resolve(process.cwd(), "src/styles/index.css"), "utf8");

  it("scopes the extra clip room to the es pages only", () => {
    expect(css).toMatch(/html\[lang="es"\]\s+\.hero-h1\s+\.word\s*\{/);
  });

  it("cancels the added padding with a matching negative margin", () => {
    // If a future edit adds padding without the margin, the headline moves.
    const blocks = [...css.matchAll(/html\[lang="es"\]\s+\.hero-h1\s+\.word\s*\{([^}]*)\}/g)];
    expect(blocks).toHaveLength(1);
    const body = blocks[0][1];
    expect({
      padBottom: /padding-bottom:\s*0\.14em/.test(body),
      marginBottom: /margin-bottom:\s*-0\.14em/.test(body),
    }).toEqual({ padBottom: true, marginBottom: true });
  });

  it("leaves the top of the clip box alone, so the headline cannot shift up", () => {
    // Spanish only overhangs at the bottom ("Descargar"), unlike Devanagari.
    const blocks = [...css.matchAll(/html\[lang="es"\]\s+\.hero-h1\s+\.word\s*\{([^}]*)\}/g)];
    const body = blocks[0][1];
    expect(/padding-top/.test(body)).toBe(false);
    expect(/margin-top/.test(body)).toBe(false);
  });

  it("does not leak the es rule into the en or hi pages", () => {
    // The base .word rule must stay free of the descender padding.
    const base = css.match(/(?<!\]\s)\n\.word\s*\{([^}]*)\}/);
    expect(base).not.toBeNull();
    expect(/padding-bottom/.test(base![1])).toBe(false);
  });
});

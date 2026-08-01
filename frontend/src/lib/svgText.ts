/**
 * Text fitting helpers for the inline how-to SVGs.
 *
 * The SVGs are hand-authored with hard-coded coordinates, so a translated
 * label cannot reflow: it just runs past the mock UI it is supposed to sit
 * inside. Rather than a per-locale coordinate table, the one label that
 * overflows gets a size step-down.
 */

/**
 * Size for the share-sheet "copy link" label in every how-to visual.
 *
 * The label starts at a fixed x with the mock card edge 98 user units away.
 * At the base 16.5 size English "Copy link" measures ~72 units (26 to spare),
 * but Spanish "Copiar enlace" measures ~105 and spills past the card edge into
 * the red marker stroke, which cuts through the final glyph. At 14 it measures
 * ~89 and clears the edge.
 *
 * Keyed on length, not on locale, so a future locale with a long share-sheet
 * label is covered without another edit here. English and Hindi both ship
 * "Copy link" (the label names the platform's own share-sheet item, which is
 * not localised on Hindi devices), so both keep the original size and both
 * locales render byte-identically to before.
 */
export const COPY_LINK_FONT_SIZE = 16.5;
export const COPY_LINK_FONT_SIZE_LONG = 14;

export function copyLinkFontSize(label: string): number {
  return label.length > 10 ? COPY_LINK_FONT_SIZE_LONG : COPY_LINK_FONT_SIZE;
}

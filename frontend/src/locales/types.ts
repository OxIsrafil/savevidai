/**
 * The typed shape of every user-visible string on a platform page.
 *
 * Keys mirror the key column of docs/superpowers/specs/2026-08-01-i18n-translations.md:
 * section 2 (shared UI), section 3 (per-page, the 16 non-FAQ strings) and
 * section 4 (HowToVisual SVG labels). Visible FAQ entries are NOT here: they are
 * hand-authored per locale in the HTML shells, which stay their single source of
 * truth (a second copy in TypeScript would be a drift surface with no reader).
 *
 * Hard rule from the spec: no component may read strings at module scope. Tables
 * reach the apps as a prop and flow down to components as props, so one jsdom
 * process can render en, es and hi side by side without leaking state.
 */

export type Locale = "en" | "es" | "hi";

export type PlatformKey = "twitter" | "tiktok" | "reddit" | "instagram" | "facebook";

/** Hero chips (section 2.4). Which page shows which is `PageStrings.chipKeys`. */
export type ChipKey =
  | "example"
  | "noLogin"
  | "noWatermark"
  | "originalQuality"
  | "withAudio"
  | "hdQuality"
  | "publicOnly";

/** 2.1 nav pill and brand */
export type NavStrings = {
  brand: string;
  twitter: string;
  tiktok: string;
  reddit: string;
  instagram: string;
  facebook: string;
  downloadButton: string;
};

/** 2.2 theme toggle (aria-label only) */
export type ThemeStrings = { toLight: string; toDark: string };

/** 2.3 paste input button states (placeholder and aria-label are per-page) */
export type InputStrings = { submit: string; fetched: string };

/** 2.4 hero chips */
export type ChipStrings = Record<ChipKey, string>;

/** 2.5 PlatformLinks. `srSuffix` carries its own leading space. */
export type PlatformStrings = {
  navLabel: string;
  twitter: string;
  tiktok: string;
  reddit: string;
  instagram: string;
  facebook: string;
  srSuffix: string;
};

/** 2.6 PreviewCard. `videoN` interpolates `{n}`. */
export type PreviewStrings = { videoSingle: string; videoN: string; gifBadge: string };

/** 2.7 QualityButton */
export type QualityStrings = {
  saved: string;
  downloading: string;
  retry: string;
  hdChip: string;
};

/** 2.8 PhotoGrid. `savePhotoN` interpolates `{n}`. */
export type PhotoStrings = {
  sectionLabel: string;
  saveAll: string;
  sound: string;
  soundSaved: string;
  soundRetry: string;
  savePhotoN: string;
};

/**
 * The follow popup a video save button opens before its download. Not in the
 * translations doc: it arrived after it. `follow` interpolates `{handle}` (the
 * handle itself lives in lib/social.ts), `line` carries no handle, and `newTab`
 * is the Follow link's visually hidden new-tab note.
 */
export type FollowPopupStrings = {
  title: string;
  line: string;
  follow: string;
  newTab: string;
  download: string;
  close: string;
};

/**
 * 2.11 client-minted error strings. The backend `body.message` passthrough is
 * deliberately NOT here: translating it is a separate backend task (spec, out of
 * scope), and papering over it on the frontend would hide a real gap.
 */
export type ErrorStrings = { network: string; serverUnreachable: string; generic: string };

/** 2.12 language switcher. Autonyms are identical in every locale. */
export type LangStrings = { navLabel: string; en: string; es: string; hi: string };

/** 2.13 shell section headers (rendered by the shells, not by React) */
export type SectionStrings = {
  howItWorksKicker: string;
  howItWorksTitle: string;
  questionsKicker: string;
  faqTitle: string;
};

/** 2.14 footer (shell) */
export type FooterStrings = {
  brand: string;
  linksLabel: string;
  platformsLabel: string;
  xLink: string;
  builtBy: string;
  copyright: string;
};

/** 2.15 footer platform anchor texts, the static crawl path (shell) */
export type FooterNavStrings = Record<PlatformKey, string>;

/** 4.1 SVG labels shared by all five HowToVisuals */
export type SharedSvgStrings = { copyLink: string; fetch: string; savedToDevice: string };

/** 4.1 + 4.2 + 4.3: everything one platform's HowToVisual renders */
export type SvgStrings = SharedSvgStrings & {
  /** 4.2 the line under the saved-file row */
  footerLine: string;
  /** 4.3 sr-only figcaption */
  figcaption: string;
  /** 4.3 aria-label, identical on the landscape and the stacked svg */
  ariaLabel: string;
};

/** Section 3 hero block */
export type HeroStrings = {
  /** h1 part A (`.word`) */
  h1a: string;
  /** h1 part B (`.word.grey.small`) */
  h1b: string;
  lede: string;
  placeholder: string;
  inputAriaLabel: string;
  note: string;
};

/** Section 3 head tags (rendered by the shells) */
export type MetaStrings = { title: string; description: string; ogDescription: string };

/** Section 3 how-it-works step (rendered by the shells) */
export type StepStrings = { heading: string; body: string };

/** Everything that is identical across the five pages of one locale. */
export type SharedStrings = {
  locale: Locale;
  /** Path prefix for every internal link: "" for en, "/es", "/hi". */
  prefix: string;
  nav: NavStrings;
  theme: ThemeStrings;
  input: InputStrings;
  chips: ChipStrings;
  platform: PlatformStrings;
  preview: PreviewStrings;
  quality: QualityStrings;
  photos: PhotoStrings;
  followPopup: FollowPopupStrings;
  errors: ErrorStrings;
  lang: LangStrings;
  section: SectionStrings;
  footer: FooterStrings;
  footerNav: FooterNavStrings;
};

/** One page in one locale: the shared table plus that page's own copy. */
export type PageStrings = SharedStrings & {
  platformKey: PlatformKey;
  meta: MetaStrings;
  hero: HeroStrings;
  chipKeys: readonly ChipKey[];
  footerDescription: string;
  steps: readonly [StepStrings, StepStrings, StepStrings];
  svg: SvgStrings;
};

/** The five pages of one locale, keyed by platform. */
export type LocaleStrings = Record<PlatformKey, PageStrings>;

/** Prop slices: each component takes only what it renders. */
export type PlatformLinksStrings = { prefix: string; platform: PlatformStrings };
export type PreviewCardStrings = {
  preview: PreviewStrings;
  quality: QualityStrings;
  photos: PhotoStrings;
  followPopup: FollowPopupStrings;
};

import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { HowToVisual } from "./components/HowToVisual";
import { PasteInput } from "./components/PasteInput";
import { PlatformLinks } from "./components/PlatformLinks";
import { PreviewCard } from "./components/PreviewCard";
import { SkeletonCard } from "./components/SkeletonCard";
import { ThemeToggle } from "./components/ThemeToggle";
import { useResolve } from "./hooks/useResolve";
import { sendEvent, visitContext } from "./lib/analytics";
import { EASE_OUT, fadeRise, heroStill } from "./lib/motion";
import { enTwitter } from "./locales/en";
import type { PageStrings } from "./locales/types";

// The maker's own video post, used as the example chip's live demo.
const EXAMPLE_URL = "https://x.com/israfilv2/status/2103009452026962290";

// Module-level (not component-level) so it survives React StrictMode's dev-time
// double-invoke of effects and any remounts, guaranteeing one visit beacon per
// page load rather than per mount.
let visitBeaconSent = false;

export default function App({ strings = enTwitter }: { strings?: PageStrings } = {}) {
  const { state, resolve } = useResolve(strings.errors);
  const [prefill, setPrefill] = useState<string | null>(null);
  const navRef = useRef<HTMLElement>(null);
  const { prefix } = strings;

  function runExample() {
    setPrefill(EXAMPLE_URL);
    resolve(EXAMPLE_URL);
  }

  const resultsRef = useRef<HTMLDivElement>(null);

  // Anonymous visit beacon, once per page load (module-level flag above guards
  // against StrictMode's double-invoke and any re-renders/remounts).
  useEffect(() => {
    if (visitBeaconSent) return;
    visitBeaconSent = true;
    sendEvent("visit", { platform: "twitter", ...visitContext() });
  }, []);

  // When a fetch lands, bring the preview card in front of the user's eyes.
  useEffect(() => {
    if (state.status !== "ready") return;
    const el = resultsRef.current;
    if (!el) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    // One frame so the card's layout exists before we aim at it.
    const raf = requestAnimationFrame(() =>
      el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" }),
    );
    // Smooth scrolls get silently canceled in throttled/background tabs and on
    // some mobile browsers; if the card still isn't in view, jump to it.
    const fallback = setTimeout(() => {
      const top = el.getBoundingClientRect().top;
      if (top > 200 || top < 0) el.scrollIntoView({ behavior: "auto", block: "start" });
    }, 700);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(fallback);
    };
  }, [state.status]);

  // Floating nav tightens past 40px of scroll (class toggle, no re-render churn).
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      nav.classList.toggle("scrolled", window.scrollY > 40);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // Ctrl/Cmd+V anywhere on the page starts a resolve.
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      if ((e.target as HTMLElement | null)?.tagName === "INPUT") return;
      const text = e.clipboardData?.getData("text") ?? "";
      if (text.includes("/status/")) resolve(text.trim());
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [resolve]);

  // ?url= support for bookmarklets and share targets.
  useEffect(() => {
    const url = new URLSearchParams(window.location.search).get("url");
    if (url) resolve(url);
  }, [resolve]);

  function focusInput() {
    document.getElementById("paste-input")?.focus();
  }

  return (
    <div className="relative isolate flex min-h-screen flex-col items-center overflow-x-clip px-4">
      <motion.nav
        ref={navRef}
        className="nav-pill"
        initial={{ y: -18, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: EASE_OUT }}
      >
        <span className="brand">
          <span>{strings.nav.brand}</span>
          <span className="brand-dot">.</span>
        </span>
        <span className="flex items-center gap-2">
          <a className="nav-meta nav-link" href={`${prefix}/tiktokvideodownloader`}>
            {strings.nav.tiktok}
          </a>
          <a className="nav-meta nav-link" href={`${prefix}/redditvideodownloader`}>
            {strings.nav.reddit}
          </a>
          <ThemeToggle strings={strings.theme} />
          <button type="button" className="btn btn-small" onClick={focusInput}>
            {strings.nav.downloadButton}
          </button>
        </span>
      </motion.nav>

      <main className="w-full max-w-3xl flex-1 pb-10 pt-[clamp(140px,22vh,220px)] text-center">
        <div aria-hidden className="aurora">
          <div className="blob blob-a" />
          <div className="blob blob-b" />
        </div>

        {/* H1 targets the search query per the spec's SEO section; the brand lives in the nav */}
        <h1 className="hero-h1">
          <span className="word">
            <motion.span className="inline-block" {...heroStill}>
              {strings.hero.h1a}
            </motion.span>
          </span>{" "}
          <span className="word grey small">
            <motion.span className="inline-block" {...heroStill}>
              {strings.hero.h1b}
            </motion.span>
          </span>
        </h1>

        <motion.p {...heroStill} className="lede mt-6">
          {strings.hero.lede}
        </motion.p>

        <motion.div {...heroStill} className="mx-auto mt-9 max-w-2xl">
          <PasteInput
            status={state.status}
            errorMessage={state.status === "error" ? state.message : null}
            onSubmit={resolve}
            presetValue={prefill}
            placeholder={strings.hero.placeholder}
            ariaLabel={strings.hero.inputAriaLabel}
            submitLabel={strings.input.submit}
            fetchedLabel={strings.input.fetched}
          />
        </motion.div>

        <motion.div {...fadeRise(3)} className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
          {strings.chipKeys.map((key) =>
            key === "example" ? (
              <button key={key} type="button" className="chip chip-action" onClick={runExample}>
                {strings.chips.example}
              </button>
            ) : (
              <span key={key} className="chip">
                {strings.chips[key]}
              </span>
            ),
          )}
        </motion.div>

        <motion.p {...fadeRise(4)} className="mt-6 text-sm text-[var(--faint)]">
          {strings.hero.note}
        </motion.p>

        <motion.div {...fadeRise(5)} className="mt-8">
          <PlatformLinks active="twitter" strings={strings} />
        </motion.div>

        {/* No AnimatePresence here on purpose: an interrupted exit animation can wedge
            mode="wait" and block the card forever (seen live when a resolve failed while
            the backend was down). Instant swap + card entrance animation is robust. */}
        <div ref={resultsRef} aria-live="polite" className="mt-10 scroll-mt-28 text-left">
          {state.status === "resolving" && <SkeletonCard />}
          {state.status === "ready" && <PreviewCard data={state.data} strings={strings} />}
        </div>

        <motion.div {...fadeRise(6)}>
          <HowToVisual strings={strings.svg} />
        </motion.div>
      </main>
    </div>
  );
}

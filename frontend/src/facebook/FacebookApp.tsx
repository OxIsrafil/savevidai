import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { PasteInput } from "../components/PasteInput";
import { PlatformLinks } from "../components/PlatformLinks";
import { PreviewCard } from "../components/PreviewCard";
import { SkeletonCard } from "../components/SkeletonCard";
import { ThemeToggle } from "../components/ThemeToggle";
import { FacebookHowToVisual } from "./FacebookHowToVisual";
import { useResolve } from "../hooks/useResolve";
import { sendEvent, visitContext } from "../lib/analytics";
import { EASE_OUT, fadeRise, heroStill } from "../lib/motion";

// Facebook's own page video (the one Meta's embed docs use), so it is public,
// long-lived and safe to showcase. Verified live through the resolver on
// 2026-07-29: 200 with an hd fbcdn variant.
const EXAMPLE_URL = "https://www.facebook.com/facebook/videos/10153231379946729";

// Module-level (not component-level) so it survives React StrictMode's dev-time
// double-invoke of effects and any remounts, guaranteeing one visit beacon per
// page load rather than per mount.
let visitBeaconSent = false;

export default function FacebookApp() {
  const { state, resolve } = useResolve();
  const [prefill, setPrefill] = useState<string | null>(null);
  const navRef = useRef<HTMLElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  function runExample() {
    setPrefill(EXAMPLE_URL);
    resolve(EXAMPLE_URL);
  }

  // Anonymous visit beacon, once per page load (module-level flag above guards
  // against StrictMode's double-invoke and any re-renders/remounts).
  useEffect(() => {
    if (visitBeaconSent) return;
    visitBeaconSent = true;
    sendEvent("visit", { platform: "facebook", ...visitContext() });
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

  // Ctrl/Cmd+V anywhere on the page starts a resolve. fb.com counts too: it is
  // an accepted host on the backend, and its links never say "facebook".
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      if ((e.target as HTMLElement | null)?.tagName === "INPUT") return;
      const text = e.clipboardData?.getData("text") ?? "";
      if (/facebook\.com|fb\.com/i.test(text)) resolve(text.trim());
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
          <span>SaveVid AI</span>
          <span className="brand-dot">.</span>
        </span>
        <span className="flex items-center gap-2">
          <a className="nav-meta nav-link" href="/">
            Twitter/X
          </a>
          <a className="nav-meta nav-link" href="/instagramvideodownloader">
            Instagram
          </a>
          <ThemeToggle />
          <button type="button" className="btn btn-small" onClick={focusInput}>
            Download
          </button>
        </span>
      </motion.nav>

      <main className="w-full max-w-3xl flex-1 pb-10 pt-[clamp(140px,22vh,220px)] text-center">
        <div aria-hidden className="aurora">
          <div className="blob blob-a" />
          <div className="blob blob-b" />
        </div>

        {/* H1 targets the search query per the spec's SEO section; the brand lives in the nav.
            Title case and the two-word split match the other four platform pages on purpose. */}
        <h1 className="hero-h1">
          <span className="word">
            <motion.span className="inline-block" {...heroStill}>
              Facebook Video
            </motion.span>
          </span>{" "}
          <span className="word grey small">
            <motion.span className="inline-block" {...heroStill}>
              Downloader
            </motion.span>
          </span>
        </h1>

        <motion.p {...heroStill} className="lede mt-6">
          Paste a Facebook link, get the video in HD. No fake buttons, one real click.
        </motion.p>

        <motion.div {...heroStill} className="mx-auto mt-9 max-w-2xl">
          <PasteInput
            status={state.status}
            errorMessage={state.status === "error" ? state.message : null}
            onSubmit={resolve}
            presetValue={prefill}
            placeholder="Paste a Facebook video or reel link"
            ariaLabel="Facebook video or reel link"
          />
        </motion.div>

        <motion.div {...fadeRise(3)} className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
          <button type="button" className="chip chip-action" onClick={runExample}>
            ▶ try an example
          </button>
          <span className="chip">no login</span>
          <span className="chip">hd quality</span>
          <span className="chip">public posts only</span>
        </motion.div>

        {/* Says the limit up front rather than burying it in the FAQ: the
            resolver reads og:video, which photo posts and login-walled posts
            never carry. Same wording as the FAQ answer. */}
        <motion.p {...fadeRise(4)} className="mt-6 text-sm text-[var(--faint)]">
          Photo posts and private videos are not supported: public videos and reels only.
        </motion.p>

        <motion.div {...fadeRise(5)} className="mt-8">
          <PlatformLinks active="facebook" />
        </motion.div>

        {/* No AnimatePresence here on purpose: an interrupted exit animation can wedge
            mode="wait" and block the card forever. Instant swap + card entrance
            animation is robust. */}
        <div ref={resultsRef} aria-live="polite" className="mt-10 scroll-mt-28 text-left">
          {state.status === "resolving" && <SkeletonCard />}
          {state.status === "ready" && <PreviewCard data={state.data} platform="facebook" />}
        </div>

        <motion.div {...fadeRise(6)}>
          <FacebookHowToVisual />
        </motion.div>
      </main>
    </div>
  );
}

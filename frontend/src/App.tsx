import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { AdSlot } from "./components/AdSlot";
import { HowToVisual } from "./components/HowToVisual";
import { PasteInput } from "./components/PasteInput";
import { PreviewCard } from "./components/PreviewCard";
import { SkeletonCard } from "./components/SkeletonCard";
import { ThemeToggle } from "./components/ThemeToggle";
import { useResolve } from "./hooks/useResolve";
import { EASE_OUT, fadeRise } from "./lib/motion";

// The maker's own video post, used as the one-click live demo.
const EXAMPLE_URL = "https://x.com/israfill/status/2077383034639094193";

export default function App() {
  const { state, resolve } = useResolve();
  const [prefill, setPrefill] = useState<string | null>(null);
  const navRef = useRef<HTMLElement>(null);

  function runExample() {
    setPrefill(EXAMPLE_URL);
    resolve(EXAMPLE_URL);
  }

  const resultsRef = useRef<HTMLDivElement>(null);

  // When a fetch lands, bring the preview card in front of the user's eyes.
  useEffect(() => {
    if (state.status !== "ready") return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    resultsRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
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
          <span>SaveVid AI</span>
          <span className="brand-dot">.</span>
        </span>
        <span className="flex items-center gap-2">
          <span className="nav-meta">Twitter/X · no login</span>
          <ThemeToggle />
          <button type="button" className="btn btn-small" onClick={focusInput}>
            Download
          </button>
        </span>
      </motion.nav>

      <main className="w-full max-w-3xl flex-1 pb-24 pt-[clamp(140px,22vh,220px)] text-center">
        <div aria-hidden className="aurora">
          <div className="blob blob-a" />
          <div className="blob blob-b" />
        </div>

        {/* H1 targets the search query per the spec's SEO section; the brand lives in the nav */}
        <h1 className="hero-h1">
          <span className="word">
            <motion.span
              className="inline-block"
              initial={{ y: "110%" }}
              animate={{ y: 0 }}
              transition={{ duration: 0.9, ease: EASE_OUT }}
            >
              Twitter Video
            </motion.span>
          </span>{" "}
          <span className="word grey small">
            <motion.span
              className="inline-block"
              initial={{ y: "110%" }}
              animate={{ y: 0 }}
              transition={{ duration: 0.9, ease: EASE_OUT, delay: 0.14 }}
            >
              Downloader
            </motion.span>
          </span>
        </h1>

        <motion.p {...fadeRise(1)} className="lede mt-6">
          One paste. Every quality. No garbage.
        </motion.p>

        <motion.div {...fadeRise(2)} className="mx-auto mt-9 max-w-2xl">
          <PasteInput
            status={state.status}
            errorMessage={state.status === "error" ? state.message : null}
            onSubmit={resolve}
            presetValue={prefill}
          />
        </motion.div>

        <motion.div {...fadeRise(3)} className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
          <button type="button" className="chip chip-action" onClick={runExample}>
            ▶ try an example
          </button>
          <span className="chip">no login</span>
          <span className="chip">no watermark</span>
          <span className="chip">original quality</span>
        </motion.div>

        <motion.p {...fadeRise(4)} className="mt-6 text-sm text-[var(--faint)]">
          Straight from Twitter's CDN. About two seconds per video.
        </motion.p>

        {/* No AnimatePresence here on purpose: an interrupted exit animation can wedge
            mode="wait" and block the card forever (seen live when a resolve failed while
            the backend was down). Instant swap + card entrance animation is robust. */}
        <div ref={resultsRef} aria-live="polite" className="mt-10 scroll-mt-28 text-left">
          {state.status === "resolving" && <SkeletonCard />}
          {state.status === "ready" && <PreviewCard data={state.data} />}
        </div>

        <motion.div {...fadeRise(5)}>
          <HowToVisual />
        </motion.div>

        <AdSlot />
      </main>
    </div>
  );
}

import { useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AdSlot } from "./components/AdSlot";
import { Footer } from "./components/Footer";
import { PasteInput } from "./components/PasteInput";
import { PreviewCard } from "./components/PreviewCard";
import { SkeletonCard } from "./components/SkeletonCard";
import { ThemeToggle } from "./components/ThemeToggle";
import { useResolve } from "./hooks/useResolve";
import { fadeRise } from "./lib/motion";

export default function App() {
  const { state, resolve } = useResolve();

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

  return (
    <div className="relative isolate flex min-h-screen flex-col items-center px-4">
      {/* Swap frontend/public/hero.webp to change the hero art; overlay keeps text readable in both themes */}
      <div aria-hidden className="hero-bg">
        <img src="/hero.webp" alt="" decoding="async" />
      </div>
      <header className="flex w-full max-w-2xl items-center justify-between pt-4">
        <span className="font-semibold tracking-tight text-cyan-400">SaveVid AI</span>
        <ThemeToggle />
      </header>

      <main className="w-full max-w-2xl flex-1 pb-24 pt-16">
        {/* H1 targets the search query per the spec's SEO section; the brand lives in the header */}
        <motion.h1 {...fadeRise(0)} className="text-4xl font-bold tracking-tight">
          Twitter Video Downloader
        </motion.h1>
        <motion.p {...fadeRise(1)} className="mt-3 text-lg text-zinc-500">
          One paste. Every quality. No garbage.
        </motion.p>

        <motion.div {...fadeRise(2)} className="mt-8">
          <PasteInput
            status={state.status}
            errorMessage={state.status === "error" ? state.message : null}
            onSubmit={resolve}
          />
        </motion.div>

        <div aria-live="polite" className="mt-8">
          <AnimatePresence mode="wait">
            {state.status === "resolving" && <SkeletonCard key="skeleton" />}
            {state.status === "ready" && <PreviewCard key="card" data={state.data} />}
          </AnimatePresence>
        </div>

        <AdSlot />
      </main>

      <Footer />
    </div>
  );
}

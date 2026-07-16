import { useEffect, useState } from "react";
import { motion } from "motion/react";

export function ThemeToggle() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    try {
      localStorage.setItem("theme", dark ? "dark" : "light");
    } catch {
      // private mode; theme just won't persist
    }
  }, [dark]);

  return (
    <motion.button
      type="button"
      whileHover={{ rotate: 15 }}
      whileTap={{ scale: 0.9 }}
      onClick={() => setDark(!dark)}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      className="rounded-full border border-[var(--line)] p-2 text-[var(--muted)] transition hover:text-[var(--accent)]"
    >
      {dark ? <SunIcon /> : <MoonIcon />}
    </motion.button>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
    </svg>
  );
}

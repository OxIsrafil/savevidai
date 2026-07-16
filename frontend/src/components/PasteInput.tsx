import { useState, type FormEvent } from "react";
import { motion } from "motion/react";

type Props = {
  status: "idle" | "resolving" | "ready" | "error";
  errorMessage: string | null;
  onSubmit: (url: string) => void;
};

export function PasteInput({ status, errorMessage, onSubmit }: Props) {
  const [value, setValue] = useState("");
  const busy = status === "resolving";

  function submit(e: FormEvent) {
    e.preventDefault();
    const url = value.trim();
    if (url && !busy) onSubmit(url);
  }

  async function prefillFromClipboard() {
    if (value) return;
    try {
      const text = await navigator.clipboard.readText();
      if (text.includes("/status/")) setValue(text.trim());
    } catch {
      // clipboard permission denied or unavailable; typing still works
    }
  }

  return (
    <form onSubmit={submit}>
      <div className="flex flex-wrap items-stretch justify-center gap-3.5">
        <input
          id="paste-input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={prefillFromClipboard}
          placeholder="Paste a Twitter/X post link"
          aria-label="Twitter/X post link"
          spellCheck={false}
          autoComplete="off"
          className={`cta-input ${status === "error" ? "animate-shake" : ""}`}
        />
        <motion.button
          whileTap={{ scale: 0.97 }}
          type="submit"
          disabled={busy}
          aria-busy={busy}
          className="btn"
        >
          {busy ? <Spinner /> : "Fetch"}
        </motion.button>
      </div>
      {status === "error" && errorMessage && (
        <motion.p
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          role="alert"
          className="error-glow mt-4 text-sm text-[#ff453a]"
        >
          {errorMessage}
        </motion.p>
      )}
    </form>
  );
}

function Spinner() {
  return (
    <span
      data-testid="spinner"
      aria-hidden
      className="inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent align-middle"
    />
  );
}

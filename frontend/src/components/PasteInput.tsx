import { useEffect, useState, type FormEvent } from "react";
import { motion } from "motion/react";
import { enShared, enTwitter } from "../locales/en";

type Props = {
  status: "idle" | "resolving" | "ready" | "error";
  errorMessage: string | null;
  onSubmit: (url: string) => void;
  /** Externally injected URL (e.g. the example chip); mirrored into the field. */
  presetValue?: string | null;
  /** Field placeholder; defaults to the Twitter/X copy for the home page. */
  placeholder?: string;
  /** Accessible name for the field; defaults to the home page's Twitter/X copy. */
  ariaLabel?: string;
  /** Submit button label; defaults to English. */
  submitLabel?: string;
  /** Submit button label right after a fetch lands; defaults to English. */
  fetchedLabel?: string;
};

export function PasteInput({
  status,
  errorMessage,
  onSubmit,
  presetValue = null,
  placeholder = enTwitter.hero.placeholder,
  ariaLabel = enTwitter.hero.inputAriaLabel,
  submitLabel = enShared.input.submit,
  fetchedLabel = enShared.input.fetched,
}: Props) {
  const [value, setValue] = useState("");
  const [justFetched, setJustFetched] = useState(false);
  const busy = status === "resolving";

  useEffect(() => {
    if (presetValue) setValue(presetValue);
  }, [presetValue]);

  // Brief success state on the button so users know the fetch landed.
  useEffect(() => {
    if (status !== "ready") {
      setJustFetched(false);
      return;
    }
    setJustFetched(true);
    const t = setTimeout(() => setJustFetched(false), 2200);
    return () => clearTimeout(t);
  }, [status]);

  function submit(e: FormEvent) {
    e.preventDefault();
    const url = value.trim();
    if (url && !busy) onSubmit(url);
  }

  async function prefillFromClipboard() {
    if (value) return;
    try {
      const text = await navigator.clipboard.readText();
      if (text.includes("/status/") || text.includes("tiktok")) setValue(text.trim());
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
          placeholder={placeholder}
          aria-label={ariaLabel}
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
          {busy ? (
            <Spinner />
          ) : justFetched ? (
            <>
              <CheckIcon />
              <span>{fetchedLabel}</span>
            </>
          ) : (
            submitLabel
          )}
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

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="check-draw size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 12.5 10 18.5 20 6" />
    </svg>
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

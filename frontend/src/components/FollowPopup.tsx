import { useEffect, useId, useRef, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "motion/react";
import { EASE_OUT } from "../lib/motion";
import { X_HANDLE, X_PROFILE_URL } from "../lib/social";
import { enShared } from "../locales/en";
import type { FollowPopupStrings } from "../locales/types";

/**
 * The popup a video save button opens before its download starts. Following is
 * never required: Download always works, and every way out (Escape, the close
 * button, the backdrop) closes it without downloading anything.
 *
 * Portaled to document.body so no card's overflow can clip it, and so it sits
 * outside the results' aria-live region.
 */
export function FollowPopup({
  onDownload,
  onClose,
  strings = enShared.followPopup,
}: {
  onDownload: () => void;
  onClose: () => void;
  strings?: FollowPopupStrings;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const downloadRef = useRef<HTMLButtonElement>(null);
  const reduceMotion = useReducedMotion();

  // On open: focus the primary action and lock the page scroll behind the popup.
  useEffect(() => {
    downloadRef.current?.focus();
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
    };
  }, []);

  // On the document rather than the card, so Escape works wherever focus is.
  useEffect(() => {
    function onKeyDown(e: globalThis.KeyboardEvent) {
      if (e.key !== "Escape") return;
      e.preventDefault();
      onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  // Tab and Shift+Tab cycle through the dialog's own controls and never leave it.
  function trapTab(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Tab") return;
    const items = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>("a[href], button:not(:disabled)") ?? [],
    );
    if (items.length === 0) return;
    e.preventDefault();
    const at = items.indexOf(document.activeElement as HTMLElement);
    const next = e.shiftKey ? (at <= 0 ? items.length : at) - 1 : (at + 1) % items.length;
    items[next].focus();
  }

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <motion.div
        data-testid="follow-popup-backdrop"
        aria-hidden
        // detail > 1 is the second click of a double-click on a save button:
        // the first click opened the popup, so the second lands here. Ignore it.
        onClick={(e) => {
          if (e.detail <= 1) onClose();
        }}
        className="absolute inset-0 bg-black/45 backdrop-blur-sm dark:bg-black/65"
        initial={reduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2, ease: EASE_OUT }}
      />
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={trapTab}
        className="panel relative w-full max-w-md px-6 pb-6 pt-8 text-center outline-none"
        initial={reduceMotion ? false : { opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.24, ease: EASE_OUT }}
      >
        <div
          aria-hidden
          className="mx-auto flex size-14 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--pill)] text-[var(--fg)]"
        >
          <XLogo />
        </div>
        <h2 id={titleId} className="mt-4 text-xl font-semibold tracking-tight">
          {strings.title}
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">@{X_HANDLE}</p>
        <p className="mx-auto mt-3 max-w-[32ch] text-[0.95rem] leading-relaxed text-[var(--muted)]">
          {strings.line}
        </p>

        {/* Side by side while both labels fit, stacked under 400px. The link's
            colors carry the important modifier because index.css colors every
            <a> outside any layer, and unlayered CSS beats Tailwind's utilities.
            The {" "} is not rendered between flex items but keeps the
            accessible name spaced. */}
        <div className="mt-6 flex flex-wrap gap-3 max-[400px]:flex-col">
          <a
            href={X_PROFILE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex flex-1 items-center justify-center whitespace-nowrap rounded-full border border-transparent bg-black px-[1.15rem] py-[0.65rem] font-semibold text-white! transition hover:bg-neutral-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] dark:bg-white dark:text-black! dark:hover:bg-neutral-200"
          >
            {strings.follow.replace("{handle}", `@${X_HANDLE}`)}{" "}
            <span className="sr-only">{strings.newTab}</span>
          </a>
          <button
            ref={downloadRef}
            type="button"
            onClick={onDownload}
            className="quality-btn quality-btn-primary flex-1 whitespace-nowrap font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          >
            {strings.download}
          </button>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label={strings.close}
          className="absolute right-3 top-3 rounded-full p-2 text-[var(--muted)] transition hover:bg-[var(--pill)] hover:text-[var(--fg)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
        >
          <CloseIcon />
        </button>
      </motion.div>
    </div>,
    document.body,
  );
}

function XLogo() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" fill="currentColor" aria-hidden>
      <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M6 6 18 18M18 6 6 18" />
    </svg>
  );
}

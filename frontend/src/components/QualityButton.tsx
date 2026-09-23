import { useRef, useState } from "react";
import { motion } from "motion/react";
import { sendEvent } from "../lib/analytics";
import type { Variant } from "../lib/api";
import { downloadVariant, type Progress } from "../lib/download";
import { formatBytes } from "../lib/format";
import { enShared } from "../locales/en";
import type { FollowPopupStrings, QualityStrings } from "../locales/types";
import { FollowPopup } from "./FollowPopup";

type Phase =
  | { name: "idle" }
  | { name: "downloading"; progress: Progress }
  | { name: "done" }
  | { name: "failed" };

export function QualityButton({
  variant,
  filename,
  primary = false,
  platform = "twitter",
  strings = enShared.quality,
  popupStrings = enShared.followPopup,
}: {
  variant: Variant;
  filename: string;
  primary?: boolean;
  platform?: "twitter" | "tiktok" | "reddit" | "instagram" | "facebook";
  strings?: QualityStrings;
  popupStrings?: FollowPopupStrings;
}) {
  const [phase, setPhase] = useState<Phase>({ name: "idle" });
  const [popupOpen, setPopupOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const size = formatBytes(variant.size_bytes);
  // Show the true stored resolution (e.g. "1280×720"); fall back to the "720p"
  // label only when the API didn't give dimensions (rare, e.g. some GIFs).
  const dims =
    variant.width && variant.height
      ? `${variant.width}×${variant.height}`
      : variant.label.toUpperCase();
  const isHd = (variant.height ?? 0) >= 720 || variant.label === "hd";

  async function start() {
    if (phase.name === "downloading") return;
    setPhase({ name: "downloading", progress: { received: 0, total: variant.size_bytes } });
    sendEvent("download", { quality: variant.label, platform });
    try {
      await downloadVariant(variant.url, filename, (progress) =>
        setPhase({ name: "downloading", progress }),
      );
      setPhase({ name: "done" });
    } catch {
      setPhase({ name: "failed" });
    }
  }

  // A save click only opens the follow popup. The download starts from the
  // popup's Download button, through start() exactly as before.
  function openPopup() {
    if (phase.name === "downloading") return;
    setPopupOpen(true);
  }

  // Every way out of the popup hands focus back to this button.
  function closePopup() {
    setPopupOpen(false);
    buttonRef.current?.focus();
  }

  function downloadFromPopup() {
    closePopup();
    void start();
  }

  const pct =
    phase.name === "downloading" && phase.progress.total
      ? Math.min(1, phase.progress.received / phase.progress.total)
      : null;
  const indeterminate = phase.name === "downloading" && pct === null;

  return (
    <>
      <motion.button
        ref={buttonRef}
        type="button"
        onClick={openPopup}
        aria-haspopup="dialog"
        whileHover={{ y: -2 }}
        whileTap={{ scale: 0.97 }}
        data-phase={phase.name}
        aria-busy={phase.name === "downloading"}
        className={`quality-btn ${primary ? "quality-btn-primary" : ""}`}
      >
        <span
          aria-hidden
          className={`quality-fill ${indeterminate ? "quality-fill-sweep" : ""}`}
          style={
            indeterminate
              ? undefined
              : { transform: `scaleX(${phase.name === "done" ? 1 : (pct ?? 0)})` }
          }
        />
        <span className="relative z-10 flex items-center gap-2">
          {phase.name === "done" ? (
            <>
              <CheckIcon />
              <span className="font-semibold">{strings.saved}</span>
            </>
          ) : phase.name === "downloading" ? (
            <span className="font-mono text-sm tabular-nums">
              {pct === null ? strings.downloading : `${Math.round(pct * 100)}%`}
            </span>
          ) : (
            <>
              {variant.width && variant.height && isHd && (
                <span className="hd-chip uppercase">{strings.hdChip}</span>
              )}
              <span className="font-semibold tabular-nums">{dims}</span>
              {size && <span className="font-mono text-xs opacity-70">{size}</span>}
              {phase.name === "failed" && <span className="text-xs text-red-400">{strings.retry}</span>}
            </>
          )}
        </span>
      </motion.button>
      {popupOpen && (
        <FollowPopup strings={popupStrings} onDownload={downloadFromPopup} onClose={closePopup} />
      )}
    </>
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

import { useState } from "react";
import { motion } from "motion/react";
import type { Variant } from "../lib/api";
import { downloadVariant, type Progress } from "../lib/download";
import { formatBytes } from "../lib/format";

type Phase =
  | { name: "idle" }
  | { name: "downloading"; progress: Progress }
  | { name: "done" }
  | { name: "failed" };

export function QualityButton({
  variant,
  filename,
  primary = false,
}: {
  variant: Variant;
  filename: string;
  primary?: boolean;
}) {
  const [phase, setPhase] = useState<Phase>({ name: "idle" });
  const size = formatBytes(variant.size_bytes);
  // Show the true stored resolution (e.g. "1280×720"); fall back to the "720p"
  // label only when the API didn't give dimensions (rare, e.g. some GIFs).
  const dims =
    variant.width && variant.height ? `${variant.width}×${variant.height}` : variant.label;
  const isHd = (variant.height ?? 0) >= 720;

  async function start() {
    if (phase.name === "downloading") return;
    setPhase({ name: "downloading", progress: { received: 0, total: variant.size_bytes } });
    try {
      await downloadVariant(variant.url, filename, (progress) =>
        setPhase({ name: "downloading", progress }),
      );
      setPhase({ name: "done" });
    } catch {
      setPhase({ name: "failed" });
    }
  }

  const pct =
    phase.name === "downloading" && phase.progress.total
      ? Math.min(1, phase.progress.received / phase.progress.total)
      : null;
  const indeterminate = phase.name === "downloading" && pct === null;

  return (
    <motion.button
      type="button"
      onClick={start}
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
            <span className="font-semibold">Saved</span>
          </>
        ) : phase.name === "downloading" ? (
          <span className="font-mono text-sm tabular-nums">
            {pct === null ? "downloading" : `${Math.round(pct * 100)}%`}
          </span>
        ) : (
          <>
            {isHd && <span className="hd-chip uppercase">HD</span>}
            <span className="font-semibold tabular-nums">{dims}</span>
            {size && <span className="font-mono text-xs opacity-70">{size}</span>}
            {phase.name === "failed" && <span className="text-xs text-red-400">retry</span>}
          </>
        )}
      </span>
    </motion.button>
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

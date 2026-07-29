import { useState } from "react";
import { motion } from "motion/react";
import { sendEvent } from "../lib/analytics";
import type { MediaItem } from "../lib/api";
import { buildMediaFilename, downloadVariant } from "../lib/download";
import { cascade } from "../lib/motion";

type TileState = "idle" | "saving" | "saved" | "failed";

const STAGGER_MS = 600;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function PhotoGrid({
  photos,
  audio,
  handle,
  id,
  platform,
}: {
  photos: MediaItem[];
  audio: MediaItem | null;
  handle: string;
  id: string;
  platform: "twitter" | "tiktok" | "reddit" | "instagram" | "facebook";
}) {
  const [states, setStates] = useState<TileState[]>(() => photos.map(() => "idle"));
  const [savingAll, setSavingAll] = useState(false);
  const [soundState, setSoundState] = useState<TileState>("idle");

  function setTile(i: number, next: TileState) {
    setStates((prev) => prev.map((s, idx) => (idx === i ? next : s)));
  }

  // Save a single tile; returns whether it succeeded so Save all can carry on.
  async function savePhoto(i: number): Promise<void> {
    const variant = photos[i]?.variants[0];
    if (!variant) {
      setTile(i, "failed");
      return;
    }
    setTile(i, "saving");
    try {
      await downloadVariant(
        variant.url,
        buildMediaFilename(handle, id, "photo", photos[i].index),
        () => {},
      );
      setTile(i, "saved");
    } catch {
      setTile(i, "failed");
    }
  }

  async function onPhotoClick(i: number) {
    // Ignore tile taps while a Save all sweep is in flight so a photo isn't
    // downloaded (and beaconed) twice.
    if (savingAll || states[i] === "saving") return;
    sendEvent("download", { quality: "photo", platform });
    await savePhoto(i);
  }

  // One album beacon for the whole batch, then a staggered sequential save so we
  // don't fire a burst of downloads; a failed tile is marked and the rest go on.
  async function onSaveAll() {
    if (savingAll) return;
    setSavingAll(true);
    sendEvent("download", { quality: "album", platform });
    for (let i = 0; i < photos.length; i++) {
      await savePhoto(i);
      if (i < photos.length - 1) await sleep(STAGGER_MS);
    }
    setSavingAll(false);
  }

  async function onSound() {
    if (!audio || soundState === "saving") return;
    const variant = audio.variants[0];
    if (!variant) return;
    setSoundState("saving");
    sendEvent("download", { quality: "sound", platform });
    try {
      await downloadVariant(variant.url, buildMediaFilename(handle, id, "sound"), () => {});
      setSoundState("saved");
    } catch {
      setSoundState("failed");
    }
  }

  return (
    <section aria-label="Photos" className="space-y-3.5">
      <motion.div {...cascade(2)} className="flex flex-wrap gap-2.5">
        <button
          type="button"
          onClick={onSaveAll}
          aria-busy={savingAll}
          className="quality-btn quality-btn-primary font-semibold"
        >
          Save all
        </button>
        {audio && (
          <button
            type="button"
            onClick={onSound}
            aria-busy={soundState === "saving"}
            data-state={soundState}
            className="quality-btn font-semibold"
          >
            {soundState === "saved"
              ? "Sound saved"
              : soundState === "failed"
                ? "Retry sound"
                : "Sound"}
          </button>
        )}
      </motion.div>

      <motion.div {...cascade(3)} className="photo-grid">
        {photos.map((photo, i) => {
          const src = photo.thumbnail ?? photo.variants[0]?.url ?? null;
          return (
            <button
              key={photo.index}
              type="button"
              onClick={() => onPhotoClick(i)}
              data-state={states[i]}
              aria-label={`Save photo ${photo.index}`}
              className="photo-tile group"
            >
              {src ? (
                <img src={src} alt="" loading="lazy" />
              ) : (
                <span aria-hidden className="photo-tile-empty" />
              )}
              <span aria-hidden className="photo-tile-overlay">
                {states[i] === "saved" ? (
                  <CheckIcon />
                ) : states[i] === "failed" ? (
                  <CrossIcon />
                ) : states[i] === "saving" ? (
                  <Spinner />
                ) : null}
              </span>
            </button>
          );
        })}
      </motion.div>
    </section>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="check-draw size-6"
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

function CrossIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M6 6 18 18M18 6 6 18" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg viewBox="0 0 24 24" className="photo-spinner size-6" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

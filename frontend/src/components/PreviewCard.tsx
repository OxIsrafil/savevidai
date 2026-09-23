import { motion } from "motion/react";
import type { MediaItem, ResolveResponse } from "../lib/api";
import { buildFilename } from "../lib/download";
import { formatDuration } from "../lib/format";
import { cardReveal, cascade } from "../lib/motion";
import { enShared } from "../locales/en";
import type { PreviewCardStrings } from "../locales/types";
import { PhotoGrid } from "./PhotoGrid";
import { QualityButton } from "./QualityButton";

export function PreviewCard({
  data,
  platform = "twitter",
  strings = enShared,
}: {
  data: ResolveResponse;
  platform?: "twitter" | "tiktok" | "reddit" | "instagram" | "facebook";
  strings?: PreviewCardStrings;
}) {
  // Route slideshow photos and the soundtrack to PhotoGrid; MediaSection only
  // ever handles playable video/gif items (its play badge + .mp4 filenames).
  const photos = data.items.filter((i) => i.kind === "image");
  const audio = data.items.find((i) => i.kind === "audio") ?? null;
  const media = data.items.filter((i) => i.kind === "video" || i.kind === "gif");

  return (
    <motion.article {...cardReveal} data-testid="preview-card" className="panel p-5">
      <motion.div {...cascade(0)} className="flex items-center gap-3">
        {data.avatar_url ? (
          <img src={data.avatar_url} alt="" className="size-10 rounded-full" />
        ) : (
          <div aria-hidden className="avatar-fallback">
            {data.handle.slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <p className="truncate font-semibold">{data.author}</p>
          <p className="truncate text-sm text-[var(--muted)]">@{data.handle}</p>
        </div>
      </motion.div>

      {data.text && (
        <motion.p {...cascade(1)} className="mt-3 line-clamp-3 text-sm text-[var(--muted)]">
          {data.text}
        </motion.p>
      )}

      <div className="mt-4 space-y-6">
        {photos.length > 0 && (
          <PhotoGrid
            photos={photos}
            audio={audio}
            handle={data.handle}
            id={data.id}
            platform={platform}
            strings={strings.photos}
          />
        )}
        {media.map((item) => (
          <MediaSection
            key={item.index}
            item={item}
            count={media.length}
            data={data}
            platform={platform}
            strings={strings}
          />
        ))}
      </div>
    </motion.article>
  );
}

function MediaSection({
  item,
  count,
  data,
  platform,
  strings,
}: {
  item: MediaItem;
  count: number;
  data: ResolveResponse;
  platform: "twitter" | "tiktok" | "reddit" | "instagram" | "facebook";
  strings: PreviewCardStrings;
}) {
  const many = count > 1;
  const numbered = strings.preview.videoN.replace("{n}", String(item.index));
  return (
    <section aria-label={many ? numbered : strings.preview.videoSingle}>
      {many && <h3 className="mb-2 text-sm font-medium text-[var(--muted)]">{numbered}</h3>}
      <motion.div {...cascade(2)} className="group relative overflow-hidden rounded-2xl">
        {item.thumbnail ? (
          <img
            src={item.thumbnail}
            alt=""
            className="aspect-video w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          // Metadata-light platforms (instagram) have no thumbnail; the media
          // element shows the file's first frame instead. Display needs no
          // CORS, preload=metadata keeps the fetch to a few hundred KB, and
          // the #t fragment forces browsers to paint that frame.
          <video
            src={`${item.variants[0].url}#t=0.001`}
            preload="metadata"
            muted
            playsInline
            aria-hidden
            tabIndex={-1}
            className="aspect-video w-full bg-[var(--pill)] object-cover"
          />
        )}
        <div aria-hidden className="play-badge">
          <svg viewBox="0 0 24 24" className="ml-0.5 size-5" fill="currentColor">
            <path d="M8 5.5v13l11-6.5-11-6.5Z" />
          </svg>
        </div>
        <div className="absolute bottom-2 right-2 flex items-center gap-2">
          {item.kind === "gif" && <span className="badge">{strings.preview.gifBadge}</span>}
          {item.duration_seconds != null && (
            <span className="badge font-mono">{formatDuration(item.duration_seconds)}</span>
          )}
        </div>
      </motion.div>
      <motion.div {...cascade(3)} className="mt-3.5 flex flex-wrap gap-2.5">
        {item.variants.map((variant, i) => (
          <QualityButton
            key={variant.url}
            variant={variant}
            primary={i === 0}
            platform={platform}
            strings={strings.quality}
            popupStrings={strings.followPopup}
            filename={buildFilename(data.handle, data.id, variant.label, item.index, count)}
          />
        ))}
      </motion.div>
    </section>
  );
}

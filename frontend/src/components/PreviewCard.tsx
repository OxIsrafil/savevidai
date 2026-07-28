import { motion } from "motion/react";
import type { MediaItem, ResolveResponse } from "../lib/api";
import { buildFilename } from "../lib/download";
import { formatDuration } from "../lib/format";
import { cardReveal, cascade } from "../lib/motion";
import { PhotoGrid } from "./PhotoGrid";
import { QualityButton } from "./QualityButton";

export function PreviewCard({
  data,
  platform = "twitter",
}: {
  data: ResolveResponse;
  platform?: "twitter" | "tiktok" | "reddit" | "instagram";
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
          />
        )}
        {media.map((item) => (
          <MediaSection
            key={item.index}
            item={item}
            count={media.length}
            data={data}
            platform={platform}
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
}: {
  item: MediaItem;
  count: number;
  data: ResolveResponse;
  platform: "twitter" | "tiktok" | "reddit" | "instagram";
}) {
  const many = count > 1;
  return (
    <section aria-label={many ? `Video ${item.index}` : "Video"}>
      {many && (
        <h3 className="mb-2 text-sm font-medium text-[var(--muted)]">Video {item.index}</h3>
      )}
      <motion.div {...cascade(2)} className="group relative overflow-hidden rounded-2xl">
        {item.thumbnail ? (
          <img
            src={item.thumbnail}
            alt=""
            className="aspect-video w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="aspect-video w-full bg-[var(--pill)]" />
        )}
        <div aria-hidden className="play-badge">
          <svg viewBox="0 0 24 24" className="ml-0.5 size-5" fill="currentColor">
            <path d="M8 5.5v13l11-6.5-11-6.5Z" />
          </svg>
        </div>
        <div className="absolute bottom-2 right-2 flex items-center gap-2">
          {item.kind === "gif" && <span className="badge">GIF</span>}
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
            filename={buildFilename(data.handle, data.id, variant.label, item.index, count)}
          />
        ))}
      </motion.div>
    </section>
  );
}

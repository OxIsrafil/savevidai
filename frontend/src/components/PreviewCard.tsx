import { motion } from "motion/react";
import type { MediaItem, ResolveResponse } from "../lib/api";
import { buildFilename } from "../lib/download";
import { formatDuration } from "../lib/format";
import { cardReveal, cascade } from "../lib/motion";
import { QualityButton } from "./QualityButton";

export function PreviewCard({ data }: { data: ResolveResponse }) {
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
        {data.items.map((item) => (
          <MediaSection key={item.index} item={item} data={data} />
        ))}
      </div>
    </motion.article>
  );
}

function MediaSection({ item, data }: { item: MediaItem; data: ResolveResponse }) {
  const many = data.items.length > 1;
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
            filename={buildFilename(data.handle, data.id, variant.label, item.index, data.items.length)}
          />
        ))}
      </motion.div>
    </section>
  );
}

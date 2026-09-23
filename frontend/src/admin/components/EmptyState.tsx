/** A dashed box, at least 96px tall, 28px radius, one muted sentence. */
export function EmptyState({ text }: { text: string }) {
  return <p className="grid min-h-24 place-items-center rounded-tile border border-dashed border-line/60 px-4 text-center text-sm text-text-muted">{text}</p>;
}

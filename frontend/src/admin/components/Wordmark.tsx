import { ArrowDownToLine } from "lucide-react";

/** A 22px blue rounded square with a white download arrow, then "SaveVid". */
export function Wordmark() {
  return (
    <span className="inline-flex items-center gap-2">
      <span aria-hidden="true" className="grid size-[22px] shrink-0 place-items-center rounded-[6px] bg-brand text-white">
        <ArrowDownToLine className="size-3.5" strokeWidth={2.5} />
      </span>
      <span className="text-[15px] font-semibold tracking-[-0.01em] text-text-primary">SaveVid</span>
    </span>
  );
}

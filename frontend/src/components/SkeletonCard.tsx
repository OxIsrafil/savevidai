import { motion } from "motion/react";
import { cardReveal } from "../lib/motion";

export function SkeletonCard() {
  return (
    <motion.div
      {...cardReveal}
      data-testid="skeleton"
      className="panel p-5"
    >
      <div className="flex items-center gap-3">
        <div className="size-10 rounded-full shimmer" />
        <div className="h-4 w-40 rounded-full shimmer" />
      </div>
      <div className="mt-4 aspect-video w-full rounded-2xl shimmer" />
      <div className="mt-4 flex gap-2">
        <div className="h-11 w-32 rounded-full shimmer" />
        <div className="h-11 w-32 rounded-full shimmer" />
      </div>
    </motion.div>
  );
}

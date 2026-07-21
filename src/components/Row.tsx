import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PosterCard, PosterSkeleton } from "./PosterCard";
import type { MediaItem } from "../services/types";

export function Row({
  title,
  items,
  loading,
  progressFor,
}: {
  title: string;
  items?: MediaItem[];
  loading?: boolean;
  progressFor?: (item: MediaItem) => number | undefined;
}) {
  const scroller = useRef<HTMLDivElement>(null);

  const nudge = (dir: number) => {
    scroller.current?.scrollBy({ left: dir * (scroller.current.clientWidth * 0.8), behavior: "smooth" });
  };

  if (!loading && (!items || items.length === 0)) return null;

  return (
    <section className="group/row mb-8 animate-row-in">
      <h2 className="mb-3 px-4 text-lg font-bold tracking-tight sm:px-8">{title}</h2>
      <div className="relative">
        <button
          data-spatial-skip
          onClick={() => nudge(-1)}
          className="absolute left-0 top-0 z-10 hidden h-full w-10 items-center justify-center bg-gradient-to-r from-bg to-transparent opacity-0 transition-opacity group-hover/row:opacity-100 md:flex"
          aria-label="Scroll left"
        >
          <ChevronLeft />
        </button>
        <div
          ref={scroller}
          className="no-scrollbar focus-scroller flex gap-2.5 overflow-x-auto scroll-smooth px-4 sm:px-8"
        >
          {loading
            ? Array.from({ length: 8 }).map((_, i) => <PosterSkeleton key={i} />)
            : items!.map((item) => (
                <PosterCard key={`${item.type}-${item.id}`} item={item} progress={progressFor?.(item)} />
              ))}
        </div>
        <button
          data-spatial-skip
          onClick={() => nudge(1)}
          className="absolute right-0 top-0 z-10 hidden h-full w-10 items-center justify-center bg-gradient-to-l from-bg to-transparent opacity-0 transition-opacity group-hover/row:opacity-100 md:flex"
          aria-label="Scroll right"
        >
          <ChevronRight />
        </button>
      </div>
    </section>
  );
}

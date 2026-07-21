import { PosterCard } from "./PosterCard";
import type { MediaItem } from "../services/types";

/**
 * A full grid rather than a horizontal scroller.
 *
 * Used when a brand is picked from the strip: at that point the user has
 * narrowed to one collection and wants to see all of it, so making them drag
 * sideways through a single row would be the wrong shape.
 */
export function PosterGrid({
  title,
  items,
  loading,
}: {
  title: string;
  items?: MediaItem[];
  loading?: boolean;
}) {
  return (
    <section className="mb-8 animate-row-in">
      <h2 className="mb-3 px-4 text-lg font-bold tracking-tight sm:px-8">{title}</h2>

      {loading ? (
        <div className="grid grid-cols-3 gap-2.5 px-4 sm:grid-cols-4 sm:px-8 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="skeleton aspect-[2/3] w-full rounded-lg" />
          ))}
        </div>
      ) : items && items.length > 0 ? (
        <div className="grid grid-cols-3 gap-2.5 px-4 sm:grid-cols-4 sm:px-8 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
          {items.map((item) => (
            <PosterCard key={`${item.type}-${item.id}`} item={item} fluid />
          ))}
        </div>
      ) : (
        <p className="px-4 py-8 text-sm text-muted sm:px-8">Nothing to show here yet.</p>
      )}
    </section>
  );
}

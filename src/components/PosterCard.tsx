import { useNavigate } from "react-router-dom";
import { Play, Plus, Check } from "lucide-react";
import type { MediaItem } from "../services/types";
import { useAppStore } from "../store/useAppStore";
import { usePlay } from "../hooks/usePlay";

export function PosterCard({ item, progress }: { item: MediaItem; progress?: number }) {
  const navigate = useNavigate();
  const play = usePlay();
  const inList = useAppStore((s) => s.inWatchlist(item.id));
  const toggle = useAppStore((s) => s.toggleWatchlist);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => navigate(`/title/${item.type}/${item.id}`)}
      onKeyDown={(e) => e.key === "Enter" && navigate(`/title/${item.type}/${item.id}`)}
      className="focusable group relative w-[150px] shrink-0 cursor-pointer overflow-hidden rounded-lg bg-surface-2 transition-transform sm:w-[168px]"
    >
      <div className="aspect-[2/3] w-full">
        {item.poster ? (
          <img
            src={item.poster}
            alt={item.title}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center p-2 text-center text-xs text-muted">
            {item.title}
          </div>
        )}
      </div>

      {/* progress bar for continue-watching */}
      {progress !== undefined && progress > 0 && (
        <div className="absolute inset-x-0 bottom-0 h-1 bg-black/60">
          <div className="h-full bg-accent" style={{ width: `${Math.min(progress, 100)}%` }} />
        </div>
      )}

      {/* hover overlay */}
      <div className="pointer-events-none absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/90 via-black/10 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
        <div className="mb-1 line-clamp-2 text-xs font-bold">{item.title}</div>
        <div className="flex items-center gap-1.5 text-[11px] text-muted">
          <span className="text-accent">★ {item.rating || "—"}</span>
          <span>{item.year}</span>
        </div>
        <div className="pointer-events-auto mt-2 flex gap-1.5">
          <button
            onClick={(e) => {
              e.stopPropagation();
              play(item);
            }}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-black"
            aria-label="Play"
          >
            <Play size={15} fill="currentColor" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggle(item);
            }}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/40 bg-black/50 text-white"
            aria-label={inList ? "Remove from watchlist" : "Add to watchlist"}
          >
            {inList ? <Check size={15} /> : <Plus size={15} />}
          </button>
        </div>
      </div>
    </div>
  );
}

export function PosterSkeleton() {
  return <div className="skeleton aspect-[2/3] w-[150px] shrink-0 rounded-lg sm:w-[168px]" />;
}

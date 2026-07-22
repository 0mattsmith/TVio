import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Play, Plus, Check } from "lucide-react";
import type { MediaItem } from "../services/types";
import { useAppStore } from "../store/useAppStore";
import { usePlay } from "../hooks/usePlay";
import { PosterActions } from "./PosterActions";

/** Hold OK this long to bring up the actions dialog instead of opening the page. */
const HOLD_MS = 500;

/**
 * `fluid` drops the fixed width so the card fills a grid cell. Rows still want
 * the fixed width, because a horizontal scroller has no column to fill.
 */
export function PosterCard({
  item,
  progress,
  fluid,
}: {
  // Continue Watching passes progress entries, which carry the episode — shown
  // on the poster so an in-progress series is distinguishable from a film.
  item: MediaItem & { season?: number; episode?: number };
  progress?: number;
  fluid?: boolean;
}) {
  const navigate = useNavigate();
  const play = usePlay();
  const inList = useAppStore((s) => s.inWatchlist(item.id));
  const toggle = useAppStore((s) => s.toggleWatchlist);
  // Films get a "watched" tick; series are ticked per-episode in the browser.
  const watchedMovie = useAppStore((s) => (item.type === "movie" ? s.isWatched(item.id) : false));
  const [actionsOpen, setActionsOpen] = useState(false);

  const holdTimer = useRef<number>();
  const opened = useRef(false);
  const open = () => navigate(`/title/${item.type}/${item.id}`);

  // A tap of OK opens the title; holding it opens the quick actions. Split
  // across keydown/keyup because key repeat fires keydown continuously, so the
  // press itself can't be timed from a single event.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "Enter" || e.repeat) return;
    e.preventDefault();
    opened.current = false;
    holdTimer.current = window.setTimeout(() => {
      opened.current = true;
      setActionsOpen(true);
    }, HOLD_MS);
  };

  const onKeyUp = (e: React.KeyboardEvent) => {
    if (e.key !== "Enter") return;
    window.clearTimeout(holdTimer.current);
    if (!opened.current) open();
  };

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={open}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        className={`focusable group relative cursor-pointer overflow-hidden rounded-lg bg-surface-2 transition-transform ${
          fluid ? "w-full" : "w-[150px] shrink-0 sm:w-[168px]"
        }`}
      >
        <div className="aspect-[2/3] w-full">
          {item.poster ? (
            <img src={item.poster} alt={item.title} loading="lazy" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center p-2 text-center text-xs text-muted">
              {item.title}
            </div>
          )}
        </div>

        {/* Watched tick (films) */}
        {watchedMovie && (
          <div className="absolute right-1.5 top-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-green-500 text-white shadow ring-2 ring-black/40">
            <Check size={14} strokeWidth={3} />
          </div>
        )}

        {/* progress bar for continue-watching */}
        {progress !== undefined && progress > 0 && (
          <div className="absolute inset-x-0 bottom-0 h-1 bg-black/60">
            <div className="h-full bg-accent" style={{ width: `${Math.min(progress, 100)}%` }} />
          </div>
        )}

        <div className="pointer-events-none absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/90 via-black/10 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100 group-focus:opacity-100">
          <div className="poster-title mb-1 line-clamp-2 text-xs font-bold">{item.title}</div>
          <div className="poster-meta flex items-center gap-1.5 text-[11px] text-muted">
            {item.season && item.episode ? (
              <span className="font-bold text-accent">S{item.season} · E{item.episode}</span>
            ) : (
              <>
                <span className="text-accent">★ {item.rating || "—"}</span>
                <span>{item.year}</span>
              </>
            )}
          </div>

          {/* Hidden on TV (see index.css) — as focus stops inside every card
              these made moving along a row unpredictable. Hold OK there
              instead, which opens the same actions in a locked dialog. */}
          <div className="poster-actions pointer-events-auto mt-2 flex gap-1.5">
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

      {actionsOpen && <PosterActions item={item} onClose={() => setActionsOpen(false)} />}
    </>
  );
}

export function PosterSkeleton() {
  return <div className="skeleton aspect-[2/3] w-[150px] shrink-0 rounded-lg sm:w-[168px]" />;
}

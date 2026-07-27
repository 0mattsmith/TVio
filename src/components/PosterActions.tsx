import { useEffect, useRef } from "react";
import { Play, Plus, Check, X, Trash2, Eye } from "lucide-react";
import { Button } from "./Button";
import { usePlay } from "../hooks/usePlay";
import { useOverlayBack } from "../hooks/useOverlayBack";
import { useAppStore } from "../store/useAppStore";
import type { MediaItem } from "../services/types";

/**
 * Quick actions for a poster, opened by holding OK on a remote.
 *
 * On TV the per-poster buttons are hidden, because as focus stops inside every
 * card they made moving along a row unpredictable. Holding OK brings them back
 * on demand: the background dims and blurs, focus is locked to this dialog via
 * data-spatial-scope, and Back returns to exactly the poster you were on.
 */
export function PosterActions({
  item,
  onClose,
  context,
}: {
  item: MediaItem;
  onClose: () => void;
  /** Which row opened this — decides whether Remove-from-CW / Watchlist shows. */
  context?: "continue" | "watchlist";
}) {
  const play = usePlay();
  const inList = useAppStore((s) => s.inWatchlist(item.id));
  const toggle = useAppStore((s) => s.toggleWatchlist);
  const removeFromProgress = useAppStore((s) => s.removeFromProgress);
  const watched = useAppStore((s) => s.isWatched(item.id));
  const markWatched = useAppStore((s) => s.markWatched);
  const removeWatched = useAppStore((s) => s.removeWatched);

  const rootRef = useRef<HTMLDivElement>(null);

  // Only mounted while open, so Back always maps to closing this dialog.
  useOverlayBack(true, onClose);

  // The OK that opened this was HELD (that's how the menu appears). If we accept
  // input straight away, the still-held key's auto-repeat lands on the focused
  // Play button and fires it. So swallow OK until it's released, then focus Play.
  useEffect(() => {
    let armed = false;
    const focusPlay = () => rootRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const onUp = (e: KeyboardEvent) => {
      if (armed || (e.key !== "Enter" && e.key !== " ")) return;
      armed = true;
      focusPlay();
    };
    const swallow = (e: KeyboardEvent) => {
      if (!armed && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("keydown", swallow, true);
    window.addEventListener("keyup", onUp, true);
    // Opened by pointer/tap (no key to release): arm shortly after so it's usable.
    const t = window.setTimeout(() => {
      if (!armed) {
        armed = true;
        focusPlay();
      }
    }, 500);
    return () => {
      window.removeEventListener("keydown", swallow, true);
      window.removeEventListener("keyup", onUp, true);
      window.clearTimeout(t);
    };
  }, []);

  useEffect(() => {
    // Capture phase, so this closes the dialog before the global Back handler
    // can send focus off to the navbar.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Backspace") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return (
    <div
      data-spatial-scope
      onClick={onClose}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl border border-white/10 bg-surface p-6 shadow-card"
      >
        <div className="flex gap-4">
          {item.poster && (
            <img src={item.poster} alt="" className="h-32 w-[88px] shrink-0 rounded-lg object-cover" />
          )}
          <div className="min-w-0">
            <h2 className="line-clamp-3 text-lg font-bold leading-tight">{item.title}</h2>
            <p className="mt-1 text-sm text-muted">
              <span className="text-accent">★ {item.rating || "—"}</span> · {item.year}
            </p>
          </div>
        </div>

        <div ref={rootRef} className="mt-6 space-y-2.5">
          <Button
            className="w-full py-3"
            onClick={() => {
              onClose();
              play(item);
            }}
          >
            <Play size={17} fill="currentColor" /> Play
          </Button>
          {/* Watchlist toggle — hidden only when opened from Continue Watching
              and the title is already listed (Remove-from-CW takes its place). */}
          {!(context === "continue" && inList) && (
            <Button
              variant="secondary"
              className="w-full py-3"
              onClick={() => {
                toggle(item);
                onClose();
              }}
            >
              {inList ? <Check size={17} /> : <Plus size={17} />}
              {inList ? "Remove from Watchlist" : "Add to Watchlist"}
            </Button>
          )}
          {/* Mark the whole title watched (or undo). Lets you backfill shows
              you've already seen so they leave "keep watching" suggestions. */}
          <Button
            variant="secondary"
            className="w-full py-3"
            onClick={() => {
              if (watched) removeWatched(item.id);
              else markWatched(item);
              onClose();
            }}
          >
            {watched ? <Check size={17} /> : <Eye size={17} />}
            {watched ? "Remove from Watched" : "Mark as watched"}
          </Button>
          {/* Remove from Continue Watching — only when opened from that row. */}
          {context === "continue" && (
            <Button
              variant="secondary"
              className="w-full py-3"
              onClick={() => {
                removeFromProgress(item.id);
                onClose();
              }}
            >
              <Trash2 size={16} /> Remove from Continue Watching
            </Button>
          )}
          <Button variant="ghost" className="w-full py-3" onClick={onClose}>
            <X size={16} /> Back
          </Button>
        </div>
      </div>
    </div>
  );
}

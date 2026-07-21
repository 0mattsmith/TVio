import { useEffect } from "react";
import { Play, Plus, Check, X } from "lucide-react";
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
export function PosterActions({ item, onClose }: { item: MediaItem; onClose: () => void }) {
  const play = usePlay();
  const inList = useAppStore((s) => s.inWatchlist(item.id));
  const toggle = useAppStore((s) => s.toggleWatchlist);

  // Only mounted while open, so Back always maps to closing this dialog.
  useOverlayBack(true, onClose);

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

        <div className="mt-6 space-y-2.5">
          <Button
            autoFocus
            className="w-full py-3"
            onClick={() => {
              onClose();
              play(item);
            }}
          >
            <Play size={17} fill="currentColor" /> Play
          </Button>
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
          <Button variant="ghost" className="w-full py-3" onClick={onClose}>
            <X size={16} /> Back
          </Button>
        </div>
      </div>
    </div>
  );
}

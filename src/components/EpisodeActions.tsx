import { useEffect, useRef } from "react";
import { Play, Check, Eye, X } from "lucide-react";
import { Button } from "./Button";
import { usePlay } from "../hooks/usePlay";
import { useOverlayBack } from "../hooks/useOverlayBack";
import { useAppStore } from "../store/useAppStore";
import type { MediaItem } from "../services/types";

/**
 * Hold-OK actions for a single episode: play it, or tick/untick it as watched —
 * the same manual override films have, for when the auto-tick missed it or you
 * watched the episode elsewhere. Focus is locked inside the dialog.
 */
export function EpisodeActions({
  series,
  season,
  episode,
  title,
  onClose,
}: {
  series: MediaItem;
  season: number;
  episode: number;
  title: string;
  onClose: () => void;
}) {
  const play = usePlay();
  const watched = useAppStore((s) => s.isEpisodeWatched(series.id, season, episode));
  const markWatched = useAppStore((s) => s.markWatched);
  const removeEpisodeWatched = useAppStore((s) => s.removeEpisodeWatched);
  const rootRef = useRef<HTMLDivElement>(null);

  useOverlayBack(true, onClose);

  // The OK that opened this was HELD, so swallow it until released (then focus
  // Play), and close on Escape/Back — mirrors the poster hold-OK menu.
  useEffect(() => {
    let armed = false;
    const focusFirst = () => rootRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const onUp = (e: KeyboardEvent) => {
      if (armed || (e.key !== "Enter" && e.key !== " ")) return;
      armed = true;
      focusFirst();
    };
    const swallow = (e: KeyboardEvent) => {
      if (!armed && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    const onBack = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Backspace") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", swallow, true);
    window.addEventListener("keyup", onUp, true);
    window.addEventListener("keydown", onBack, true);
    const t = window.setTimeout(() => { if (!armed) { armed = true; focusFirst(); } }, 500);
    return () => {
      window.removeEventListener("keydown", swallow, true);
      window.removeEventListener("keyup", onUp, true);
      window.removeEventListener("keydown", onBack, true);
      window.clearTimeout(t);
    };
  }, [onClose]);

  return (
    <div
      data-spatial-scope
      onClick={onClose}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm"
    >
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-2xl border border-white/10 bg-surface p-6 shadow-card">
        <div className="text-xs font-bold uppercase tracking-wider text-accent">S{season} · E{episode}</div>
        <h2 className="mt-0.5 line-clamp-2 text-lg font-bold leading-tight">{title}</h2>

        <div ref={rootRef} className="mt-5 space-y-2.5">
          <Button className="w-full py-3" onClick={() => { onClose(); play(series, { season, episode }); }}>
            <Play size={17} fill="currentColor" /> Play
          </Button>
          <Button
            variant="secondary"
            className="w-full py-3"
            onClick={() => {
              if (watched) removeEpisodeWatched(series.id, season, episode);
              else markWatched(series, { season, episode });
              onClose();
            }}
          >
            {watched ? <Check size={17} /> : <Eye size={17} />}
            {watched ? "Remove from Watched" : "Mark as watched"}
          </Button>
          <Button variant="ghost" className="w-full py-3" onClick={onClose}>
            <X size={16} /> Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}

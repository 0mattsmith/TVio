import { useNavigate } from "react-router-dom";
import { useAppStore } from "../store/useAppStore";
import type { MediaItem } from "../services/types";

export interface EpisodeRef {
  season: number;
  episode: number;
}

// Central "Play" action. Respects the user's onPlay preference:
//  - "menu": open the Quick Watch sheet (choose a source / resolved stream)
//  - "best": jump straight into the in-app player (best source once resolvers rank streams)
// Optional episode context is threaded through for TV series.
export function usePlay() {
  const navigate = useNavigate();
  const behavior = useAppStore((s) => s.onPlayBehavior);
  const openQuickWatch = useAppStore((s) => s.openQuickWatch);

  return (item: MediaItem, episode?: EpisodeRef) => {
    if (behavior === "best") {
      const q = episode ? `?s=${episode.season}&e=${episode.episode}` : "";
      navigate(`/watch/${item.type}/${item.id}${q}`);
    } else {
      openQuickWatch(item, episode);
    }
  };
}

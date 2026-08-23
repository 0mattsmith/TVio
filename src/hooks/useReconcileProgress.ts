import { useEffect, useRef } from "react";
import { useAppStore } from "../store/useAppStore";
import { getDetail } from "../services/catalog";
import { computeNextEpisode } from "../services/nextEpisode";

/**
 * One-off cleanup for Continue Watching entries left sitting on a finished
 * episode by an older build (before finishing an episode advanced the entry).
 *
 * If an entry's exact episode is already ticked in watchedEpisodes, walk forward
 * to the first episode that ISN'T watched and park the entry there — or drop it
 * if the viewer has caught up to the end. Runs once per session; after bumping,
 * the entry no longer points at a watched episode, so it won't be touched again.
 */
export function useReconcileProgress() {
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;

    const { progress, watchedEpisodes, setProgress, removeFromProgress } = useAppStore.getState();
    const isWatched = (id: number, s: number, e: number) => watchedEpisodes.includes(`${id}:${s}:${e}`);
    const stuck = progress.filter(
      (p) => p.type === "tv" && p.season != null && p.episode != null && isWatched(p.id, p.season, p.episode)
    );
    if (stuck.length === 0) return;

    (async () => {
      for (const p of stuck) {
        try {
          const d = await getDetail("tv", p.id);
          // Skip over any run of already-watched episodes to the first unseen one.
          let next = computeNextEpisode(d.seasonsList, p.season!, p.episode!);
          while (next && isWatched(p.id, next.season, next.episode)) {
            next = computeNextEpisode(d.seasonsList, next.season, next.episode);
          }
          if (next) setProgress(d, 0, 0, next);
          else removeFromProgress(p.id); // caught up / series finished
        } catch {
          /* can't resolve this one right now — leave it untouched */
        }
      }
    })();
  }, []);
}

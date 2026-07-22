import type { SeasonSummary } from "./types";
import { fetchStreams, isWebPlayable, isHttpAddon, streamTitle } from "../addons/manager";
import { rankByTitleMatch, type StreamExpectation } from "../addons/match";

// "What plays after this episode?" — used by autoplay-next and by advancing the
// Continue Watching entry once an episode finishes.

export interface EpisodeRef {
  season: number;
  episode: number;
}

/**
 * The episode that follows (season, episode), or null at the end of the series.
 *
 * Rolls into the next real season when the current one runs out, skipping
 * "Specials" (season 0) — a special is never the natural next thing to watch
 * after a numbered episode.
 */
export function computeNextEpisode(
  seasons: SeasonSummary[] | undefined,
  season: number,
  episode: number
): EpisodeRef | null {
  if (!seasons?.length) return null;
  const current = seasons.find((s) => s.seasonNumber === season);
  if (current && episode < current.episodeCount) {
    return { season, episode: episode + 1 };
  }
  const nextSeason = seasons
    .filter((s) => s.seasonNumber > season && s.seasonNumber > 0)
    .sort((a, b) => a.seasonNumber - b.seasonNumber)[0];
  return nextSeason ? { season: nextSeason.seasonNumber, episode: 1 } : null;
}

/**
 * The season to open a show on by default: the earliest real season (skipping
 * Specials) unless progress puts the viewer in a later one.
 */
export function defaultSeason(seasons: SeasonSummary[] | undefined, inProgressSeason?: number): number {
  if (inProgressSeason && inProgressSeason > 0) return inProgressSeason;
  const real = (seasons ?? []).filter((s) => s.seasonNumber > 0).sort((a, b) => a.seasonNumber - b.seasonNumber);
  return real[0]?.seasonNumber ?? 1;
}

/**
 * Finds the best playable stream for a specific episode across the given
 * addons, applying the same title/episode/language checks Quick Watch uses so
 * autoplay never rolls onto a wrong-episode or foreign file. Null if nothing
 * suitable turns up.
 */
export async function resolveEpisodeStream(opts: {
  addons: { url: string }[];
  imdbId: string;
  ref: EpisodeRef;
  expect: StreamExpectation;
  native: boolean;
}): Promise<{ url: string; name: string } | null> {
  const { addons, imdbId, ref, expect, native } = opts;
  for (const addon of addons) {
    if (!isHttpAddon(addon.url)) continue;
    let streams;
    try {
      streams = await fetchStreams(addon.url, "tv", imdbId, ref.season, ref.episode);
    } catch {
      continue;
    }
    const playable = (native ? streams : streams.filter(isWebPlayable)).filter((s) => s.url);
    if (playable.length === 0) continue;

    const ranked = rankByTitleMatch(
      playable,
      (s) => streamTitle(s),
      { ...expect, season: ref.season, episode: ref.episode },
      (s) => s.behaviorHints?.videoSize
    );
    // First result that isn't a definite mismatch — never autoplay a wrong one.
    const best = ranked.find((r) => r.verdict !== "mismatch") ?? null;
    if (best) return { url: best.item.url!, name: streamTitle(best.item) };
  }
  return null;
}

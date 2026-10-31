// Auto-linking episodes to owned TorBox files by filename.
//
// Files are usually named with the date and/or SxxExx — e.g.
// "Raw S1E1 - Raw - Jan 11, 1993.mp4". We reuse the date/episode matchers (the
// same logic that ranks streams) to pick the right file per episode. Title isn't
// required to match (the user's own files are often tersely named), so it's only
// a tie-breaker when several files fit the same episode.

import type { Episode } from "./types";
import { matchDate, matchEpisode } from "../addons/match";
import { pinKey, type TorboxFile, type TorboxPin } from "./torbox";

const STOP = new Set(["the", "a", "an", "wwe", "wwf", "show", "night", "and"]);

function titleTokens(t: string): string[] {
  return t
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
}

function tokenOverlap(name: string, tokens: string[]): number {
  const n = name.toLowerCase();
  return tokens.reduce((acc, t) => acc + (n.includes(t) ? 1 : 0), 0);
}

/**
 * The best-matching library file for one episode, or null. A date match or an
 * exact SxxExx match is required (either is authoritative); a date match wins
 * over an episode-tag-only match, and a title-word overlap breaks ties.
 */
export function matchFileForEpisode(files: TorboxFile[], ep: Episode, seriesTitle: string): TorboxFile | null {
  const tokens = titleTokens(seriesTitle);
  const cands = files
    .map((f) => ({ f, d: matchDate(f.name, ep.airDate), e: matchEpisode(f.name, ep.seasonNumber, ep.episodeNumber) }))
    .filter((x) => x.d !== "mismatch" && x.e !== "mismatch")
    .filter((x) => x.d === "match" || x.e === "match");
  if (cands.length === 0) return null;
  cands.sort(
    (a, b) =>
      (a.d === "match" ? 0 : 1) - (b.d === "match" ? 0 : 1) ||
      tokenOverlap(b.f.name, tokens) - tokenOverlap(a.f.name, tokens)
  );
  return cands[0].f;
}

/**
 * Auto-link a batch of episodes to library files, returning a { pinKey: pin }
 * map of the confident matches. Each file is used at most once.
 */
export function autoLinkEpisodes(
  seriesId: number,
  seriesTitle: string,
  episodes: Episode[],
  files: TorboxFile[]
): Record<string, TorboxPin> {
  const out: Record<string, TorboxPin> = {};
  const used = new Set<string>();
  for (const ep of episodes) {
    const available = files.filter((f) => !used.has(`${f.type}:${f.id}:${f.fileId}`));
    const f = matchFileForEpisode(available, ep, seriesTitle);
    if (!f) continue;
    out[pinKey("tv", seriesId, ep.seasonNumber, ep.episodeNumber)] = {
      type: f.type,
      id: f.id,
      fileId: f.fileId,
      label: f.name,
    };
    used.add(`${f.type}:${f.id}:${f.fileId}`);
  }
  return out;
}

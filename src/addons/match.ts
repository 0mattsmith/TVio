// Sanity-checking what an addon sends back.
//
// We request streams by IMDb id, which is unambiguous — tt0108778 is Friends
// (1994) and nothing else. But the indexers behind an addon frequently match on
// filenames instead, so a request for Friends can come back with
// "Barney.and.Friends.S01E01" purely because the word appears in it.
//
// We can't fix their matching. We can notice it: compare the title embedded in
// each result against the title we asked for, and push the ones that clearly
// disagree to the bottom with a warning. Deliberately demoted rather than
// hidden — release naming is chaotic enough that over-filtering would hide
// working sources, which is a worse failure than showing a doubtful one.

/** Tokens that mark the end of the title portion of a release name. */
const STOP = /\b(s\d{1,2}e\d{1,3}|season|\d{3,4}p|19\d{2}|20\d{2}|web[- .]?dl|webrip|bluray|bdrip|hdtv|x26[45]|h ?26[45]|hevc|aac|ddp?5|remux|proper|repack|multi|dual)\b/i;

/**
 * Lowercase, strip punctuation, and rejoin dotted acronyms.
 *
 * "S.H.I.E.L.D." becomes six single letters once punctuation goes, which would
 * never match a release's "SHIELD". Runs of two or more single letters are
 * folded back into one word. The lone "s" from a possessive is left alone.
 */
function normalise(text: string): string {
  const words = text
    .toLowerCase()
    .replace(/[._]+/g, " ")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  const out: string[] = [];
  for (let i = 0; i < words.length; ) {
    let j = i;
    while (j < words.length && words[j].length === 1) j++;
    if (j - i >= 2) {
      out.push(words.slice(i, j).join(""));
      i = j;
    } else {
      out.push(words[i]);
      i++;
    }
  }
  return out.join(" ");
}

/**
 * The leading portion of a release name, before any quality/episode tag.
 *
 * `keepYears` exists because a bare four-digit number is ambiguous: usually a
 * release year, but sometimes part of the title (Blade Runner 2049, Dune 2021).
 * Callers try it both ways rather than guessing.
 */
export function titlePart(raw: string, keepYears = false): string {
  const flat = raw.replace(/[._]+/g, " ");
  const pattern = keepYears
    ? new RegExp(STOP.source.replace("|19\\d{2}|20\\d{2}", ""), "i")
    : STOP;
  const stop = flat.search(pattern);
  const title = normalise(stop > 0 ? flat.slice(0, stop) : flat);
  // Keeping years means the real release year is still attached — "blade runner
  // 2049 2017". Drop the trailing one; any year belonging to the title isn't last.
  return keepYears ? title.replace(/\s(?:19|20)\d{2}$/, "") : title;
}

export type MatchVerdict = "match" | "uncertain" | "mismatch";

/**
 * Words a release may legitimately add to a title without changing what it is —
 * regional variants, edition markers, and the like.
 */
const HARMLESS = new Set([
  "us", "uk", "au", "ca", "nz", "the", "a", "an",
  "remastered", "extended", "uncut", "unrated", "theatrical",
  "directors", "director", "cut", "edition", "complete", "series", "anime",
]);

/**
 * Compares the title in a release name with the one we asked for.
 *
 * Position is not the test — "friends with benefits" starts with "friends" and
 * is a different programme, while "friends us" is the same one. What matters is
 * what the *extra* words are: regional and edition tags are harmless, anything
 * else means a different title.
 */
export function matchTitle(releaseName: string, expected: string): MatchVerdict {
  const strict = judge(titlePart(releaseName, false), normalise(expected));
  if (strict === "match") return strict;
  // A number in the title may have been mistaken for a release year, so try
  // again keeping them and take whichever reading is kinder.
  const lenient = judge(titlePart(releaseName, true), normalise(expected));
  const rank: Record<MatchVerdict, number> = { match: 0, uncertain: 1, mismatch: 2 };
  return rank[lenient] < rank[strict] ? lenient : strict;
}

function judge(candidate: string, want: string): MatchVerdict {
  if (!candidate || !want) return "uncertain";
  if (candidate === want) return "match";

  const wantWords = want.split(" ").filter(Boolean);
  const candWords = candidate.split(" ").filter(Boolean);
  const wantSet = new Set(wantWords);

  if (!wantWords.every((w) => candWords.includes(w))) {
    // The release used a shorter name than TMDB's — "Agents of SHIELD" for
    // "Marvel's Agents of S.H.I.E.L.D.". Common, and not evidence of a
    // mismatch, so long as it adds nothing of its own.
    const isSubset = candWords.every((w) => wantSet.has(w));
    return isSubset ? "uncertain" : "mismatch";
  }

  const extras = candWords.filter((w) => !wantSet.has(w));
  if (extras.length === 0) return "match";
  return extras.every((w) => HARMLESS.has(w)) ? "match" : "mismatch";
}

/** Sorts likely mismatches last, preserving the addon's order within each group. */
export function rankByTitleMatch<T>(
  items: T[],
  nameOf: (item: T) => string,
  expected: string
): { item: T; verdict: MatchVerdict }[] {
  const weight: Record<MatchVerdict, number> = { match: 0, uncertain: 1, mismatch: 2 };
  return items
    .map((item, index) => ({ item, index, verdict: matchTitle(nameOf(item), expected) }))
    .sort((a, b) => weight[a.verdict] - weight[b.verdict] || a.index - b.index)
    .map(({ item, verdict }) => ({ item, verdict }));
}

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

/** A plausible release year (1900–2099) from a release name, or null. */
export function releaseYear(name: string): number | null {
  const matches = name.match(/\b(19\d{2}|20\d{2})\b/g);
  if (!matches) return null;
  // The last one is usually the release year; earlier digits are often part of
  // the title (Blade Runner 2049, 1917). Take whichever is a believable year.
  for (let i = matches.length - 1; i >= 0; i--) {
    const y = parseInt(matches[i], 10);
    if (y >= 1900 && y <= new Date().getFullYear() + 1) return y;
  }
  return null;
}

/**
 * Compares the year in a release name with the expected one. A year that's off
 * by one is treated as uncertain, not wrong — releases and TMDB occasionally
 * disagree by a year over festival vs general release dates.
 */
export function matchYear(name: string, expectedYear?: number): MatchVerdict {
  // Year is only ever a signal when it's present AND disagrees. A missing
  // expected year, or a release name with no year (common, especially for TV
  // episodes), is neutral — never a penalty.
  if (!expectedYear) return "match";
  const found = releaseYear(name);
  if (found === null) return "match";
  const diff = Math.abs(found - expectedYear);
  if (diff === 0) return "match";
  if (diff === 1) return "uncertain"; // festival vs general release can differ by a year
  return "mismatch";
}

const EPISODE_RE = /\bs(\d{1,2})[ ._-]?e(\d{1,3})\b/i;
const EPISODE_X_RE = /\b(\d{1,2})x(\d{1,3})\b/; // 1x05 style

/**
 * Compares the season/episode tag in a release name with what we asked for.
 * A name with no episode tag is uncertain (could be a full-season pack), a
 * wrong number is a mismatch.
 */
export function matchEpisode(name: string, season?: number, episode?: number): MatchVerdict {
  if (season == null || episode == null) return "match"; // not a single episode
  const m = name.match(EPISODE_RE) || name.match(EPISODE_X_RE);
  if (!m) return "uncertain"; // season pack, or an oddly named file
  return parseInt(m[1], 10) === season && parseInt(m[2], 10) === episode ? "match" : "mismatch";
}

const RANK: Record<MatchVerdict, number> = { match: 0, uncertain: 1, mismatch: 2 };

const MB = 1_000_000;

// Release-name tags that signal a foreign-language audio track…
const FOREIGN_AUDIO =
  /\b(french|truefrench|vostfr|vff?|vfq|vo|german|deutsch|italian|ita|spanish|espanol|castellano|latino|korean|japanese|hindi|tamil|telugu|russian|polish|portuguese|dublado|legendado|nordic|swedish|danish|norwegian|dutch|turkish|thai)\b/i;
// …and tags that mean English is present anyway (multi-track, or explicit).
const ENGLISH_AUDIO = /\b(english|eng|multi|dual[ .-]?audio|dual)\b/i;

/**
 * Judges a release name's audio language against the preferred one.
 *
 * The audio codec isn't in the metadata, but the language usually is in the
 * name. A name that flags a foreign language and nothing English is very likely
 * a foreign dub — pushed down (or hidden by the caller). Anything that mentions
 * English, is multi-track, or carries no language tag at all is left alone,
 * since untagged releases are overwhelmingly English.
 *
 * Only filters when English is preferred; other preferences pass through until
 * we build out per-language matching.
 */
export function matchAudioLanguage(name: string, preferred = "en"): MatchVerdict {
  if (preferred !== "en") return "match";
  if (ENGLISH_AUDIO.test(name)) return "match";
  return FOREIGN_AUDIO.test(name) ? "mismatch" : "match";
}

/** The release name explicitly flags English audio. */
export function hasEnglishTag(name: string): boolean {
  return ENGLISH_AUDIO.test(name);
}

/** The release name flags a foreign language and doesn't mention English —
 *  almost certainly a foreign dub, which we hide when English is wanted. */
export function isForeignOnly(name: string): boolean {
  return FOREIGN_AUDIO.test(name) && !ENGLISH_AUDIO.test(name);
}

/**
 * Is the file large enough to plausibly contain this runtime of video?
 *
 * We can't read a stream's real duration without opening it, but a file that's
 * far too small for the runtime is almost always a sample, a fake decoy, or a
 * short clip mislabelled as the whole thing — never what the user wants. The
 * floor is deliberately generous (a real rip is well above it) so a genuinely
 * low-quality-but-complete file isn't wrongly condemned.
 *
 *   < 0.7 MB/min (~90 kbps)  → sample/fake territory     → mismatch
 *   < 1.2 MB/min (~160 kbps) → suspiciously thin         → uncertain
 * Missing runtime or size → can't judge → no penalty.
 */
export function plausibleSize(sizeBytes?: number, runtimeMin?: number): MatchVerdict {
  if (!sizeBytes || !runtimeMin || runtimeMin <= 0) return "match";
  const mbPerMin = sizeBytes / MB / runtimeMin;
  if (mbPerMin < 0.7) return "mismatch";
  if (mbPerMin < 1.2) return "uncertain";
  return "match";
}

export interface StreamExpectation {
  title: string;
  year?: number;
  season?: number;
  episode?: number;
  /**
   * The episode's broadcast date (YYYY-MM-DD). For date-driven weekly shows —
   * wrestling (Raw, SmackDown, TNA, AEW), the soaps, long-runners — release
   * files are named by date, not SxxExx, so this is the strongest signal we have.
   */
  airDate?: string;
  /** TMDB runtime in minutes — enables the file-size plausibility check. */
  runtimeMin?: number;
  /** Preferred audio language (ISO 639-1) — flags foreign-dub releases. */
  preferredLang?: string;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/** Every plausible day-level date in a release name, as {y,m,d}. */
function datesIn(name: string): { y: number; m: number; d: number }[] {
  const out: { y: number; m: number; d: number }[] = [];
  const flat = ` ${name.toLowerCase().replace(/[._]+/g, " ")} `;
  let mm: RegExpExecArray | null;
  // YYYY MM DD (also YYYYMMDD): the most common wrestling/soap convention.
  let re = /\b(19|20)(\d\d)[.\-_ ]?(\d{1,2})[.\-_ ]?(\d{1,2})\b/g;
  while ((mm = re.exec(flat))) {
    const y = +(mm[1] + mm[2]), a = +mm[3], b = +mm[4];
    if (a >= 1 && a <= 12 && b >= 1 && b <= 31) out.push({ y, m: a, d: b });
  }
  // DD MM YYYY / MM DD YYYY — ambiguous, so accept whichever ordering is valid.
  re = /\b(\d{1,2})[.\-_ ](\d{1,2})[.\-_ ]((?:19|20)\d\d)\b/g;
  while ((mm = re.exec(flat))) {
    const a = +mm[1], b = +mm[2], y = +mm[3];
    if (b >= 1 && b <= 12 && a >= 1 && a <= 31) out.push({ y, m: b, d: a });
    if (a >= 1 && a <= 12 && b >= 1 && b <= 31) out.push({ y, m: a, d: b });
  }
  // Month-name dates: "Jan 01 2024" / "1st January 2024".
  re = /\b([a-z]{3,9})[.\-_ ]?(\d{1,2})(?:st|nd|rd|th)?,?[.\-_ ]((?:19|20)\d\d)\b/g;
  while ((mm = re.exec(flat))) {
    const mo = MONTHS[mm[1].slice(0, 3)];
    if (mo) out.push({ y: +mm[3], m: mo, d: +mm[2] });
  }
  re = /\b(\d{1,2})(?:st|nd|rd|th)?[.\-_ ]([a-z]{3,9})[.\-_ ]((?:19|20)\d\d)\b/g;
  while ((mm = re.exec(flat))) {
    const mo = MONTHS[mm[2].slice(0, 3)];
    if (mo) out.push({ y: +mm[3], m: mo, d: +mm[1] });
  }
  return out;
}

/**
 * Compares dates found in a release name with the episode's broadcast date.
 * "none" when the name carries no date (neutral — most files don't), so the
 * caller falls back to the SxxExx tag.
 */
export function matchDate(name: string, airDate?: string): "match" | "mismatch" | "none" {
  const t = airDate?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!t) return "none";
  const target = { y: +t[1], m: +t[2], d: +t[3] };
  const found = datesIn(name);
  if (found.length === 0) return "none";
  return found.some((f) => f.y === target.y && f.m === target.m && f.d === target.d) ? "match" : "mismatch";
}

export interface StreamCheck {
  verdict: MatchVerdict;
  /** Which dimension pulled the verdict down — for the badge label. */
  reason: "title" | "year" | "episode" | "size" | "language" | null;
}

/**
 * The overall verdict for a release name: the worst of title, year and episode.
 * `reason` names whichever failed, so the UI can say "Wrong episode?" rather
 * than a generic warning.
 */
export function checkStream(name: string, expect: StreamExpectation, sizeBytes?: number): StreamCheck {
  const episodic = expect.season != null && expect.episode != null;

  // Episode identity. When we know the broadcast date and the file carries a
  // date, the date is authoritative — uploaders of weekly shows routinely
  // mislabel or omit SxxExx, so a matching date beats a wrong tag, and a wrong
  // date sinks the file. With no date in the name we fall back to the SxxExx tag.
  const dateV = matchDate(name, expect.airDate);
  const episodeVerdict: MatchVerdict =
    dateV === "match" ? "match" : dateV === "mismatch" ? "mismatch" : matchEpisode(name, expect.season, expect.episode);

  const checks: { reason: StreamCheck["reason"]; verdict: MatchVerdict }[] = [
    { reason: "title", verdict: matchTitle(name, expect.title) },
    { reason: "episode", verdict: episodeVerdict },
    // A series' start year never matches an individual episode file's air year
    // (Corrie began in 1960; a 2024 episode's file says 2024), so the year check
    // is for movies only — otherwise every current episode reads as "wrong year".
    ...(episodic ? [] : [{ reason: "year" as const, verdict: matchYear(name, expect.year) }]),
    { reason: "size", verdict: plausibleSize(sizeBytes, expect.runtimeMin) },
    { reason: "language", verdict: matchAudioLanguage(name, expect.preferredLang ?? "en") },
  ];
  let verdict: MatchVerdict = "match";
  let reason: StreamCheck["reason"] = null;
  for (const c of checks) {
    if (RANK[c.verdict] > RANK[verdict]) {
      verdict = c.verdict;
      reason = c.reason;
    }
  }
  return { verdict, reason: verdict === "match" ? null : reason };
}

/** Sorts likely mismatches last, preserving the addon's order within each group. */
export function rankByTitleMatch<T>(
  items: T[],
  nameOf: (item: T) => string,
  expected: string | StreamExpectation,
  sizeOf?: (item: T) => number | undefined
): { item: T; verdict: MatchVerdict; reason: StreamCheck["reason"] }[] {
  // Accepts a bare title (title-only check) or a full expectation (title +
  // year + episode + runtime), so callers can opt into the stronger checks.
  const expect: StreamExpectation = typeof expected === "string" ? { title: expected } : expected;
  return items
    .map((item, index) => ({ item, index, ...checkStream(nameOf(item), expect, sizeOf?.(item)) }))
    .sort((a, b) => RANK[a.verdict] - RANK[b.verdict] || a.index - b.index)
    .map(({ item, verdict, reason }) => ({ item, verdict, reason }));
}

import type { Video } from "./types";

// Choosing a trailer that actually plays.
//
// TMDB cheerfully lists videos that no longer work: uploads that were deleted,
// videos since made private, and — by far the most common — clips whose owner
// disabled embedding, which leaves an <iframe> showing "Video unavailable".
// There's no way to detect that from inside the iframe (it's cross-origin), so
// we check each candidate up front and use the first that survives.
//
// Order of preference: right language → real trailer → official → YouTube over
// Vimeo → highest resolution. If nothing survives, the caller hides the section.

const TYPE_RANK: Record<string, number> = {
  Trailer: 0,
  Teaser: 1,
  Clip: 2,
  Featurette: 3,
  "Behind the Scenes": 4,
  Bloopers: 5,
};

/** Cap the work: probing every one of 40 videos would be silly. */
const MAX_CANDIDATES = 6;

/** Best first. */
export function rankVideos(videos: Video[], lang = "en"): Video[] {
  return videos
    .filter((v) => v.key && (v.site === "YouTube" || v.site === "Vimeo"))
    .map((v) => ({
      v,
      score: [
        !v.language || v.language === lang ? 0 : 1, // a Russian trailer helps nobody here
        TYPE_RANK[v.type] ?? 9,
        v.official === false ? 1 : 0,
        v.site === "YouTube" ? 0 : 1, // YouTube embeds most reliably
        v.size ? -v.size : 0, // prefer the highest resolution on offer
      ],
    }))
    .sort((a, b) => {
      for (let i = 0; i < a.score.length; i++) {
        if (a.score[i] !== b.score[i]) return a.score[i] - b.score[i];
      }
      return 0;
    })
    .map((x) => x.v);
}

type Verdict = "ok" | "gone" | "unknown";

/** Verdicts persist for the session — detail pages get revisited a lot. */
const cache = new Map<string, Verdict>();

const OEMBED: Record<string, (key: string) => string> = {
  YouTube: (k) =>
    `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${k}`)}`,
  Vimeo: (k) => `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(`https://vimeo.com/${k}`)}`,
};

/**
 * oEmbed gives the honest answer: 404 for a video that's gone, 401/403 when the
 * owner has disabled embedding — which is precisely the case that breaks us.
 */
async function probeOembed(video: Video, signal?: AbortSignal): Promise<Verdict> {
  const url = OEMBED[video.site]?.(video.key);
  if (!url) return "unknown";
  try {
    const res = await fetch(url, { signal });
    if (res.ok) return "ok";
    if (res.status === 401 || res.status === 403 || res.status === 404) return "gone";
    return "unknown";
  } catch {
    return "unknown"; // offline, CORS, blocked network — not the video's fault
  }
}

/**
 * Backup probe for when oEmbed can't be reached at all. YouTube serves a 120x90
 * grey placeholder for videos that no longer exist, and a real 320x180 thumbnail
 * for ones that do, so the intrinsic width answers the question without needing
 * CORS. It can't detect "embedding disabled", which is why it's second choice.
 */
function probeThumbnail(key: string, timeoutMs = 4000): Promise<Verdict> {
  return new Promise((resolve) => {
    const img = new Image();
    let settled = false;
    const done = (v: Verdict) => {
      if (settled) return;
      settled = true;
      img.onload = img.onerror = null;
      resolve(v);
    };
    const timer = setTimeout(() => done("unknown"), timeoutMs);
    img.onload = () => {
      clearTimeout(timer);
      done(img.naturalWidth > 120 ? "ok" : "gone");
    };
    img.onerror = () => {
      clearTimeout(timer);
      done("unknown");
    };
    img.src = `https://i.ytimg.com/vi/${key}/mqdefault.jpg`;
  });
}

export async function checkVideo(video: Video, signal?: AbortSignal): Promise<Verdict> {
  const id = `${video.site}:${video.key}`;
  const cached = cache.get(id);
  if (cached) return cached;

  let verdict = await probeOembed(video, signal);
  if (verdict === "unknown" && video.site === "YouTube") verdict = await probeThumbnail(video.key);

  // Only remember decisive answers; "unknown" is usually a network hiccup and
  // caching it would wrongly condemn the video for the rest of the session.
  if (verdict !== "unknown") cache.set(id, verdict);
  return verdict;
}

/**
 * The first video in preference order that isn't provably dead, or null.
 *
 * Note "unknown" counts as playable. Hiding a working trailer because a probe
 * timed out is a worse outcome than showing one that turns out to be broken, so
 * we only hide on a definite no.
 */
export async function pickPlayableVideo(videos: Video[], signal?: AbortSignal): Promise<Video | null> {
  for (const video of rankVideos(videos).slice(0, MAX_CANDIDATES)) {
    if (signal?.aborted) return null;
    if ((await checkVideo(video, signal)) !== "gone") return video;
  }
  return null;
}

export function embedUrl(video: Video): string {
  return video.site === "Vimeo"
    ? `https://player.vimeo.com/video/${video.key}`
    : `https://www.youtube-nocookie.com/embed/${video.key}?rel=0&modestbranding=1`;
}

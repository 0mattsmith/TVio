import type {
  MediaItem,
  MediaDetail,
  MediaType,
  CastMember,
  Video,
  WatchProvider,
  SeasonSummary,
  Episode,
  CollectionDetail,
} from "./types";

const V3 = "https://api.themoviedb.org/3";
export const IMG = "https://image.tmdb.org/t/p";

const ENV_KEY = import.meta.env.VITE_TMDB_KEY as string | undefined;
const TOKEN = import.meta.env.VITE_TMDB_TOKEN as string | undefined;
const ENV_REGION = (import.meta.env.VITE_TMDB_REGION as string) || "US";

// Optional server-side proxy (e.g. a Cloudflare Worker) that holds the TMDB key
// so it never ships in the client bundle. When set, requests go here and no key
// is sent from the browser — users need no configuration at all.
const ENV_PROXY = (import.meta.env.VITE_TMDB_PROXY as string | undefined)?.replace(/\/+$/, "") || undefined;

// Runtime overrides (set from Settings, persisted in the store) take precedence
// over the build-time env vars, so an end-user on the web / PWA build can supply
// their own TMDB key without editing .env.local.
let runtimeKey: string | undefined;
let runtimeRegion: string | undefined;

export function configureTmdb(opts: { key?: string; region?: string }) {
  runtimeKey = opts.key && opts.key.trim() ? opts.key.trim() : undefined;
  runtimeRegion = opts.region && opts.region.trim() ? opts.region.trim() : undefined;
}

function activeKey() {
  return runtimeKey || ENV_KEY;
}
export function hasTmdbKey(): boolean {
  return Boolean(ENV_PROXY || activeKey() || TOKEN);
}

// True when data works without the user supplying anything (baked-in key or proxy).
export function usingBuiltInKey(): boolean {
  return Boolean(ENV_PROXY || ENV_KEY || TOKEN);
}
export function currentRegion(): string {
  return runtimeRegion || ENV_REGION;
}

export function img(path: string | null, size: "w200" | "w342" | "w500" | "w780" | "original" = "w342") {
  return path ? `${IMG}/${size}${path}` : null;
}

async function tmdb<T>(path: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
  const url = new URL((ENV_PROXY || V3) + path);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  }
  const headers: Record<string, string> = { accept: "application/json" };
  // With a proxy the key lives server-side, so nothing is sent from the browser.
  if (!ENV_PROXY) {
    const key = activeKey();
    if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;
    else if (key) url.searchParams.set("api_key", key);
  }

  const res = await fetch(url.toString(), { headers });
  if (!res.ok) throw new Error(`TMDB ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

interface RawMedia {
  id: number;
  title?: string;
  name?: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date?: string;
  first_air_date?: string;
  vote_average?: number;
  overview?: string;
  genre_ids?: number[];
  media_type?: string;
}

function mapItem(raw: RawMedia, fallbackType: MediaType): MediaItem {
  const type: MediaType = (raw.media_type === "tv" || raw.media_type === "movie"
    ? raw.media_type
    : fallbackType) as MediaType;
  const date = raw.release_date || raw.first_air_date || "";
  return {
    id: raw.id,
    type,
    title: raw.title || raw.name || "Untitled",
    poster: img(raw.poster_path, "w342"),
    backdrop: img(raw.backdrop_path, "w780"),
    year: date ? date.slice(0, 4) : "",
    rating: raw.vote_average ? Math.round(raw.vote_average * 10) / 10 : 0,
    overview: raw.overview || "",
    genreIds: raw.genre_ids || [],
  };
}

interface Paged<T> { results: T[]; total_pages?: number }

async function list(path: string, type: MediaType, params: Record<string, string | number | undefined> = {}) {
  const data = await tmdb<Paged<RawMedia>>(path, params);
  return (data.results || []).filter((r) => r.poster_path).map((r) => mapItem(r, type));
}

// --- Discover-based rows for a specific streaming service ---
type Sort =
  | "popularity.desc"
  | "vote_count.desc"
  | "vote_average.desc"
  | "primary_release_date.desc"
  | "first_air_date.desc"
  | "first_air_date.asc";

export function discover(type: MediaType, opts: {
  providerId?: number;
  region?: string;
  sort?: Sort;
  genre?: number;
  newerThanDays?: number;
  page?: number;
  /** Studio/brand rows — Pixar, Marvel, Lucasfilm… "|" is OR in TMDB. */
  companies?: number[];
  /** TV originals for a given service's own network. */
  networks?: number[];
  minVotes?: number;
}) {
  const params: Record<string, string | number | undefined> = {
    include_adult: "false",
    sort_by: opts.sort || "popularity.desc",
    watch_region: opts.region || currentRegion(),
    with_watch_providers: opts.providerId && opts.providerId > 0 ? opts.providerId : undefined,
    with_genres: opts.genre,
    with_companies: opts.companies?.length ? opts.companies.join("|") : undefined,
    with_networks: type === "tv" && opts.networks?.length ? opts.networks.join("|") : undefined,
    page: opts.page || 1,
    "vote_count.gte": opts.minVotes ?? (opts.sort === "popularity.desc" ? 50 : undefined),
  };
  if (opts.newerThanDays) {
    const since = new Date(Date.now() - opts.newerThanDays * 86400000).toISOString().slice(0, 10);
    if (type === "movie") params["primary_release_date.gte"] = since;
    else params["first_air_date.gte"] = since;
  }
  return list(`/discover/${type}`, type, params);
}

export const trending = (type: MediaType | "all" = "all", window: "day" | "week" = "week") =>
  list(`/trending/${type}/${window}`, type === "tv" ? "tv" : "movie");

export const popular = (type: MediaType) => list(`/${type}/popular`, type);

export const search = (q: string) =>
  list("/search/multi", "movie", { query: q, include_adult: "false" });

export const genres = async (type: MediaType) => {
  const data = await tmdb<{ genres: { id: number; name: string }[] }>(`/genre/${type}/list`);
  return data.genres;
};

export async function detail(type: MediaType, id: number): Promise<MediaDetail> {
  const raw = await tmdb<any>(`/${type}/${id}`, {
    append_to_response: "credits,videos,watch/providers,external_ids",
    // Widens the video list beyond the request language so there are fallbacks
    // to fall back TO when the first-choice trailer turns out to be dead.
    include_video_language: "en,null",
  });
  const base = mapItem(raw, type);
  const cast: CastMember[] = (raw.credits?.cast || []).slice(0, 20).map((c: any) => ({
    id: c.id,
    name: c.name,
    character: c.character,
    profile: img(c.profile_path, "w200"),
  }));
  // Vimeo is kept as a genuine fallback — a handful of titles have nothing else.
  const videos: Video[] = (raw.videos?.results || [])
    .filter((v: any) => v.key && (v.site === "YouTube" || v.site === "Vimeo"))
    .map((v: any) => ({
      key: v.key,
      name: v.name,
      type: v.type,
      site: v.site,
      official: v.official,
      language: v.iso_639_1,
      size: v.size,
      publishedAt: v.published_at,
    }));
  const region = (raw["watch/providers"]?.results || {})[currentRegion()] || {};
  const providers: WatchProvider[] = [];
  const push = (arr: any[] | undefined, kind: WatchProvider["type"]) =>
    (arr || []).forEach((p: any) =>
      providers.push({ providerId: p.provider_id, name: p.provider_name, logo: img(p.logo_path, "w200"), type: kind })
    );
  push(region.flatrate, "flatrate");
  push(region.free, "free");
  push(region.ads, "ads");
  push(region.rent, "rent");
  push(region.buy, "buy");

  const seasonsList: SeasonSummary[] = (raw.seasons || [])
    .filter((s: any) => s.episode_count > 0)
    .map((s: any) => ({
      seasonNumber: s.season_number,
      name: s.name,
      episodeCount: s.episode_count,
      poster: img(s.poster_path, "w342"),
      airYear: s.air_date ? String(s.air_date).slice(0, 4) : "",
      overview: s.overview || "",
    }));

  return {
    ...base,
    tagline: raw.tagline || "",
    runtime: raw.runtime || (raw.episode_run_time?.[0] ?? null),
    genres: raw.genres || [],
    cast,
    videos,
    providers,
    watchLink: region.link || null,
    imdbId: raw.external_ids?.imdb_id || raw.imdb_id || null,
    seasons: raw.number_of_seasons,
    seasonsList: type === "tv" ? seasonsList : undefined,
    collectionId: raw.belongs_to_collection?.id ?? null,
    collectionName: raw.belongs_to_collection?.name ?? null,
  };
}

export async function tvSeason(id: number, seasonNumber: number): Promise<Episode[]> {
  const raw = await tmdb<any>(`/tv/${id}/season/${seasonNumber}`);
  return (raw.episodes || []).map((e: any) => ({
    seasonNumber,
    episodeNumber: e.episode_number,
    name: e.name || `Episode ${e.episode_number}`,
    overview: e.overview || "",
    still: img(e.still_path, "w342"),
    runtime: e.runtime ?? null,
    airDate: e.air_date || "",
    rating: e.vote_average ? Math.round(e.vote_average * 10) / 10 : 0,
  }));
}

export async function collectionDetail(collectionId: number): Promise<CollectionDetail> {
  const raw = await tmdb<any>(`/collection/${collectionId}`);
  // Sort on the raw release_date (not just year) so same-year entries stay in
  // true release order.
  const parts: MediaItem[] = (raw.parts || [])
    .filter((p: any) => p.poster_path)
    .sort((a: any, b: any) => String(a.release_date || "9999").localeCompare(String(b.release_date || "9999")))
    .map((p: any) => mapItem(p, "movie"));

  return {
    id: raw.id,
    name: raw.name || "Collection",
    overview: raw.overview || "",
    poster: img(raw.poster_path, "w342"),
    backdrop: img(raw.backdrop_path, "w780"),
    parts,
  };
}

export async function collection(collectionId: number): Promise<MediaItem[]> {
  return (await collectionDetail(collectionId)).parts;
}

/**
 * A title logo (transparent wordmark art) for a series or a film collection,
 * for the brand tiles. Collections rarely carry their own logo, so fall back to
 * the earliest film's. Returns a ready-to-use image URL, or null if there's none.
 */
export async function titleLogo(kind: "tv" | "movie" | "collection", id: number): Promise<string | null> {
  const pick = (logos: any[] | undefined): string | null => {
    const all = (logos || []).filter((l) => l.file_path);
    if (!all.length) return null;
    const en = all.filter((l) => l.iso_639_1 === "en");
    const pool = (en.length ? en : all).slice();
    // Prefer PNG (safe in an <img>) then the most-voted rendition.
    pool.sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0));
    const best = pool.find((l) => String(l.file_path).endsWith(".png")) ?? pool[0];
    return img(best.file_path, "w342");
  };
  try {
    if (kind === "collection") {
      const c = await tmdb<any>(`/collection/${id}/images`, { include_image_language: "en,null" });
      const own = pick(c.logos);
      if (own) return own;
      const det = await tmdb<any>(`/collection/${id}`);
      const firstId = (det.parts || [])
        .filter((p: any) => p.release_date)
        .sort((a: any, b: any) => String(a.release_date).localeCompare(String(b.release_date)))[0]?.id;
      if (!firstId) return null;
      const m = await tmdb<any>(`/movie/${firstId}/images`, { include_image_language: "en,null" });
      return pick(m.logos);
    }
    const data = await tmdb<any>(`/${kind}/${id}/images`, { include_image_language: "en,null" });
    return pick(data.logos);
  } catch {
    return null;
  }
}

export async function person(id: number) {
  const raw = await tmdb<any>(`/person/${id}`, { append_to_response: "combined_credits" });
  const credits: MediaItem[] = (raw.combined_credits?.cast || [])
    .filter((c: any) => c.poster_path && (c.media_type === "movie" || c.media_type === "tv"))
    .map((c: any) => mapItem(c, c.media_type))
    .sort((a: MediaItem, b: MediaItem) => b.rating - a.rating);
  // de-dupe by id
  const seen = new Set<number>();
  const unique = credits.filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)));
  return {
    id: raw.id,
    name: raw.name as string,
    biography: raw.biography as string,
    profile: img(raw.profile_path, "w342"),
    knownFor: raw.known_for_department as string,
    credits: unique,
  };
}

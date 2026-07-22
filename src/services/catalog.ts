// Unified catalog layer: uses live TMDB when a key is present, otherwise
// deterministic demo data so the whole app is browsable out of the box.
import { hasTmdbKey, discover, trending, popular, detail, person, search, genres, tvSeason, collection, collectionDetail, titleLogo } from "./tmdb";
import { demoRow, demoDetail, demoSeason } from "./demo";
import type { MediaItem, MediaType, CollectionDetail } from "./types";

export type RowKind = "popular" | "trending" | "new";

export async function serviceRow(
  type: MediaType,
  providerId: number,
  kind: RowKind,
  genre?: number
): Promise<MediaItem[]> {
  if (!hasTmdbKey()) return demoRow(type, providerId + kind.length, 18);
  const sort =
    kind === "trending"
      ? "vote_count.desc"
      : kind === "new"
      ? type === "movie"
        ? "primary_release_date.desc"
        : "first_air_date.desc"
      : "popularity.desc";
  return discover(type, {
    providerId,
    sort: sort as any,
    genre,
    newerThanDays: kind === "new" ? 120 : undefined,
  });
}

/** Studio/brand row — "Pixar", "Marvel", "Star Wars" and friends. */
export async function companiesRow(
  type: MediaType,
  providerId: number,
  companies: number[]
): Promise<MediaItem[]> {
  if (!hasTmdbKey()) return demoRow(type, companies[0] ?? 1, 18);
  return discover(type, { providerId, companies, sort: "popularity.desc", minVotes: 20 });
}

/** A service's own originals, via its TV network. Series only. */
export async function networkRow(type: MediaType, networkId: number): Promise<MediaItem[]> {
  if (!hasTmdbKey()) return demoRow(type, networkId, 18);
  return discover(type, { networks: [networkId], sort: "popularity.desc", minVotes: 20 });
}

/** Highest-rated on a service, rather than merely the most popular. */
export async function topRatedRow(type: MediaType, providerId: number): Promise<MediaItem[]> {
  if (!hasTmdbKey()) return demoRow(type, providerId + 11, 18);
  return discover(type, { providerId, sort: "vote_average.desc", minVotes: 300 });
}

export async function trendingRow(type: MediaType): Promise<MediaItem[]> {
  if (!hasTmdbKey()) return demoRow(type, 3, 18);
  return trending(type, "week");
}

export async function popularRow(type: MediaType): Promise<MediaItem[]> {
  if (!hasTmdbKey()) return demoRow(type, 7, 18);
  return popular(type);
}

export async function genreRow(type: MediaType, genreId: number): Promise<MediaItem[]> {
  if (!hasTmdbKey()) return demoRow(type, genreId, 18);
  return discover(type, { genre: genreId, sort: "popularity.desc" });
}

export async function getGenres(type: MediaType) {
  if (!hasTmdbKey())
    return [
      { id: 28, name: "Action" }, { id: 35, name: "Comedy" }, { id: 18, name: "Drama" },
      { id: 27, name: "Horror" }, { id: 878, name: "Sci-Fi" }, { id: 53, name: "Thriller" },
      { id: 10749, name: "Romance" }, { id: 16, name: "Animation" },
    ];
  return genres(type);
}

export async function getDetail(type: MediaType, id: number) {
  if (!hasTmdbKey()) return demoDetail(type, id);
  return detail(type, id);
}

export async function getSeason(seriesId: number, seasonNumber: number) {
  if (!hasTmdbKey()) return demoSeason(seasonNumber);
  return tvSeason(seriesId, seasonNumber);
}

export async function getCollection(collectionId: number): Promise<MediaItem[]> {
  if (!hasTmdbKey()) return demoRow("movie", collectionId % 20, 6);
  return collection(collectionId);
}

/** Title-logo art for a brand tile (series or film collection), or null. */
export async function getTitleLogo(kind: "tv" | "movie" | "collection", id: number): Promise<string | null> {
  if (!hasTmdbKey()) return null;
  return titleLogo(kind, id);
}

export async function getCollectionDetail(collectionId: number): Promise<CollectionDetail> {
  if (!hasTmdbKey()) {
    const parts = demoRow("movie", collectionId % 20, 6);
    return {
      id: collectionId,
      name: "Demo Collection",
      overview: "Add a TMDB key to load real film series.",
      poster: parts[0]?.poster ?? null,
      backdrop: parts[0]?.backdrop ?? null,
      parts,
    };
  }
  return collectionDetail(collectionId);
}

export async function getPerson(id: number) {
  if (!hasTmdbKey())
    return {
      id, name: "Demo Actor", biography: "Add a TMDB key to load real filmographies.",
      profile: `https://picsum.photos/seed/cast${id}/342/513`, knownFor: "Acting",
      credits: demoRow("movie", id, 12).concat(demoRow("tv", id + 5, 6)),
    };
  return person(id);
}

export async function searchAll(q: string): Promise<MediaItem[]> {
  if (!q.trim()) return [];
  if (!hasTmdbKey())
    return demoRow("movie", 2, 10)
      .concat(demoRow("tv", 4, 8))
      .filter((m) => m.title.toLowerCase().includes(q.toLowerCase()) || true);
  return search(q);
}

export { hasTmdbKey };

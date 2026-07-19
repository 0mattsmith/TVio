export type MediaType = "movie" | "tv";

export interface MediaItem {
  id: number;
  type: MediaType;
  title: string;
  poster: string | null;
  backdrop: string | null;
  year: string;
  rating: number; // 0-10
  overview: string;
  genreIds: number[];
}

export interface CastMember {
  id: number;
  name: string;
  character: string;
  profile: string | null;
}

export interface Video {
  key: string; // YouTube or Vimeo id
  name: string;
  type: string; // Trailer, Teaser…
  site: string; // "YouTube" | "Vimeo"
  official?: boolean;
  language?: string; // ISO 639-1
  size?: number; // 1080, 720…
  publishedAt?: string;
}

export interface WatchProvider {
  providerId: number;
  name: string;
  logo: string | null;
  type: "flatrate" | "rent" | "buy" | "ads" | "free";
}

/** A film series/franchise (TMDB "collection") — e.g. Star Wars, Halloween. */
export interface CollectionDetail {
  id: number;
  name: string;
  overview: string;
  poster: string | null;
  backdrop: string | null;
  /** Films in release order. */
  parts: MediaItem[];
}

export interface SeasonSummary {
  seasonNumber: number;
  name: string;
  episodeCount: number;
  poster: string | null;
  airYear: string;
  overview: string;
}

export interface Episode {
  seasonNumber: number;
  episodeNumber: number;
  name: string;
  overview: string;
  still: string | null;
  runtime: number | null;
  airDate: string;
  rating: number;
}

export interface MediaDetail extends MediaItem {
  tagline: string;
  runtime: number | null;
  genres: { id: number; name: string }[];
  cast: CastMember[];
  videos: Video[];
  providers: WatchProvider[];
  watchLink: string | null; // TMDB/JustWatch "where to watch" page for this title
  imdbId: string | null;
  seasons?: number;
  seasonsList?: SeasonSummary[]; // tv: season list for the episode browser
  collectionId?: number | null; // movie: part of a franchise/collection
  collectionName?: string | null;
}

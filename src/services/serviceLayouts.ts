import type { MediaItem, MediaType } from "./types";
import type { StreamService } from "./services";
import { serviceRow, companiesRow, networkRow, topRatedRow, getCollection, type DiscoverRowOpts } from "./catalog";

// Service-shaped browsing.
//
// When exactly one service is selected, the page is laid out the way that
// service lays out its own home screen — Disney+ leads with its five brands,
// Netflix with Trending/Top rated/genres, and so on. Blending two services'
// identities together would read as neither, so this only ever applies to a
// lone selection; anything else falls back to the neutral layout.
//
// Genres are matched by NAME rather than id: TMDB's movie and TV genre lists
// differ ("Action" vs "Action & Adventure", "Sci-Fi & Fantasy" only on TV), so
// hardcoding ids would silently produce empty or wrong rows on one of the tabs.

export interface BrandTile {
  key: string;
  name: string;
  /**
   * TMDB company logo path — the official artwork, same source as provider
   * icons. Optional: collection/series tiles carry no studio logo and render
   * their name as text on the plate instead.
   */
  logoPath?: string;
  /** Studio/brand tile: OR of these TMDB company ids. */
  companies?: number[];
  /** Franchise tile: a TMDB collection, shown as its films in release order. */
  collectionId?: number;
  /** Series tile: a show, shown as its individual season posters. */
  seriesId?: number;
  /** Layout tile: selecting it shows its own set of rows (e.g. WWE). */
  layout?: BrandRowSpec[];
  /** Restrict the tile to these tabs (defaults to both movie and tv). */
  types?: MediaType[];
  /**
   * True when the artwork is a dark wordmark on transparency, so it has to be
   * knocked out to white to show on the tile. This is a fact about the file,
   * not a styling choice — logos that carry their own colour (Marvel's red
   * block, Nat Geo's gold square) are left exactly as they are.
   */
  darkArtwork?: boolean;
}

/** One row inside a layout tile (see WWE_LAYOUT). */
export interface BrandRowSpec {
  key: string;
  title: string;
  /** A series shown as a horizontal row of its season posters. */
  seriesSeasons?: number;
  /** A discover row of a fixed media type (films or shows). */
  discover?: { mediaType: MediaType } & DiscoverRowOpts;
}

// The WWE homescreen when you pick the WWE tile: the weekly/flagship shows as
// season rows, the events as films, plus documentaries and the classics — all
// via TMDB (series ids and the WWE company, 146598, verified live).
const WWE_LAYOUT: BrandRowSpec[] = [
  { key: "raw", title: "Monday Night Raw", seriesSeasons: 4656 },
  { key: "smackdown", title: "Friday Night SmackDown", seriesSeasons: 1549 },
  { key: "nxt", title: "WWE NXT", seriesSeasons: 31991 },
  { key: "ple", title: "Premium Live Events (PPVs & PLEs)", discover: { mediaType: "movie", companies: [146598], sort: "primary_release_date.desc" } },
  { key: "docs", title: "Documentaries", discover: { mediaType: "tv", companies: [146598], genre: 99, sort: "popularity.desc", minVotes: 0 } },
  { key: "wcw", title: "WCW", seriesSeasons: 1837 },
  { key: "ecw", title: "ECW", seriesSeasons: 14774 },
  { key: "classic", title: "Classic Programming", discover: { mediaType: "tv", companies: [146598], sort: "first_air_date.asc", minVotes: 0 } },
];

/**
 * Two notes on what's reachable here.
 *
 * Marvel: the wanted look is a white block with BLACK "MARVEL" and WHITE
 * "STUDIOS". In the source artwork the block is red and both words are white
 * pixels, so any CSS filter moves them together — there's no way to send one
 * word dark and hold the other light. Exact would mean redrawing the mark as
 * an SVG, which is real work and someone else's trademark.
 *
 * The four dark wordmarks: an earlier attempt painted them through a CSS mask
 * so they could be tinted gold or blue. It rendered nothing on the real app —
 * a mask that doesn't load masks everything out — so they're plain images
 * again, and the colour on selection comes from the tile behind them, which
 * is just a background and cannot fail.
 */

type RowSpec =
  | { kind: "trending" | "popular" | "new"; title: string }
  | { kind: "toprated"; title: string }
  | { kind: "originals"; title: string }
  | { kind: "companies"; title: string; companies: number[] }
  | { kind: "genre"; title: string; genre: string };

interface Layout {
  rows: RowSpec[];
  brands?: BrandTile[];
}

// Company ids and logo paths verified against TMDB rather than recalled.
const DISNEY_BRANDS: BrandTile[] = [
  { key: "disney", name: "Disney", logoPath: "/wdrCwmRnLFJhEoH8GSfymY85KHT.png", companies: [2], darkArtwork: true },
  { key: "pixar", name: "Pixar", logoPath: "/1TjvGVDMYsj6JBxOAkUHpPEwLf7.png", companies: [3], darkArtwork: true },
  { key: "marvel", name: "Marvel", logoPath: "/hUzeosd33nzE5MCNsZxCGEKTXaQ.png", companies: [420] },
  // Lucasfilm's whole catalogue — kept on the TV tab (Mandalorian, Andor,
  // Ahsoka…). On Movies the curated Skywalker-saga collection tile below stands
  // in for it, so there aren't two "Star Wars" tiles on the same tab.
  { key: "starwars", name: "Star Wars", logoPath: "/tlVSws0RvvtPBwViUyOFAO0vcQS.png", companies: [1], darkArtwork: true, types: ["tv"] },
  { key: "natgeo", name: "National Geographic", logoPath: "/fRqMjLjyAqThtEg9P9WKCXLmCpJ.png", companies: [7521] },
  { key: "20th", name: "20th Century", logoPath: "/h0rjX5vjW5r8yEnUBStFarjcLT4.png", companies: [127928], darkArtwork: true },
  // Movie franchises — shown as their films in release order (TMDB collections).
  { key: "sw-saga", name: "Star Wars", collectionId: 10, types: ["movie"] },
  { key: "toystory", name: "Toy Story", collectionId: 10194, types: ["movie"] },
  // TV staples — shown as their individual season posters (see SeasonGrid).
  { key: "simpsons", name: "The Simpsons", seriesId: 456, types: ["tv"] },
  { key: "familyguy", name: "Family Guy", seriesId: 1434, types: ["tv"] },
  { key: "futurama", name: "Futurama", seriesId: 615, types: ["tv"] },
  { key: "americandad", name: "American Dad!", seriesId: 1433, types: ["tv"] },
];

const LAYOUTS: Record<string, Layout> = {
  netflix: {
    // WWE moved to Netflix — its own home, reachable from the WWE tile.
    brands: [{ key: "wwe", name: "WWE", layout: WWE_LAYOUT }],
    rows: [
      { kind: "trending", title: "Trending Now" },
      { kind: "originals", title: "Netflix Originals" },
      { kind: "new", title: "New on Netflix" },
      { kind: "toprated", title: "Critically Acclaimed" },
      { kind: "genre", title: "Comedies", genre: "Comedy" },
      { kind: "genre", title: "Documentaries", genre: "Documentary" },
      { kind: "genre", title: "Thrillers", genre: "Thriller" },
      { kind: "genre", title: "Romance", genre: "Romance" },
    ],
  },
  disney: {
    brands: DISNEY_BRANDS,
    rows: [
      { kind: "trending", title: "Recommended For You" },
      { kind: "new", title: "New to Disney+" },
      { kind: "companies", title: "Marvel", companies: [420] },
      { kind: "companies", title: "Star Wars", companies: [1] },
      { kind: "companies", title: "Pixar", companies: [3] },
      { kind: "companies", title: "Disney Classics", companies: [2] },
      { kind: "companies", title: "National Geographic", companies: [7521] },
      { kind: "genre", title: "Family", genre: "Family" },
      { kind: "genre", title: "Animation", genre: "Animation" },
    ],
  },
  prime: {
    rows: [
      { kind: "trending", title: "Trending Now" },
      { kind: "originals", title: "Amazon Originals" },
      { kind: "new", title: "Recently Added" },
      { kind: "toprated", title: "Top Rated" },
      { kind: "genre", title: "Action & Adventure", genre: "Action" },
      { kind: "genre", title: "Comedy", genre: "Comedy" },
      { kind: "genre", title: "Thrillers", genre: "Thriller" },
    ],
  },
  max: {
    rows: [
      { kind: "trending", title: "Trending Now" },
      { kind: "originals", title: "Max Originals" },
      { kind: "toprated", title: "Award Winners" },
      { kind: "new", title: "New on Max" },
      { kind: "genre", title: "Drama", genre: "Drama" },
      { kind: "genre", title: "Documentaries", genre: "Documentary" },
    ],
  },
  hulu: {
    rows: [
      { kind: "trending", title: "Trending Now" },
      { kind: "originals", title: "Hulu Originals" },
      { kind: "new", title: "New on Hulu" },
      { kind: "genre", title: "Comedy", genre: "Comedy" },
      { kind: "genre", title: "Horror", genre: "Horror" },
      { kind: "genre", title: "Documentaries", genre: "Documentary" },
    ],
  },
  paramount: {
    rows: [
      { kind: "trending", title: "Trending Now" },
      { kind: "originals", title: "Paramount+ Originals" },
      { kind: "new", title: "New on Paramount+" },
      { kind: "genre", title: "Action", genre: "Action" },
      { kind: "genre", title: "Comedy", genre: "Comedy" },
    ],
  },
  apple: {
    rows: [
      { kind: "trending", title: "Trending Now" },
      { kind: "originals", title: "Apple Originals" },
      { kind: "toprated", title: "Critically Acclaimed" },
      { kind: "new", title: "New on Apple TV+" },
      { kind: "genre", title: "Drama", genre: "Drama" },
    ],
  },
  peacock: {
    rows: [
      { kind: "trending", title: "Trending Now" },
      { kind: "originals", title: "Peacock Originals" },
      { kind: "new", title: "New on Peacock" },
      { kind: "genre", title: "Comedy", genre: "Comedy" },
      { kind: "genre", title: "Reality", genre: "Reality" },
    ],
  },
};

export interface ResolvedRow {
  key: string;
  title: string;
  load: () => Promise<MediaItem[]>;
}

/**
 * Shared query key for a brand's titles, so the strip's emptiness check and the
 * grid shown after selecting it are the same cached request rather than two.
 */
export function brandRowKey(type: MediaType, providerId: number, brand: BrandTile) {
  return ["brand-row", type, providerId, brand.key];
}

/**
 * The MediaItem[] loader for a tile — a studio's discover row or a film
 * collection. Series tiles (rendered as season posters, not a flat list) have
 * no loader here; SeasonGrid reads them from the series detail instead.
 */
export function brandItemsLoader(
  type: MediaType,
  providerId: number,
  brand: BrandTile
): (() => Promise<MediaItem[]>) | null {
  if (brand.collectionId != null) return () => getCollection(brand.collectionId!);
  if (brand.companies?.length) return () => companiesRow(type, providerId, brand.companies!);
  return null;
}

export function serviceBrands(service: StreamService, type: MediaType): BrandTile[] {
  const brands = LAYOUTS[service.key]?.brands ?? [];
  return brands.filter((b) => !b.types || b.types.includes(type));
}

export function hasServiceLayout(service: StreamService): boolean {
  return Boolean(LAYOUTS[service.key]);
}

/**
 * Concrete rows for a service, or null when we don't have a layout for it (the
 * caller then uses the generic Popular/Trending/New rows).
 *
 * Rows that can't apply to this tab are dropped rather than rendered empty:
 * "Originals" needs a TV network, and a genre absent from this media type's
 * TMDB list has no id to query.
 */
export function serviceLayoutRows(
  service: StreamService,
  type: MediaType,
  genres: { id: number; name: string }[]
): ResolvedRow[] | null {
  const layout = LAYOUTS[service.key];
  if (!layout) return null;

  const genreId = (name: string) =>
    genres.find((g) => g.name.toLowerCase() === name.toLowerCase())?.id ??
    genres.find((g) => g.name.toLowerCase().includes(name.toLowerCase()))?.id;

  const rows: ResolvedRow[] = [];

  for (const spec of layout.rows) {
    const key = `${service.key}:${type}:${spec.kind}:${spec.title}`;

    if (spec.kind === "originals") {
      // Films don't have a network to filter on, so this is a series-only row.
      if (type !== "tv" || !service.networkId) continue;
      const networkId = service.networkId;
      rows.push({ key, title: spec.title, load: () => networkRow(type, networkId) });
      continue;
    }

    if (spec.kind === "companies") {
      rows.push({ key, title: spec.title, load: () => companiesRow(type, service.providerId, spec.companies) });
      continue;
    }

    if (spec.kind === "genre") {
      const id = genreId(spec.genre);
      if (!id) continue;
      rows.push({ key, title: spec.title, load: () => serviceRow(type, service.providerId, "popular", id) });
      continue;
    }

    if (spec.kind === "toprated") {
      rows.push({ key, title: spec.title, load: () => topRatedRow(type, service.providerId) });
      continue;
    }

    rows.push({ key, title: spec.title, load: () => serviceRow(type, service.providerId, spec.kind) });
  }

  return rows;
}

import type { MediaItem, MediaType } from "./types";
import type { StreamService } from "./services";
import { serviceRow, companiesRow, networkRow, topRatedRow } from "./catalog";

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

/**
 * Per-brand art direction.
 *
 * Two kinds of artwork need opposite handling. Flat single-colour wordmarks
 * (Disney, Pixar, Lucasfilm, 20th Century) are drawn through a CSS mask, so the
 * shape can be filled with any colour we like — grey at rest, the brand's own
 * colour when picked. Logos that already carry colour (Marvel's red block, Nat
 * Geo's yellow) stay as images on a light plate and are adjusted with filters,
 * because recolouring them would destroy what makes them recognisable.
 */
export interface BrandStyle {
  /** Draw via CSS mask instead of <img>, so `fill*` applies. */
  mono?: boolean;
  tileIdle?: string;
  tileActive?: string;
  /** Mask fill — any CSS background, so gradients work. */
  fillIdle?: string;
  fillActive?: string;
  /** CSS filter for image-based logos. */
  filterIdle?: string;
  filterActive?: string;
}

export interface BrandTile {
  key: string;
  name: string;
  /** TMDB company logo path — the official artwork, same source as provider icons. */
  logoPath: string;
  companies: number[];
  style?: BrandStyle;
}

const GREY = "#9aa2ad"; // resting fill for mono wordmarks

/**
 * A note on Marvel, because the obvious request isn't quite reachable.
 *
 * The wanted look is a white block with BLACK "MARVEL" and WHITE "STUDIOS".
 * In the source artwork the block is red and both words are white pixels, so
 * any CSS filter moves them together — there's no way to send one word dark
 * and hold the other light. Getting it exact would mean redrawing the mark as
 * an SVG we control, which is both real work and someone else's trademark.
 * The compromise: the block lightens towards white at rest and returns to red
 * when selected, with the lettering white throughout.
 */

const BRAND_STYLES: Record<string, BrandStyle> = {
  disney: {
    mono: true,
    fillIdle: GREY,
    fillActive: "linear-gradient(180deg,#6fb5ff,#1a63d6)",
  },
  pixar: {
    mono: true,
    fillIdle: GREY,
    fillActive: "#0b3d6b",
    tileActive: "linear-gradient(180deg,#cfe9f7,#a9d6ee)", // the pale blue of the title card
  },
  starwars: {
    mono: true,
    fillIdle: GREY,
    fillActive: "linear-gradient(180deg,#f6d982,#c69a35)", // Lucasfilm gold
  },
  "20th": {
    mono: true,
    fillIdle: GREY,
    fillActive: "linear-gradient(180deg,#f8e09b,#c9962c)", // gold lettering
    tileActive: "linear-gradient(180deg,#123a66,#07203c)", // dark sky blue behind it
  },
  marvel: {
    // Lifts the block towards white while the lettering, already white, stays
    // put. See the note below on why the block can't be white with black text.
    filterIdle: "grayscale(1) brightness(1.7)",
  },
  natgeo: {
    // Square and wordmark are both light in the source, so one brightness pass
    // takes them both to white; selected restores the yellow.
    filterIdle: "grayscale(1) brightness(3)",
  },
};

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
  { key: "disney", name: "Disney", logoPath: "/wdrCwmRnLFJhEoH8GSfymY85KHT.png", companies: [2] },
  { key: "pixar", name: "Pixar", logoPath: "/1TjvGVDMYsj6JBxOAkUHpPEwLf7.png", companies: [3] },
  { key: "marvel", name: "Marvel", logoPath: "/hUzeosd33nzE5MCNsZxCGEKTXaQ.png", companies: [420] },
  { key: "starwars", name: "Star Wars", logoPath: "/tlVSws0RvvtPBwViUyOFAO0vcQS.png", companies: [1] },
  { key: "natgeo", name: "National Geographic", logoPath: "/fRqMjLjyAqThtEg9P9WKCXLmCpJ.png", companies: [7521] },
  { key: "20th", name: "20th Century", logoPath: "/h0rjX5vjW5r8yEnUBStFarjcLT4.png", companies: [127928] },
].map((brand) => ({ ...brand, style: BRAND_STYLES[brand.key] }));

const LAYOUTS: Record<string, Layout> = {
  netflix: {
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

export function serviceBrands(service: StreamService): BrandTile[] {
  return LAYOUTS[service.key]?.brands ?? [];
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

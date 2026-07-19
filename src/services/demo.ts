import type { MediaItem, MediaType, Episode } from "./types";

// Used only when no TMDB key is configured, so the shell is fully browsable
// out of the box. Posters are deterministic placeholder art.
const TITLES: Record<MediaType, string[]> = {
  movie: [
    "Neon Harbor", "The Last Ascent", "Paper Moons", "Vantage", "Cold Signal",
    "Gilded Hours", "Undertow", "Static Bloom", "The Quiet War", "Afterlight",
    "Meridian", "Hollow Crown", "Nightcrawl", "Solaris Drift", "Ember & Ash",
    "The Long Fall", "Riftwalker", "Glasshouse", "Vermilion", "Sundowners",
  ],
  tv: [
    "Blackwater Bay", "Signal & Noise", "The Ninth Floor", "Corvid", "Lantern",
    "Verity", "Iron Season", "The Understudy", "Pale Horizon", "Dusk Protocol",
    "Marrow", "The Longview", "Cinders", "Halflight", "Aftershock",
    "The Reckoners", "Tidewater", "Nightingale", "Foxglove", "The Wire Room",
  ],
};

function make(type: MediaType, i: number): MediaItem {
  const seed = (type === "movie" ? 100 : 400) + i;
  const title = TITLES[type][i % TITLES[type].length];
  return {
    id: seed,
    type,
    title,
    poster: `https://picsum.photos/seed/tvio${seed}/342/513`,
    backdrop: `https://picsum.photos/seed/tvio${seed}b/780/439`,
    year: String(2018 + (i % 8)),
    rating: Math.round((6 + (i % 40) / 10) * 10) / 10,
    overview:
      "A placeholder synopsis. Add your TMDB key in .env.local to replace demo content with live posters, cast, trailers, and where-to-watch data.",
    genreIds: [],
  };
}

export function demoRow(type: MediaType, offset = 0, n = 18): MediaItem[] {
  return Array.from({ length: n }, (_, i) => make(type, i + offset));
}

export function demoDetail(type: MediaType, id: number) {
  const base = make(type, id % 20);
  return {
    ...base,
    id,
    tagline: "Demo mode — add a TMDB key for real data.",
    runtime: type === "movie" ? 118 : 47,
    genres: [{ id: 18, name: "Drama" }, { id: 53, name: "Thriller" }],
    cast: Array.from({ length: 8 }, (_, i) => ({
      id: 900 + i,
      name: ["Ava Sinclair", "Marcus Bell", "Nadia Okafor", "Leo Vance", "Priya Rao", "Sam Cortez", "Iris Holt", "Dev Malik"][i],
      character: "Character " + (i + 1),
      profile: `https://picsum.photos/seed/cast${900 + i}/200/300`,
    })),
    videos: [],
    providers: [
      { providerId: 8, name: "Netflix", logo: null, type: "flatrate" as const },
      { providerId: 337, name: "Disney Plus", logo: null, type: "flatrate" as const },
      { providerId: 10, name: "Amazon Video", logo: null, type: "buy" as const },
    ],
    watchLink: "https://www.themoviedb.org",
    imdbId: null,
    seasons: type === "tv" ? 3 : undefined,
    seasonsList:
      type === "tv"
        ? Array.from({ length: 3 }, (_, i) => ({
            seasonNumber: i + 1,
            name: `Season ${i + 1}`,
            episodeCount: 8,
            poster: base.poster,
            airYear: String(2020 + i),
            overview: "",
          }))
        : undefined,
    collectionId: null,
    collectionName: null,
  };
}

export function demoSeason(seasonNumber: number): Episode[] {
  return Array.from({ length: 8 }, (_, i) => ({
    seasonNumber,
    episodeNumber: i + 1,
    name: `Episode ${i + 1}`,
    overview:
      "Placeholder episode synopsis. Add a TMDB key in .env.local for real episode titles, stills and air dates.",
    still: `https://picsum.photos/seed/ep${seasonNumber}x${i}/342/192`,
    runtime: 42 + (i % 4) * 3,
    airDate: `2022-0${(seasonNumber % 9) + 1}-1${i % 9}`,
    rating: Math.round((7 + (i % 20) / 10) * 10) / 10,
  }));
}

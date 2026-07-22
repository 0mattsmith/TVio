// Streaming services used for the multi-select filters and the
// "Popular / Trending / New on <service>" rows. providerId maps to TMDB
// watch-provider IDs (JustWatch-backed). networkId maps to TMDB TV network IDs
// (used for discover queries on the TV side). Company IDs power movie discover.
export interface StreamService {
  key: string;
  name: string;
  color: string;
  providerId: number; // TMDB watch provider id
  networkId?: number; // TMDB TV network id
}

export const SERVICES: StreamService[] = [
  { key: "netflix", name: "Netflix", color: "#e50914", providerId: 8, networkId: 213 },
  { key: "disney", name: "Disney+", color: "#0063e5", providerId: 337, networkId: 2739 },
  { key: "prime", name: "Prime Video", color: "#00a8e1", providerId: 9, networkId: 1024 },
  { key: "max", name: "Max", color: "#7b2ff7", providerId: 1899, networkId: 3186 },
  { key: "hulu", name: "Hulu", color: "#1ce783", providerId: 15, networkId: 453 },
  { key: "paramount", name: "Paramount+", color: "#0064ff", providerId: 531, networkId: 4330 },
  { key: "apple", name: "Apple TV+", color: "#ffffff", providerId: 350, networkId: 2552 },
  { key: "peacock", name: "Peacock", color: "#ffce00", providerId: 386, networkId: 3353 },
  // NOW (formerly NOW TV) — the streaming home of Sky content in the UK/IE.
  // TMDB watch-provider id 39. No single TMDB network maps to it (Sky content
  // airs across Sky Atlantic, Sky Max, etc.), so it has no "Originals" row.
  { key: "now", name: "NOW", color: "#00b7b3", providerId: 39 },
];

// Pseudo-service for popular titles not on any tracked platform.
export const OTHER_SERVICE: StreamService = {
  key: "other",
  name: "Other",
  color: "#9ca3af",
  providerId: -1,
};

export const ALL_SERVICE_KEYS = [...SERVICES.map((s) => s.key), OTHER_SERVICE.key];

export function serviceByKey(key: string): StreamService | undefined {
  return key === OTHER_SERVICE.key ? OTHER_SERVICE : SERVICES.find((s) => s.key === key);
}

// Maps TMDB watch-provider names to the service's own site so a user can click
// through, sign in, and browse that service's library. TMDB doesn't provide
// per-title deep links per provider, so we send them to the service (and fall
// back to the title's JustWatch page when we don't recognise the provider).
const PROVIDER_HOMEPAGES: Record<string, string> = {
  "Netflix": "https://www.netflix.com",
  "Netflix Kids": "https://www.netflix.com",
  "Netflix basic with Ads": "https://www.netflix.com",
  "Disney Plus": "https://www.disneyplus.com",
  "Disney+": "https://www.disneyplus.com",
  "Amazon Prime Video": "https://www.primevideo.com",
  "Amazon Video": "https://www.primevideo.com",
  "Max": "https://www.max.com",
  "HBO Max": "https://www.max.com",
  "Hulu": "https://www.hulu.com",
  "Paramount Plus": "https://www.paramountplus.com",
  "Paramount+": "https://www.paramountplus.com",
  "Paramount Plus Apple TV Channel ": "https://www.paramountplus.com",
  "Paramount+ with Showtime": "https://www.paramountplus.com",
  "Apple TV Plus": "https://tv.apple.com",
  "Apple TV+": "https://tv.apple.com",
  "Apple TV": "https://tv.apple.com",
  "Peacock Premium": "https://www.peacocktv.com",
  "Peacock Premium Plus": "https://www.peacocktv.com",
  "Peacock": "https://www.peacocktv.com",
  "Google Play Movies": "https://play.google.com/store/movies",
  "YouTube": "https://www.youtube.com",
  "Microsoft Store": "https://www.microsoft.com/en-us/store/movies-and-tv",
  "Vudu": "https://www.vudu.com",
  "Fandango At Home": "https://www.vudu.com",
};

// Resolve where a provider chip should link: the service's own site if known,
// otherwise the title's JustWatch page from TMDB.
export function resolveProviderUrl(name: string, watchLink: string | null): string | null {
  return PROVIDER_HOMEPAGES[name.trim()] ?? watchLink ?? null;
}

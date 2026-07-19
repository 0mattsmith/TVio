import type { AddonManifest, Stream, ResolvedStream } from "./types";
import type { MediaType } from "../services/types";

// Stremio content type mapping. TVio uses "tv"; Stremio calls it "series".
export function stremioType(type: MediaType): "movie" | "series" {
  return type === "tv" ? "series" : "movie";
}

// Build the Stremio resource id for a title/episode.
//  movie  -> "tt1234567"
//  series -> "tt1234567:1:2"  (imdbId:season:episode)
export function stremioId(type: MediaType, imdbId: string, season?: number, episode?: number): string {
  if (type === "tv") return `${imdbId}:${season ?? 1}:${episode ?? 1}`;
  return imdbId;
}

// The addon's base URL is its manifest URL without the trailing /manifest.json.
export function addonBase(manifestUrl: string): string {
  return manifestUrl.replace(/\/manifest\.json.*$/i, "").replace(/\/+$/, "");
}

export function isHttpAddon(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

async function getJson(url: string, timeoutMs = 12000): Promise<any> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { accept: "application/json" }, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

export async function fetchManifest(manifestUrl: string): Promise<AddonManifest> {
  return getJson(manifestUrl) as Promise<AddonManifest>;
}

export function manifestSupportsStream(manifest: AddonManifest, type: MediaType): boolean {
  const st = stremioType(type);
  return (manifest.resources || []).some((r) =>
    typeof r === "string" ? r === "stream" : r.name === "stream" && (!r.types || r.types.includes(st))
  );
}

// Fetch streams for a single addon. Returns [] on any error so one bad addon
// never blocks the others.
export async function fetchStreams(
  manifestUrl: string,
  type: MediaType,
  imdbId: string,
  season?: number,
  episode?: number
): Promise<Stream[]> {
  if (!isHttpAddon(manifestUrl) || !imdbId) return [];
  const base = addonBase(manifestUrl);
  const id = stremioId(type, imdbId, season, episode);
  // NB: do not URL-encode the id — Stremio expects raw colons in series ids.
  const url = `${base}/stream/${stremioType(type)}/${id}.json`;
  const data = await getJson(url).catch(() => null);
  return (data?.streams as Stream[]) || [];
}

// Is a stream playable in a browser <video>? (url present, not a torrent, web-ready)
export function isWebPlayable(s: Stream): boolean {
  return Boolean(s.url) && !s.infoHash && !s.behaviorHints?.notWebReady;
}

// First text line of a stream's label (addons often pack quality tags on line 2).
export function streamTitle(s: Stream): string {
  return (s.name || s.description || s.title || "Stream").split("\n")[0].trim();
}

export function streamSubtitle(s: Stream): string {
  const body = (s.description || s.title || "").replace(/\n/g, "  ").trim();
  return body || s.behaviorHints?.filename || "";
}

export function humanSize(bytes?: number): string {
  if (!bytes) return "";
  const gb = bytes / 1e9;
  if (gb >= 1) return `${gb.toFixed(2)} GB`;
  return `${Math.round(bytes / 1e6)} MB`;
}

export type { ResolvedStream };

// Optional Simkl integration — a free Trakt alternative for syncing the user's
// watchlist, watched history and ratings, with TV-friendly PIN sign-in.
//
// Docs: https://api.simkl.org  ·  Base: https://api.simkl.com
// Every request carries client_id + app-name + app-version and a User-Agent;
// authed calls add `Authorization: Bearer <token>`. Simkl speaks TMDB ids
// natively (ids:{ tmdb }), which is exactly what TVio uses, so no id mapping.
//
// Simkl is only offered when a client id is baked in (VITE_SIMKL_CLIENT_ID);
// the user then connects their own account via the PIN flow.

import type { MediaItem, MediaType, WatchedItem } from "./types";

const BASE = "https://api.simkl.com";
const CLIENT_ID = (import.meta.env.VITE_SIMKL_CLIENT_ID as string | undefined)?.trim() || undefined;
const APP_NAME = "tvio";
const APP_VERSION = "1.0";

let token: string | undefined;

/** Set the signed-in user's token (from the store) so authed calls work. */
export function configureSimkl(t?: string) {
  token = t && t.trim() ? t.trim() : undefined;
}

/** True when the build ships a Simkl client id, so the feature can be offered. */
export function simklEnabled(): boolean {
  return !!CLIENT_ID;
}

/** True when a user has connected their Simkl account. */
export function simklConnected(): boolean {
  return !!CLIENT_ID && !!token;
}

function qs(extra: Record<string, string | number | undefined> = {}): string {
  const p = new URLSearchParams({ client_id: CLIENT_ID || "", "app-name": APP_NAME, "app-version": APP_VERSION });
  for (const [k, v] of Object.entries(extra)) if (v !== undefined) p.set(k, String(v));
  return p.toString();
}

function headers(auth = true): Record<string, string> {
  const h: Record<string, string> = { "User-Agent": `${APP_NAME}/${APP_VERSION}`, "Content-Type": "application/json" };
  if (auth && token) h.Authorization = `Bearer ${token}`;
  return h;
}

// --- PIN (device) auth ------------------------------------------------------

export interface SimklPin {
  userCode: string;
  url: string;
  interval: number; // seconds between polls
  expiresIn: number; // seconds until the code dies
}

/** Step 1: ask Simkl for a code to show the user. */
export async function requestPin(): Promise<SimklPin | null> {
  if (!CLIENT_ID) return null;
  try {
    const r = await fetch(`${BASE}/oauth/pin?${qs()}`, { headers: headers(false) });
    if (!r.ok) return null;
    const d = await r.json();
    if (!d?.user_code) return null;
    return {
      userCode: d.user_code,
      url: d.verification_url || d.verification_uri || "https://simkl.com/pin",
      interval: Number(d.interval) || 5,
      expiresIn: Number(d.expires_in) || 900,
    };
  } catch {
    return null;
  }
}

/** Step 3: poll until the user enters the code. Returns the token, or pending/gone. */
export async function pollPin(userCode: string): Promise<{ token?: string; gone?: boolean }> {
  if (!CLIENT_ID) return { gone: true };
  try {
    const r = await fetch(`${BASE}/oauth/pin/${encodeURIComponent(userCode)}?${qs()}`, { headers: headers(false) });
    if (!r.ok) return {};
    const d = await r.json();
    // A response carrying device_code means the original code was garbage-
    // collected (authorized already, or expired) — stop polling.
    if (d?.device_code) return { gone: true };
    if (d?.result === "OK" && d?.access_token) return { token: d.access_token as string };
    return {}; // still pending
  } catch {
    return {};
  }
}

// --- sync -------------------------------------------------------------------

const idEntry = (m: { id: number }) => ({ ids: { tmdb: m.id } });

/** Push the user's watchlist (→ Plan to Watch) and watched films/shows (→ history). */
export async function pushLists(watchlist: MediaItem[], watched: WatchedItem[]): Promise<boolean> {
  if (!simklConnected()) return false;
  const wlMovies = watchlist.filter((m) => m.type === "movie").map((m) => ({ to: "plantowatch", ids: { tmdb: m.id } }));
  const wlShows = watchlist.filter((m) => m.type === "tv").map((m) => ({ to: "plantowatch", ids: { tmdb: m.id } }));
  const hMovies = watched.filter((w) => w.type === "movie").map(idEntry);
  const hShows = watched.filter((w) => w.type === "tv").map(idEntry);
  try {
    if (wlMovies.length || wlShows.length) {
      await fetch(`${BASE}/sync/add-to-list?${qs()}`, { method: "POST", headers: headers(), body: JSON.stringify({ movies: wlMovies, shows: wlShows }) });
    }
    if (hMovies.length || hShows.length) {
      await fetch(`${BASE}/sync/history?${qs()}`, { method: "POST", headers: headers(), body: JSON.stringify({ movies: hMovies, shows: hShows }) });
    }
    return true;
  } catch {
    return false;
  }
}

interface SimklNode {
  title?: string;
  year?: number;
  poster?: string | null;
  ids?: { tmdb?: number | string };
}

function mapNode(entry: { movie?: SimklNode; show?: SimklNode } & SimklNode, type: MediaType): MediaItem | null {
  const node = entry.movie || entry.show || entry;
  const tmdb = node?.ids?.tmdb;
  if (!tmdb) return null; // TVio is TMDB-keyed; skip anything without a TMDB id
  return {
    id: Number(tmdb),
    type,
    title: node.title || "Untitled",
    poster: node.poster ? `https://simkl.in/posters/${node.poster}_m.jpg` : null,
    backdrop: null,
    year: node.year ? String(node.year) : "",
    rating: 0,
    overview: "",
    genreIds: [],
  };
}

async function allItems(type: "movies" | "shows", status: string): Promise<MediaItem[]> {
  if (!simklConnected()) return [];
  try {
    const r = await fetch(`${BASE}/sync/all-items/${type}/${status}?${qs({ extended: "full" })}`, { headers: headers() });
    if (!r.ok) return [];
    const d = await r.json();
    const rows = (d?.[type] || d?.movies || d?.shows || []) as ({ movie?: SimklNode; show?: SimklNode } & SimklNode)[];
    const mt: MediaType = type === "movies" ? "movie" : "tv";
    return rows.map((e) => mapNode(e, mt)).filter((x): x is MediaItem => !!x);
  } catch {
    return [];
  }
}

/**
 * Simkl-flavoured recommendations for the Home screen, seeded from a title the
 * user has watched/listed. Simkl has no "recommended feed" endpoint, so we take
 * a seed → resolve its Simkl id → read that title's recommendations (which carry
 * TMDB ids). Best-effort: returns [] if anything is missing, so the row simply
 * hides rather than breaking.
 */
export async function getRecommendations(seedTmdb: number, type: MediaType): Promise<MediaItem[]> {
  if (!simklConnected()) return [];
  const kind = type === "movie" ? "movies" : "tv";
  try {
    const s = await fetch(`${BASE}/search/id?${qs({ tmdb: seedTmdb, type: type === "movie" ? "movie" : "tv" })}`, { headers: headers(false) });
    if (!s.ok) return [];
    const arr = await s.json();
    const first = Array.isArray(arr) ? arr[0] : undefined;
    const simklId = first?.ids?.simkl ?? first?.[type]?.ids?.simkl ?? first?.movie?.ids?.simkl ?? first?.show?.ids?.simkl;
    if (!simklId) return [];
    const d = await fetch(`${BASE}/${kind}/${simklId}?${qs({ extended: "full" })}`, { headers: headers(false) });
    if (!d.ok) return [];
    const detail = await d.json();
    const recs = (detail?.users_recommendations || detail?.recommendations || []) as SimklNode[];
    return recs.map((n) => mapNode(n, type)).filter((x): x is MediaItem => !!x);
  } catch {
    return [];
  }
}

/** Pull the user's Plan to Watch (→ watchlist) and Completed (→ watched) lists. */
export async function pullLists(): Promise<{ watchlist: MediaItem[]; watched: MediaItem[] }> {
  const [plM, plS, cmM, cmS] = await Promise.all([
    allItems("movies", "plantowatch"),
    allItems("shows", "plantowatch"),
    allItems("movies", "completed"),
    allItems("shows", "completed"),
  ]);
  return { watchlist: [...plM, ...plS], watched: [...cmM, ...cmS] };
}

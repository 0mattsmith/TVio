// Optional TorBox integration — browse your own TorBox (debrid) library and pin
// episodes to owned files, so a show always plays that exact file with no search.
//
// Docs: https://api-docs.torbox.app  ·  Base: https://api.torbox.app/v1/api
// Auth is a Bearer token (the user's API key). The requestdl endpoint takes the
// key as a ?token= query param instead. The key is user-supplied (Settings).
//
// IMPORTANT: TorBox's API does NOT send CORS headers, so a plain browser/WebView
// fetch to it is blocked. On the native app we go through Capacitor's native HTTP
// (OkHttp), which isn't subject to CORS; on the web build we fall back to fetch,
// which only works behind a CORS proxy.

import { Capacitor, CapacitorHttp } from "@capacitor/core";

const BASE = "https://api.torbox.app/v1/api";

let key: string | undefined;

export function configureTorbox(k?: string) {
  key = k && k.trim() ? k.trim() : undefined;
}

export function torboxConnected(): boolean {
  return !!key;
}

// --- transport (CORS-safe on native) ---------------------------------------

async function httpJson(url: string, headers?: Record<string, string>): Promise<unknown> {
  // Native: OkHttp via CapacitorHttp — not subject to WebView CORS.
  if (Capacitor.isNativePlatform()) {
    try {
      const res = await CapacitorHttp.request({ method: "GET", url, headers });
      if (res.status < 200 || res.status >= 300) return null;
      return typeof res.data === "string" ? JSON.parse(res.data) : res.data;
    } catch {
      return null;
    }
  }
  // Web/desktop: plain fetch (TorBox has no CORS, so this needs a proxy).
  try {
    const r = await fetch(url, { headers });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

// --- types ------------------------------------------------------------------

export type TorboxKind = "torrent" | "usenet" | "webdl";

/** A stable pin stored on an episode — never a direct URL (those expire). */
export interface TorboxPin {
  type: TorboxKind;
  id: number; // parent torrent / usenet / webdl id
  fileId: number; // file index within the parent
  label?: string; // human name, for the UI
}

/** Map key for a pin: a specific episode, or a movie. */
export function pinKey(type: "movie" | "tv", id: number, season?: number, episode?: number): string {
  return type === "tv" && season != null && episode != null ? `tv:${id}:${season}:${episode}` : `movie:${id}`;
}

/**
 * A pinned value is either a single file or an ordered list of parts (e.g. a
 * split PPV / two-disc DVD). Normalise both shapes to an array.
 */
export function asParts(v: TorboxPin | TorboxPin[] | undefined): TorboxPin[] {
  return v ? (Array.isArray(v) ? v : [v]) : [];
}

/** Resolve every part to a fresh playable URL, in order (drops any that fail). */
export async function resolveParts(parts: TorboxPin[]): Promise<string[]> {
  const urls = await Promise.all(parts.map((p) => resolveLink(p)));
  return urls.filter((u): u is string => !!u);
}

/** One playable file inside the user's library. */
export interface TorboxFile extends TorboxPin {
  name: string; // the file's own (short) name
  item: string; // parent item (torrent/usenet) name
  size?: number;
}

const VIDEO_RE = /\.(mkv|mp4|avi|m4v|mov|ts|webm|wmv|flv|mpg|mpeg)$/i;

interface RawFile { id: number; name?: string; short_name?: string; size?: number; mimetype?: string }
interface RawItem { id: number; name?: string; files?: RawFile[] }

async function mylist(kind: "torrents" | "usenet" | "webdl"): Promise<TorboxFile[]> {
  if (!key) return [];
  const d = (await httpJson(`${BASE}/${kind}/mylist?bypass_cache=true`, { Authorization: `Bearer ${key}` })) as
    | { data?: RawItem[] }
    | null;
  const items = Array.isArray(d?.data) ? (d!.data as RawItem[]) : [];
  const type: TorboxKind = kind === "torrents" ? "torrent" : kind === "usenet" ? "usenet" : "webdl";
  const out: TorboxFile[] = [];
  for (const it of items) {
    for (const f of it.files ?? []) {
      const name = f.short_name || f.name || `File ${f.id}`;
      // Video files only — skip samples, nfo, art, etc.
      if (!VIDEO_RE.test(name) && !(f.mimetype || "").startsWith("video")) continue;
      out.push({ type, id: it.id, fileId: f.id, name, item: it.name || "", size: f.size });
    }
  }
  return out;
}

/** Every playable video file across the user's TorBox library. */
export async function listLibrary(): Promise<TorboxFile[]> {
  const [t, u, w] = await Promise.all([mylist("torrents"), mylist("usenet"), mylist("webdl")]);
  return [...t, ...u, ...w];
}

/**
 * Resolve a pin to a fresh, playable URL. Re-generated every call, so a pinned
 * episode never goes stale — the pin itself (ids) is the permanent part.
 */
export async function resolveLink(pin: TorboxPin): Promise<string | null> {
  if (!key) return null;
  const path = pin.type === "torrent" ? "torrents" : pin.type === "usenet" ? "usenet" : "webdl";
  const idParam = pin.type === "torrent" ? "torrent_id" : pin.type === "usenet" ? "usenet_id" : "web_id";
  const url = `${BASE}/${path}/requestdl?token=${encodeURIComponent(key)}&${idParam}=${pin.id}&file_id=${pin.fileId}&redirect=false`;
  const d = (await httpJson(url)) as { data?: unknown } | null;
  return typeof d?.data === "string" ? d.data : null;
}

/** Check a key works, for a live "Connected" check. */
export async function validateKey(k: string): Promise<boolean> {
  if (!k.trim()) return false;
  const d = (await httpJson(`${BASE}/user/me`, { Authorization: `Bearer ${k.trim()}` })) as
    | { success?: boolean; data?: unknown }
    | null;
  return !!d && (d.success === true || d.data != null);
}

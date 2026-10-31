// Optional TorBox integration — browse your own TorBox (debrid) library and pin
// episodes to owned files, so a show always plays that exact file with no search.
//
// Docs: https://api-docs.torbox.app  ·  Base: https://api.torbox.app/v1/api
// Auth is a Bearer token (the user's API key). The requestdl endpoint takes the
// key as a ?token= query param instead. The key is user-supplied (Settings).

const BASE = "https://api.torbox.app/v1/api";

let key: string | undefined;

export function configureTorbox(k?: string) {
  key = k && k.trim() ? k.trim() : undefined;
}

export function torboxConnected(): boolean {
  return !!key;
}

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
  try {
    const r = await fetch(`${BASE}/${kind}/mylist?bypass_cache=true`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!r.ok) return [];
    const d = await r.json();
    const items = (Array.isArray(d?.data) ? d.data : []) as RawItem[];
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
  } catch {
    return [];
  }
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
  try {
    const url = `${BASE}/${path}/requestdl?token=${encodeURIComponent(key)}&${idParam}=${pin.id}&file_id=${pin.fileId}&redirect=false`;
    const r = await fetch(url);
    if (!r.ok) return null;
    const d = await r.json();
    return typeof d?.data === "string" ? d.data : null;
  } catch {
    return null;
  }
}

/** Check a key works, for the Settings "Connected" status. */
export async function validateKey(k: string): Promise<boolean> {
  if (!k.trim()) return false;
  try {
    const r = await fetch(`${BASE}/user/me`, { headers: { Authorization: `Bearer ${k.trim()}` } });
    return r.ok;
  } catch {
    return false;
  }
}

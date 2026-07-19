// Bridge to the desktop ffmpeg sidecar (see src-tauri/src/playback.rs).
//
// When the WebView can't decode a stream (MKV container, HEVC video, AC3 audio),
// we hand the URL to ffmpeg, which remuxes or re-encodes it into HLS served on
// loopback. The existing <video> + hls.js then plays it, so the whole TVio
// player UI is preserved rather than being replaced by a native surface.

import { hasNativePlayback } from "../platform/capabilities";

export interface NativeStream {
  /** Local HLS URL to feed the player. */
  url: string;
  /** "copy" = remuxed (near-instant), "transcode" = re-encoded (slower to start). */
  mode: "copy" | "transcode";
}

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke: call } = await import("@tauri-apps/api/core");
  return call<T>(cmd, args);
}

/** Is the sidecar available on this runtime? */
export function nativePlayerAvailable(): boolean {
  return hasNativePlayback();
}

/**
 * Converts a stream into something the WebView can play.
 * Resolves null when there's no sidecar (web/mobile builds).
 */
export async function prepareStream(url: string, seekSeconds = 0): Promise<NativeStream | null> {
  if (!hasNativePlayback()) return null;
  return invoke<NativeStream>("start_stream", { url, seek: seekSeconds || null });
}

/** Stops any running conversion (called when leaving the player). */
export async function stopStream(): Promise<void> {
  if (!hasNativePlayback()) return;
  try {
    await invoke("stop_stream");
  } catch {
    /* nothing running */
  }
}

/**
 * ffmpeg needs a moment to emit the first HLS segment, so the playlist 404s
 * briefly. Poll until it's there before handing the URL to the player.
 */
export async function waitForPlaylist(url: string, timeoutMs = 45_000): Promise<boolean> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (res.ok && (await res.text()).includes("#EXTINF")) return true; // has a segment
    } catch {
      /* server not ready */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

/** Already downloaded? Cheap check — never triggers a download. */
export async function ffmpegReady(): Promise<boolean> {
  if (!hasNativePlayback()) return true; // nothing to fetch on web/mobile
  try {
    return await invoke<boolean>("ffmpeg_ready");
  } catch {
    return false;
  }
}

/** Pre-fetches ffmpeg so the first difficult stream doesn't wait on a download. */
export async function ensureFfmpeg(): Promise<boolean> {
  if (!hasNativePlayback()) return false;
  try {
    return await invoke<boolean>("ensure_ffmpeg");
  } catch {
    return false;
  }
}

/** Subscribe to download progress (0-100). Returns an unsubscribe function. */
export async function onFfmpegProgress(cb: (pct: number) => void): Promise<() => void> {
  try {
    const { listen } = await import("@tauri-apps/api/event");
    return await listen<number>("ffmpeg-progress", (e) => cb(e.payload));
  } catch {
    return () => {};
  }
}

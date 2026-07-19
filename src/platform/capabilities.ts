// Runtime playback capability.
//
// The web / PWA / GitHub Pages build is limited to what a browser <video> plus
// hls.js / mpegts.js can play (MP4/WebM, HLS, MPEG-TS). It CANNOT play MKV,
// HEVC/AC3, or torrent (infoHash) sources.
//
// The native builds bundle a real player and can play everything:
//   - Windows desktop  → Tauri  (libVLC / mpv)
//   - Android / Android TV → Capacitor  (ExoPlayer / media3)
//
// Those wrappers signal their capability by setting a global. Until they exist,
// hasNativePlayback() is false everywhere, so the web build filters correctly.

export function hasNativePlayback(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as {
    __TVIO_NATIVE__?: boolean;
    __TAURI__?: unknown;
    __TAURI_INTERNALS__?: unknown;
    Capacitor?: { isNativePlatform?: () => boolean; isNative?: boolean };
  };

  if (w.__TVIO_NATIVE__ === true) return true; // explicit opt-in from a wrapper
  if (w.__TAURI__ || w.__TAURI_INTERNALS__) return true; // Tauri (Windows)
  const cap = w.Capacitor;
  if (cap && (cap.isNativePlatform ? cap.isNativePlatform() : cap.isNative)) return true; // Capacitor (Android / TV)
  return false;
}

// Convenience alias.
export const supportsAllFormats = hasNativePlayback;

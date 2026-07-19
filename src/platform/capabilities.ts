// Two DIFFERENT questions that used to be conflated:
//
//   isNativeShell()     — are we running inside the Tauri/Capacitor app?
//                         Drives branding (TVio vs TVio Lite) and platform UX.
//
//   hasNativePlayback() — is there a real native player that can decode
//                         anything (MKV/HEVC/AC3/torrents)?
//
// These are not the same. The native builds currently render video in a WEBVIEW
// (WebView2 on Windows, Android System WebView), which has the same codec limits
// as a browser. So until a real player backend is wired in — an ffmpeg sidecar on
// desktop, ExoPlayer/media3 on Android — hasNativePlayback() must stay false, or
// the app offers sources it then fails to play.
//
// When that backend lands, it sets `window.__TVIO_NATIVE_PLAYER__ = true` at boot
// and everything downstream (source filtering, the unsupported-format gate)
// unlocks automatically.

interface TvioWindow {
  __TVIO_NATIVE__?: boolean;
  __TVIO_NATIVE_PLAYER__?: boolean;
  __TAURI__?: unknown;
  __TAURI_INTERNALS__?: unknown;
  Capacitor?: { isNativePlatform?: () => boolean; isNative?: boolean };
}

/** Running inside the packaged desktop / Android app (not a browser). */
export function isNativeShell(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as TvioWindow;

  if (w.__TVIO_NATIVE__ === true) return true; // explicit opt-in from a wrapper
  if (w.__TAURI__ || w.__TAURI_INTERNALS__) return true; // Tauri (Windows)
  const cap = w.Capacitor;
  if (cap && (cap.isNativePlatform ? cap.isNativePlatform() : cap.isNative)) return true; // Capacitor
  return false;
}

/**
 * Can this runtime play *anything* (MKV, HEVC, AC3, torrents)?
 * Only true once a native player backend is present — see the note above.
 */
export function hasNativePlayback(): boolean {
  if (typeof window === "undefined") return false;
  return (window as unknown as TvioWindow).__TVIO_NATIVE_PLAYER__ === true;
}

// Convenience alias used by the source filters.
export const supportsAllFormats = hasNativePlayback;

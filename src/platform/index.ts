export type DeviceProfile = "tv" | "mobile" | "web";

// The native wrapper (Capacitor Android TV / phone build) sets this global at
// boot — it's the authoritative signal on real devices. UA + screen size are
// browser fallbacks so the web/PWA build still adapts. A user override in
// Settings takes precedence over all of this (see useDeviceProfile).
declare global {
  interface Window {
    __TVIO_PLATFORM__?: DeviceProfile;
  }
}

const TV_UA =
  /Android TV|AndroidTV|GoogleTV|SMART-?TV|SmartTV|Tizen|Web ?0?OS|WebOS|HbbTV|BRAVIA|AFT[A-Z]{1,3}|CrKey|NetCast|VIDAA|Roku/i;

export function detectPlatform(): DeviceProfile {
  if (typeof window === "undefined" || typeof navigator === "undefined") return "web";

  const injected = window.__TVIO_PLATFORM__;
  if (injected === "tv" || injected === "mobile" || injected === "web") return injected;

  const ua = navigator.userAgent || "";
  if (TV_UA.test(ua)) return "tv";

  const coarse = typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
  const small = Math.min(window.innerWidth, window.innerHeight) < 820;
  if (coarse && small && /Android|iPhone|iPad|iPod|Mobile/i.test(ua)) return "mobile";

  return "web";
}

// Bridge to the native ExoPlayer activity (android-src/NativePlayer.java).
//
// On Android this replaces the <video> element entirely: it launches a
// full-screen Media3 player that decodes with Android's own codecs, so AC3 /
// E-AC3 / DTS audio and HEVC / MKV video — none of which the WebView can handle
// — play with sound and picture. The activity returns the final position so we
// can save "continue watching".

export interface NativeSubtitle {
  url: string;
  lang?: string;
  label?: string;
}

export interface NativePlayResult {
  positionMs: number;
  durationMs: number;
  /** The native player gave up after prolonged buffering. */
  stalled?: boolean;
}

interface NativePlayerPlugin {
  isAvailable(): Promise<{ available: boolean }>;
  play(opts: {
    url: string;
    title?: string;
    startMs?: number;
    audioLang?: string;
    filename?: string;
    sizeBytes?: number;
    subtitles?: NativeSubtitle[];
  }): Promise<NativePlayResult>;
}

interface CapacitorGlobal {
  getPlatform?: () => string;
  isPluginAvailable?: (name: string) => boolean;
  Plugins?: { NativePlayer?: NativePlayerPlugin };
}

function cap(): CapacitorGlobal | undefined {
  return (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
}

/** True only when the native plugin is really present on an Android build. */
export function exoPlayerAvailable(): boolean {
  const c = cap();
  if (!c?.getPlatform || c.getPlatform() !== "android") return false;
  return c.isPluginAvailable ? c.isPluginAvailable("NativePlayer") : false;
}

/**
 * Flip on native-playback capability at boot when ExoPlayer is present, so the
 * source filters stop hiding MKV/HEVC/AC3 — the native player can decode them.
 * Called before React renders so capability checks are right from frame one.
 */
export function initNativePlayback(): void {
  if (exoPlayerAvailable()) {
    (window as unknown as { __TVIO_NATIVE_PLAYER__?: boolean }).__TVIO_NATIVE_PLAYER__ = true;
  }
}

/** Launches the native player and resolves with the final position on exit. */
export async function playNative(opts: {
  url: string;
  title?: string;
  startMs?: number;
  audioLang?: string;
  filename?: string;
  sizeBytes?: number;
  subtitles?: NativeSubtitle[];
}): Promise<NativePlayResult> {
  const plugin = cap()?.Plugins?.NativePlayer;
  if (!plugin) throw new Error("Native player isn't available on this build.");
  return plugin.play(opts);
}

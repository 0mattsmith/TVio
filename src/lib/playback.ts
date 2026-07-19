// Playback routing for the in-app <video>. Picks the right engine per format:
//   - HLS (.m3u8 / application/vnd.apple.mpegurl) → hls.js (native where supported)
//   - MPEG-TS (.ts / mpegts) and MPEG-TS-over-HTTP → mpegts.js
//   - MP4 / WebM / native HLS → direct <video src>
//   - MKV / Matroska → the browser can't play the container (and MKVs are often
//     HEVC/AC3, which browsers can't decode either) → caller shows a native-build hint.

export type PlaybackKind = "native" | "hls" | "mpegts" | "unsupported";

export function classifyStream(url: string): PlaybackKind {
  const u = url.toLowerCase().split("?")[0];
  if (u.endsWith(".m3u8") || u.includes("mpegurl")) return "hls";
  if (u.endsWith(".ts") || u.includes("mpegts") || u.endsWith(".m2ts")) return "mpegts";
  if (u.endsWith(".mkv") || u.includes("matroska")) return "unsupported";
  return "native"; // mp4, webm, mov, m4v, direct links…
}

export interface AttachResult {
  cleanup: () => void;
  kind: PlaybackKind;
}

export async function attachStream(video: HTMLVideoElement, url: string): Promise<AttachResult> {
  const kind = classifyStream(url);
  const nativeHls = video.canPlayType("application/vnd.apple.mpegurl") !== "";

  // HLS
  if (kind === "hls") {
    if (nativeHls) {
      video.src = url;
      return { kind, cleanup: () => clearSrc(video) };
    }
    try {
      const { default: Hls } = await import("hls.js");
      if (Hls.isSupported()) {
        const hls = new Hls({ enableWorker: true, lowLatencyMode: true, backBufferLength: 30 });
        hls.loadSource(url);
        hls.attachMedia(video);
        return { kind, cleanup: () => hls.destroy() };
      }
    } catch {
      /* fall through */
    }
  }

  // MPEG-TS (common for IPTV) via mpegts.js
  if (kind === "mpegts") {
    try {
      const mod = (await import("mpegts.js")) as any;
      const mpegts = mod.default ?? mod;
      if (mpegts.getFeatureList().mseLivePlayback) {
        const player = mpegts.createPlayer({ type: "mpegts", url, isLive: true }, { enableWorker: true, liveBufferLatencyChasing: true });
        player.attachMediaElement(video);
        player.load();
        player.play().catch(() => {});
        return { kind, cleanup: () => { try { player.destroy(); } catch { /* ignore */ } } };
      }
    } catch {
      /* fall through */
    }
  }

  // Native (mp4/webm) or last-resort attempt (browser will error if truly unsupported)
  video.src = url;
  return { kind, cleanup: () => clearSrc(video) };
}

function clearSrc(video: HTMLVideoElement) {
  video.removeAttribute("src");
  try {
    video.load();
  } catch {
    /* ignore */
  }
}

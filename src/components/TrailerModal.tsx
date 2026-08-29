import { useEffect, useRef, useState } from "react";
import { Play, Pause, Rewind, FastForward, Maximize, Minimize, X } from "lucide-react";
import type { Video } from "../services/types";
import { embedUrl } from "../services/trailers";
import { useOverlayBack } from "../hooks/useOverlayBack";

// The YouTube IFrame API, loaded once and shared. We drive the embedded player
// through it so TVio's own (remote-focusable) buttons control playback — the
// stock YouTube controls aren't reliably reachable with a D-pad.
let ytReady: Promise<void> | null = null;
function loadYouTubeApi(): Promise<void> {
  if (ytReady) return ytReady;
  ytReady = new Promise<void>((resolve) => {
    const w = window as unknown as { YT?: { Player?: unknown }; onYouTubeIframeAPIReady?: () => void };
    if (w.YT && w.YT.Player) return resolve();
    const prev = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => { prev?.(); resolve(); };
    if (!document.getElementById("yt-iframe-api")) {
      const s = document.createElement("script");
      s.id = "yt-iframe-api";
      s.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(s);
    }
  });
  return ytReady;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type YTPlayer = any;

/**
 * A trailer player in a dark, blurred pop-up window. The video is the official
 * embed (YouTube, or Vimeo as a fallback), but the chrome is ours: a teal
 * control bar you can drive with the remote, and an optional full-screen toggle.
 */
export function TrailerModal({ video, onClose }: { video: Video; onClose: () => void }) {
  const isYouTube = video.site === "YouTube";
  const hostRef = useRef<HTMLDivElement>(null); // stable node the YT iframe mounts under
  const windowRef = useRef<HTMLDivElement>(null); // the full-screen target
  const playerRef = useRef<YTPlayer>(null);
  const [playing, setPlaying] = useState(true);
  const [full, setFull] = useState(false);

  useOverlayBack(true, onClose);

  // Build the YouTube player. We append our own child node and let the API
  // replace *that* with its iframe, so React never manages the swapped node.
  useEffect(() => {
    if (!isYouTube || !hostRef.current) return;
    let cancelled = false;
    const mount = document.createElement("div");
    mount.className = "h-full w-full";
    hostRef.current.appendChild(mount);
    loadYouTubeApi().then(() => {
      if (cancelled) return;
      const YT = (window as unknown as { YT: { Player: new (el: Element, o: unknown) => YTPlayer } }).YT;
      playerRef.current = new YT.Player(mount, {
        videoId: video.key,
        playerVars: {
          autoplay: 1, controls: 0, rel: 0, modestbranding: 1,
          playsinline: 1, fs: 0, disablekb: 1, iv_load_policy: 3,
        },
        events: {
          onReady: (e: { target: YTPlayer }) => { try { e.target.playVideo(); } catch { /* ignore */ } },
          onStateChange: (e: { data: number }) => setPlaying(e.data === 1),
        },
      });
    });
    return () => {
      cancelled = true;
      try { playerRef.current?.destroy?.(); } catch { /* ignore */ }
      playerRef.current = null;
      if (hostRef.current) hostRef.current.innerHTML = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video.key]);

  // Focus the first control so the remote lands on it.
  useEffect(() => {
    const raf = requestAnimationFrame(() => windowRef.current?.querySelector<HTMLElement>("button")?.focus());
    return () => cancelAnimationFrame(raf);
  }, []);

  // Reflect full-screen changes made outside our button.
  useEffect(() => {
    const onFs = () => setFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const togglePlay = () => {
    const pl = playerRef.current;
    if (!pl) return;
    try { (pl.getPlayerState?.() === 1 ? pl.pauseVideo() : pl.playVideo()); } catch { /* ignore */ }
  };
  const seek = (delta: number) => {
    const pl = playerRef.current;
    if (!pl) return;
    try { pl.seekTo(Math.max(0, (pl.getCurrentTime?.() || 0) + delta), true); } catch { /* ignore */ }
  };
  const toggleFull = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (windowRef.current) await windowRef.current.requestFullscreen();
    } catch { /* ignore */ }
  };

  const btn = "focusable flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white transition-colors";

  return (
    <div
      data-spatial-scope
      onClick={onClose}
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md sm:p-8"
    >
      <div
        ref={windowRef}
        onClick={(e) => e.stopPropagation()}
        className={`relative overflow-hidden bg-black shadow-card ${
          full ? "h-screen w-screen" : "aspect-video w-[min(94vw,1100px)] rounded-2xl"
        }`}
      >
        {isYouTube ? (
          <div ref={hostRef} className="h-full w-full" />
        ) : (
          <iframe
            className="h-full w-full"
            src={`${embedUrl(video)}?autoplay=1`}
            title={video.name}
            allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
            allowFullScreen
          />
        )}

        {/* TVio's own control bar — remote-focusable, over a soft gradient. */}
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-3 pt-10">
          {isYouTube && (
            <>
              <button onClick={togglePlay} className={btn} aria-label={playing ? "Pause" : "Play"}>
                {playing ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
              </button>
              <button onClick={() => seek(-10)} className={btn} aria-label="Back 10 seconds"><Rewind size={18} /></button>
              <button onClick={() => seek(10)} className={btn} aria-label="Forward 10 seconds"><FastForward size={18} /></button>
            </>
          )}
          <button onClick={toggleFull} className={btn} aria-label={full ? "Exit full screen" : "Full screen"}>
            {full ? <Minimize size={18} /> : <Maximize size={18} />}
          </button>
          <button onClick={onClose} className="focusable flex h-11 items-center gap-1.5 rounded-full bg-white/15 px-4 text-sm font-semibold text-white" aria-label="Close trailer">
            <X size={18} /> Close
          </button>
        </div>
      </div>
    </div>
  );
}

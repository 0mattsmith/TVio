import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Play, Pause, Volume2, VolumeX, Subtitles, Maximize, SkipForward } from "lucide-react";
import { getDetail } from "../services/catalog";
import type { MediaType } from "../services/types";
import { useAppStore } from "../store/useAppStore";
import { attachStream, classifyStream } from "../lib/playback";
import { useIsTV } from "../hooks/useDeviceProfile";
import { hasNativePlayback } from "../platform/capabilities";

// Big Buck Bunny — royalty-free sample so the player is usable before addon
// stream sources are wired in.
const SAMPLE = "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4";

function fmt(t: number) {
  if (!isFinite(t)) return "0:00";
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function Player() {
  const { type, id } = useParams<{ type: MediaType; id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const setProgress = useAppStore((s) => s.setProgress);

  // A resolved stream URL passed from Quick Watch (via router state).
  const streamUrl = (location.state as { url?: string } | null)?.url;
  const streamName = (location.state as { name?: string } | null)?.name;
  const params = new URLSearchParams(location.search);
  const epLabel = params.get("s") && params.get("e") ? `S${params.get("s")} · E${params.get("e")}` : "";
  const isTV = useIsTV();

  const [playing, setPlaying] = useState(true);
  const [muted, setMuted] = useState(false);
  const [subs, setSubs] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showUI, setShowUI] = useState(true);
  const [error, setError] = useState(false);

  const { data } = useQuery({
    queryKey: ["detail", type, id],
    queryFn: () => getDetail((type || "movie") as MediaType, Number(id)),
  });

  // persist progress to Continue Watching
  useEffect(() => {
    if (!data || !duration) return;
    const iv = setInterval(() => {
      const v = videoRef.current;
      if (v && !v.paused) setProgress(data, v.currentTime, duration);
    }, 5000);
    return () => clearInterval(iv);
  }, [data, duration, setProgress]);

  // auto-hide controls
  useEffect(() => {
    if (!showUI) return;
    const t = setTimeout(() => playing && setShowUI(false), 3000);
    return () => clearTimeout(t);
  }, [showUI, playing]);

  // Attach the right playback engine for the resolved stream.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    setError(false);
    if (!streamUrl) {
      v.src = SAMPLE;
      return;
    }
    if (!hasNativePlayback() && classifyStream(streamUrl) === "unsupported") {
      setError(true);
      return;
    }
    let cleanup = () => {};
    let active = true;
    attachStream(v, streamUrl).then((r) => {
      if (!active) return r.cleanup();
      cleanup = r.cleanup;
      v.play?.().catch(() => {});
    });
    return () => {
      active = false;
      cleanup();
    };
  }, [streamUrl]);

  const toggle = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play(); setPlaying(true); } else { v.pause(); setPlaying(false); }
  };

  return (
    <div
      className="relative h-screen w-screen bg-black"
      onMouseMove={() => setShowUI(true)}
      onClick={() => setShowUI(true)}
    >
      <video
        ref={videoRef}
        key={streamUrl || "sample"}
        autoPlay
        muted={muted}
        className="h-full w-full object-contain"
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onError={() => setError(true)}
        onClick={toggle}
      >
        {subs && <track kind="subtitles" default label="English" srcLang="en" />}
      </video>

      {/* Subtitle mock overlay */}
      {subs && (
        <div className="pointer-events-none absolute inset-x-0 bottom-28 text-center">
          <span className="rounded bg-black/70 px-3 py-1 text-lg font-medium text-white">
            [ Subtitles enabled — sample track ]
          </span>
        </div>
      )}

      {/* Playback error (unsupported format / torrent / dead link) */}
      {error && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/85 p-6 text-center">
          <p className="text-lg font-bold">This source couldn't be played here</p>
          <p className="max-w-md text-sm text-white/70">
            The browser may not support this stream's format (e.g. MKV or a torrent link). Try another source, or use the
            Android / desktop build which bundles a native player.
          </p>
          <button onClick={() => navigate(-1)} className="focusable rounded-lg bg-accent px-4 py-2 font-bold text-black">
            Back to sources
          </button>
        </div>
      )}

      {/* Controls */}
      <div
        className={`absolute inset-0 flex flex-col justify-between bg-gradient-to-b from-black/60 via-transparent to-black/80 p-4 transition-opacity duration-300 sm:p-6 ${
          showUI ? "opacity-100" : "opacity-0"
        }`}
      >
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="focusable flex items-center gap-2 rounded-full bg-black/40 px-4 py-2 font-semibold">
            <ArrowLeft size={18} /> Back
          </button>
          <div className="min-w-0">
            <div className="truncate text-lg font-bold">{data?.title || "Now Playing"}</div>
            <div className="truncate text-xs text-white/60">
              {[epLabel, streamName || (streamUrl ? "Addon source" : "Sample video")].filter(Boolean).join("  ·  ")}
            </div>
          </div>
        </div>

        <div className="space-y-3">
          {/* seek bar */}
          <input
            type="range"
            min={0}
            max={duration || 100}
            value={time}
            onChange={(e) => {
              const v = videoRef.current;
              if (v) { v.currentTime = Number(e.target.value); setTime(Number(e.target.value)); }
            }}
            className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/25 accent-accent"
            style={{ background: `linear-gradient(90deg,#14b8a6 ${(time / (duration || 1)) * 100}%, rgba(255,255,255,0.25) 0)` }}
          />
          <div className="flex items-center gap-4">
            <button onClick={toggle} className="focusable">
              {playing ? <Pause size={26} fill="currentColor" /> : <Play size={26} fill="currentColor" />}
            </button>
            <button onClick={() => { const v = videoRef.current; if (v) v.currentTime += 10; }} className="focusable">
              <SkipForward size={22} />
            </button>
            {!isTV && (
              <button onClick={() => setMuted((m) => !m)} className="focusable" aria-label="Mute">
                {muted ? <VolumeX size={22} /> : <Volume2 size={22} />}
              </button>
            )}
            <span className="text-sm tabular-nums text-white/80">{fmt(time)} / {fmt(duration)}</span>
            <div className="flex-1" />
            <button
              onClick={() => setSubs((s) => !s)}
              className={`focusable rounded-lg px-2 py-1 ${subs ? "text-accent" : "text-white"}`}
              aria-label="Subtitles"
            >
              <Subtitles size={22} />
            </button>
            <button
              onClick={() => videoRef.current?.requestFullscreen?.()}
              className="focusable"
              aria-label="Fullscreen"
            >
              <Maximize size={22} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

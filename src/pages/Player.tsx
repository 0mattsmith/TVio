import { useEffect, useRef, useState } from "react";
import { CastButton } from "../components/CastButton";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Play, Pause, Volume2, VolumeX, Subtitles, Maximize, SkipForward, Loader2 } from "lucide-react";
import { getDetail } from "../services/catalog";
import type { MediaType } from "../services/types";
import { useAppStore } from "../store/useAppStore";
import { attachStream, classifyStream } from "../lib/playback";
import { useIsTV } from "../hooks/useDeviceProfile";
import { hasNativePlayback } from "../platform/capabilities";
import { exoPlayerAvailable, playNative } from "../services/exoPlayer";
import { prepareStream, stopStream, waitForPlaylist } from "../services/nativePlayer";

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
  const openQuickWatch = useAppStore((s) => s.openQuickWatch);

  // A resolved stream URL passed from Quick Watch (via router state).
  const streamUrl = (location.state as { url?: string } | null)?.url;
  const streamName = (location.state as { name?: string } | null)?.name;
  const params = new URLSearchParams(location.search);
  const epLabel = params.get("s") && params.get("e") ? `S${params.get("s")} · E${params.get("e")}` : "";
  const isTV = useIsTV();

  // Android: the whole player is a separate native activity, not the <video>
  // below. Decided once here so both the launch effect and the web-attach
  // effect agree.
  const nativeVideo = exoPlayerAvailable();

  const [playing, setPlaying] = useState(true);
  const [muted, setMuted] = useState(false);
  const [subs, setSubs] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showUI, setShowUI] = useState(true);
  const [error, setError] = useState(false);
  // "" = not preparing; "copy" = remuxing (fast); "transcode" = re-encoding.
  const [preparing, setPreparing] = useState<"" | "copy" | "transcode">("");

  const { data } = useQuery({
    queryKey: ["detail", type, id],
    queryFn: () => getDetail((type || "movie") as MediaType, Number(id)),
  });

  // Android native playback: hand the stream to the ExoPlayer activity, which
  // decodes AC3/HEVC/MKV the WebView can't, then save the returned position and
  // go back. Replaces the <video> path entirely on Android.
  useEffect(() => {
    if (!nativeVideo || !streamUrl) return;
    let cancelled = false;
    (async () => {
      const resumeSec =
        useAppStore.getState().progress.find((p) => p.id === Number(id))?.positionSec ?? 0;
      try {
        const res = await playNative({
          url: streamUrl,
          title: streamName || data?.title || "",
          startMs: Math.floor(resumeSec * 1000),
          audioLang: useAppStore.getState().preferredAudioLang || "en",
        });
        if (!cancelled && data && res.durationMs > 0) {
          setProgress(data, res.positionMs / 1000, res.durationMs / 1000);
        }
      } catch {
        /* nothing to fall back to on Android — just leave the player */
      } finally {
        if (!cancelled) navigate(-1);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nativeVideo, streamUrl]);

  // persist progress to Continue Watching (web/desktop <video> only)
  useEffect(() => {
    if (nativeVideo || !data || !duration) return;
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

  // Attach the right playback engine for the resolved stream. Formats the
  // WebView can't decode are routed through the desktop ffmpeg sidecar.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || nativeVideo) return; // Android uses the native activity instead
    setError(false);
    setPreparing("");
    if (!streamUrl) {
      v.src = SAMPLE;
      return;
    }

    let cleanup = () => {};
    let active = true;

    (async () => {
      let playable = streamUrl;

      if (classifyStream(streamUrl) === "unsupported") {
        if (!hasNativePlayback()) {
          setError(true); // web/mobile: nothing we can do
          return;
        }
        try {
          const native = await prepareStream(streamUrl);
          if (!native || !active) return;
          setPreparing(native.mode);
          const ready = await waitForPlaylist(native.url);
          if (!active) return;
          if (!ready) {
            setError(true);
            setPreparing("");
            return;
          }
          playable = native.url;
          setPreparing("");
        } catch {
          if (active) {
            setError(true);
            setPreparing("");
          }
          return;
        }
      }

      const r = await attachStream(v, playable);
      if (!active) return r.cleanup();
      cleanup = r.cleanup;
      v.play?.().catch(() => {});
    })();

    return () => {
      active = false;
      cleanup();
      stopStream(); // don't leave ffmpeg running after we navigate away
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
        playsInline
        // Safari won't offer an AirPlay route without this, and iOS otherwise
        // hijacks playback into its own fullscreen player.
        x-webkit-airplay="allow"
        className="h-full w-full object-contain"
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onError={(e) => {
          // Ignore aborts that happen while swapping the source.
          const err = e.currentTarget.error;
          if (err && err.code === err.MEDIA_ERR_ABORTED) return;
          if (streamUrl) setError(true);
        }}
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

      {/* Converting an undecodable stream via the desktop sidecar */}
      {preparing && !error && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/85 p-6 text-center">
          <Loader2 className="animate-spin text-accent" size={28} />
          <p className="text-lg font-bold">
            {preparing === "copy" ? "Preparing this source…" : "Converting this source…"}
          </p>
          <p className="max-w-md text-sm text-white/70">
            {preparing === "copy"
              ? "Repackaging the stream so it plays here. This is quick."
              : "This source uses a codec the player can't read directly, so it's being converted. The first few seconds take longest."}
          </p>
        </div>
      )}

      {/* Playback error (unsupported format / torrent / dead link) */}
      {error && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/85 p-6 text-center">
          <p className="text-lg font-bold">This source can't play in the browser</p>
          <p className="max-w-md text-sm text-white/70">
            It likely uses a codec the browser can't decode (often HEVC/H.265 or AC3 audio), or the server blocks web
            playback. Pick a different source — an <span className="font-semibold text-white">H.264 / 1080p</span> one usually
            works — or use the TVio Windows / Android app, which plays anything.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <button
              onClick={() => {
                if (data) {
                  const s = params.get("s");
                  const ep = params.get("e");
                  openQuickWatch(data, s && ep ? { season: Number(s), episode: Number(ep) } : undefined);
                  navigate(`/title/${data.type}/${data.id}`);
                } else {
                  navigate(-1);
                }
              }}
              className="focusable rounded-lg bg-accent px-4 py-2 font-bold text-black"
            >
              Try another source
            </button>
            <button onClick={() => navigate(-1)} className="focusable rounded-lg bg-white/10 px-4 py-2 font-semibold">
              Back
            </button>
          </div>
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
            {/* Hidden on TV — it's already the big screen. */}
            {!isTV && <CastButton videoRef={videoRef} />}
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

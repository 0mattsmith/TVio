import { useEffect, useMemo, useRef, useState } from "react";
import { CastButton } from "../components/CastButton";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Play, Pause, Volume2, VolumeX, Subtitles, Maximize, SkipForward, Loader2, RotateCcw } from "lucide-react";
import { getDetail, getCollection } from "../services/catalog";
import type { MediaType } from "../services/types";
import { useAppStore } from "../store/useAppStore";
import { attachStream, classifyStream } from "../lib/playback";
import { useIsTV } from "../hooks/useDeviceProfile";
import { hasNativePlayback } from "../platform/capabilities";
import { exoPlayerAvailable, playNative } from "../services/exoPlayer";
import { registerBackInterceptor } from "../platform/backButton";
import { computeNextEpisode, resolveEpisodeStreams, type EpisodeRef } from "../services/nextEpisode";
import { isHttpAddon } from "../addons/manager";
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
  const markWatched = useAppStore((s) => s.markWatched);
  const removeFromProgress = useAppStore((s) => s.removeFromProgress);
  const openQuickWatch = useAppStore((s) => s.openQuickWatch);

  // A resolved stream URL passed from Quick Watch (via router state). `queue`
  // holds the remaining auto-play-next candidates to fall through on failure;
  // `auto` marks a stream that started from autoplay-next (so a total failure
  // opens the source list rather than a dead-end error).
  const st = location.state as
    | { url?: string; name?: string; filename?: string; size?: number; queue?: { url: string; name: string }[]; auto?: boolean; parts?: string[] }
    | null;
  // A pinned episode can be several files played back-to-back (a split PPV /
  // two-disc DVD). Everything else is a single part.
  const partsList = useMemo(
    () => (st?.parts && st.parts.length ? st.parts : st?.url ? [st.url] : []),
    [st?.parts, st?.url]
  );
  const [partIndex, setPartIndex] = useState(0);
  useEffect(() => { setPartIndex(0); }, [partsList]);
  const streamUrl = partsList[partIndex];
  const multiPart = partsList.length > 1;
  const streamName = st?.name;
  const queue = st?.queue ?? [];
  const params = new URLSearchParams(location.search);
  const epLabel = params.get("s") && params.get("e") ? `S${params.get("s")} · E${params.get("e")}` : "";
  // Threaded into progress so Continue Watching can show which episode.
  const epRef =
    params.get("s") && params.get("e")
      ? { season: Number(params.get("s")), episode: Number(params.get("e")) }
      : undefined;
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

  // Resume vs. start-over. When there's a meaningful saved position for exactly
  // this title/episode (and it isn't basically finished), ask before playing
  // instead of silently resuming. Autoplay-next streams always just play.
  const computeResumeSec = () => {
    if (st?.auto) return 0;
    const p = useAppStore.getState().progress.find((x) => x.id === Number(id));
    if (!p || p.positionSec < 30) return 0;
    if (p.durationSec && p.positionSec > p.durationSec * 0.95) return 0; // basically done
    if (type === "tv" && epRef && (p.season !== epRef.season || p.episode !== epRef.episode)) return 0;
    return Math.floor(p.positionSec);
  };
  const [resumeSec, setResumeSec] = useState(computeResumeSec);
  const [resumeChoice, setResumeChoice] = useState<"pending" | "resume" | "restart">(() =>
    computeResumeSec() > 0 ? "pending" : "resume"
  );
  // Re-decide when the target title/episode changes (e.g. autoplay-next).
  useEffect(() => {
    const sec = computeResumeSec();
    setResumeSec(sec);
    setResumeChoice(sec > 0 ? "pending" : "resume");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, epRef?.season, epRef?.episode, st?.auto]);

  const { data } = useQuery({
    queryKey: ["detail", type, id],
    queryFn: () => getDetail((type || "movie") as MediaType, Number(id)),
  });

  // Keep the latest detail + episode in refs. The native-playback effect below
  // runs once (before this detail query resolves) and its async result handler
  // would otherwise close over a stale, undefined `data`/`epRef` — which meant
  // nothing landed in Continue Watching and the next episode was never queued.
  const dataRef = useRef(data);
  dataRef.current = data;
  const epRefRef = useRef(epRef);
  epRefRef.current = epRef;

  // Next-episode autoplay. When an episode finishes we advance Continue
  // Watching to the next one and offer to play it; picking Yes resolves a
  // stream for it and remounts the player on the new episode.
  const [pendingNext, setPendingNext] = useState<EpisodeRef | null>(null);
  const [loadingNext, setLoadingNext] = useState(false);

  // Loading / buffering state, so a slow stream reads as "loading", not frozen.
  // A stream that buffers this long is treated as stuck and the user is offered
  // a fresh source list.
  const STALL_MS = 25000;
  const [buffering, setBuffering] = useState(true);
  const [stalled, setStalled] = useState(false);
  const stallTimer = useRef<number>();

  const onBufferStart = () => {
    setBuffering(true);
    window.clearTimeout(stallTimer.current);
    stallTimer.current = window.setTimeout(() => setStalled(true), STALL_MS);
  };
  const onBufferEnd = () => {
    setBuffering(false);
    setStalled(false);
    window.clearTimeout(stallTimer.current);
  };

  // Reopen Quick Watch on the same title/episode so the user can pick another
  // source — used by both the "can't play" and the "stuck" overlays.
  const tryAnotherSource = () => {
    const d = dataRef.current;
    if (d) {
      openQuickWatch(d, epRefRef.current);
      navigate(`/title/${type}/${id}`, { replace: true });
    } else {
      navigate(-1);
    }
  };

  useEffect(() => () => window.clearTimeout(stallTimer.current), []);

  const onEpisodeFinished = (): boolean => {
    const d = dataRef.current;
    const ep = epRefRef.current;
    if (!d || !ep || type !== "tv") return false;
    // Tick the episode (green tick in the browser) — not the whole show yet.
    markWatched(d, ep);

    // Whole show finished? Then it graduates to the Watched row and leaves
    // Continue Watching. Specials (season 0) don't count towards completion.
    const seasons = (d.seasonsList ?? []).filter((s) => s.seasonNumber >= 1 && s.episodeCount > 0);
    const done = new Set(useAppStore.getState().watchedEpisodes);
    done.add(`${d.id}:${ep.season}:${ep.episode}`);
    const showComplete =
      seasons.length > 0 &&
      seasons.every((s) =>
        Array.from({ length: s.episodeCount }, (_, i) => i + 1).every((e) =>
          done.has(`${d.id}:${s.seasonNumber}:${e}`)
        )
      );
    if (showComplete) {
      markWatched(d); // whole show → Watched row, out of Continue Watching
      return false;
    }

    // Not complete → just advance Continue Watching to the next episode. Finishing
    // an episode (or a season) never puts the show in Watched; only finishing the
    // WHOLE show does (above).
    const next = computeNextEpisode(d.seasonsList, ep.season, ep.episode);
    if (!next) {
      // Caught up to what's aired — drop it from Continue Watching rather than
      // leaving the finished episode sitting there.
      removeFromProgress(d.id);
      return false;
    }
    // Advance the Continue Watching entry to the next episode, ready to watch.
    setProgress(d, 0, 0, next);
    setPendingNext(next);
    return true;
  };

  // A finished film: markWatched pulls it out of Continue Watching (and shuffles
  // the Watchlist), and if it's part of a series the next film is queued at the
  // front of Continue Watching so the series carries on.
  const onMovieFinished = async () => {
    const d = dataRef.current;
    if (!d || type === "tv") return;
    markWatched(d);
    if (!d.collectionId) return;
    try {
      const films = await getCollection(d.collectionId); // release order
      const idx = films.findIndex((f) => f.id === d.id);
      const next = idx >= 0 ? films[idx + 1] : undefined;
      if (next) setProgress(next, 0, 0);
    } catch {
      /* no next film queued */
    }
  };

  const toDetail = () => navigate(`/title/${type}/${id}`, { replace: true });

  // Open the source list (Quick Watch) over the player so the user can pick a
  // stream for the given episode themselves.
  const openSourceList = (ep: EpisodeRef | null) => {
    if (data && ep) openQuickWatch(data, ep);
    else toDetail();
  };

  const playNext = async () => {
    if (!pendingNext || !data?.imdbId) return openSourceList(pendingNext);
    setLoadingNext(true);
    const addons = useAppStore
      .getState()
      .addons.filter((a) => a.enabled && isHttpAddon(a.url));
    // Up to five acceptable (English / no foreign-only audio) candidates in rank
    // order. Play the first; the rest ride along as a queue so the player can
    // fall through them on failure before giving up.
    const found = await resolveEpisodeStreams({
      addons,
      imdbId: data.imdbId,
      ref: pendingNext,
      expect: {
        title: data.title,
        year: data.year ? Number(data.year) : undefined,
        runtimeMin: data.runtime ?? undefined,
        preferredLang: useAppStore.getState().preferredAudioLang || "en",
      },
      native: nativeVideo || hasNativePlayback(),
      limit: 5,
    });
    setLoadingNext(false);
    if (found.length > 0) {
      navigate(`/watch/${type}/${id}?s=${pendingNext.season}&e=${pendingNext.episode}`, {
        state: { url: found[0].url, name: found[0].name, queue: found.slice(1), auto: true },
        replace: true,
      });
    } else {
      // Nothing resolved automatically — hand over the full source list to pick
      // from, right over the player.
      openSourceList(pendingNext);
    }
  };

  // A stream started by autoplay-next failed. Try the next queued candidate; if
  // the queue is exhausted, open the source list so the user can choose.
  const onAutoStreamFailed = (): boolean => {
    if (queue.length > 0) {
      navigate(`/watch/${type}/${id}${location.search}`, {
        state: { url: queue[0].url, name: queue[0].name, queue: queue.slice(1), auto: true },
        replace: true,
      });
      return true;
    }
    if (st?.auto) {
      openSourceList(epRefRef.current ?? null);
      return true;
    }
    return false;
  };

  // Android native playback: hand the stream to the ExoPlayer activity, which
  // decodes AC3/HEVC/MKV the WebView can't, then save the returned position and
  // go back. Replaces the <video> path entirely on Android.
  useEffect(() => {
    if (!nativeVideo || !streamUrl || resumeChoice === "pending") return; // wait for Continue / Start over
    let cancelled = false;
    (async () => {
      const startSec = partIndex > 0 ? 0 : resumeChoice === "restart" ? 0 : resumeSec;
      try {
        const res = await playNative({
          url: streamUrl,
          title: streamName || data?.title || "",
          startMs: Math.floor(startSec * 1000),
          audioLang: useAppStore.getState().preferredAudioLang || "en",
          filename: st?.filename,
          sizeBytes: st?.size,
        });
        if (cancelled) return;
        // Native player gave up buffering. If this was an autoplay-next stream,
        // fall through to the next candidate / source list; otherwise offer a
        // fresh source list.
        if (res.stalled) {
          if (onAutoStreamFailed()) return;
          return tryAnotherSource();
        }
        const finished = res.durationMs > 0 && res.positionMs >= res.durationMs * 0.9;
        // Finished → advance Continue Watching / roll up to Watched. Crucially,
        // don't fall through to the progress-save below, which would re-add the
        // finished episode we just advanced past.
        if (finished) {
          if (partIndex < partsList.length - 1) { setPartIndex((i) => i + 1); return; } // play the next part
          if (type === "tv") {
            if (onEpisodeFinished()) return; // next queued → stay for the "Up next" prompt
            navigate(-1); return;            // show complete / caught up → state already set
          }
          onMovieFinished(); // film: out of CW, next in series queued
          navigate(-1);
          return;
        }
        if (dataRef.current && res.durationMs > 0) {
          setProgress(dataRef.current, res.positionMs / 1000, res.durationMs / 1000, epRefRef.current);
        }
        navigate(-1);
      } catch {
        if (cancelled) return;
        if (onAutoStreamFailed()) return; // try the next queued candidate / list
        navigate(-1); // nothing to fall back to on Android
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nativeVideo, streamUrl, data, resumeChoice, resumeSec]);

  // persist progress to Continue Watching (web/desktop <video> only)
  useEffect(() => {
    if (nativeVideo || !data || !duration) return;
    const iv = setInterval(() => {
      const v = videoRef.current;
      if (v && !v.paused) setProgress(data, v.currentTime, duration, epRef);
    }, 5000);
    return () => clearInterval(iv);
  }, [data, duration, setProgress]);

  // auto-hide controls
  useEffect(() => {
    if (!showUI) return;
    const t = setTimeout(() => playing && setShowUI(false), 3000);
    return () => clearTimeout(t);
  }, [showUI, playing]);

  // Two-stage Back, so a stray press can't dump you out of a stream:
  //   controls up   → hide them
  //   controls down → show "press Back again to exit", armed for a few seconds
  //   pressed again → leave the player
  const [confirmExit, setConfirmExit] = useState(false);
  const confirmTimer = useRef<number>();
  const handleBack = (): boolean => {
    if (nativeVideo) return false; // the native activity owns its own Back
    if (showUI) {
      setShowUI(false);
      return true;
    }
    if (!confirmExit) {
      setConfirmExit(true);
      window.clearTimeout(confirmTimer.current);
      confirmTimer.current = window.setTimeout(() => setConfirmExit(false), 3500);
      return true;
    }
    window.clearTimeout(confirmTimer.current);
    navigate(-1);
    return true;
  };

  // Hardware Back (Android) via the interceptor; Escape / Backspace for a
  // keyboard or a remote that emits key events. Same logic for both.
  useEffect(() => {
    const stop = registerBackInterceptor(handleBack);
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "Escape" || e.key === "Backspace") && handleBack()) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      stop();
      window.removeEventListener("keydown", onKey, true);
      window.clearTimeout(confirmTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showUI, confirmExit, nativeVideo]);

  // Attach the right playback engine for the resolved stream. Formats the
  // WebView can't decode are routed through the desktop ffmpeg sidecar.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || nativeVideo || resumeChoice === "pending") return; // wait for Continue / Start over
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
      // Resume from the saved position when the user chose Continue (first part only).
      if (resumeChoice === "resume" && resumeSec > 0 && partIndex === 0) {
        const seek = () => { try { v.currentTime = resumeSec; } catch { /* not seekable yet */ } };
        if (v.readyState >= 1) seek();
        else v.addEventListener("loadedmetadata", seek, { once: true });
      }
      v.play?.().catch(() => {});
    })();

    return () => {
      active = false;
      cleanup();
      stopStream(); // don't leave ffmpeg running after we navigate away
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamUrl, resumeChoice, resumeSec]);

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
        onWaiting={onBufferStart}
        onStalled={onBufferStart}
        onPlaying={onBufferEnd}
        onCanPlay={onBufferEnd}
        onTimeUpdate={(e) => {
          setTime(e.currentTarget.currentTime);
          if (buffering) onBufferEnd(); // frames are advancing → not stuck
        }}
        onEnded={() => {
          if (partIndex < partsList.length - 1) { setPartIndex((i) => i + 1); return; } // next part
          if (onEpisodeFinished()) return; // tv episode: marked watched + advanced
          if (type !== "tv") onMovieFinished(); // film: out of CW, next in series queued
          toDetail();
        }}
        onError={(e) => {
          // Ignore aborts that happen while swapping the source.
          const err = e.currentTarget.error;
          if (err && err.code === err.MEDIA_ERR_ABORTED) return;
          if (onAutoStreamFailed()) return; // autoplay-next: try next candidate / list
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

      {/* Loading / buffering — a slow or large stream, not a frozen one. Only
          for the web <video>; the native player shows its own spinner. */}
      {!nativeVideo && buffering && !stalled && !preparing && !error && streamUrl && (
        <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-black/60">
          <Loader2 className="animate-spin text-accent" size={32} />
          <div className="text-center">
            <p className="text-lg font-bold">Loading stream…</p>
            <p className="mt-0.5 text-sm text-white/60">Larger files can take a moment to start.</p>
          </div>
          <div className="h-1 w-48 overflow-hidden rounded-full bg-white/15">
            <div className="h-full w-full animate-pulse rounded-full bg-accent/60" />
          </div>
        </div>
      )}

      {/* Buffered past the patience threshold — treat it as stuck and offer a
          fresh source list rather than leaving the user staring at a spinner. */}
      {!nativeVideo && stalled && !error && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black/85 p-6 text-center">
          <p className="text-lg font-bold">This stream seems stuck</p>
          <p className="max-w-md text-sm text-white/70">
            It's still loading after a while — the source may be slow or down. Try another one, or keep waiting.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <button onClick={tryAnotherSource} className="focusable rounded-lg bg-accent px-4 py-2 font-bold text-black">
              Try another source
            </button>
            <button
              onClick={onBufferEnd}
              className="focusable rounded-lg bg-white/10 px-4 py-2 font-semibold"
            >
              Keep waiting
            </button>
          </div>
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
            <button onClick={tryAnotherSource} className="focusable rounded-lg bg-accent px-4 py-2 font-bold text-black">
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
              {[epLabel, multiPart ? `Part ${partIndex + 1} of ${partsList.length}` : "", streamName || (streamUrl ? "Addon source" : "Sample video")].filter(Boolean).join("  ·  ")}
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
            <button onClick={toggle} className="focus-tint">
              {playing ? <Pause size={26} fill="currentColor" /> : <Play size={26} fill="currentColor" />}
            </button>
            <button onClick={() => { const v = videoRef.current; if (v) v.currentTime += 10; }} className="focus-tint">
              <SkipForward size={22} />
            </button>
            {!isTV && (
              <button onClick={() => setMuted((m) => !m)} className="focus-tint" aria-label="Mute">
                {muted ? <VolumeX size={22} /> : <Volume2 size={22} />}
              </button>
            )}
            <span className="text-sm tabular-nums text-white/80">{fmt(time)} / {fmt(duration)}</span>
            <div className="flex-1" />
            <button
              onClick={() => setSubs((s) => !s)}
              className={`focus-tint px-2 py-1 ${subs ? "text-accent" : "text-white"}`}
              aria-label="Subtitles"
            >
              <Subtitles size={22} />
            </button>
            {/* Hidden on TV — it's already the big screen. */}
            {!isTV && <CastButton videoRef={videoRef} />}
            <button
              onClick={() => videoRef.current?.requestFullscreen?.()}
              className="focus-tint"
              aria-label="Fullscreen"
            >
              <Maximize size={22} />
            </button>
          </div>
        </div>
      </div>

      {/* Episode finished — offer the next one. */}
      {pendingNext && (
        <div className="absolute bottom-6 right-6 z-40 w-64 animate-row-in rounded-xl border border-white/15 bg-black/90 p-4 shadow-card backdrop-blur">
          <div className="text-[11px] font-bold uppercase tracking-wider text-accent">Up next</div>
          <div className="mt-0.5 text-sm font-bold">
            Play S{pendingNext.season} · E{pendingNext.episode}?
          </div>
          <div className="mt-3 flex gap-2">
            <button
              onClick={playNext}
              disabled={loadingNext}
              autoFocus
              className="focusable flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-accent py-2 text-sm font-bold text-black"
            >
              {loadingNext ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} fill="currentColor" />}
              {loadingNext ? "Finding…" : "Yes"}
            </button>
            <button
              onClick={toDetail}
              disabled={loadingNext}
              className="focusable rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold hover:bg-white/20"
            >
              No
            </button>
          </div>
        </div>
      )}

      {/* Shown when Back is pressed with the controls already hidden — a second
          Back within a few seconds actually leaves the stream. */}
      {confirmExit && (
        <div className="absolute bottom-6 right-6 z-30 animate-row-in rounded-xl border border-white/15 bg-black/85 px-4 py-3 text-sm shadow-card backdrop-blur">
          <span className="font-semibold">Press Back again to exit</span>
          <span className="ml-1 text-muted">— or wait to keep watching.</span>
        </div>
      )}

      {/* Resume vs. start over — gates playback until the user chooses. */}
      {resumeChoice === "pending" && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-black/85 p-6 text-center">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-accent">
              {[epLabel, data?.title].filter(Boolean).join("  ·  ") || "Resume"}
            </div>
            <h2 className="mt-1 text-2xl font-black">Resume from {fmt(resumeSec)}?</h2>
            <p className="mt-1 text-sm text-white/70">
              You were partway through this {type === "tv" ? "episode" : "film"}.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            <button
              onClick={() => setResumeChoice("resume")}
              autoFocus
              className="focusable flex items-center gap-2 rounded-lg bg-accent px-6 py-3 font-bold text-black"
            >
              <Play size={18} fill="currentColor" /> Continue
            </button>
            <button
              onClick={() => setResumeChoice("restart")}
              className="focusable flex items-center gap-2 rounded-lg bg-white/10 px-6 py-3 font-semibold hover:bg-white/20"
            >
              <RotateCcw size={18} /> Watch from start
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

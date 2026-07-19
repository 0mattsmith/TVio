import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, ListVideo, Tv } from "lucide-react";
import { useGuide } from "../hooks/useIptv";
import { attachStream, classifyStream } from "../lib/playback";
import { hasNativePlayback } from "../platform/capabilities";
import { MiniGuide } from "../components/epg/MiniGuide";
import { ProgrammeInfoModal } from "../components/epg/ProgrammeInfoModal";
import { nowNext, programmesFor } from "../iptv/guide";
import type { Channel, Programme } from "../iptv/types";

export function LivePlayer() {
  const { channelId } = useParams<{ channelId: string }>();
  const navigate = useNavigate();
  const { channels, epg, isLoading } = useGuide();
  const videoRef = useRef<HTMLVideoElement>(null);

  const [current, setCurrent] = useState<Channel | null>(null);
  const [showGuide, setShowGuide] = useState(false);
  const [info, setInfo] = useState<{ p: Programme; c: Channel } | null>(null);
  const [error, setError] = useState(false);
  const [showUI, setShowUI] = useState(true);

  // Resolve the channel from the URL once the playlist loads.
  useEffect(() => {
    if (!current && channels.length) {
      const want = decodeURIComponent(channelId || "");
      setCurrent(channels.find((c) => c.id === want) || channels[0]);
    }
  }, [channels, channelId, current]);

  // Attach the stream for the current channel.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !current) return;
    setError(false);
    if (!hasNativePlayback() && classifyStream(current.url) === "unsupported") {
      setError(true);
      return;
    }
    let cleanup = () => {};
    let active = true;
    attachStream(v, current.url).then((r) => {
      if (!active) return r.cleanup();
      cleanup = r.cleanup;
      v.play?.().catch(() => {});
    });
    return () => {
      active = false;
      cleanup();
    };
  }, [current?.url]);

  // Keyboard: any arrow/enter opens the mini guide; g toggles; Esc closes/back.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showGuide) setShowGuide(false);
        else navigate(-1);
      } else if (e.key === "g" || e.key === "G") {
        setShowGuide((g) => !g);
      } else if (!showGuide && (e.key.startsWith("Arrow") || e.key === "Enter")) {
        setShowGuide(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showGuide, navigate]);

  const nn = current ? nowNext(programmesFor(epg, current)) : { current: undefined, next: undefined, index: -1 };

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black" onMouseMove={() => setShowUI(true)}>
      <video
        ref={videoRef}
        className="h-full w-full object-contain"
        autoPlay
        playsInline
        onError={() => setError(true)}
        onClick={() => videoRef.current?.play().catch(() => {})}
      />

      {error && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black/85 p-6 text-center">
          <p className="text-lg font-bold">This channel couldn't be played here</p>
          <p className="max-w-md text-sm text-white/70">
            The stream format may be unsupported in the browser (e.g. MKV/HEVC), or the server blocks browser (CORS)
            requests. It should play in the Android / desktop builds.
          </p>
          <div className="flex gap-2">
            <button onClick={() => setShowGuide(true)} className="focusable rounded-lg bg-accent px-4 py-2 font-bold text-black">Open guide</button>
            <button onClick={() => navigate(-1)} className="focusable rounded-lg bg-white/10 px-4 py-2 font-semibold">Back</button>
          </div>
        </div>
      )}

      {isLoading && !current && (
        <div className="absolute inset-0 flex items-center justify-center gap-3 text-muted">
          <Loader2 className="animate-spin" /> Loading channel…
        </div>
      )}

      {/* Top bar */}
      <div className={`absolute inset-x-0 top-0 z-20 flex items-center gap-3 bg-gradient-to-b from-black/70 to-transparent p-4 transition-opacity ${showUI || showGuide ? "opacity-100" : "opacity-0"}`}>
        <button onClick={() => navigate(-1)} className="focusable flex items-center gap-2 rounded-full bg-black/40 px-4 py-2 font-semibold">
          <ArrowLeft size={18} /> Back
        </button>
        {current && (
          <div className="flex min-w-0 items-center gap-2">
            {current.logo ? <img src={current.logo} alt="" className="h-7 w-7 rounded object-contain" /> : <Tv size={18} />}
            <div className="min-w-0">
              <div className="truncate text-sm font-bold leading-tight">{current.name}</div>
              {nn.current && <div className="truncate text-xs text-white/60">{nn.current.title}</div>}
            </div>
          </div>
        )}
        <div className="flex-1" />
        <button onClick={() => setShowGuide((g) => !g)} className="focusable flex items-center gap-2 rounded-full bg-black/40 px-4 py-2 font-semibold">
          <ListVideo size={18} /> Guide
        </button>
      </div>

      {showGuide && current && channels.length > 0 && (
        <MiniGuide
          channels={channels}
          epg={epg}
          currentId={current.id}
          onWatch={(c) => { setCurrent(c); setShowGuide(false); }}
          onInfo={(p, c) => setInfo({ p, c })}
          onClose={() => setShowGuide(false)}
        />
      )}

      <ProgrammeInfoModal programme={info?.p ?? null} channelName={info?.c.name} onClose={() => setInfo(null)} />
    </div>
  );
}

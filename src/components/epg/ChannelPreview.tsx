import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Maximize2, Tv } from "lucide-react";
import { attachStream } from "../../lib/playback";
import { programmesFor, nowNext, fmtTime, progress } from "../../iptv/guide";
import type { Channel, EpgData } from "../../iptv/types";

// Muted corner preview of the selected channel with now/next info.
export function ChannelPreview({ channel, epg }: { channel: Channel | null; epg: EpgData }) {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !channel) return;
    let cleanup = () => {};
    let active = true;
    v.muted = true;
    attachStream(v, channel.url).then((r) => {
      if (!active) return r.cleanup();
      cleanup = r.cleanup;
      v.play?.().catch(() => {});
    });
    return () => {
      active = false;
      cleanup();
    };
  }, [channel?.url]);

  if (!channel) {
    return (
      <div className="flex aspect-video w-full items-center justify-center rounded-xl border border-white/10 bg-surface text-sm text-muted">
        <Tv size={18} className="mr-2" /> Select a channel
      </div>
    );
  }

  const nn = nowNext(programmesFor(epg, channel));

  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-black shadow-card">
      <div className="relative aspect-video bg-black">
        <video ref={videoRef} className="h-full w-full object-contain" playsInline muted autoPlay />
        <button
          onClick={() => navigate(`/live/watch/${encodeURIComponent(channel.id)}`)}
          className="focusable absolute right-2 top-2 flex items-center gap-1 rounded-full bg-black/60 px-3 py-1.5 text-xs font-bold backdrop-blur"
          aria-label="Fullscreen"
        >
          <Maximize2 size={14} /> Full screen
        </button>
      </div>
      <div className="p-3">
        <div className="flex items-center gap-2">
          {channel.logo ? (
            <img src={channel.logo} alt="" className="h-6 w-6 rounded object-contain" />
          ) : (
            <Tv size={16} className="text-accent" />
          )}
          <span className="truncate text-sm font-bold">{channel.name}</span>
        </div>
        {nn.current ? (
          <div className="mt-2">
            <div className="truncate text-sm font-semibold">{nn.current.title}</div>
            <div className="text-xs text-muted">
              {fmtTime(nn.current.start)} – {fmtTime(nn.current.stop)}
            </div>
            <div className="mt-1.5 h-1 rounded bg-white/15">
              <div className="h-full rounded bg-accent" style={{ width: `${progress(nn.current)}%` }} />
            </div>
            {nn.next && <div className="mt-1.5 truncate text-xs text-muted">Next: {nn.next.title}</div>}
          </div>
        ) : (
          <div className="mt-2 text-xs text-muted">No guide data for this channel.</div>
        )}
      </div>
    </div>
  );
}

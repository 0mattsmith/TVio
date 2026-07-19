import { Play, Clock, Tag, Info } from "lucide-react";
import type { Programme } from "../../iptv/types";
import { fmtTime, fmtDuration, progress } from "../../iptv/guide";

// Inline (non-modal) info panel for the currently selected programme, shown to
// the left of the channel preview on the Live TV page.
export function ProgrammeInfoBox({
  programme,
  channelName,
  onWatch,
}: {
  programme: Programme | null;
  channelName?: string;
  onWatch?: () => void;
}) {
  if (!programme) {
    return (
      <div className="flex h-full min-h-[13rem] flex-col items-center justify-center rounded-xl border border-white/10 bg-surface p-6 text-center text-sm text-muted">
        <Info size={22} className="mb-2" />
        Select a programme in the guide to see details.
      </div>
    );
  }

  const live = programme.start <= Date.now() && programme.stop > Date.now();

  return (
    <div className="flex h-full min-h-[13rem] flex-col rounded-xl border border-white/10 bg-surface p-5">
      {channelName && <div className="text-xs font-bold uppercase tracking-wider text-accent">{channelName}</div>}
      <h2 className="mt-1 line-clamp-2 text-2xl font-black tracking-tight">{programme.title}</h2>

      <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted">
        <span className="flex items-center gap-1.5"><Clock size={14} /> {fmtTime(programme.start)} – {fmtTime(programme.stop)}</span>
        <span>{fmtDuration(programme.stop - programme.start)}</span>
        {programme.category && <span className="flex items-center gap-1.5"><Tag size={14} /> {programme.category}</span>}
        {live && <span className="rounded bg-red-500/20 px-2 py-0.5 text-xs font-bold text-red-400">● LIVE</span>}
      </div>

      {live && (
        <div className="mt-2 h-1 rounded bg-white/15">
          <div className="h-full rounded bg-accent" style={{ width: `${progress(programme)}%` }} />
        </div>
      )}

      {programme.desc && <p className="mt-3 line-clamp-4 text-sm leading-relaxed text-white/85">{programme.desc}</p>}

      <div className="flex-1" />

      {onWatch && live && (
        <button
          onClick={onWatch}
          className="focusable mt-4 flex items-center justify-center gap-2 self-start rounded-lg bg-accent px-4 py-2.5 font-bold text-black"
        >
          <Play size={16} fill="currentColor" /> Watch live
        </button>
      )}
    </div>
  );
}

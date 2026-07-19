import { X, Play, Clock, Tag } from "lucide-react";
import type { Programme } from "../../iptv/types";
import { fmtTime, fmtDuration } from "../../iptv/guide";

export function ProgrammeInfoModal({
  programme,
  channelName,
  onClose,
  onWatch,
}: {
  programme: Programme | null;
  channelName?: string;
  onClose: () => void;
  onWatch?: () => void;
}) {
  if (!programme) return null;
  const live = programme.start <= Date.now() && programme.stop > Date.now();
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="animate-row-in w-full max-w-md rounded-2xl border border-white/10 bg-surface p-6 shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {channelName && <div className="text-xs font-bold uppercase tracking-wider text-accent">{channelName}</div>}
            <h2 className="mt-0.5 text-xl font-black tracking-tight">{programme.title}</h2>
          </div>
          <button onClick={onClose} className="focusable rounded-full p-1 text-muted hover:text-white" aria-label="Close">
            <X size={22} />
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-muted">
          <span className="flex items-center gap-1.5">
            <Clock size={14} /> {fmtTime(programme.start)} – {fmtTime(programme.stop)}
          </span>
          <span>{fmtDuration(programme.stop - programme.start)}</span>
          {programme.category && (
            <span className="flex items-center gap-1.5"><Tag size={14} /> {programme.category}</span>
          )}
          {live && <span className="rounded bg-red-500/20 px-2 py-0.5 text-xs font-bold text-red-400">● LIVE</span>}
        </div>

        {programme.desc && <p className="mt-4 text-sm leading-relaxed text-white/85">{programme.desc}</p>}

        {onWatch && live && (
          <button
            onClick={onWatch}
            className="focusable mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-accent py-3 font-bold text-black"
          >
            <Play size={18} fill="currentColor" /> Watch live
          </button>
        )}
      </div>
    </div>
  );
}

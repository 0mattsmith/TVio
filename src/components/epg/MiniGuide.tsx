import { useEffect, useMemo, useRef, useState } from "react";
import { Info, Tv, X } from "lucide-react";
import type { Channel, EpgData, Programme } from "../../iptv/types";
import { programmesFor, fmtTime } from "../../iptv/guide";

// Sky/Virgin-style mini guide overlaid on the live player.
//   ↑ / ↓  change channel   ← / →  scroll that channel's schedule
//   Enter  watch focused channel     i  info on focused programme
export function MiniGuide({
  channels,
  epg,
  currentId,
  onWatch,
  onInfo,
  onClose,
}: {
  channels: Channel[];
  epg: EpgData;
  currentId: string;
  onWatch: (c: Channel) => void;
  onInfo: (p: Programme, c: Channel) => void;
  onClose: () => void;
}) {
  const startIndex = Math.max(0, channels.findIndex((c) => c.id === currentId));
  const [chIdx, setChIdx] = useState(startIndex);
  const [progIdx, setProgIdx] = useState(0);
  const focusCh = channels[chIdx] || channels[0];

  const progs = useMemo(
    () => (focusCh ? programmesFor(epg, focusCh).filter((p) => p.stop > Date.now()).slice(0, 12) : []),
    [epg, focusCh]
  );

  const chRef = useRef<HTMLButtonElement>(null);
  const progRef = useRef<HTMLButtonElement>(null);

  useEffect(() => setProgIdx(0), [chIdx]);
  useEffect(() => chRef.current?.scrollIntoView({ block: "nearest" }), [chIdx]);
  useEffect(() => progRef.current?.scrollIntoView({ inline: "nearest", block: "nearest" }), [progIdx]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown": e.preventDefault(); setChIdx((i) => Math.min(channels.length - 1, i + 1)); break;
        case "ArrowUp": e.preventDefault(); setChIdx((i) => Math.max(0, i - 1)); break;
        case "ArrowRight": e.preventDefault(); setProgIdx((i) => Math.min(Math.max(0, progs.length - 1), i + 1)); break;
        case "ArrowLeft": e.preventDefault(); setProgIdx((i) => Math.max(0, i - 1)); break;
        case "Enter": e.preventDefault(); if (focusCh) onWatch(focusCh); break;
        case "i": case "I": if (progs[progIdx] && focusCh) onInfo(progs[progIdx], focusCh); break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [channels.length, progs, progIdx, focusCh, onWatch, onInfo]);

  return (
    <div className="absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-black via-black/95 to-transparent p-4 pt-10">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-bold">Guide</div>
        <div className="flex items-center gap-3">
          <span className="hidden text-xs text-muted sm:inline">↑↓ channels · ←→ schedule · Enter watch · i info</span>
          <button onClick={onClose} className="focusable rounded-full p-1 text-muted hover:text-white" aria-label="Close guide"><X size={18} /></button>
        </div>
      </div>

      <div className="flex gap-4">
        {/* Channel list */}
        <div className="no-scrollbar max-h-52 w-56 shrink-0 space-y-1 overflow-y-auto">
          {channels.map((c, i) => {
            const active = i === chIdx;
            return (
              <button
                key={c.id}
                ref={active ? chRef : undefined}
                onMouseEnter={() => setChIdx(i)}
                onClick={() => onWatch(c)}
                className={`focusable flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left ${
                  active ? "bg-accent-soft ring-1 ring-accent" : "bg-surface-2/60 hover:bg-white/10"
                }`}
              >
                {c.logo ? (
                  <img src={c.logo} alt="" className="h-7 w-7 shrink-0 rounded object-contain" />
                ) : (
                  <Tv size={16} className="shrink-0 text-muted" />
                )}
                <span className="truncate text-sm font-semibold">{c.name}</span>
                {c.id === currentId && <span className="ml-auto text-[10px] font-bold text-accent">● ON</span>}
              </button>
            );
          })}
        </div>

        {/* Schedule for focused channel */}
        <div className="min-w-0 flex-1">
          <div className="mb-2 truncate text-sm font-bold text-muted">{focusCh?.name} — schedule</div>
          {progs.length === 0 ? (
            <div className="rounded-lg bg-surface-2/60 px-3 py-6 text-center text-xs text-muted">No guide data for this channel.</div>
          ) : (
            <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
              {progs.map((p, i) => {
                const active = i === progIdx;
                const live = p.start <= Date.now() && p.stop > Date.now();
                return (
                  <button
                    key={`${p.start}-${i}`}
                    ref={active ? progRef : undefined}
                    onMouseEnter={() => setProgIdx(i)}
                    onClick={() => focusCh && onInfo(p, focusCh)}
                    className={`focusable w-52 shrink-0 rounded-lg border p-3 text-left ${
                      active ? "border-accent bg-accent-soft" : "border-white/10 bg-surface-2"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted">{fmtTime(p.start)}–{fmtTime(p.stop)}</span>
                      {live && <span className="text-[10px] font-bold text-red-400">● LIVE</span>}
                    </div>
                    <div className="mt-1 line-clamp-2 text-sm font-semibold">{p.title}</div>
                    <div className="mt-1 flex items-center gap-1 text-[11px] text-accent"><Info size={12} /> Info</div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

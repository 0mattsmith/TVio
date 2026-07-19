import { useEffect, useMemo, useRef, useState } from "react";
import { Tv } from "lucide-react";
import type { Channel, EpgData, Programme } from "../../iptv/types";
import { MINUTE, HOUR, floorTo, programmesFor, programmesInWindow, fmtTime } from "../../iptv/guide";

const PX_PER_MIN = 6; // 1 hour = 360px
const ROW_H = 76;
const COL_W = 200; // channel column width
const HEADER_H = 34;
const HOURS = 8; // window span
const BUFFER = 4; // extra rows rendered above/below the viewport

export function EpgGrid({
  channels,
  epg,
  selectedId,
  selectedProgKey,
  onSelect,
  onOpenProgramme,
}: {
  channels: Channel[];
  epg: EpgData;
  selectedId?: string;
  selectedProgKey?: string;
  onSelect: (c: Channel) => void;
  onOpenProgramme: (p: Programme, c: Channel) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(600);

  const start = useMemo(() => floorTo(Date.now(), 30), []);
  const end = start + HOURS * HOUR;
  const spanPx = ((end - start) / MINUTE) * PX_PER_MIN;

  const ticks = useMemo(() => {
    const out: { x: number; label: string }[] = [];
    for (let t = start; t < end; t += 30 * MINUTE) {
      out.push({ x: ((t - start) / MINUTE) * PX_PER_MIN, label: fmtTime(t) });
    }
    return out;
  }, [start, end]);

  const nowX = ((Date.now() - start) / MINUTE) * PX_PER_MIN;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => setViewportH(el.clientHeight);
    measure();
    el.scrollLeft = Math.max(0, nowX - 80); // start near "now"
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => setScrollTop(el.scrollTop));
  };

  // Vertical virtualization: only render rows near the viewport.
  const firstRow = Math.max(0, Math.floor(scrollTop / ROW_H) - BUFFER);
  const visCount = Math.ceil(viewportH / ROW_H) + BUFFER * 2;
  const lastRow = Math.min(channels.length, firstRow + visCount);
  const topPad = firstRow * ROW_H;
  const bottomPad = Math.max(0, (channels.length - lastRow) * ROW_H);
  const visible = channels.slice(firstRow, lastRow);

  return (
    <div ref={scrollRef} onScroll={onScroll} className="relative overflow-auto rounded-xl border border-white/10 bg-surface" style={{ height: "62vh" }}>
      <div className="relative" style={{ width: COL_W + spanPx }}>
        {/* Timeline header */}
        <div className="sticky top-0 z-30 flex bg-surface/95 backdrop-blur" style={{ height: HEADER_H }}>
          <div className="sticky left-0 z-40 flex items-center bg-surface px-3 text-xs font-bold uppercase tracking-wider text-muted" style={{ width: COL_W, minWidth: COL_W }}>
            Channels
          </div>
          <div className="relative" style={{ width: spanPx }}>
            {ticks.map((t) => (
              <div key={t.x} className="absolute top-0 flex h-full items-center border-l border-white/10 pl-2 text-xs text-muted" style={{ left: t.x }}>
                {t.label}
              </div>
            ))}
          </div>
        </div>

        {/* Virtualized channel rows */}
        {topPad > 0 && <div style={{ height: topPad }} />}
        {visible.map((ch) => {
          const progs = programmesInWindow(programmesFor(epg, ch), start, end);
          const isSel = ch.id === selectedId;
          return (
            <div key={ch.id} className="flex border-t border-white/5" style={{ height: ROW_H }}>
              <button
                onClick={() => onSelect(ch)}
                className={`focusable sticky left-0 z-20 flex items-center gap-2 border-r border-white/10 px-3 text-left ${isSel ? "bg-accent-soft" : "bg-surface hover:bg-white/5"}`}
                style={{ width: COL_W, minWidth: COL_W }}
              >
                {ch.logo ? (
                  <img src={ch.logo} alt="" loading="lazy" className="h-9 w-9 shrink-0 rounded object-contain" />
                ) : (
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-surface-2"><Tv size={16} className="text-muted" /></span>
                )}
                <span className={`truncate text-sm font-semibold ${isSel ? "text-accent" : ""}`}>{ch.name}</span>
              </button>

              <div className="relative" style={{ width: spanPx }}>
                {progs.length === 0 && <div className="flex h-full items-center px-3 text-xs text-muted/60">No guide data</div>}
                {progs.map((p) => {
                  const left = Math.max(0, ((p.start - start) / MINUTE) * PX_PER_MIN);
                  const right = Math.min(spanPx, ((p.stop - start) / MINUTE) * PX_PER_MIN);
                  const width = Math.max(2, right - left);
                  const live = p.start <= Date.now() && p.stop > Date.now();
                  const isSelected = selectedProgKey === `${ch.id}:${p.start}`;
                  return (
                    <button
                      key={`${p.start}-${p.title}`}
                      onClick={() => onOpenProgramme(p, ch)}
                      title={`${p.title} · ${fmtTime(p.start)}–${fmtTime(p.stop)}`}
                      className={`focusable absolute bottom-1 top-1 overflow-hidden rounded-md border px-2 py-1 text-left ${
                        isSelected ? "border-accent bg-accent-soft ring-2 ring-accent" : live ? "border-accent/60 bg-accent-soft" : "border-white/5 bg-surface-2 hover:bg-white/10"
                      }`}
                      style={{ left: left + 2, width: width - 4 }}
                    >
                      <div className="truncate text-xs font-semibold">{p.title}</div>
                      <div className="truncate text-[11px] text-muted">{fmtTime(p.start)}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
        {bottomPad > 0 && <div style={{ height: bottomPad }} />}

        {/* Now indicator */}
        {nowX >= 0 && nowX <= spanPx && (
          <div className="pointer-events-none absolute z-10 w-0.5 bg-accent" style={{ left: COL_W + nowX, top: HEADER_H, bottom: 0 }} />
        )}
      </div>
    </div>
  );
}

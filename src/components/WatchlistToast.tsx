import { useEffect, useRef, useState } from "react";
import { X, Play } from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import { useDeviceProfile } from "../hooks/useDeviceProfile";
import { usePlay } from "../hooks/usePlay";

const SHOW_MS = 6000;

// Non-intrusive top-right toast on the big-screen app (TV / desktop) when an
// item is added to the watchlist — typically from a phone / the Lite build on
// the same account. Suppressed on mobile (the phone is usually the one adding),
// and it lives inside AppLayout so it never appears over the fullscreen player.
export function WatchlistToast() {
  const last = useAppStore((s) => s.lastWatchlistAdd);
  const clear = useAppStore((s) => s.clearWatchlistAdd);
  const profile = useDeviceProfile();
  const isTV = profile === "tv";
  const play = usePlay();
  const [visible, setVisible] = useState(false);
  const [remaining, setRemaining] = useState(SHOW_MS);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!last || profile === "mobile") return;
    setVisible(true);
    setRemaining(SHOW_MS);

    // Tick down. On TV the countdown pauses whenever focus is inside the toast,
    // so it can't disappear while the user is deciding whether to open it — a
    // remote makes "reach the button before it vanishes" a real problem.
    let elapsed = 0;
    let lastTick = Date.now();
    const id = setInterval(() => {
      const now = Date.now();
      const focusedInside = isTV && rootRef.current?.contains(document.activeElement);
      if (!focusedInside) elapsed += now - lastTick;
      lastTick = now;

      const left = Math.max(0, SHOW_MS - elapsed);
      setRemaining(left);
      if (left <= 0) {
        setVisible(false);
        setTimeout(clear, 400);
      }
    }, 100);

    return () => clearInterval(id);
  }, [last?.at, profile, isTV, clear]);

  if (!last || profile === "mobile") return null;
  const item = last.item;
  const secs = Math.ceil(remaining / 1000);

  return (
    <div
      ref={rootRef}
      className={`fixed right-4 top-20 z-[70] w-80 max-w-[calc(100vw-2rem)] transition-all duration-300 ${
        visible ? "translate-x-0 opacity-100" : "pointer-events-none translate-x-6 opacity-0"
      }`}
    >
      <div className="overflow-hidden rounded-xl border border-white/10 bg-surface/95 shadow-card backdrop-blur">
        <div className="flex gap-3 p-3">
          <div className="h-24 w-16 shrink-0 overflow-hidden rounded-md bg-surface-2">
            {item.poster && <img src={item.poster} alt="" className="h-full w-full object-cover" />}
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[11px] font-bold uppercase tracking-wider text-accent">Added to Watchlist</div>
              {/* Desktop keeps a click-to-dismiss X; TV can't easily hit it, so
                  it gets a countdown instead and auto-closes. */}
              {isTV ? (
                <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-bold tabular-nums text-muted">
                  {secs}s
                </span>
              ) : (
                <button
                  onClick={() => setVisible(false)}
                  className="focusable -mr-1 -mt-1 shrink-0 text-muted hover:text-white"
                  aria-label="Dismiss"
                >
                  <X size={16} />
                </button>
              )}
            </div>
            <div className="mt-0.5 line-clamp-2 text-sm font-bold leading-tight">{item.title}</div>
            <div className="mt-auto pt-2">
              <button
                onClick={() => {
                  setVisible(false);
                  clear();
                  play(item);
                }}
                className="focusable flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-bold text-black"
              >
                <Play size={13} fill="currentColor" /> Watch Now
              </button>
            </div>
          </div>
        </div>

        {/* Countdown bar — the visual timer that replaces the X on TV. */}
        {isTV && (
          <div className="h-1 w-full bg-white/10">
            <div
              className="h-full bg-accent transition-[width] duration-100 ease-linear"
              style={{ width: `${(remaining / SHOW_MS) * 100}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

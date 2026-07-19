import { useEffect, useState } from "react";
import { X, Play } from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import { useDeviceProfile } from "../hooks/useDeviceProfile";
import { usePlay } from "../hooks/usePlay";

// Non-intrusive top-right toast on the big-screen app (TV / desktop) when an
// item is added to the watchlist — typically from a phone / the Lite build on
// the same account. Shows the poster, "… added to Watchlist" and a Watch Now
// button for ~6s. Suppressed on mobile (the phone is usually the one adding),
// and it lives inside AppLayout so it never appears over the fullscreen player.
export function WatchlistToast() {
  const last = useAppStore((s) => s.lastWatchlistAdd);
  const clear = useAppStore((s) => s.clearWatchlistAdd);
  const profile = useDeviceProfile();
  const play = usePlay();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!last || profile === "mobile") return;
    setVisible(true);
    const hide = setTimeout(() => setVisible(false), 6000);
    const remove = setTimeout(clear, 6400); // clear after the fade-out
    return () => {
      clearTimeout(hide);
      clearTimeout(remove);
    };
  }, [last?.at, profile, clear]);

  if (!last || profile === "mobile") return null;
  const item = last.item;

  return (
    <div
      className={`fixed right-4 top-20 z-[70] w-80 max-w-[calc(100vw-2rem)] transition-all duration-300 ${
        visible ? "translate-x-0 opacity-100" : "pointer-events-none translate-x-6 opacity-0"
      }`}
    >
      <div className="flex gap-3 rounded-xl border border-white/10 bg-surface/95 p-3 shadow-card backdrop-blur">
        <div className="h-24 w-16 shrink-0 overflow-hidden rounded-md bg-surface-2">
          {item.poster && <img src={item.poster} alt="" className="h-full w-full object-cover" />}
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="text-[11px] font-bold uppercase tracking-wider text-accent">Added to Watchlist</div>
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
        <button onClick={() => setVisible(false)} className="focusable self-start text-muted hover:text-white" aria-label="Dismiss">
          <X size={16} />
        </button>
      </div>
    </div>
  );
}

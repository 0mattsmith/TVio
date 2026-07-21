import { useEffect, useState } from "react";
import { X, MonitorPlay, Tv, Bluetooth, Loader2, Check, MonitorSmartphone } from "lucide-react";
import { discoverTargets, sendToTarget, type PlayTarget } from "../services/playon";
import type { MediaItem } from "../services/types";

function TargetIcon({ kind }: { kind: PlayTarget["kind"] }) {
  if (kind === "windows") return <MonitorPlay size={18} className="text-accent" />;
  if (kind === "bluetooth") return <Bluetooth size={18} className="text-accent" />;
  return <Tv size={18} className="text-accent" />;
}

// "Play On…" — pick another TVio app (TV / desktop) to send this title to.
export function PlayOnSheet({
  item,
  episode,
  streamUrl,
  onClose,
}: {
  item: MediaItem;
  episode?: { season: number; episode: number };
  streamUrl?: string;
  onClose: () => void;
}) {
  const [targets, setTargets] = useState<PlayTarget[] | null>(null);
  const [sending, setSending] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    discoverTargets().then((t) => active && setTargets(t));
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      active = false;
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const send = async (t: PlayTarget) => {
    setSending(t.id);
    setError(null);
    try {
      await sendToTarget(t, item, { season: episode?.season, episode: episode?.episode, streamUrl });
      setSentTo(t.name);
      setTimeout(onClose, 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send to that screen.");
    } finally {
      setSending(null);
    }
  };

  return (
    <div data-spatial-scope className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div className="animate-row-in w-full max-w-md rounded-t-2xl border border-white/10 bg-surface p-5 shadow-card sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-accent">
              <MonitorSmartphone size={14} /> Play On…
            </div>
            <h2 className="mt-0.5 truncate text-lg font-black tracking-tight">{item.title}</h2>
            <p className="text-xs text-muted">Send this to a TVio screen on your account or network.</p>
          </div>
          <button onClick={onClose} className="focusable rounded-full p-1 text-muted hover:text-white" aria-label="Close">
            <X size={22} />
          </button>
        </div>

        <div className="mt-4">
          {sentTo ? (
            <div className="flex items-center gap-2 rounded-lg bg-accent-soft px-4 py-3 text-sm font-semibold text-accent">
              <Check size={18} /> Sent to {sentTo}
            </div>
          ) : targets === null ? (
            <div className="flex items-center gap-2 px-1 py-6 text-sm text-muted">
              <Loader2 className="animate-spin" size={18} /> Looking for screens…
            </div>
          ) : targets.length === 0 ? (
            <div className="rounded-lg border border-dashed border-white/15 bg-surface-2/50 p-4 text-center text-sm text-muted">
              No screens found. Open TVio on your Android TV or PC — signed into the same account or on the same Wi-Fi — and it will appear here.
              <div className="mt-2 text-xs">Play On runs from the TVio mobile app.</div>
            </div>
          ) : (
            <div className="space-y-2">
              {targets.map((t) => (
                <button
                  key={t.id}
                  disabled={!t.online || sending === t.id}
                  onClick={() => send(t)}
                  className="focusable flex w-full items-center gap-3 rounded-lg bg-surface-2 px-4 py-3 text-left hover:bg-white/10 disabled:opacity-50"
                >
                  <TargetIcon kind={t.kind} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{t.name}</div>
                    <div className="truncate text-xs text-muted">{t.online ? "Ready" : "Offline"}</div>
                  </div>
                  {sending === t.id && <Loader2 className="animate-spin text-accent" size={16} />}
                </button>
              ))}
            </div>
          )}
          {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
        </div>
      </div>
    </div>
  );
}

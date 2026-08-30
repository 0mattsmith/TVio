import { useEffect, useRef, useState } from "react";
import { X, RefreshCw, Check } from "lucide-react";
import { requestPin, pollPin } from "../services/simkl";
import { useAppStore } from "../store/useAppStore";
import { useOverlayBack } from "../hooks/useOverlayBack";

type Phase = "loading" | "waiting" | "done" | "error";

/**
 * Simkl PIN sign-in — TV-friendly device flow. We fetch a short code, show it,
 * and poll until the user approves it at simkl.com/pin on their phone. On
 * success we save the token and run a first sync. Focus-trapped like the other
 * dialogs so a stray D-pad press can't wander behind it.
 */
export function SimklConnectDialog({ onClose }: { onClose: () => void }) {
  const setSimklToken = useAppStore((s) => s.setSimklToken);
  const syncSimkl = useAppStore((s) => s.syncSimkl);
  const [phase, setPhase] = useState<Phase>("loading");
  const [code, setCode] = useState("");
  const [url, setUrl] = useState("https://simkl.com/pin");
  const timers = useRef<number[]>([]);

  useOverlayBack(true, onClose);

  const start = async () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setPhase("loading");
    const pin = await requestPin();
    if (!pin) {
      setPhase("error");
      return;
    }
    setCode(pin.userCode);
    setUrl(pin.url);
    setPhase("waiting");
    const deadline = Date.now() + pin.expiresIn * 1000;
    const tick = async () => {
      if (Date.now() > deadline) {
        setPhase("error");
        return;
      }
      const r = await pollPin(pin.userCode);
      if (r.token) {
        setSimklToken(r.token);
        setPhase("done");
        syncSimkl().finally(() => window.setTimeout(onClose, 1400));
        return;
      }
      if (r.gone) {
        setPhase("error");
        return;
      }
      timers.current.push(window.setTimeout(tick, pin.interval * 1000));
    };
    timers.current.push(window.setTimeout(tick, pin.interval * 1000));
  };

  useEffect(() => {
    start();
    return () => timers.current.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      data-spatial-scope
      onClick={onClose}
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-white/10 bg-surface p-6 text-center shadow-card"
      >
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-bold">Connect Simkl</h2>
          <button onClick={onClose} className="focusable rounded-full p-1 text-muted hover:text-white" aria-label="Close">
            <X size={22} />
          </button>
        </div>

        {phase === "loading" && <p className="mt-8 text-sm text-muted">Getting a code…</p>}

        {phase === "waiting" && (
          <>
            <p className="mt-5 text-sm text-muted">On your phone or computer, go to</p>
            <div className="mt-1 text-base font-semibold text-accent">{url}</div>
            <p className="mt-4 text-sm text-muted">and enter this code:</p>
            <div className="mt-2 rounded-xl border border-white/10 bg-surface-2 px-4 py-4 text-4xl font-black tracking-[0.3em]">
              {code}
            </div>
            <p className="mt-4 text-xs text-muted">Waiting for you to approve…</p>
          </>
        )}

        {phase === "done" && (
          <div className="mt-8 flex flex-col items-center gap-2 text-accent">
            <Check size={40} />
            <div className="text-sm font-semibold">Connected! Syncing your lists…</div>
          </div>
        )}

        {phase === "error" && (
          <>
            <p className="mt-8 text-sm text-muted">That didn't work, or the code expired.</p>
            <button
              onClick={start}
              className="focusable mt-4 inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-bold text-black"
            >
              <RefreshCw size={16} /> Try again
            </button>
          </>
        )}
      </div>
    </div>
  );
}

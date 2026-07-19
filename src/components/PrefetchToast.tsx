import { useEffect, useState } from "react";
import { Download, Check, X } from "lucide-react";
import { hasNativePlayback } from "../platform/capabilities";
import { ffmpegReady, ensureFfmpeg, onFfmpegProgress } from "../services/nativePlayer";

// Desktop only. Fetches the playback components in the background shortly after
// launch, so the first time you play an MKV/HEVC source it's already there
// rather than stalling on an ~80 MB download.
const START_DELAY_MS = 6000;

export function PrefetchToast() {
  const [pct, setPct] = useState(0);
  const [state, setState] = useState<"idle" | "downloading" | "done">("idle");
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!hasNativePlayback()) return;
    let active = true;
    let unlisten: (() => void) | undefined;

    const timer = setTimeout(async () => {
      if (await ffmpegReady()) return; // already have it — stay silent
      if (!active) return;

      setState("downloading");
      unlisten = await onFfmpegProgress((p) => active && setPct(p));
      const ok = await ensureFfmpeg();
      if (!active) return;

      setState(ok ? "done" : "idle"); // on failure, stay quiet; retried on demand
      if (ok) setTimeout(() => active && setDismissed(true), 4000);
    }, START_DELAY_MS);

    return () => {
      active = false;
      clearTimeout(timer);
      unlisten?.();
    };
  }, []);

  if (state === "idle" || dismissed) return null;

  return (
    <div className="fixed bottom-4 left-4 z-[70] w-72 max-w-[calc(100vw-2rem)] animate-row-in">
      <div className="rounded-xl border border-white/10 bg-surface/95 p-3.5 shadow-card backdrop-blur">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-accent">
              {state === "done" ? <Check size={13} /> : <Download size={13} />}
              {state === "done" ? "Ready" : "Preparing playback"}
            </div>
            <p className="mt-1 text-xs text-muted">
              {state === "done"
                ? "TVio can now play every source format."
                : "Downloading playback components so any source plays smoothly. You can keep browsing."}
            </p>
          </div>
          <button onClick={() => setDismissed(true)} className="focusable text-muted hover:text-white" aria-label="Dismiss">
            <X size={15} />
          </button>
        </div>

        {state === "downloading" && (
          <div className="mt-2.5">
            <div className="h-1 overflow-hidden rounded bg-white/15">
              <div className="h-full rounded bg-accent transition-all" style={{ width: `${pct}%` }} />
            </div>
            <div className="mt-1 text-[11px] text-muted">{pct}%</div>
          </div>
        )}
      </div>
    </div>
  );
}

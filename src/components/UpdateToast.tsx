import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { autoUpdate, installApk, type UpdateInfo } from "../services/updater";

// Runs the auto-updater once at startup.
//  - Windows (Tauri): updates silently and relaunches — this renders nothing.
//  - Android / Android TV: Android forbids silent installs for sideloaded apps,
//    so we surface a small one-tap prompt instead.
export function UpdateToast() {
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let active = true;
    // Small delay so updating never competes with first paint.
    const t = setTimeout(() => {
      autoUpdate(__APP_VERSION__)
        .then((info) => active && setUpdate(info))
        .catch(() => {});
    }, 4000);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, []);

  if (!update || dismissed) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[70] w-80 max-w-[calc(100vw-2rem)] animate-row-in">
      <div className="rounded-xl border border-white/10 bg-surface/95 p-4 shadow-card backdrop-blur">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-wider text-accent">Update available</div>
            <div className="mt-0.5 text-sm font-bold">TVio {update.version}</div>
            <p className="mt-1 text-xs text-muted">
              Tap update, then confirm the install when Android asks.
            </p>
          </div>
          <button onClick={() => setDismissed(true)} className="focusable text-muted hover:text-white" aria-label="Dismiss">
            <X size={16} />
          </button>
        </div>
        <button
          onClick={() => update.apkUrl && installApk(update.apkUrl)}
          className="focusable mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-accent py-2.5 text-sm font-bold text-black"
        >
          <Download size={15} /> Update now
        </button>
      </div>
    </div>
  );
}

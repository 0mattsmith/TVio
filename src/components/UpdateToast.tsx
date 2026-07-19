import { useEffect, useState } from "react";
import { Download, X, Loader2 } from "lucide-react";
import { checkAndroidUpdate, installApk, type UpdateInfo } from "../services/updater";

// Android / Android TV only: downloads the APK in the background, then hands it
// to Android's installer (which always shows its own confirmation for sideloaded
// apps — plus a one-time "install unknown apps" toggle).
//
// Desktop is handled by UpdateGate at launch instead, so an update never
// interrupts a session that's already running.
export function UpdateToast() {
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let active = true;
    // Small delay so updating never competes with first paint.
    const t = setTimeout(() => {
      checkAndroidUpdate(__APP_VERSION__)
        .then((info) => {
          if (!active || !info?.apkUrl) return;
          setUpdate(info);
          // Start fetching straight away — by the time the user looks, the only
          // thing left is confirming the install.
          setProgress(0);
          installApk(info.apkUrl, (pct) => active && setProgress(pct)).finally(() => {
            if (active) setProgress(100);
          });
        })
        .catch(() => {});
    }, 4000);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, []);

  if (!update || dismissed) return null;
  const downloading = progress !== null && progress < 100;

  return (
    <div className="fixed bottom-4 right-4 z-[70] w-80 max-w-[calc(100vw-2rem)] animate-row-in">
      <div className="rounded-xl border border-white/10 bg-surface/95 p-4 shadow-card backdrop-blur">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-wider text-accent">
              {downloading ? "Downloading update" : "Update ready"}
            </div>
            <div className="mt-0.5 text-sm font-bold">TVio {update.version}</div>
            <p className="mt-1 text-xs text-muted">
              {downloading
                ? "Fetching in the background — you can keep watching."
                : "Confirm the install when Android asks."}
            </p>
          </div>
          <button onClick={() => setDismissed(true)} className="focusable text-muted hover:text-white" aria-label="Dismiss">
            <X size={16} />
          </button>
        </div>

        {downloading ? (
          <div className="mt-3">
            <div className="h-1.5 overflow-hidden rounded bg-white/15">
              <div className="h-full rounded bg-accent transition-all" style={{ width: `${progress}%` }} />
            </div>
            <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted">
              <Loader2 size={12} className="animate-spin" /> {progress}%
            </div>
          </div>
        ) : (
          <button
            onClick={() => update.apkUrl && installApk(update.apkUrl, setProgress)}
            className="focusable mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-accent py-2.5 text-sm font-bold text-black"
          >
            <Download size={15} /> Install now
          </button>
        )}
      </div>
    </div>
  );
}

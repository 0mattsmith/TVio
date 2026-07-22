import { useEffect, useRef, useState } from "react";
import { Download, X, Loader2 } from "lucide-react";
import { checkAndroidUpdate, installApk, type UpdateInfo } from "../services/updater";
import { useIsTV } from "../hooks/useDeviceProfile";

// Android / Android TV only: a small prompt when a newer APK is available.
// Tapping Install grabs the "install unknown apps" permission if needed (once),
// then downloads and hands the APK to Android's installer for confirmation.
//
// Desktop is handled by UpdateGate at launch instead, so an update never
// interrupts a session that's already running.
export function UpdateToast() {
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const isTV = useIsTV();
  const installRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let active = true;
    // Small delay so the check never competes with first paint.
    const t = setTimeout(() => {
      checkAndroidUpdate(__APP_VERSION__)
        .then((info) => {
          if (active && info?.apkUrl) setUpdate(info);
        })
        .catch(() => {});
    }, 4000);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, []);

  const downloading = progress !== null && progress < 100;

  // On a TV, bring focus to Install when the prompt appears, so the remote can
  // act (install or dismiss) without hunting for the button.
  useEffect(() => {
    if (!isTV || !update || dismissed || downloading) return;
    const raf = requestAnimationFrame(() => installRef.current?.focus());
    return () => cancelAnimationFrame(raf);
  }, [isTV, update, dismissed, downloading]);

  if (!update || dismissed) return null;

  const install = async () => {
    if (!update.apkUrl) return;
    setProgress(0);
    await installApk(update.apkUrl, setProgress);
    setProgress(100);
  };

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
                ? "Confirm the install when Android asks."
                : "Install the new version now, or later."}
            </p>
          </div>
          {!isTV && !downloading && (
            <button onClick={() => setDismissed(true)} className="focusable text-muted hover:text-white" aria-label="Dismiss">
              <X size={16} />
            </button>
          )}
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
          <div className="mt-3 flex gap-2">
            <button
              ref={installRef}
              onClick={install}
              className="focusable flex flex-1 items-center justify-center gap-2 rounded-lg bg-accent py-2.5 text-sm font-bold text-black"
            >
              <Download size={15} /> Install now
            </button>
            <button
              onClick={() => setDismissed(true)}
              className="focusable rounded-lg bg-white/10 px-4 py-2.5 text-sm font-semibold hover:bg-white/20"
            >
              Later
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

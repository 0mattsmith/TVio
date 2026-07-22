import { useEffect, useState } from "react";
import { Download, RefreshCw, Check, Loader2, AlertCircle, RotateCw, Sparkles } from "lucide-react";
import { Button } from "./Button";
import {
  updateChannel,
  checkDesktopUpdateStrict,
  downloadDesktopUpdate,
  installDesktopUpdate,
  checkAndroidUpdate,
  installApk,
  fetchReleaseNotes,
  type DesktopUpdate,
  type UpdateInfo,
} from "../services/updater";
import { cleanReleaseNotes } from "../services/releaseNotes";
import { isNativeShell, hasNativePlayback } from "../platform/capabilities";

type Status = "idle" | "checking" | "current" | "downloading" | "ready" | "installing" | "error";

/**
 * "Which version am I on, and is there a newer one?" — answered in one place.
 *
 * Desktop downloads as soon as it finds something, then waits: installing
 * force-closes the app on Windows, so it has to be the user's decision, not
 * ours. Android can't separate the two (the OS owns the install prompt), and
 * on the web the service worker does the work and we just trigger a check.
 */
export function UpdateSection() {
  const channel = updateChannel();
  const [status, setStatus] = useState<Status>("idle");
  const [pct, setPct] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [desktop, setDesktop] = useState<DesktopUpdate | null>(null);
  const [android, setAndroid] = useState<UpdateInfo | null>(null);
  const [webReady, setWebReady] = useState(false);
  const [whatsNew, setWhatsNew] = useState<string[]>([]);

  // Notes for the version currently installed — shown whether or not there's an
  // update, so "what did the last update change?" is always answerable.
  useEffect(() => {
    let active = true;
    fetchReleaseNotes(__APP_VERSION__).then((body) => {
      if (active) setWhatsNew(cleanReleaseNotes(body));
    });
    return () => {
      active = false;
    };
  }, []);

  const fail = (e: unknown) => {
    setError(e instanceof Error ? e.message : "Couldn't check for updates.");
    setStatus("error");
  };

  const check = async () => {
    setStatus("checking");
    setError("");
    setPct(0);
    try {
      if (channel === "desktop") {
        const update = await checkDesktopUpdateStrict();
        if (!update) return setStatus("current");
        setDesktop(update);
        // Fetch it now so "install" is instant when they're ready for it.
        setStatus("downloading");
        await downloadDesktopUpdate(update, setPct);
        setStatus("ready");
        return;
      }

      if (channel === "android") {
        const info = await checkAndroidUpdate(__APP_VERSION__);
        if (!info?.apkUrl) return setStatus("current");
        setAndroid(info);
        setStatus("ready");
        return;
      }

      // Web / PWA: ask the service worker to look for a new build.
      const reg = await navigator.serviceWorker?.getRegistration();
      if (!reg) return setStatus("current");
      await reg.update();
      if (reg.waiting || reg.installing) {
        setWebReady(true);
        setStatus("ready");
      } else {
        setStatus("current");
      }
    } catch (e) {
      fail(e);
    }
  };

  const install = async () => {
    setError("");
    try {
      if (channel === "desktop" && desktop) {
        setStatus("installing");
        await installDesktopUpdate(desktop);
        // Windows normally terminates us inside that call and the installer
        // restarts the app. Reaching this line means it didn't, so say so
        // rather than spinning on "Installing…" forever.
        setNotice("Update installed. Close TVio and reopen it to finish.");
      } else if (channel === "android" && android?.apkUrl) {
        // Straight to "Downloading…" (skip the "Installing…" flash) so the tap
        // gives immediate, correctly-labelled feedback that it's working.
        setStatus("downloading");
        await installApk(android.apkUrl, setPct);
        setStatus("ready");
      } else if (webReady) {
        setStatus("installing");
        window.location.reload();
      }
    } catch (e) {
      fail(e);
    }
  };

  const version = (
    <>
      {isNativeShell() ? "TVio" : "TVio Lite"} <span className="font-mono text-accent">v{__APP_VERSION__}</span>
    </>
  );

  const caption =
    status === "current"
      ? "You're on the latest version."
      : status === "ready" && channel === "desktop"
        ? "Update downloaded — installs silently and restarts TVio."
        : status === "ready" && channel === "android"
          ? "Update ready. Android will ask you to confirm the install."
          : status === "ready"
            ? "A new version is ready — reload to switch to it."
            : isNativeShell() && !hasNativePlayback()
              ? "Playback components pending."
              : channel === "web"
                ? "Updates install automatically when you reload."
                : "Updates install automatically at launch.";

  return (
    <section className="mt-6 rounded-xl border border-white/5 bg-surface p-6">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <RotateCw size={18} /> About &amp; updates
      </h2>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="text-sm font-semibold">{version}</div>
          <p className="mt-0.5 text-xs text-muted">{caption}</p>
        </div>

        {status === "ready" ? (
          <Button onClick={install}>
            <Download size={16} />
            {channel === "desktop" ? "Install & restart" : channel === "android" ? "Install update" : "Reload now"}
          </Button>
        ) : (
          <Button
            variant="secondary"
            onClick={check}
            disabled={status === "checking" || status === "downloading" || status === "installing"}
          >
            {status === "checking" ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Checking…
              </>
            ) : status === "downloading" ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Downloading…
              </>
            ) : status === "installing" ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Installing…
              </>
            ) : status === "current" ? (
              <>
                <Check size={16} /> Up to date
              </>
            ) : (
              <>
                <RefreshCw size={16} /> Check for updates
              </>
            )}
          </Button>
        )}
      </div>

      {status === "downloading" && (
        <div className="mt-4">
          <div className="h-1.5 overflow-hidden rounded bg-white/15">
            <div className="h-full rounded bg-accent transition-all duration-200" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-1.5 text-xs text-muted">{pct}% — you can carry on using TVio while this downloads.</p>
        </div>
      )}

      {notice && <p className="mt-3 text-sm text-muted">{notice}</p>}

      {status === "error" && (
        <p className="mt-3 flex items-start gap-2 text-sm text-red-400">
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          {error}
        </p>
      )}

      {/* What changed in the version you're running — the same notes the
          post-update card shows, always available here too. */}
      {whatsNew.length > 0 && (
        <div className="mt-5 border-t border-white/5 pt-4">
          <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-accent">
            <Sparkles size={13} /> What's new in {__APP_VERSION__}
          </div>
          <ul className="mt-2 space-y-1">
            {whatsNew.map((l, i) => (
              <li key={i} className="flex gap-2 text-sm text-white/80">
                <span className="text-accent">•</span>
                <span>{l}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

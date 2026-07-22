import { useEffect, useState } from "react";
import { Sparkles, X } from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import { fetchReleaseNotes } from "../services/updater";
import { cleanReleaseNotes } from "../services/releaseNotes";
import { useIsTV } from "../hooks/useDeviceProfile";

/**
 * After an update lands, shows the release notes — a centered, focusable dialog
 * on TV (so it can be dismissed with a remote) and a corner card elsewhere.
 * Silent on a fresh install (nothing to compare against), shown once per version.
 */
export function WhatsNew() {
  const lastSeenVersion = useAppStore((s) => s.lastSeenVersion);
  const setLastSeenVersion = useAppStore((s) => s.setLastSeenVersion);
  const [lines, setLines] = useState<string[] | null>(null);
  const isTV = useIsTV();

  useEffect(() => {
    const current = __APP_VERSION__;
    if (!lastSeenVersion) {
      setLastSeenVersion(current);
      return;
    }
    if (lastSeenVersion === current) return;

    let active = true;
    fetchReleaseNotes(current).then((body) => {
      if (!active) return;
      const cleaned = cleanReleaseNotes(body);
      setLines(cleaned.length ? cleaned : ["Various improvements and fixes."]);
    });
    return () => {
      active = false;
    };
  }, [lastSeenVersion, setLastSeenVersion]);

  if (lines === null) return null;

  const dismiss = () => {
    setLastSeenVersion(__APP_VERSION__);
    setLines(null);
  };

  const body = (
    <>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-accent">
            <Sparkles size={13} /> What's new
          </div>
          <div className="mt-0.5 text-sm font-bold">TVio {__APP_VERSION__}</div>
        </div>
        {!isTV && (
          <button onClick={dismiss} className="focusable text-muted hover:text-white" aria-label="Dismiss">
            <X size={16} />
          </button>
        )}
      </div>

      <ul className="mt-3 space-y-1.5">
        {lines.map((l, i) => (
          <li key={i} className="flex gap-2 text-sm text-white/85">
            <span className="text-accent">•</span>
            <span className="line-clamp-2">{l}</span>
          </li>
        ))}
      </ul>

      <button
        onClick={dismiss}
        autoFocus
        className="focusable mt-4 w-full rounded-lg bg-accent py-2.5 text-sm font-bold text-black"
      >
        Got it
      </button>
    </>
  );

  // TV: a centered, focus-trapped dialog so the remote can reach "Got it".
  if (isTV) {
    return (
      <div
        data-spatial-scope
        className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-8 backdrop-blur-sm"
      >
        <div className="w-full max-w-md rounded-2xl border border-white/10 bg-surface p-6 shadow-card">{body}</div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-[70] w-80 max-w-[calc(100vw-2rem)] animate-row-in">
      <div className="rounded-xl border border-white/10 bg-surface/95 p-4 shadow-card backdrop-blur">{body}</div>
    </div>
  );
}

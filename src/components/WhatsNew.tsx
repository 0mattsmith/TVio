import { useEffect, useState } from "react";
import { Sparkles, X } from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import { fetchReleaseNotes } from "../services/updater";

/**
 * After an update lands, shows a compact "What's New" card with the release
 * notes. Silent on a fresh install (nothing to compare against) and shown once
 * per version.
 */
export function WhatsNew() {
  const lastSeenVersion = useAppStore((s) => s.lastSeenVersion);
  const setLastSeenVersion = useAppStore((s) => s.setLastSeenVersion);
  const [notes, setNotes] = useState<string | null>(null);

  useEffect(() => {
    const current = __APP_VERSION__;
    // Fresh install: remember the version silently, don't announce it.
    if (!lastSeenVersion) {
      setLastSeenVersion(current);
      return;
    }
    if (lastSeenVersion === current) return;

    let active = true;
    fetchReleaseNotes(current).then((body) => {
      if (!active) return;
      setNotes(body || "Various improvements and fixes.");
    });
    return () => {
      active = false;
    };
  }, [lastSeenVersion, setLastSeenVersion]);

  if (notes === null) return null;

  const dismiss = () => {
    setLastSeenVersion(__APP_VERSION__);
    setNotes(null);
  };

  // Release bodies are markdown; show the first few meaningful lines plainly.
  const lines = notes
    .split("\n")
    .map((l) => l.replace(/^[\s>*-]+/, "").trim())
    .filter((l) => l && !l.startsWith("|") && !l.startsWith("#"))
    .slice(0, 5);

  return (
    <div className="fixed bottom-4 right-4 z-[70] w-80 max-w-[calc(100vw-2rem)] animate-row-in">
      <div className="rounded-xl border border-white/10 bg-surface/95 p-4 shadow-card backdrop-blur">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-accent">
              <Sparkles size={13} /> What's new
            </div>
            <div className="mt-0.5 text-sm font-bold">TVio {__APP_VERSION__}</div>
          </div>
          <button onClick={dismiss} className="focusable text-muted hover:text-white" aria-label="Dismiss">
            <X size={16} />
          </button>
        </div>

        <ul className="mt-2 space-y-1">
          {lines.map((l, i) => (
            <li key={i} className="line-clamp-2 text-xs text-white/80">• {l}</li>
          ))}
        </ul>

        <button
          onClick={dismiss}
          className="focusable mt-3 w-full rounded-lg bg-white/10 py-2 text-xs font-semibold hover:bg-white/20"
        >
          Got it
        </button>
      </div>
    </div>
  );
}

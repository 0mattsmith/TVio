import { useEffect, useState, type ReactNode } from "react";
import { Logo } from "./Logo";
import { isTauri, checkDesktopUpdate, runDesktopUpdate } from "../services/updater";

// How long we'll wait for the update check before launching anyway. Startup
// must never hang on a slow or offline network.
const CHECK_TIMEOUT_MS = 4000;

type Phase = "checking" | "updating" | "ready";

/**
 * Wraps the app on desktop. At launch it checks for an update; if there is one
 * it installs it on this splash and relaunches straight into the new version.
 * Anything unexpected (offline, slow, error) falls through and just launches.
 * On web/mobile this renders children immediately.
 */
export function UpdateGate({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>(() => (isTauri() ? "checking" : "ready"));
  const [pct, setPct] = useState(0);
  const [version, setVersion] = useState("");

  useEffect(() => {
    if (!isTauri()) return;
    let settled = false; // we've already shown the app — don't yank it back

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        setPhase("ready"); // fail open; the next launch will pick the update up
      }
    }, CHECK_TIMEOUT_MS);

    checkDesktopUpdate()
      .then(async (update) => {
        clearTimeout(timer);
        if (settled) return; // timed out and already launched
        if (!update) {
          settled = true;
          setPhase("ready");
          return;
        }
        setVersion(update.version);
        setPhase("updating");
        try {
          await runDesktopUpdate(update, setPct); // relaunches on success
        } catch {
          /* install failed — just launch the current version */
        }
        settled = true;
        setPhase("ready");
      })
      .catch(() => {
        clearTimeout(timer);
        if (settled) return;
        settled = true;
        setPhase("ready");
      });

    return () => clearTimeout(timer);
  }, []);

  if (phase === "ready") return <>{children}</>;

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-bg">
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(900px 500px at 50% 30%, rgba(20,184,166,0.12), transparent 60%)" }}
      />
      <div className="relative flex w-72 flex-col items-center">
        <Logo />

        {phase === "checking" ? (
          <p className="mt-6 text-sm text-muted">Checking for updates…</p>
        ) : (
          <>
            <p className="mt-6 text-sm font-semibold">Updating to {version}</p>
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded bg-white/15">
              <div className="h-full rounded bg-accent transition-all duration-200" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-2 text-xs text-muted">{pct}% — TVio will restart automatically</p>
          </>
        )}
      </div>
    </div>
  );
}

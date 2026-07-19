import { useEffect, useState, type ReactNode } from "react";
import { Download, X, Loader2 } from "lucide-react";
import { Logo } from "./Logo";
import { isTauri, checkDesktopUpdate, runDesktopUpdate, type DesktopUpdate } from "../services/updater";

// Hard ceiling on waiting for the check. Generous enough for a cold DNS lookup
// plus GitHub's redirect chain, short enough that an unreachable network doesn't
// feel like a hang.
const CHECK_TIMEOUT_MS = 6000;

// A deliberate minimum on the splash, so the decision to install is always made
// while the splash is still up rather than after the UI is usable. It also stops
// the splash flashing past on a fast connection.
const MIN_SPLASH_MS = 2000;

type Phase = "checking" | "updating" | "ready";

/**
 * Desktop update handling, in two halves.
 *
 * Fast path — the check returns before the timeout, so the update installs on
 * this splash and the app relaunches straight into the new version. Silent, and
 * over before the user has really started.
 *
 * Slow path — the check outran the timeout and the app is already on screen. We
 * deliberately do NOT install now. Tearing down a running session without
 * warning is the exact behaviour this component exists to prevent, so we offer
 * the update instead; declining just means it installs at the next launch.
 *
 * On web and mobile this renders children immediately.
 */
export function UpdateGate({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>(() => (isTauri() ? "checking" : "ready"));
  const [pct, setPct] = useState(0);
  const [version, setVersion] = useState("");
  const [late, setLate] = useState<DesktopUpdate | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (!isTauri()) return;

    const startedAt = Date.now();
    const timers: number[] = [];
    let launched = false; // once true, the app is on screen and stays there

    /** Releases the UI — but never before the splash has had its full moment. */
    const launch = () => {
      if (launched) return;
      launched = true;
      const wait = Math.max(0, MIN_SPLASH_MS - (Date.now() - startedAt));
      if (wait === 0) setPhase("ready");
      else timers.push(window.setTimeout(() => setPhase("ready"), wait));
    };

    const timeout = window.setTimeout(launch, CHECK_TIMEOUT_MS);
    timers.push(timeout);

    checkDesktopUpdate()
      .then(async (update) => {
        clearTimeout(timeout);

        if (!update) return launch();
        if (launched) {
          setLate(update); // too late to be silent — ask instead of ambushing
          return;
        }

        // Claim the session BEFORE the download starts. Getting this wrong is
        // what let the old build hand over the UI mid-download and then close
        // the app from under the user when the installer ran.
        launched = true;
        setVersion(update.version);
        setPhase("updating");
        try {
          await runDesktopUpdate(update, setPct); // relaunches on success
        } catch {
          setPhase("ready"); // install failed — just run the current version
        }
      })
      .catch(() => {
        clearTimeout(timeout);
        launch();
      });

    return () => timers.forEach(clearTimeout);
  }, []);

  const installLate = async () => {
    if (!late) return;
    setInstalling(true);
    try {
      await runDesktopUpdate(late, setPct); // relaunches on success
    } catch {
      setInstalling(false);
    }
  };

  if (phase !== "ready") {
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

  return (
    <>
      {children}

      {late && !dismissed && (
        <div className="fixed bottom-4 right-4 z-[70] w-80 max-w-[calc(100vw-2rem)] animate-row-in">
          <div className="rounded-xl border border-white/10 bg-surface/95 p-4 shadow-card backdrop-blur">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] font-bold uppercase tracking-wider text-accent">Update ready</div>
                <div className="mt-0.5 text-sm font-bold">TVio {late.version}</div>
                <p className="mt-1 text-xs text-muted">
                  {installing
                    ? "Installing — TVio will restart on its own."
                    : "Takes a few seconds. If you'd rather not stop now, it installs next time you open TVio."}
                </p>
              </div>
              {!installing && (
                <button
                  onClick={() => setDismissed(true)}
                  className="focusable text-muted hover:text-white"
                  aria-label="Dismiss"
                >
                  <X size={16} />
                </button>
              )}
            </div>

            {installing ? (
              <div className="mt-3">
                <div className="h-1.5 overflow-hidden rounded bg-white/15">
                  <div className="h-full rounded bg-accent transition-all" style={{ width: `${pct}%` }} />
                </div>
                <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted">
                  <Loader2 size={12} className="animate-spin" /> {pct}%
                </div>
              </div>
            ) : (
              <button
                onClick={installLate}
                className="focusable mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-accent py-2.5 text-sm font-bold text-black"
              >
                <Download size={15} /> Restart &amp; update
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}

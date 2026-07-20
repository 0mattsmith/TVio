import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Tv, Check, AlertCircle, Camera, Loader2 } from "lucide-react";
import { Logo } from "../components/Logo";
import { Button } from "../components/Button";
import { CameraScanner } from "../components/CameraScanner";
import { approveDeviceCode, isDeviceCode, normalizeDeviceCode } from "../services/devicePairing";

type Phase = "idle" | "scanning" | "working" | "done" | "error";

/**
 * Phone side of TV sign-in: scan the code on the TV and approve it.
 *
 * Only reachable while signed in — approving is what proves to the server which
 * account the TV should get, so there has to be a session to hand over.
 */
export function ApproveTv() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState("");
  const [manual, setManual] = useState("");

  const approve = async (raw: string) => {
    setPhase("working");
    setError("");
    try {
      await approveDeviceCode(raw);
      setPhase("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't approve that code.");
      setPhase("error");
    }
  };

  if (phase === "scanning") {
    return (
      <CameraScanner
        note="Point at the QR code on your TV's sign-in screen."
        onClose={() => setPhase("idle")}
        onResult={(raw) => {
          // Guard against scanning the wrong TVio code — the desktop flow uses
          // a different prefix and would fail with a confusing message.
          if (!isDeviceCode(raw) && normalizeDeviceCode(raw).length !== 8) {
            setError("That isn't a TV sign-in code.");
            setPhase("error");
            return;
          }
          void approve(raw);
        }}
      />
    );
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-bg px-6 py-12">
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(1200px 600px at 50% -10%, rgba(20,184,166,0.10), transparent 60%)" }}
      />
      <div className="relative w-full max-w-sm rounded-2xl border border-white/5 bg-surface/80 p-8 shadow-card">
        <Logo />
        <div className="mt-6 flex items-center gap-2 text-accent">
          <Tv size={18} />
          <span className="text-xs font-bold uppercase tracking-wider">Sign in a TV</span>
        </div>

        {phase === "done" ? (
          <>
            <h1 className="mt-1 text-2xl font-black tracking-tight">Your TV is signed in</h1>
            <p className="mt-2 flex items-center gap-2 text-sm text-accent">
              <Check size={16} /> It should be loading your profiles now.
            </p>
            <Button className="mt-6 w-full py-3" onClick={() => navigate(-1)}>
              Done
            </Button>
          </>
        ) : (
          <>
            <h1 className="mt-1 text-2xl font-black tracking-tight">Scan the code on your TV</h1>
            <p className="mt-2 text-sm text-muted">
              Open TVio on the TV, then scan the QR code shown on its sign-in screen. The TV will sign into this
              account.
            </p>

            <Button
              className="mt-5 w-full py-3"
              onClick={() => setPhase("scanning")}
              disabled={phase === "working"}
            >
              {phase === "working" ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
              {phase === "working" ? "Approving…" : "Scan TV code"}
            </Button>

            <div className="mt-5">
              <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-muted">
                Or type the code shown on the TV
              </span>
              <input
                value={manual}
                onChange={(e) => setManual(normalizeDeviceCode(e.target.value))}
                placeholder="ABCD2345"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                className="focusable w-full rounded-lg border border-white/10 bg-surface-2 px-4 py-3 text-center font-mono text-xl font-black tracking-[0.2em] outline-none focus:border-accent"
              />
              <Button
                className="mt-3 w-full py-3"
                variant="secondary"
                disabled={manual.length !== 8 || phase === "working"}
                onClick={() => approve(manual)}
              >
                Approve
              </Button>
            </div>

            {error && (
              <p className="mt-4 flex items-start gap-2 text-sm text-red-400">
                <AlertCircle size={15} className="mt-0.5 shrink-0" />
                {error}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

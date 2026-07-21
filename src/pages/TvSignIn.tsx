import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import QRCode from "qrcode";
import { Smartphone, RefreshCw, Check, Loader2, AlertCircle } from "lucide-react";
import { Logo } from "../components/Logo";
import { Button } from "../components/Button";
import {
  startDeviceCode,
  awaitDeviceApproval,
  devicePairingAvailable,
  type DeviceCode,
} from "../services/devicePairing";

type Phase = "loading" | "waiting" | "signed-in" | "expired" | "error";

/**
 * Sign-in for a freshly installed TV, in the shape people already know from
 * Netflix: a big QR on one side, plain instructions on the other, and nothing
 * to type. The TV polls in the background; scanning the code on a phone that's
 * already signed in is the whole interaction.
 */
export function TvSignIn() {
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pairing, setPairing] = useState<DeviceCode | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState("");
  const [remaining, setRemaining] = useState(0);

  const begin = useCallback(async (signal: AbortSignal) => {
    setPhase("loading");
    setError("");
    try {
      const code = await startDeviceCode();
      if (signal.aborted) return;
      setPairing(code);
      setPhase("waiting");

      if (await awaitDeviceApproval(code.code, signal)) {
        setPhase("signed-in");
        // Straight to profile selection, exactly as any other sign-in would.
        setTimeout(() => navigate("/profiles", { replace: true }), 900);
      }
    } catch (e) {
      if (signal.aborted) return;
      const msg = e instanceof Error ? e.message : "Couldn't start sign-in.";
      // An expired code is a normal outcome, not a failure worth shouting about.
      if (/PAIR_EXPIRED/.test(msg)) {
        setPhase("expired");
        return;
      }
      setError(msg);
      setPhase("error");
    }
  }, [navigate]);

  useEffect(() => {
    const controller = new AbortController();
    void begin(controller.signal);
    return () => controller.abort();
  }, [begin]);

  // Draw the QR whenever a new code arrives.
  useEffect(() => {
    if (!pairing || !canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, pairing.qr, {
      width: 176,
      margin: 1,
      color: { dark: "#0a0a0a", light: "#ffffff" },
    }).catch(() => {});
  }, [pairing]);

  // Countdown, and flip to "expired" the moment it runs out.
  useEffect(() => {
    if (!pairing || phase !== "waiting") return;
    const tick = () => {
      const left = Math.max(0, Math.round((pairing.expiresAt - Date.now()) / 1000));
      setRemaining(left);
      if (left === 0) setPhase("expired");
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [pairing, phase]);

  const retry = () => {
    const controller = new AbortController();
    void begin(controller.signal);
  };

  if (!devicePairingAvailable()) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg p-12 text-center">
        <div>
          <Logo />
          <p className="mt-6 max-w-md text-lg text-muted">
            TV sign-in isn't configured on this build. Sign in with your email and password instead.
          </p>
          <Button className="mt-6" onClick={() => navigate("/signin?form=1", { replace: true })}>
            Use email &amp; password
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-bg px-12 py-10">
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(1400px 700px at 50% -10%, rgba(20,184,166,0.12), transparent 60%)" }}
      />

      <div className="relative grid w-full max-w-4xl grid-cols-1 items-center gap-12 lg:grid-cols-[1fr_auto]">
        {/* Instructions */}
        <div>
          <Logo />
          <h1 className="mt-5 text-3xl font-black leading-tight tracking-tight">
            Sign in with
            <br />
            your phone
          </h1>

          <ol className="mt-5 space-y-2.5 text-base text-white/85">
            {[
              "Open TVio on your phone",
              "Go to Settings → Sign in a TV",
              "Scan the code on the right",
            ].map((step, i) => (
              <li key={step} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-black text-black">
                  {i + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>

          <div className="mt-6 flex min-h-[1.75rem] items-center gap-2.5 text-sm">
            {phase === "waiting" && (
              <>
                <Loader2 size={17} className="animate-spin text-accent" />
                <span className="text-muted">
                  Waiting for your phone — expires in {Math.floor(remaining / 60)}:
                  {String(remaining % 60).padStart(2, "0")}
                </span>
              </>
            )}
            {phase === "loading" && (
              <>
                <Loader2 size={20} className="animate-spin text-accent" />
                <span className="text-muted">Getting a code…</span>
              </>
            )}
            {phase === "signed-in" && (
              <>
                <Check size={22} className="text-accent" />
                <span className="font-bold text-accent">Signed in — loading your profiles…</span>
              </>
            )}
            {phase === "error" && (
              <span className="flex items-start gap-2 text-red-400">
                <AlertCircle size={20} className="mt-1 shrink-0" />
                {error}
              </span>
            )}
          </div>

          {(phase === "expired" || phase === "error") && (
            <Button className="focusable mt-5" onClick={retry} autoFocus>
              <RefreshCw size={16} /> Get a new code
            </Button>
          )}
        </div>

        {/* QR */}
        <div className="justify-self-center">
          <div className="relative rounded-2xl bg-white p-4">
            <canvas ref={canvasRef} className="h-44 w-44" />
            {(phase === "expired" || phase === "signed-in") && (
              <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/85 text-center text-lg font-bold">
                {phase === "signed-in" ? (
                  <span className="text-accent">Signed in ✓</span>
                ) : (
                  <span className="text-muted">Code expired</span>
                )}
              </div>
            )}
          </div>

          {pairing && phase === "waiting" && (
            <div className="mt-4 text-center">
              <div className="text-xs font-bold uppercase tracking-wider text-muted">Or enter this code</div>
              <div className="mt-1 font-mono text-2xl font-black tracking-[0.2em] text-accent">{pairing.code}</div>
            </div>
          )}
        </div>
      </div>

      <button
        onClick={() => navigate("/signin?form=1", { replace: true })}
        className="focusable absolute bottom-8 flex items-center gap-2 text-base text-muted hover:text-white"
      >
        <Smartphone size={16} /> Use email &amp; password instead
      </button>
    </div>
  );
}

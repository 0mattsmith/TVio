import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Smartphone, RefreshCw, Check, Loader2 } from "lucide-react";
import { Button } from "./Button";
import { createPairing, watchPairing, cancelPairing, pairingAvailable, type Pairing } from "../services/pairing";

/**
 * Desktop: shows a short-lived QR + code for signing a phone into this account.
 * The code IS the secret, so it's 8 unambiguous characters and expires in 3
 * minutes; redemption is single-use and verified server-side.
 */
export function PairQr() {
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const generate = async () => {
    setBusy(true);
    setError("");
    setDone(false);
    try {
      if (pairing) await cancelPairing(pairing.code);
      setPairing(await createPairing());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create a code.");
    } finally {
      setBusy(false);
    }
  };

  // Draw the QR + watch for the phone claiming it.
  useEffect(() => {
    if (!pairing) return;
    if (canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, pairing.qr, {
        width: 180,
        margin: 1,
        color: { dark: "#0a0a0a", light: "#ffffff" },
      }).catch(() => {});
    }
    const stop = watchPairing(pairing.code, () => setDone(true));
    return () => stop();
  }, [pairing]);

  // Countdown; the code stops working when it hits zero.
  useEffect(() => {
    if (!pairing || done) return;
    const tick = () => setRemaining(Math.max(0, Math.round((pairing.expiresAt - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [pairing, done]);

  if (!pairingAvailable()) {
    return (
      <p className="mt-2 text-sm text-muted">
        QR sign-in needs Firebase and the TVio Worker configured on this build.
      </p>
    );
  }

  const expired = pairing !== null && remaining <= 0 && !done;

  return (
    <div className="mt-4">
      {!pairing ? (
        <Button variant="secondary" onClick={generate} disabled={busy}>
          <Smartphone size={16} /> {busy ? "Creating…" : "Show QR code"}
        </Button>
      ) : (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="relative w-fit rounded-xl bg-white p-3">
            <canvas ref={canvasRef} className="h-44 w-44" />
            {(done || expired) && (
              <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/80 text-center text-sm font-bold">
                {done ? <span className="text-accent">Signed in ✓</span> : <span className="text-muted">Code expired</span>}
              </div>
            )}
          </div>

          <div className="min-w-0">
            {done ? (
              <p className="flex items-center gap-2 text-sm font-semibold text-accent">
                <Check size={16} /> Your phone is signed in.
              </p>
            ) : (
              <>
                <p className="text-sm text-muted">Or type this code on your phone:</p>
                <div className="mt-1 font-mono text-2xl font-black tracking-[0.2em] text-accent">{pairing.code}</div>
                <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">
                  {expired ? (
                    "Expired — generate a new one."
                  ) : (
                    <>
                      <Loader2 size={12} className="animate-spin" /> Waiting… expires in{" "}
                      {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}
                    </>
                  )}
                </p>
              </>
            )}
            <Button variant="ghost" onClick={generate} disabled={busy} className="mt-3">
              <RefreshCw size={15} /> New code
            </Button>
          </div>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
    </div>
  );
}

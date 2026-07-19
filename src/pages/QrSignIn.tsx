import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { QrCode, Camera, ArrowLeft, Loader2 } from "lucide-react";
import { Logo } from "../components/Logo";
import { Button } from "../components/Button";
import { redeemPairing, normalizeCode, pairingAvailable } from "../services/pairing";

/** Barcode scanner plugin, if the native build includes it. */
async function scanQr(): Promise<string | null> {
  try {
    const mod = await import("@capacitor-mlkit/barcode-scanning");
    const scanner = mod.BarcodeScanner;
    const { camera } = await scanner.requestPermissions();
    if (camera !== "granted" && camera !== "limited") throw new Error("Camera permission denied");
    const { barcodes } = await scanner.scan();
    return barcodes?.[0]?.rawValue ?? null;
  } catch {
    return null; // no plugin / denied / cancelled — fall back to typing
  }
}

export function QrSignIn() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [scanning, setScanning] = useState(false);
  const [cameraAvailable, setCameraAvailable] = useState(false);

  useEffect(() => {
    // Only offer the camera button if the native scanner is actually present.
    import("@capacitor-mlkit/barcode-scanning")
      .then(() => setCameraAvailable(true))
      .catch(() => setCameraAvailable(false));
  }, []);

  const submit = async (raw: string) => {
    setBusy(true);
    setError("");
    try {
      await redeemPairing(raw);
      navigate("/", { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't sign in with that code.");
    } finally {
      setBusy(false);
    }
  };

  const startScan = async () => {
    setScanning(true);
    setError("");
    const raw = await scanQr();
    setScanning(false);
    if (raw) await submit(raw);
    else setError("Couldn't read a code — enter it below instead.");
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-bg px-6 py-12">
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(1200px 600px at 50% -10%, rgba(20,184,166,0.10), transparent 60%)" }}
      />
      <div className="relative w-full max-w-sm rounded-2xl border border-white/5 bg-surface/80 p-8 shadow-card">
        <Logo />
        <div className="mt-6 flex items-center gap-2 text-accent">
          <QrCode size={18} />
          <span className="text-xs font-bold uppercase tracking-wider">Sign in with QR</span>
        </div>
        <h1 className="mt-1 text-2xl font-black tracking-tight">Scan from your TV or PC</h1>
        <p className="mt-2 text-sm text-muted">
          On TVio for desktop, open <span className="text-white">Settings → Sign in on your phone</span>, then scan the
          code — or type the 8 characters shown beneath it.
        </p>

        {!pairingAvailable() ? (
          <p className="mt-5 rounded-lg bg-surface-2 px-4 py-3 text-sm text-muted">
            QR sign-in isn't configured on this build. Sign in with your email and password instead.
          </p>
        ) : (
          <>
            {cameraAvailable && (
              <Button onClick={startScan} disabled={scanning || busy} className="mt-5 w-full py-3">
                {scanning ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
                {scanning ? "Scanning…" : "Scan QR code"}
              </Button>
            )}

            <div className="mt-5">
              <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-muted">
                {cameraAvailable ? "Or enter the code" : "Enter the code"}
              </span>
              <input
                value={code}
                onChange={(e) => setCode(normalizeCode(e.target.value))}
                onKeyDown={(e) => e.key === "Enter" && code.length === 8 && submit(code)}
                placeholder="ABCD2345"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                className="focusable w-full rounded-lg border border-white/10 bg-surface-2 px-4 py-3 text-center font-mono text-xl font-black tracking-[0.2em] outline-none focus:border-accent"
              />
            </div>

            {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

            <Button onClick={() => submit(code)} disabled={busy || code.length !== 8} className="mt-4 w-full py-3">
              {busy ? "Signing in…" : "Sign In"}
            </Button>
          </>
        )}

        <button
          onClick={() => navigate("/signin", { replace: true })}
          className="focusable mt-4 flex w-full items-center justify-center gap-1.5 text-xs text-muted hover:text-white"
        >
          <ArrowLeft size={13} /> Back to sign in
        </button>
      </div>
    </div>
  );
}

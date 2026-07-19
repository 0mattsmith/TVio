import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { QrCode, Camera, ArrowLeft, Loader2 } from "lucide-react";
import { Logo } from "../components/Logo";
import { Button } from "../components/Button";
import { CameraScanner } from "../components/CameraScanner";
import { redeemPairing, normalizeCode, pairingAvailable } from "../services/pairing";

/**
 * Opens the native scanner, throwing with a usable message rather than
 * returning null. "Nothing happens when I tap it" is the least debuggable
 * failure there is, and swallowing every error is what caused it.
 */
async function scanQr(): Promise<string> {
  const { BarcodeScanner } = await import("@capacitor-mlkit/barcode-scanning");

  const { supported } = await BarcodeScanner.isSupported();
  if (!supported) throw new Error("This device can't scan barcodes — enter the code below instead.");

  const { camera } = await BarcodeScanner.requestPermissions();
  if (camera !== "granted" && camera !== "limited") {
    throw new Error("Camera access was denied. Allow it in Android settings, or enter the code below.");
  }

  // scan() relies on Google's on-demand code-scanner module, which most devices
  // don't have until something asks for it. Without this the call just fails,
  // and the camera never opens.
  if (!(await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable()).available) {
    await BarcodeScanner.installGoogleBarcodeScannerModule();
    // That promise resolves when the download STARTS, not when it finishes.
    const deadline = Date.now() + 60_000;
    let ready = false;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 1500));
      if ((await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable()).available) {
        ready = true;
        break;
      }
    }
    if (!ready) throw new Error("Still fetching the scanner from Google Play — try again in a moment.");
  }

  const { barcodes } = await BarcodeScanner.scan();
  const raw = barcodes?.[0]?.rawValue;
  if (!raw) throw new Error("No code was scanned.");
  return raw;
}

export function QrSignIn() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [scanning, setScanning] = useState(false);
  const [webScanner, setWebScanner] = useState(false);
  const [nativeNote, setNativeNote] = useState("");
  const [cameraAvailable, setCameraAvailable] = useState(false);

  useEffect(() => {
    // Offer the button if EITHER path could work: the native scanner, or the
    // WebView camera fallback. Previously this hid the button whenever the
    // native plugin was unhappy, leaving no way to scan at all.
    const webCapable = Boolean(navigator.mediaDevices?.getUserMedia);
    import("@capacitor-mlkit/barcode-scanning")
      .then(async (m) => setCameraAvailable((await m.BarcodeScanner.isSupported()).supported || webCapable))
      .catch(() => setCameraAvailable(webCapable));
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
    try {
      const raw = await scanQr();
      setScanning(false);
      await submit(raw);
    } catch (e) {
      setScanning(false);
      const msg = e instanceof Error ? e.message : "";
      if (/cancel/i.test(msg)) return; // backing out of the scanner isn't an error
      // Don't dead-end on the native scanner: fall straight through to the
      // WebView camera, which doesn't need Play Services at all.
      setNativeNote(msg ? `Native scanner unavailable (${msg}) — using the in-app camera.` : "");
      setWebScanner(true);
    }
  };

  if (webScanner) {
    return (
      <CameraScanner
        note={nativeNote}
        onClose={() => setWebScanner(false)}
        onResult={async (raw) => {
          setWebScanner(false);
          await submit(raw);
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

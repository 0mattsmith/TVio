import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import QRCode from "qrcode";
import { Logo } from "../components/Logo";
import { Button } from "../components/Button";
import { useAppStore } from "../store/useAppStore";
import { auth, firebaseEnabled } from "../services/firebase";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from "firebase/auth";
import { useIsTV } from "../hooks/useDeviceProfile";

function usePairingCode() {
  // 4-digit device-pair code (TV). Maps to a Firestore pairings/{code} doc a
  // signed-in phone can claim (QR + Companion channel).
  const [code] = useState(() => String(Math.floor(1000 + Math.random() * 9000)));
  return code;
}

const inputCls =
  "focusable w-full rounded-lg border border-white/10 bg-surface-2 px-4 py-3.5 text-white placeholder:text-muted/60 focus:border-accent";
const labelCls = "mb-2 block text-xs font-bold uppercase tracking-wider text-muted";

export function SignIn() {
  const navigate = useNavigate();
  const signIn = useAppStore((s) => s.signIn);
  const isTV = useIsTV();

  const [siEmail, setSiEmail] = useState("");
  const [siPass, setSiPass] = useState("");
  const [suEmail, setSuEmail] = useState("");
  const [suPass, setSuPass] = useState("");
  const [error, setError] = useState("");
  const [errorFor, setErrorFor] = useState<"signin" | "register" | "">("");
  const [busy, setBusy] = useState(false);

  const authAction = async (mode: "signin" | "register", em: string, pw: string) => {
    setError("");
    setErrorFor("");
    if (!firebaseEnabled || !auth) {
      signIn(em || "guest@tvio.app"); // demo mode — accept anything
      navigate("/");
      return;
    }
    setBusy(true);
    try {
      if (mode === "register") await createUserWithEmailAndPassword(auth, em, pw);
      else await signInWithEmailAndPassword(auth, em, pw);
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message.replace(/^Firebase:\s*/, "") : "Authentication failed.");
      setErrorFor(mode);
    } finally {
      setBusy(false);
    }
  };

  // QR / pairing (Android TV only)
  const code = usePairingCode();
  const qrRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (isTV && qrRef.current) {
      const url = `${window.location.origin}${window.location.pathname}#/pair/${code}`;
      QRCode.toCanvas(qrRef.current, url, {
        width: 176,
        margin: 1,
        color: { dark: "#0a0a0a", light: "#ffffff" },
      }).catch(() => {});
    }
  }, [code, isTV]);

  return (
    <div className="relative min-h-screen bg-bg">
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(1200px 600px at 50% -10%, rgba(20,184,166,0.10), transparent 60%)" }}
      />
      <header className="relative flex items-center px-6 py-6 sm:px-12">
        <Logo />
      </header>

      <div className="relative mx-auto grid max-w-5xl gap-6 px-6 py-10 md:grid-cols-2 md:py-16">
        {/* Sign In */}
        <div className="rounded-2xl border border-white/5 bg-surface/80 p-8 shadow-card sm:p-10">
          <h1 className="text-4xl font-black tracking-tight">Sign In</h1>
          <p className="mt-2 text-sm text-muted">Sign in to access your watchlist, sources and synced playlists.</p>
          <form onSubmit={(e) => { e.preventDefault(); authAction("signin", siEmail, siPass); }} className="mt-8 space-y-5">
            <label className="block">
              <span className={labelCls}>Email Address</span>
              <input type="email" value={siEmail} onChange={(e) => setSiEmail(e.target.value)} placeholder="name@domain.com" className={inputCls} />
            </label>
            <label className="block">
              <span className={labelCls}>Password</span>
              <input type="password" value={siPass} onChange={(e) => setSiPass(e.target.value)} placeholder="••••••••" className={inputCls} />
            </label>
            {errorFor === "signin" && error && <p className="text-sm text-red-400">{error}</p>}
            <Button type="submit" disabled={busy} className="w-full py-4 text-base">{busy ? "Please wait…" : "Sign In"}</Button>
          </form>
          <div className="mt-6 border-t border-white/10 pt-5 text-center text-xs text-muted">
            {firebaseEnabled
              ? "Your watchlist & sources sync across your devices."
              : "Demo mode (no Firebase configured) — try any email to sign in instantly."}
          </div>
        </div>

        {/* Second box: Pair Device on TV, Sign Up on desktop/mobile */}
        {isTV ? (
          <div className="flex flex-col items-center rounded-2xl border border-white/5 bg-surface/50 p-8 text-center shadow-card sm:p-10">
            <div className="rounded-2xl bg-white p-3">
              <div className="h-1 w-full rounded bg-accent" />
              <canvas ref={qrRef} className="mt-2 h-44 w-44" />
            </div>
            <h2 className="mt-6 text-2xl font-black tracking-tight">Pair Device / Quick Log In</h2>
            <p className="mt-3 max-w-xs text-sm text-muted">
              Scan the QR code with your phone, or open the <strong className="text-white">Companion Remote</strong> and
              enter this pairing code to sign in without typing:
            </p>
            <div className="mt-5 flex gap-3 rounded-xl bg-surface-2 px-8 py-4">
              {code.split("").map((d, i) => (
                <span key={i} className="text-4xl font-black text-accent">{d}</span>
              ))}
            </div>
            <div className="mt-5 flex items-center gap-2 text-xs text-muted">
              <span className="h-2 w-2 animate-pulse rounded-full bg-yellow-400" /> Awaiting mobile connection…
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-white/5 bg-surface/80 p-8 shadow-card sm:p-10">
            <h1 className="text-4xl font-black tracking-tight">Sign Up</h1>
            <p className="mt-2 text-sm text-muted">Create a TVio account to save and sync your watchlist and sources.</p>
            <form onSubmit={(e) => { e.preventDefault(); authAction("register", suEmail, suPass); }} className="mt-8 space-y-5">
              <label className="block">
                <span className={labelCls}>Email Address</span>
                <input type="email" value={suEmail} onChange={(e) => setSuEmail(e.target.value)} placeholder="name@domain.com" className={inputCls} />
              </label>
              <label className="block">
                <span className={labelCls}>Password</span>
                <input type="password" value={suPass} onChange={(e) => setSuPass(e.target.value)} placeholder="At least 6 characters" className={inputCls} />
              </label>
              {errorFor === "register" && error && <p className="text-sm text-red-400">{error}</p>}
              <Button type="submit" variant="secondary" disabled={busy} className="w-full py-4 text-base">
                {busy ? "Please wait…" : "Create Account"}
              </Button>
            </form>
            <div className="mt-6 border-t border-white/10 pt-5 text-center text-xs text-muted">
              {firebaseEnabled
                ? "Free — just an email and password (min. 6 characters)."
                : "Demo mode — accounts aren't stored until Firebase is configured."}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

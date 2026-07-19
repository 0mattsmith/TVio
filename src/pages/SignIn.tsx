import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import QRCode from "qrcode";
import { Logo } from "../components/Logo";
import { Button } from "../components/Button";
import { useAppStore } from "../store/useAppStore";
import { auth, firebaseEnabled } from "../services/firebase";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from "firebase/auth";

function usePairingCode() {
  // 4-digit device-pair code. In production this maps to a Firestore
  // `pairings/{code}` doc a signed-in phone can claim (QR + Play On channel).
  const [code] = useState(() => String(Math.floor(1000 + Math.random() * 9000)));
  return code;
}

export function SignIn() {
  const navigate = useNavigate();
  const signIn = useAppStore((s) => s.signIn);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const code = usePairingCode();
  const qrRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (qrRef.current) {
      const url = `${window.location.origin}${window.location.pathname}#/pair/${code}`;
      QRCode.toCanvas(qrRef.current, url, {
        width: 176,
        margin: 1,
        color: { dark: "#0a0a0a", light: "#ffffff" },
      }).catch(() => {});
    }
  }, [code]);

  const authAction = async (mode: "signin" | "register") => {
    setError("");
    if (!firebaseEnabled || !auth) {
      signIn(email || "guest@tvio.app"); // demo mode: accept anything
      navigate("/");
      return;
    }
    setBusy(true);
    try {
      if (mode === "register") await createUserWithEmailAndPassword(auth, email, password);
      else await signInWithEmailAndPassword(auth, email, password);
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message.replace(/^Firebase:\s*/, "") : "Authentication failed.");
    } finally {
      setBusy(false);
    }
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    authAction("signin");
  };

  return (
    <div className="relative min-h-screen bg-bg">
      {/* subtle radial glow backdrop */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(1200px 600px at 50% -10%, rgba(20,184,166,0.10), transparent 60%)" }}
      />
      <header className="relative flex items-center justify-between px-6 py-6 sm:px-12">
        <Logo />
        <button
          onClick={() => authAction("register")}
          className="focusable rounded text-sm font-semibold text-muted hover:text-white"
        >
          Register / Create Account
        </button>
      </header>

      <div className="relative mx-auto grid max-w-5xl gap-6 px-6 py-10 md:grid-cols-2 md:py-20">
        {/* Sign In card */}
        <div className="rounded-2xl border border-white/5 bg-surface/80 p-8 shadow-card sm:p-10">
          <h1 className="text-4xl font-black tracking-tight">Sign In</h1>
          <p className="mt-2 text-sm text-muted">Sign in to access your custom streams and synched playlists.</p>

          <form onSubmit={submit} className="mt-8 space-y-5">
            <label className="block">
              <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-muted">Email Address</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@domain.com"
                className="focusable w-full rounded-lg border border-white/10 bg-surface-2 px-4 py-3.5 text-white placeholder:text-muted/60 focus:border-accent"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-muted">Password</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="focusable w-full rounded-lg border border-white/10 bg-surface-2 px-4 py-3.5 text-white placeholder:text-muted/60 focus:border-accent"
              />
            </label>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <Button type="submit" disabled={busy} className="w-full py-4 text-base">
              {busy ? "Signing in…" : "Sign In"}
            </Button>
          </form>

          <div className="mt-6 border-t border-white/10 pt-5 text-center text-xs text-muted">
            {firebaseEnabled
              ? "Signed in with your TVio account — watchlist & progress sync across your devices."
              : "Demo mode (no Firebase configured). Try any email to sign in instantly!"}
          </div>
        </div>

        {/* Pair device card */}
        <div className="flex flex-col items-center rounded-2xl border border-white/5 bg-surface/50 p-8 text-center shadow-card sm:p-10">
          <div className="rounded-2xl bg-white p-3">
            <div className="h-1 w-full rounded bg-accent" />
            <canvas ref={qrRef} className="mt-2 h-44 w-44" />
          </div>
          <h2 className="mt-6 text-2xl font-black tracking-tight">Pair Device / Quick Log In</h2>
          <p className="mt-3 max-w-xs text-sm text-muted">
            Scan the QR code with your phone, or open the <strong className="text-white">Companion Remote</strong> and
            enter this pairing code to sync:
          </p>
          <div className="mt-5 flex gap-3 rounded-xl bg-surface-2 px-8 py-4">
            {code.split("").map((d, i) => (
              <span key={i} className="text-4xl font-black text-accent">{d}</span>
            ))}
          </div>
          <div className="mt-5 flex items-center gap-2 text-xs text-muted">
            <span className="h-2 w-2 animate-pulse rounded-full bg-yellow-400" />
            Awaiting mobile connection…
          </div>
        </div>
      </div>
    </div>
  );
}
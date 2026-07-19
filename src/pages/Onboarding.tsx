import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { KeyRound, ExternalLink } from "lucide-react";
import { Logo } from "../components/Logo";
import { Button } from "../components/Button";
import { useAppStore } from "../store/useAppStore";
import { hasTmdbKey } from "../services/tmdb";

// Shown once after sign-in when the account has no TMDB key yet.
export function Onboarding() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const setTmdbKey = useAppStore((s) => s.setTmdbKey);
  const setTmdbRegion = useAppStore((s) => s.setTmdbRegion);
  const setOnboardingDone = useAppStore((s) => s.setOnboardingDone);
  const tmdbKey = useAppStore((s) => s.tmdbKey);

  const [key, setKey] = useState("");
  const [region, setRegion] = useState("");

  // If a key arrives from the account (Firestore sync), skip straight in.
  useEffect(() => {
    if (hasTmdbKey()) navigate("/", { replace: true });
  }, [tmdbKey, navigate]);

  const save = () => {
    if (key.trim()) setTmdbKey(key);
    if (region.trim()) setTmdbRegion(region);
    setOnboardingDone(true);
    queryClient.invalidateQueries();
    navigate("/", { replace: true });
  };
  const skip = () => {
    setOnboardingDone(true);
    navigate("/", { replace: true });
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-bg px-6 py-12">
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(1200px 600px at 50% -10%, rgba(20,184,166,0.10), transparent 60%)" }}
      />
      <div className="relative w-full max-w-md rounded-2xl border border-white/5 bg-surface/80 p-8 shadow-card sm:p-10">
        <Logo />
        <div className="mt-6 flex items-center gap-2 text-accent">
          <KeyRound size={18} />
          <span className="text-xs font-bold uppercase tracking-wider">One quick step</span>
        </div>
        <h1 className="mt-1 text-3xl font-black tracking-tight">Add your TMDB key</h1>
        <p className="mt-2 text-sm text-muted">
          TVio uses TMDB for posters, cast, trailers and where-to-watch. It's free — create a key, paste it below, and
          it's saved to your account for every device.
        </p>

        <a
          href="https://www.themoviedb.org/settings/api"
          target="_blank"
          rel="noopener noreferrer"
          className="focusable mt-4 inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold hover:bg-white/20"
        >
          Create a free TMDB key <ExternalLink size={14} />
        </a>

        <div className="mt-5 space-y-3">
          <input
            value={key}
            onChange={(e) => setKey(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && key.trim() && save()}
            placeholder="Paste your TMDB API key (v3)"
            className="focusable w-full rounded-lg border border-white/10 bg-surface-2 px-4 py-3 text-sm outline-none focus:border-accent"
          />
          <input
            value={region}
            onChange={(e) => setRegion(e.target.value.toUpperCase().slice(0, 2))}
            placeholder="Region (optional) — e.g. GB"
            className="focusable w-40 rounded-lg border border-white/10 bg-surface-2 px-4 py-3 text-sm outline-none focus:border-accent"
          />
        </div>

        <Button onClick={save} disabled={!key.trim()} className="mt-5 w-full">Continue</Button>
        <button onClick={skip} className="focusable mt-3 w-full rounded text-center text-xs text-muted hover:text-white">
          Skip for now — browse in demo mode
        </button>
      </div>
    </div>
  );
}

import { Navigate, Outlet } from "react-router-dom";
import { Navbar } from "./Navbar";
import { QuickWatch } from "./QuickWatch";
import { WatchlistToast } from "./WatchlistToast";
import { UpdateToast } from "./UpdateToast";
import { useAppStore } from "../store/useAppStore";
import { hasTmdbKey } from "../services/tmdb";

export function AppLayout() {
  const user = useAppStore((s) => s.user);
  const tmdbKey = useAppStore((s) => s.tmdbKey); // subscribe so the gate reacts to key changes
  const onboardingDone = useAppStore((s) => s.onboardingDone);
  const activeProfileId = useAppStore((s) => s.activeProfileId);

  // First-run gate: sign in → TMDB key (or explicit skip) → pick a profile.
  void tmdbKey;
  if (!user) return <Navigate to="/signin" replace />;
  if (!hasTmdbKey() && !onboardingDone) return <Navigate to="/onboarding" replace />;
  if (!activeProfileId) return <Navigate to="/profiles" replace />;

  return (
    <div className="min-h-screen bg-bg">
      <Navbar />
      <main className="min-h-screen">
        <Outlet />
      </main>
      <footer className="border-t border-white/5 px-4 py-8 text-center text-xs text-muted sm:px-8">
        TVio — media discovery, your way. Metadata by TMDB. Not affiliated with any streaming service.
      </footer>
      <QuickWatch />
      <WatchlistToast />
      <UpdateToast />
    </div>
  );
}

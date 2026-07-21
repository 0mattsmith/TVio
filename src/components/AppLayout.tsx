import { useEffect } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { Navbar } from "./Navbar";
import { useIsTV } from "../hooks/useDeviceProfile";
import { isNativeShell } from "../platform/capabilities";
import { installSpatialNav, installTvTextEntryGuard } from "../platform/spatialNav";
import { QuickWatch } from "./QuickWatch";
import { WatchlistToast } from "./WatchlistToast";
import { UpdateToast } from "./UpdateToast";
import { WhatsNew } from "./WhatsNew";
import { PrefetchToast } from "./PrefetchToast";
import { useAppStore } from "../store/useAppStore";
import { hasTmdbKey } from "../services/tmdb";

export function AppLayout() {
  const user = useAppStore((s) => s.user);
  const tmdbKey = useAppStore((s) => s.tmdbKey); // subscribe so the gate reacts to key changes
  const onboardingDone = useAppStore((s) => s.onboardingDone);
  const activeProfileId = useAppStore((s) => s.activeProfileId);
  const isTV = useIsTV();

  // Arrow keys move focus rather than scrolling, wherever the app is driven by
  // a remote or a keyboard. Left off in the browser, where scrolling with the
  // arrows is what people expect.
  const remoteDriven = isTV || isNativeShell();
  useEffect(() => {
    if (!remoteDriven) return;
    return installSpatialNav();
  }, [remoteDriven]);

  // Text fields stay inert until OK is pressed, so the Android keyboard can't
  // ambush the layout as focus passes over an input.
  useEffect(() => {
    if (!isTV) return;
    return installTvTextEntryGuard();
  }, [isTV]);

  // First-run gate: sign in → TMDB key (or explicit skip) → pick a profile.
  void tmdbKey;
  if (!user) return <Navigate to="/signin" replace />;
  if (!hasTmdbKey() && !onboardingDone) return <Navigate to="/onboarding" replace />;
  if (!activeProfileId) return <Navigate to="/profiles" replace />;

  return (
    <div className="min-h-screen bg-bg">
      <Navbar />
      {/* A 10-foot layout at 1080p leaves very little on screen at once, so the
          content is scaled down on TV. `zoom` rather than `transform: scale`
          because zoom reflows the layout — coordinates stay honest, which the
          focus geometry above depends on. The navbar is left alone. */}
      <div style={isTV ? ({ zoom: 0.65 } as React.CSSProperties) : undefined}>
        <main className="min-h-screen">
          <Outlet />
        </main>
        <footer className="border-t border-white/5 px-4 py-8 text-center text-xs text-muted sm:px-8">
          TVio — media discovery, your way. Metadata by TMDB. Not affiliated with any streaming service.
        </footer>
      </div>
      <QuickWatch />
      <WatchlistToast />
      <UpdateToast />
      <WhatsNew />
      <PrefetchToast />
    </div>
  );
}

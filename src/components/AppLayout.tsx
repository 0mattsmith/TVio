import { Outlet } from "react-router-dom";
import { Navbar } from "./Navbar";
import { QuickWatch } from "./QuickWatch";
import { WatchlistToast } from "./WatchlistToast";

export function AppLayout() {
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
    </div>
  );
}

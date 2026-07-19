import { Link } from "react-router-dom";
import { hasTmdbKey } from "../services/tmdb";
import { useAppStore } from "../store/useAppStore";

export function DemoBanner() {
  // Subscribe to the key so the banner re-renders (and hides) the moment the
  // user saves a TMDB key in Settings — no reload needed.
  useAppStore((s) => s.tmdbKey);
  if (hasTmdbKey()) return null;
  return (
    <div className="border-b border-accent/30 bg-accent-soft px-4 py-2 text-center text-xs text-accent sm:px-8">
      Demo mode — add your free TMDB API key in{" "}
      <Link to="/settings" className="font-bold underline underline-offset-2">Settings</Link>{" "}
      for live posters, cast, trailers &amp; where-to-watch.
    </div>
  );
}

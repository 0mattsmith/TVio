import { hasTmdbKey } from "../services/tmdb";

export function DemoBanner() {
  if (hasTmdbKey) return null;
  return (
    <div className="border-b border-accent/30 bg-accent-soft px-4 py-2 text-center text-xs text-accent sm:px-8">
      Demo mode — add <code className="font-mono">VITE_TMDB_KEY</code> to{" "}
      <code className="font-mono">.env.local</code> for live posters, cast, trailers & where-to-watch.
    </div>
  );
}

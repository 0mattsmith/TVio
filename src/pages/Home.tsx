import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Layers } from "lucide-react";
import { Hero } from "../components/Hero";
import { Row } from "../components/Row";
import { DemoBanner } from "../components/DemoBanner";
import { trendingRow, popularRow, recommendationsRow } from "../services/catalog";
import { getRecommendations } from "../services/simkl";
import { useAppStore } from "../store/useAppStore";
import { useReconcileProgress } from "../hooks/useReconcileProgress";
import type { MediaItem } from "../services/types";

export function Home() {
  const navigate = useNavigate();
  // Tidy up any Continue Watching entries left on a finished episode by an old build.
  useReconcileProgress();
  const watchlist = useAppStore((s) => s.watchlist);
  const progress = useAppStore((s) => s.progress);
  const collections = useAppStore((s) => s.collections);
  const watched = useAppStore((s) => s.watched);

  const trendMovies = useQuery({ queryKey: ["home", "trend", "movie"], queryFn: () => trendingRow("movie") });
  const trendTv = useQuery({ queryKey: ["home", "trend", "tv"], queryFn: () => trendingRow("tv") });
  const popMovies = useQuery({ queryKey: ["home", "pop", "movie"], queryFn: () => popularRow("movie") });

  // "Because you watched X" — seed from the most recent thing you finished, then
  // in-progress, then the watchlist, and use TMDB's per-title recommendations
  // (kind/era/cast aware) rather than a single genre.
  const seed = [...watched, ...progress, ...watchlist][0];
  const because = useQuery({
    queryKey: ["home", "because", seed?.type ?? "none", seed?.id ?? 0],
    queryFn: () => (seed ? recommendationsRow(seed.type, seed.id) : trendingRow("movie")),
  });

  // When Simkl is connected, prefer its own recommendations on Home (this screen
  // is all about the user's profile). Only Home — the Movies/TV tabs stay
  // per-service. Falls back to ours if Simkl returns nothing.
  const simklOn = useAppStore((s) => !!s.simklToken);
  const simklRecs = useQuery({
    queryKey: ["home", "simkl-recs", seed?.type ?? "none", seed?.id ?? 0],
    queryFn: () => (seed ? getRecommendations(seed.id, seed.type) : Promise.resolve([])),
    enabled: simklOn && !!seed,
  });
  const useSimklRecs = simklOn && (simklRecs.data?.length ?? 0) > 0;

  const heroItem = trendMovies.data?.[0];
  const pct = (p: { positionSec: number; durationSec: number }) =>
    p.durationSec ? (p.positionSec / p.durationSec) * 100 : 0;
  const progressLookup = (item: MediaItem) => {
    const p = progress.find((x) => x.id === item.id);
    return p ? pct(p) : undefined;
  };

  return (
    <div className="animate-fade-in">
      <DemoBanner />
      <Hero item={heroItem} />

      <div className="relative z-10 pt-6">
        {progress.length > 0 && (
          <Row title="Continue Watching…" items={progress} progressFor={progressLookup} context="continue" />
        )}
        {watchlist.length > 0 && <Row title="My Watchlist" items={watchlist} context="watchlist" />}
        {watched.length > 0 && <Row title="Watched" items={watched} />}

        {/* Followed film series — Star Wars, Halloween, Scream… */}
        {collections.length > 0 && (
          <section className="mb-8 animate-row-in">
            <h2 className="mb-3 flex items-center gap-2 px-4 text-lg font-bold tracking-tight sm:px-8">
              <Layers size={18} className="text-accent" /> My Film Series
            </h2>
            <div className="no-scrollbar focus-scroller flex gap-2.5 overflow-x-auto px-4 sm:px-8">
              {collections.map((c) => (
                <button
                  key={c.id}
                  onClick={() => navigate(`/collection/${c.id}`)}
                  className="focusable w-[150px] shrink-0 overflow-hidden rounded-lg bg-surface-2 text-left transition-transform hover:scale-[1.03] sm:w-[168px]"
                >
                  <div className="aspect-[2/3] w-full">
                    {c.poster ? (
                      <img src={c.poster} alt={c.name} loading="lazy" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center p-2 text-center text-xs text-muted">
                        {c.name}
                      </div>
                    )}
                  </div>
                  <div className="truncate px-2 py-1.5 text-xs font-semibold">{c.name}</div>
                </button>
              ))}
            </div>
          </section>
        )}

        {useSimklRecs ? (
          <Row title="Recommended by Simkl" items={simklRecs.data} loading={simklRecs.isLoading} />
        ) : (
          <Row title={seed ? `Because You Watched ${seed.title}` : "Because You've Watched…"} items={because.data} loading={because.isLoading} />
        )}

        <Row title="Trending Movies" items={trendMovies.data} loading={trendMovies.isLoading} />
        <Row title="Trending TV Shows" items={trendTv.data} loading={trendTv.isLoading} />
        <Row title="Popular Films" items={popMovies.data} loading={popMovies.isLoading} />
      </div>
    </div>
  );
}

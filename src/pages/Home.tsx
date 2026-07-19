import { useQuery } from "@tanstack/react-query";
import { Hero } from "../components/Hero";
import { Row } from "../components/Row";
import { DemoBanner } from "../components/DemoBanner";
import { trendingRow, popularRow, genreRow } from "../services/catalog";
import { useAppStore } from "../store/useAppStore";
import type { MediaItem } from "../services/types";

export function Home() {
  const watchlist = useAppStore((s) => s.watchlist);
  const progress = useAppStore((s) => s.progress);

  const trendMovies = useQuery({ queryKey: ["home", "trend", "movie"], queryFn: () => trendingRow("movie") });
  const trendTv = useQuery({ queryKey: ["home", "trend", "tv"], queryFn: () => trendingRow("tv") });
  const popMovies = useQuery({ queryKey: ["home", "pop", "movie"], queryFn: () => popularRow("movie") });

  // "Because you've watched" — seed recommendations from a genre implied by
  // the watchlist/progress. Falls back to trending drama.
  const seed = [...progress, ...watchlist][0];
  const becauseGenre = seed?.genreIds?.[0] ?? 18;
  const because = useQuery({
    queryKey: ["home", "because", becauseGenre],
    queryFn: () => genreRow("movie", becauseGenre),
  });

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
          <Row title="Continue Watching…" items={progress} progressFor={progressLookup} />
        )}
        {watchlist.length > 0 && <Row title="My Watchlist" items={watchlist} />}

        <Row title={seed ? `Because You Watched ${seed.title}` : "Because You've Watched…"} items={because.data} loading={because.isLoading} />
        <Row title="Trending Movies" items={trendMovies.data} loading={trendMovies.isLoading} />
        <Row title="Trending TV Series" items={trendTv.data} loading={trendTv.isLoading} />
        <Row title="Popular Films" items={popMovies.data} loading={popMovies.isLoading} />
      </div>
    </div>
  );
}

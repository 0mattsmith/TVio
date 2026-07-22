import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { getDetail } from "../services/catalog";

/**
 * A show shown as its individual season posters — the Disney+-style treatment
 * for The Simpsons, Family Guy, Futurama and American Dad, which have dozens of
 * seasons each with their own artwork. Picking one opens the series page (where
 * the season browser takes over). Season 0 ("Specials") is dropped.
 */
export function SeasonGrid({ seriesId, title }: { seriesId: number; title: string }) {
  const navigate = useNavigate();
  const q = useQuery({
    queryKey: ["series-seasons", seriesId],
    queryFn: () => getDetail("tv", seriesId),
  });
  const seasons = (q.data?.seasonsList ?? []).filter((s) => s.seasonNumber > 0);
  const grid =
    "grid grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-2.5 px-4 sm:grid-cols-[repeat(auto-fill,minmax(150px,1fr))] sm:px-8";

  return (
    <section className="mb-8 animate-row-in">
      <h2 className="mb-3 px-4 text-lg font-bold tracking-tight sm:px-8">{title}</h2>

      {q.isLoading ? (
        <div className={grid}>
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="skeleton aspect-[2/3] w-full rounded-lg" />
          ))}
        </div>
      ) : seasons.length > 0 ? (
        <div className={grid}>
          {seasons.map((s) => (
            <button
              key={s.seasonNumber}
              onClick={() => navigate(`/title/tv/${seriesId}`)}
              className="focusable group rounded-lg text-left"
              aria-label={`${title} — ${s.name}`}
            >
              <div className="aspect-[2/3] overflow-hidden rounded-lg bg-surface-2">
                {s.poster ? (
                  <img
                    src={s.poster}
                    alt={s.name}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center px-2 text-center text-sm font-semibold text-muted">
                    {s.name}
                  </div>
                )}
              </div>
              <div className="mt-1.5 truncate text-sm font-semibold">{s.name}</div>
              <div className="text-xs text-muted">
                {s.episodeCount} ep{s.episodeCount === 1 ? "" : "s"}
                {s.airYear ? ` · ${s.airYear}` : ""}
              </div>
            </button>
          ))}
        </div>
      ) : (
        <p className="px-4 py-8 text-sm text-muted sm:px-8">Nothing to show here yet.</p>
      )}
    </section>
  );
}

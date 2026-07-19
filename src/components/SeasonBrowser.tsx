import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Play, Star } from "lucide-react";
import { getSeason } from "../services/catalog";
import type { SeasonSummary, MediaItem } from "../services/types";
import { usePlay } from "../hooks/usePlay";

export function SeasonBrowser({ series, seasons }: { series: MediaItem; seasons: SeasonSummary[] }) {
  const play = usePlay();
  const [sel, setSel] = useState(seasons[0]?.seasonNumber ?? 1);

  const { data, isLoading } = useQuery({
    queryKey: ["season", series.id, sel],
    queryFn: () => getSeason(series.id, sel),
  });

  if (!seasons.length) return null;

  return (
    <section className="mt-10">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-xl font-bold">Episodes</h2>
        <select
          value={sel}
          onChange={(e) => setSel(Number(e.target.value))}
          className="focusable rounded-lg border border-white/10 bg-surface-2 px-3 py-2 text-sm font-semibold outline-none focus:border-accent"
        >
          {seasons.map((s) => (
            <option key={s.seasonNumber} value={s.seasonNumber}>
              {s.name}
              {s.episodeCount ? ` · ${s.episodeCount} eps` : ""}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        {isLoading
          ? Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton h-28 rounded-xl" />)
          : (data || []).map((ep) => (
              <button
                key={ep.episodeNumber}
                onClick={() => play(series, { season: sel, episode: ep.episodeNumber })}
                className="focusable group flex w-full gap-4 rounded-xl bg-surface p-3 text-left transition-colors hover:bg-surface-2"
              >
                <div className="relative aspect-video w-32 shrink-0 overflow-hidden rounded-lg bg-surface-2 sm:w-44">
                  {ep.still && <img src={ep.still} alt={ep.name} loading="lazy" className="h-full w-full object-cover" />}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                    <Play size={26} fill="currentColor" className="text-white" />
                  </div>
                </div>
                <div className="min-w-0 flex-1 py-0.5">
                  <div className="flex items-center gap-2">
                    <span className="line-clamp-1 text-sm font-bold">
                      {ep.episodeNumber}. {ep.name}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-3 text-xs text-muted">
                    {ep.runtime ? <span>{ep.runtime}m</span> : null}
                    {ep.rating ? (
                      <span className="flex items-center gap-1 text-accent">
                        <Star size={11} fill="currentColor" /> {ep.rating}
                      </span>
                    ) : null}
                    {ep.airDate ? <span>{ep.airDate}</span> : null}
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-xs text-white/70">
                    {ep.overview || "No synopsis available."}
                  </p>
                </div>
              </button>
            ))}
      </div>
    </section>
  );
}

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Play, Check, CalendarDays } from "lucide-react";
import { getDetail, getSeason, discoverRow } from "../services/catalog";
import type { SeasonSummary } from "../services/types";
import type { YearBrowserSpec } from "../services/serviceLayouts";
import { usePlay } from "../hooks/usePlay";
import { useAppStore } from "../store/useAppStore";
import { Row } from "./Row";

/**
 * The WWE "browse by year" block. Pick a year and see that year's episodes of
 * each weekly show (Raw and the opposing WCW Nitro, SmackDown, the B-shows…)
 * plus the events held that year. Shows with no season for a year are hidden,
 * so an empty year never renders dead rows.
 *
 * WWE/WCW seasons on TMDB are one per calendar year and carry the year in their
 * name ("1998", "Season 4 - 1998"), so a year maps to a season by that; air
 * year is the fallback.
 */
function seasonForYear(seasons: SeasonSummary[], year: number): SeasonSummary | undefined {
  return seasons.find((s) => {
    const m = s.name.match(/(?:19|20)\d{2}/);
    if (m) return Number(m[0]) === year;
    return s.airYear === String(year);
  });
}

function EpisodeStrip({ show, year }: { show: { id: number; label: string }; year: number }) {
  const play = usePlay();
  const watchedEpisodes = useAppStore((s) => s.watchedEpisodes);

  const detailQ = useQuery({ queryKey: ["detail", "tv", show.id], queryFn: () => getDetail("tv", show.id) });
  const season = detailQ.data?.seasonsList ? seasonForYear(detailQ.data.seasonsList, year) : undefined;
  const epsQ = useQuery({
    queryKey: ["season", show.id, season?.seasonNumber],
    queryFn: () => getSeason(show.id, season!.seasonNumber),
    enabled: season != null,
  });

  // Nothing for this show in this year → render nothing (no empty row).
  if (detailQ.isLoading || !season || !detailQ.data) return null;
  const series = detailQ.data; // MediaDetail is a MediaItem
  const seasonNumber = season.seasonNumber;

  return (
    <section className="mb-6">
      <h3 className="mb-2 px-4 text-base font-bold sm:px-8">
        {show.label} <span className="text-muted">· {year}</span>
      </h3>
      <div className="no-scrollbar focus-scroller flex gap-2.5 overflow-x-auto px-4 sm:px-8">
        {epsQ.isLoading
          ? Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="skeleton aspect-video w-52 shrink-0 rounded-lg" />
            ))
          : (epsQ.data || []).map((ep) => {
              const done = watchedEpisodes.includes(`${series.id}:${seasonNumber}:${ep.episodeNumber}`);
              return (
                <button
                  key={ep.episodeNumber}
                  onClick={() => play(series, { season: seasonNumber, episode: ep.episodeNumber })}
                  className="focusable group relative aspect-video w-52 shrink-0 overflow-hidden rounded-lg bg-surface-2 text-left"
                >
                  {ep.still && (
                    <img src={ep.still} alt={ep.name} loading="lazy" className="h-full w-full object-cover" />
                  )}
                  {done && (
                    <div className="absolute right-1.5 top-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-green-500 text-white ring-2 ring-black/40">
                      <Check size={12} strokeWidth={3} />
                    </div>
                  )}
                  <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/85 via-black/10 to-transparent p-2">
                    <span className="line-clamp-2 text-xs font-semibold">
                      E{ep.episodeNumber}
                      {ep.name ? ` · ${ep.name}` : ""}
                    </span>
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100 group-focus:opacity-100">
                    <Play size={26} fill="currentColor" className="text-white" />
                  </div>
                </button>
              );
            })}
      </div>
    </section>
  );
}

function PpvStrip({ company, year }: { company: number; year: number }) {
  const q = useQuery({
    queryKey: ["ppv-year", company, year],
    queryFn: () => discoverRow("movie", { companies: [company], sort: "primary_release_date.desc", year }),
  });
  if (!q.isLoading && (q.data?.length ?? 0) === 0) return null;
  return <Row title={`Premium Live Events · ${year}`} items={q.data} loading={q.isLoading} />;
}

export function YearBrowser({ spec }: { spec: YearBrowserSpec }) {
  const now = new Date().getFullYear();
  const years = useMemo(
    () => Array.from({ length: Math.max(1, now - spec.fromYear + 1) }, (_, i) => now - i),
    [now, spec.fromYear]
  );
  const [year, setYear] = useState<number | null>(null);

  return (
    <section className="mb-8">
      <div className="mb-3 flex items-center gap-2 px-4 sm:px-8">
        <CalendarDays size={16} className="text-accent" />
        <h2 className="text-lg font-bold">Browse by Year</h2>
      </div>

      <div className="no-scrollbar focus-scroller mb-4 flex gap-2 overflow-x-auto px-4 sm:px-8">
        {years.map((y) => (
          <button
            key={y}
            onClick={() => setYear((cur) => (cur === y ? null : y))}
            aria-pressed={year === y}
            className={`focusable shrink-0 rounded-full border px-4 py-2 text-sm font-bold transition-colors ${
              year === y
                ? "border-accent bg-accent text-black"
                : "border-white/15 bg-surface-2 text-white/85 hover:border-white/40"
            }`}
          >
            {y}
          </button>
        ))}
      </div>

      {year == null ? (
        <p className="px-4 text-sm text-muted sm:px-8">
          Pick a year to see that year's Raw, the opposing WCW Nitro, SmackDown, the B-shows and every PPV.
        </p>
      ) : (
        <div>
          {spec.shows.map((show) => (
            <EpisodeStrip key={show.id} show={show} year={year} />
          ))}
          {spec.ppvCompany != null && <PpvStrip company={spec.ppvCompany} year={year} />}
        </div>
      )}
    </section>
  );
}

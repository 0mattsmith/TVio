import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Play, Star, Check } from "lucide-react";
import { getSeason } from "../services/catalog";
import type { SeasonSummary, MediaItem, Episode } from "../services/types";
import { usePlay } from "../hooks/usePlay";
import { defaultSeason } from "../services/nextEpisode";
import { useAppStore } from "../store/useAppStore";
import { EpisodeActions } from "./EpisodeActions";

/** Hold OK this long on an episode to open its actions (mark watched, etc.). */
const HOLD_MS = 500;

/** One episode row: a tap plays it, holding OK opens its actions menu. */
function EpisodeRow({
  series,
  season,
  ep,
  watched,
  onHold,
}: {
  series: MediaItem;
  season: number;
  ep: Episode;
  watched: boolean;
  onHold: () => void;
}) {
  const play = usePlay();
  const holdTimer = useRef<number>();
  const opened = useRef(false);
  const start = () => play(series, { season, episode: ep.episodeNumber });
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "Enter" || e.repeat) return;
    e.preventDefault();
    opened.current = false;
    holdTimer.current = window.setTimeout(() => { opened.current = true; onHold(); }, HOLD_MS);
  };
  const onKeyUp = (e: React.KeyboardEvent) => {
    if (e.key !== "Enter") return;
    window.clearTimeout(holdTimer.current);
    if (!opened.current) start();
  };
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={start}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      className="focusable group flex w-full cursor-pointer gap-4 rounded-xl bg-surface p-3 text-left transition-colors hover:bg-surface-2"
    >
      <div className="relative aspect-video w-32 shrink-0 overflow-hidden rounded-lg bg-surface-2 sm:w-44">
        {ep.still && <img src={ep.still} alt={ep.name} loading="lazy" className="h-full w-full object-cover" />}
        {watched && (
          <div className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-green-500 text-white shadow ring-2 ring-black/40">
            <Check size={12} strokeWidth={3} />
          </div>
        )}
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100 group-focus:opacity-100">
          <Play size={26} fill="currentColor" className="text-white" />
        </div>
      </div>
      <div className="min-w-0 flex-1 py-0.5">
        <div className="flex items-center gap-2">
          <span className="line-clamp-1 text-sm font-bold">{ep.episodeNumber}. {ep.name}</span>
        </div>
        <div className="mt-0.5 flex items-center gap-3 text-xs text-muted">
          {ep.runtime ? <span>{ep.runtime}m</span> : null}
          {ep.rating ? (
            <span className="flex items-center gap-1 text-accent"><Star size={11} fill="currentColor" /> {ep.rating}</span>
          ) : null}
          {ep.airDate ? <span>{ep.airDate}</span> : null}
        </div>
        <p className="mt-1.5 line-clamp-2 text-xs text-white/70">{ep.overview || "No synopsis available."}</p>
      </div>
    </div>
  );
}

export function SeasonBrowser({
  series,
  seasons,
  initialSeason,
}: {
  series: MediaItem;
  seasons: SeasonSummary[];
  /** Deep-linked season (e.g. from a season-poster tile) — wins if it exists. */
  initialSeason?: number;
}) {
  const watchedEpisodes = useAppStore((s) => s.watchedEpisodes);
  const [actionsEp, setActionsEp] = useState<Episode | null>(null);
  // Open on the deep-linked season if there is one, else the season you're
  // partway through, else the first real season — never "Specials" (0).
  const inProgressSeason = useAppStore.getState().progress.find((p) => p.id === series.id)?.season;
  const [sel, setSel] = useState(() =>
    initialSeason != null && seasons.some((s) => s.seasonNumber === initialSeason)
      ? initialSeason
      : defaultSeason(seasons, inProgressSeason)
  );

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
              <EpisodeRow
                key={ep.episodeNumber}
                series={series}
                season={sel}
                ep={ep}
                watched={watchedEpisodes.includes(`${series.id}:${sel}:${ep.episodeNumber}`)}
                onHold={() => setActionsEp(ep)}
              />
            ))}
      </div>

      {actionsEp && (
        <EpisodeActions
          series={series}
          season={sel}
          episode={actionsEp.episodeNumber}
          title={actionsEp.name}
          onClose={() => setActionsEp(null)}
        />
      )}
    </section>
  );
}

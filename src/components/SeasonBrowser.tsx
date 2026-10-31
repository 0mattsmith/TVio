import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Play, Star, Check, HardDrive, Pencil, Link2, RefreshCw, Trash2 } from "lucide-react";
import { getSeason } from "../services/catalog";
import type { SeasonSummary, MediaItem, Episode } from "../services/types";
import { usePlay } from "../hooks/usePlay";
import { defaultSeason } from "../services/nextEpisode";
import { useAppStore } from "../store/useAppStore";
import { EpisodeActions } from "./EpisodeActions";
import { TorboxPickerDialog } from "./TorboxPickerDialog";
import { torboxConnected, listLibrary, pinKey, asParts, type TorboxPin } from "../services/torbox";
import { autoLinkEpisodes, titleTokens } from "../services/torboxLink";

/** Hold OK this long on an episode to open its actions (mark watched, etc.). */
const HOLD_MS = 500;

/** One episode row: a tap plays it, holding OK opens its actions menu. */
function EpisodeRow({
  series,
  season,
  ep,
  watched,
  pin,
  connected,
  onHold,
  onRelink,
}: {
  series: MediaItem;
  season: number;
  ep: Episode;
  watched: boolean;
  pin?: TorboxPin | TorboxPin[];
  connected: boolean;
  onHold: () => void;
  onRelink: () => void;
}) {
  const play = usePlay();
  const parts = asParts(pin);
  const holdTimer = useRef<number>();
  const opened = useRef(false);
  const start = () => play(series, { season, episode: ep.episodeNumber });
  // Only react to keys on the row itself — not a nested button (the pencil /
  // Link control), whose Enter would otherwise also trigger play.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.target !== e.currentTarget) return;
    if (e.key !== "Enter" || e.repeat) return;
    e.preventDefault();
    opened.current = false;
    holdTimer.current = window.setTimeout(() => { opened.current = true; onHold(); }, HOLD_MS);
  };
  const onKeyUp = (e: React.KeyboardEvent) => {
    if (e.target !== e.currentTarget) return;
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

        {/* Linked TorBox file — the name to verify, with a pencil to change it;
            or a one-tap Link when nothing's pinned yet. */}
        {connected && (
          parts.length > 0 ? (
            <div className="mt-1.5 flex items-center gap-1.5">
              <span className="inline-flex min-w-0 items-center gap-1 rounded bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold text-accent">
                <HardDrive size={11} className="shrink-0" />
                <span className="truncate">{parts[0]?.label || "Linked file"}{parts.length > 1 ? ` (+${parts.length - 1})` : ""}</span>
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); onRelink(); }}
                className="focusable shrink-0 rounded p-0.5 text-muted hover:text-white"
                aria-label="Change linked file"
              >
                <Pencil size={13} />
              </button>
            </div>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); onRelink(); }}
              className="focusable mt-1.5 inline-flex items-center gap-1 rounded text-[11px] font-semibold text-muted hover:text-accent"
              aria-label="Link a TorBox file to this episode"
            >
              <Link2 size={12} /> Link file
            </button>
          )
        )}
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
  const pinnedSources = useAppStore((s) => s.pinnedSources);
  const pinSource = useAppStore((s) => s.pinSource);
  const pinSources = useAppStore((s) => s.pinSources);
  const unpinSource = useAppStore((s) => s.unpinSource);
  const [actionsEp, setActionsEp] = useState<Episode | null>(null);
  const [relinkEp, setRelinkEp] = useState<Episode | null>(null);
  const [linking, setLinking] = useState(false);
  const [linkMsg, setLinkMsg] = useState("");
  const connected = torboxConnected();
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

  // Auto-link this season's episodes to owned TorBox files by name (date/SxxExx).
  // Only confident matches are pinned — oddly-named files are left for you to
  // link by hand from the row below.
  const linkSeason = async () => {
    if (!data || linking) return;
    setLinking(true);
    setLinkMsg("");
    const files = await listLibrary();
    const pins = autoLinkEpisodes(series.id, series.title, data, files);
    const n = Object.keys(pins).length;
    if (n) pinSources(pins);
    setLinking(false);
    setLinkMsg(files.length === 0 ? "No TorBox files found — check your API key." : `Linked ${n} of ${data.length}.`);
  };

  // Remove every TorBox link in the current season — a one-click recovery if a
  // batch linked to the wrong files.
  const seasonHasPins = !!data && data.some((ep) => pinnedSources[pinKey("tv", series.id, sel, ep.episodeNumber)]);
  const clearSeason = () => {
    if (!data) return;
    data.forEach((ep) => unpinSource(pinKey("tv", series.id, sel, ep.episodeNumber)));
    setLinkMsg("Cleared this season's links.");
  };

  if (!seasons.length) return null;

  return (
    <section className="mt-10">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold">Episodes</h2>
        <div className="flex items-center gap-2">
          {connected && (
            <button
              onClick={linkSeason}
              disabled={linking}
              className="focusable flex items-center gap-1.5 rounded-lg border border-white/10 bg-surface-2 px-3 py-2 text-sm font-semibold text-accent disabled:opacity-50"
            >
              {linking ? <RefreshCw size={15} className="animate-spin" /> : <HardDrive size={15} />}
              Link from TorBox
            </button>
          )}
          {connected && seasonHasPins && (
            <button
              onClick={clearSeason}
              title="Clear all TorBox links for this season"
              aria-label="Clear all TorBox links for this season"
              className="focusable rounded-lg border border-white/10 bg-surface-2 px-2.5 py-2 text-red-400 hover:text-red-300"
            >
              <Trash2 size={16} />
            </button>
          )}
          <select
            value={sel}
            onChange={(e) => { setSel(Number(e.target.value)); setLinkMsg(""); }}
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
      </div>
      {linkMsg && <p className="mb-3 text-xs text-muted">{linkMsg}</p>}

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
                pin={pinnedSources[pinKey("tv", series.id, sel, ep.episodeNumber)]}
                connected={connected}
                onHold={() => setActionsEp(ep)}
                onRelink={() => setRelinkEp(ep)}
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

      {relinkEp && (
        <TorboxPickerDialog
          filterTokens={titleTokens(series.title)}
          defaultYear={relinkEp.airDate ? relinkEp.airDate.slice(0, 4) : undefined}
          onUnlink={
            pinnedSources[pinKey("tv", series.id, sel, relinkEp.episodeNumber)]
              ? () => unpinSource(pinKey("tv", series.id, sel, relinkEp.episodeNumber))
              : undefined
          }
          onClose={() => setRelinkEp(null)}
          onPick={(files) => {
            const toPin = (f: (typeof files)[number]) => ({ type: f.type, id: f.id, fileId: f.fileId, label: f.name });
            pinSource(
              pinKey("tv", series.id, sel, relinkEp.episodeNumber),
              files.length === 1 ? toPin(files[0]) : files.map(toPin)
            );
          }}
        />
      )}
    </section>
  );
}

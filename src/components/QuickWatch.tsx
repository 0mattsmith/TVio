import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { X, Play, Puzzle, Server, MonitorPlay, ExternalLink, Plus, Clapperboard, LayoutGrid, Tag, Magnet, AlertCircle, MonitorSmartphone } from "lucide-react";
import { PlayOnSheet } from "./PlayOnSheet";
import { useDeviceProfile } from "../hooks/useDeviceProfile";
import { getDetail } from "../services/catalog";
import { resolveProviderUrl } from "../services/services";
import { useAppStore, selectPersonalSources } from "../store/useAppStore";
import type { Addon } from "../store/useAppStore";
import type { WatchProvider, MediaType } from "../services/types";
import { useIsTV } from "../hooks/useDeviceProfile";
import { useOverlayBack } from "../hooks/useOverlayBack";
import { fetchStreams, isWebPlayable, isHttpAddon, streamTitle, streamSubtitle, humanSize } from "../addons/manager";
import { rankByTitleMatch, type StreamExpectation, type MatchVerdict, type StreamCheck } from "../addons/match";
import type { Stream } from "../addons/types";
import { hasNativePlayback } from "../platform/capabilities";
import { classifyStream } from "../lib/playback";

// Video codecs browsers generally can't decode (even inside an MP4). Addons
// like AIOStreams usually tag these in the stream label, so we can filter them
// out on the web build before the user hits a playback failure.
const HARD_CODECS = /\b(hevc|h\.?\s?265|x265|dolby\s?vision|dovi|\bdv\b)\b/i;

// Playable in a browser: web-ready per the addon, a container the browser can
// demux, and not tagged with a codec it can't decode.
const webPlayable = (s: Stream) =>
  isWebPlayable(s) &&
  classifyStream(s.url || "") !== "unsupported" &&
  !HARD_CODECS.test(`${s.name || ""} ${s.description || ""} ${s.title || ""}`);

interface EpisodeRef { season: number; episode: number }

function SourceIcon({ kind }: { kind: Addon["kind"] }) {
  const cls = "text-accent";
  if (kind === "plex" || kind === "jellyfin" || kind === "emby") return <MonitorPlay size={18} className={cls} />;
  if (kind === "nas") return <Server size={18} className={cls} />;
  return <Puzzle size={18} className={cls} />;
}

export function QuickWatch() {
  const navigate = useNavigate();
  const item = useAppStore((s) => s.quickWatchItem);
  const episode = useAppStore((s) => s.quickWatchEpisode);
  const close = useAppStore((s) => s.closeQuickWatch);
  // Android's Back closes the sheet rather than quitting the app.
  useOverlayBack(Boolean(item), close);
  const personal = useAppStore(selectPersonalSources);
  const showOfficial = useAppStore((s) => s.showOfficialSources);
  const compact = useAppStore((s) => s.compactProviders);
  const setCompact = useAppStore((s) => s.setCompactProviders);
  const isTV = useIsTV();
  const isMobile = useDeviceProfile() === "mobile";
  const [playOnOpen, setPlayOnOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["detail", item?.type, item?.id],
    queryFn: () => getDetail(item!.type, item!.id),
    enabled: !!item,
  });

  // Close on Escape + lock background scroll while open.
  useEffect(() => {
    if (!item) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [item, close]);

  if (!item) return null;

  const epQuery = episode ? `?s=${episode.season}&e=${episode.episode}` : "";
  const playInApp = () => {
    navigate(`/watch/${item.type}/${item.id}${epQuery}`);
    close();
  };
  // Launch the player with a specific resolved stream URL (from an addon).
  const playStream = (stream: Stream) => {
    if (!stream.url) return;
    navigate(`/watch/${item.type}/${item.id}${epQuery}`, {
      state: {
        url: stream.url,
        name: streamTitle(stream),
        filename: stream.behaviorHints?.filename,
        size: stream.behaviorHints?.videoSize,
      },
    });
    close();
  };
  const goSettings = () => {
    navigate("/settings");
    close();
  };

  const flatrate = (data?.providers || []).filter((p) => ["flatrate", "free", "ads"].includes(p.type));
  const buyRent = (data?.providers || []).filter((p) => ["rent", "buy"].includes(p.type));

  const addonSources = personal.filter((s) => (s.kind === "aiostreams" || s.kind === "addon") && isHttpAddon(s.url));
  const localSources = personal.filter((s) => ["plex", "jellyfin", "emby", "nas"].includes(s.kind));
  const imdbId = data?.imdbId ?? null;
  const native = hasNativePlayback(); // native builds play everything; web filters

  return (
    <>
    <div
      data-spatial-scope
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center"
      onClick={close}
    >
      <div
        className="animate-row-in max-h-[88vh] w-full overflow-y-auto rounded-t-2xl border border-white/10 bg-surface p-5 shadow-card sm:max-w-lg sm:rounded-2xl sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="h-20 w-14 shrink-0 overflow-hidden rounded-md bg-surface-2">
            {item.poster && <img src={item.poster} alt={item.title} className="h-full w-full object-cover" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-bold uppercase tracking-wider text-accent">Quick Watch</div>
            <h2 className="truncate text-xl font-black tracking-tight">{item.title}</h2>
            <div className="mt-0.5 text-sm text-muted">
              {item.year} · {item.type === "tv" ? "Series" : "Film"}
            </div>
          </div>
          <button onClick={close} className="focusable rounded-full p-1 text-muted hover:text-white" aria-label="Close">
            <X size={22} />
          </button>
        </div>

        {/* Play On — send to a TV / desktop (mobile only) */}
        {isMobile && (
          <button
            onClick={() => setPlayOnOpen(true)}
            className="focusable mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-accent/40 bg-accent-soft py-2.5 text-sm font-bold text-accent"
          >
            <MonitorSmartphone size={16} /> Play on another screen
          </button>
        )}

        {/* Your sources */}
        <div className="mt-6">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-bold uppercase tracking-wider text-muted">Play from your sources</p>
            {item.type === "tv" && (
              <span className="text-[11px] text-muted">S{episode?.season ?? 1} · E{episode?.episode ?? 1}</span>
            )}
          </div>

          {personal.length === 0 ? (
            <div className="rounded-lg border border-dashed border-white/15 bg-surface-2/50 p-4 text-center">
              <p className="text-sm text-muted">No personal sources connected yet.</p>
              <p className="mt-1 text-xs text-muted">Add a Stremio addon (e.g. AIOStreams), Plex, or a NAS share to play here.</p>
              <div className="mt-3 flex justify-center gap-2">
                <button onClick={goSettings} className="focusable flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-bold text-black">
                  <Plus size={15} /> Add a source
                </button>
                <button onClick={playInApp} className="focusable flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold hover:bg-white/20">
                  <Clapperboard size={15} /> Preview player
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Real streams resolved from Stremio addons (AIOStreams etc.) */}
              {!imdbId ? (
                <p className="rounded-lg bg-surface-2/50 px-4 py-3 text-xs text-muted">
                  {data ? "No IMDb id for this title, so addon streams can't be resolved." : "Loading…"}
                </p>
              ) : (
                addonSources.map((addon) => (
                  <AddonSource
                    key={addon.id}
                    addon={addon}
                    type={item.type}
                    imdbId={imdbId}
                    expect={{
                      title: item.title,
                      year: item.year ? Number(item.year) : undefined,
                      season: episode?.season,
                      episode: episode?.episode,
                      runtimeMin: data?.runtime ?? undefined,
                      preferredLang: useAppStore.getState().preferredAudioLang || "en",
                    }}
                    episode={episode || undefined}
                    native={native}
                    onPlay={playStream}
                  />
                ))
              )}

              {/* Plex / NAS stubs — resolvers land later; play routes to the in-app player */}
              {localSources.map((src) => (
                <button
                  key={src.id}
                  onClick={playInApp}
                  className="focusable flex w-full items-center gap-3 rounded-lg bg-surface-2 px-4 py-3 text-left hover:bg-white/10"
                >
                  <SourceIcon kind={src.kind} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{src.name}</div>
                    <div className="truncate text-xs text-muted">Open in TVio player</div>
                  </div>
                  <Play size={18} className="shrink-0 text-accent" fill="currentColor" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Official services (deep-links) */}
        <div className="mt-6">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-muted">Available on</p>
            {!showOfficial ? (
              <button onClick={goSettings} className="focusable text-xs text-accent hover:underline">Show official options</button>
            ) : !isTV && (flatrate.length > 0 || buyRent.length > 0) ? (
              // On TV the icon/label choice lives only in Settings, to keep the
              // number of D-pad focus targets in this sheet to a minimum.
              <button
                onClick={() => setCompact(!compact)}
                aria-pressed={compact}
                title={compact ? "Show names" : "Show icons only"}
                className="focusable flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold text-muted hover:text-white"
              >
                {compact ? <Tag size={14} /> : <LayoutGrid size={14} />}
                {compact ? "Names" : "Icons"}
              </button>
            ) : null}
          </div>

          {!showOfficial ? (
            <p className="rounded-lg bg-surface-2/50 px-4 py-3 text-xs text-muted">
              Official streaming options are hidden. Enable them in Settings.
            </p>
          ) : isLoading ? (
            <div className="flex gap-2">
              {Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton h-10 w-28 rounded-lg" />)}
            </div>
          ) : flatrate.length === 0 && buyRent.length === 0 ? (
            <p className="text-sm text-muted">No official streaming availability found for your region.</p>
          ) : (
            <>
              {flatrate.length > 0 && (
                <ProviderChips items={flatrate} watchLink={data?.watchLink || null} compact={compact} />
              )}
              {buyRent.length > 0 && (
                <div className="mt-2">
                  <p className="mb-1.5 text-[11px] uppercase tracking-wider text-muted">Rent or buy</p>
                  <ProviderChips items={buyRent} watchLink={data?.watchLink || null} small compact={compact} />
                </div>
              )}
              <p className="mt-2 text-[11px] text-muted">Opens the service so you can sign in and watch.</p>
            </>
          )}
        </div>
      </div>
    </div>
    {isMobile && playOnOpen && (
      <PlayOnSheet item={item} episode={episode || undefined} onClose={() => setPlayOnOpen(false)} />
    )}
    </>
  );
}

// Short badge naming which check a doubtful stream failed.
function badgeLabel(verdict: MatchVerdict | undefined, reason: StreamCheck["reason"]): string | null {
  if (verdict !== "mismatch" && verdict !== "uncertain") return null;
  const soft = verdict === "uncertain";
  if (reason === "episode") return soft ? "Check episode" : "Wrong episode?";
  if (reason === "year") return soft ? "Check year" : "Wrong year?";
  if (reason === "size") return soft ? "Small file" : "Too small — sample?";
  if (reason === "language") return soft ? "Language?" : "Not English?";
  return soft ? "Check title" : "Different title?";
}

// Fetches and lists one addon's streams for the current title/episode.
function AddonSource({
  addon,
  type,
  imdbId,
  expect,
  episode,
  native,
  onPlay,
}: {
  addon: Addon;
  type: MediaType;
  imdbId: string;
  expect: StreamExpectation;
  episode?: EpisodeRef;
  native: boolean;
  onPlay: (s: Stream) => void;
}) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["streams", addon.url, type, imdbId, episode?.season ?? 1, episode?.episode ?? 1],
    queryFn: () => fetchStreams(addon.url, type, imdbId, episode?.season, episode?.episode),
    staleTime: 60_000,
    retry: 0,
  });

  // On the web build, only surface streams the browser can actually play.
  // Native builds (Tauri / Capacitor) bundle a player, so show everything.
  const all = data || [];
  const playable = native ? all : all.filter(webPlayable);

  // Cross-check each result's release name against the title we requested, and
  // sort the likely wrong ones (Barney & Friends for Friends) to the bottom.
  // Demoted and badged rather than hidden — release naming is messy enough that
  // dropping "uncertain" ones would lose working sources.
  const ranked = rankByTitleMatch(
    playable,
    (s) => streamTitle(s),
    expect,
    (s) => s.behaviorHints?.videoSize
  );
  const visible = ranked.map((r) => r.item);
  const checks = new Map(ranked.map((r) => [r.item, r]));
  const hidden = all.length - playable.length;

  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted">
        <Puzzle size={13} className="text-accent" /> {addon.name}
      </div>
      {isLoading ? (
        <div className="space-y-1.5">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton h-12 rounded-lg" />)}
        </div>
      ) : isError ? (
        <p className="flex items-center gap-2 rounded-lg bg-surface-2/50 px-3 py-2 text-xs text-muted">
          <AlertCircle size={14} className="shrink-0" /> Couldn't reach {addon.name}. Check the addon URL or its CORS policy.
        </p>
      ) : all.length === 0 ? (
        <p className="rounded-lg bg-surface-2/50 px-3 py-2 text-xs text-muted">No streams found for this title.</p>
      ) : visible.length === 0 ? (
        <p className="flex items-center gap-2 rounded-lg bg-surface-2/50 px-3 py-2 text-xs text-muted">
          <Magnet size={14} className="shrink-0" />
          {all.length} source{all.length > 1 ? "s" : ""} found, but none play in a browser (MKV / torrent). Open the TVio Windows or Android app to watch these.
        </p>
      ) : (
        <div className="space-y-1.5">
          {visible.map((s, i) => {
            const size = humanSize(s.behaviorHints?.videoSize);
            const sub = streamSubtitle(s);
            const check = checks.get(s);
            const verdict = check?.verdict;
            const doubtful = verdict === "mismatch" || verdict === "uncertain";
            const label = badgeLabel(verdict, check?.reason ?? null);
            return (
              <button
                key={`${addon.id}-${i}`}
                onClick={() => onPlay(s)}
                title={verdict === "mismatch" ? "This file's name doesn't match what you selected" : "Play"}
                className={`focusable flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-white/10 ${
                  doubtful ? "bg-surface-2/50" : "bg-surface-2"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`truncate text-sm font-semibold ${doubtful ? "text-muted" : ""}`}>
                      {streamTitle(s)}
                    </span>
                    {label && (
                      <span
                        className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                          verdict === "mismatch" ? "bg-red-500/15 text-red-300" : "bg-amber-500/15 text-amber-300"
                        }`}
                      >
                        {label}
                      </span>
                    )}
                  </div>
                  {(sub || size) && (
                    <div className="truncate text-[11px] text-muted">{[sub, size].filter(Boolean).join("  ·  ")}</div>
                  )}
                </div>
                <Play size={16} className="shrink-0 text-accent" fill="currentColor" />
              </button>
            );
          })}
          {hidden > 0 && (
            <p className="px-1 pt-0.5 text-[11px] text-muted">
              +{hidden} more source{hidden > 1 ? "s" : ""} available in the Windows / Android app (MKV / torrent).
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function ProviderChips({
  items,
  watchLink,
  small,
  compact,
}: {
  items: WatchProvider[];
  watchLink: string | null;
  small?: boolean;
  compact?: boolean;
}) {
  const tile = compact ? (small ? "h-9 w-9" : "h-11 w-11") : "";
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((p) => {
        const url = resolveProviderUrl(p.name, watchLink);
        if (compact) {
          return (
            <a
              key={p.providerId + p.name}
              href={url || "#"}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => !url && e.preventDefault()}
              title={`Open ${p.name}`}
              aria-label={p.name}
              className={`focusable block overflow-hidden rounded-lg bg-surface-2 transition-transform hover:scale-105 ${tile}`}
            >
              {p.logo ? (
                <img src={p.logo} alt={p.name} className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-xs font-bold text-muted">
                  {p.name.slice(0, 2)}
                </span>
              )}
            </a>
          );
        }
        return (
          <a
            key={p.providerId + p.name}
            href={url || "#"}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => !url && e.preventDefault()}
            className={`focusable flex items-center gap-2 rounded-lg bg-surface-2 font-semibold hover:bg-white/10 ${
              small ? "px-2.5 py-1.5 text-xs" : "px-3 py-2 text-sm"
            }`}
          >
            {p.logo ? (
              <img src={p.logo} alt={p.name} className={small ? "h-5 w-5 rounded" : "h-7 w-7 rounded"} />
            ) : (
              <span className={small ? "h-5 w-5" : "h-7 w-7"} />
            )}
            <span className="truncate">{p.name}</span>
            <ExternalLink size={small ? 12 : 14} className="text-muted" />
          </a>
        );
      })}
    </div>
  );
}

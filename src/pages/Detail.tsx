import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Play, Plus, Check, ArrowLeft, Star, ExternalLink, EyeOff } from "lucide-react";
import { getDetail, getCollection } from "../services/catalog";
import { resolveProviderUrl } from "../services/services";
import type { MediaType, WatchProvider } from "../services/types";
import { Button } from "../components/Button";
import { PosterCard } from "../components/PosterCard";
import { SeasonBrowser } from "../components/SeasonBrowser";
import { useAppStore } from "../store/useAppStore";
import { usePlay } from "../hooks/usePlay";

export function Detail() {
  const { type, id } = useParams<{ type: MediaType; id: string }>();
  const navigate = useNavigate();
  const play = usePlay();
  const mediaType = (type || "movie") as MediaType;
  const numId = Number(id);

  const { data, isLoading } = useQuery({
    queryKey: ["detail", mediaType, numId],
    queryFn: () => getDetail(mediaType, numId),
  });

  const inList = useAppStore((s) => s.inWatchlist(numId));
  const toggle = useAppStore((s) => s.toggleWatchlist);
  const showOfficial = useAppStore((s) => s.showOfficialSources);
  const compact = useAppStore((s) => s.compactProviders);

  const collectionQ = useQuery({
    queryKey: ["collection", data?.collectionId],
    queryFn: () => getCollection(data!.collectionId!),
    enabled: mediaType === "movie" && !!data?.collectionId,
  });

  if (isLoading || !data) return <div className="skeleton h-screen w-full" />;

  const trailer = data.videos.find((v) => v.type === "Trailer") || data.videos[0];
  const flatrate = data.providers.filter((p) => p.type === "flatrate" || p.type === "free" || p.type === "ads");
  const buyRent = data.providers.filter((p) => p.type === "rent" || p.type === "buy");

  return (
    <div className="animate-fade-in">
      {/* Backdrop hero */}
      <div className="relative h-[60vh] min-h-[380px] w-full">
        {data.backdrop && <img src={data.backdrop} alt={data.title} className="h-full w-full object-cover" />}
        <div className="absolute inset-0 hero-fade" />
        <div className="absolute inset-0 hero-fade-left" />
        <button
          onClick={() => navigate(-1)}
          className="focusable absolute left-4 top-20 flex items-center gap-2 rounded-full bg-black/50 px-4 py-2 text-sm font-semibold backdrop-blur sm:left-8"
        >
          <ArrowLeft size={16} /> Back
        </button>
      </div>

      <div className="relative z-10 -mt-40 px-4 sm:px-8">
        <div className="flex flex-col gap-6 md:flex-row">
          {data.poster && (
            <img src={data.poster} alt={data.title} className="hidden w-48 shrink-0 rounded-xl shadow-card md:block" />
          )}
          <div className="flex-1">
            <h1 className="text-4xl font-black tracking-tight sm:text-5xl">{data.title}</h1>
            {data.tagline && <p className="mt-2 italic text-muted">{data.tagline}</p>}
            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm font-semibold text-muted">
              <span className="flex items-center gap-1 text-accent"><Star size={15} fill="currentColor" /> {data.rating || "—"}</span>
              <span>{data.year}</span>
              {data.runtime && <span>{data.runtime} min</span>}
              {data.seasons && <span>{data.seasons} season{data.seasons > 1 ? "s" : ""}</span>}
              <span className="rounded border border-white/25 px-1.5 text-xs uppercase">
                {mediaType === "tv" ? "Series" : "Film"}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {data.genres.map((g) => (
                <span key={g.id} className="rounded-full bg-surface-2 px-3 py-1 text-xs text-muted">{g.name}</span>
              ))}
            </div>

            <p className="mt-5 max-w-3xl text-white/85">{data.overview}</p>

            <div className="mt-6 flex flex-wrap gap-3">
              <Button onClick={() => play(data)}>
                <Play size={18} fill="currentColor" /> Play
              </Button>
              <Button variant="secondary" onClick={() => toggle(data)}>
                {inList ? <Check size={18} /> : <Plus size={18} />} {inList ? "In Watchlist" : "Watchlist"}
              </Button>
            </div>
          </div>
        </div>

        {/* Where to watch */}
        <section className="mt-10">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-xl font-bold">Ways to Watch</h2>
            <button onClick={() => play(data)} className="focusable flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-bold text-black">
              <Play size={15} fill="currentColor" /> Quick Watch
            </button>
          </div>

          {!showOfficial ? (
            <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-surface-2/50 px-4 py-3 text-sm text-muted">
              <EyeOff size={16} className="shrink-0" />
              <span>
                Official streaming options are hidden. Use Quick Watch for your own sources, or turn them back on in{" "}
                <button onClick={() => navigate("/settings")} className="text-accent hover:underline">Settings</button>.
              </span>
            </div>
          ) : flatrate.length === 0 && buyRent.length === 0 ? (
            <p className="text-sm text-muted">No official streaming availability found for your region.</p>
          ) : (
            <>
              {flatrate.length > 0 && (
                <div className="mb-4">
                  <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">Stream</p>
                  <ProviderList items={flatrate} watchLink={data.watchLink} compact={compact} />
                </div>
              )}
              {buyRent.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">Rent or Buy</p>
                  <ProviderList items={buyRent} watchLink={data.watchLink} compact={compact} />
                </div>
              )}
              <p className="mt-3 text-xs text-muted">
                Click a service to sign in and watch. Availability via TMDB / JustWatch for your region.
              </p>
            </>
          )}
        </section>

        {/* Episodes (TV) */}
        {mediaType === "tv" && data.seasonsList && data.seasonsList.length > 0 && (
          <SeasonBrowser series={data} seasons={data.seasonsList} />
        )}

        {/* Part of a collection (Film) */}
        {mediaType === "movie" && data.collectionId && (collectionQ.data?.length ?? 0) > 0 && (
          <section className="mt-10">
            <h2 className="mb-3 text-xl font-bold">{data.collectionName || "Collection"}</h2>
            <div className="no-scrollbar flex gap-2.5 overflow-x-auto pb-2">
              {collectionQ.data!.map((m) => (
                <PosterCard key={m.id} item={m} />
              ))}
            </div>
          </section>
        )}

        {/* Trailer */}
        {trailer && (
          <section className="mt-10">
            <h2 className="mb-3 text-xl font-bold">Trailer</h2>
            <div className="aspect-video w-full max-w-3xl overflow-hidden rounded-xl bg-black">
              <iframe
                className="h-full w-full"
                src={`https://www.youtube.com/embed/${trailer.key}`}
                title={trailer.name}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          </section>
        )}

        {/* Cast */}
        {data.cast.length > 0 && (
          <section className="mb-16 mt-10">
            <h2 className="mb-3 text-xl font-bold">Cast</h2>
            <div className="no-scrollbar flex gap-4 overflow-x-auto pb-2">
              {data.cast.map((c) => (
                <Link
                  key={c.id}
                  to={`/person/${c.id}`}
                  className="focusable w-24 shrink-0 text-center"
                >
                  <div className="mx-auto h-24 w-24 overflow-hidden rounded-full bg-surface-2">
                    {c.profile ? (
                      <img src={c.profile} alt={c.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs text-muted">?</div>
                    )}
                  </div>
                  <div className="mt-2 line-clamp-2 text-xs font-semibold">{c.name}</div>
                  <div className="line-clamp-1 text-[11px] text-muted">{c.character}</div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function ProviderList({
  items,
  watchLink,
  compact,
}: {
  items: WatchProvider[];
  watchLink: string | null;
  compact?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-3">
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
              className="focusable block h-11 w-11 overflow-hidden rounded-lg bg-surface-2 transition-transform hover:scale-105"
              title={`Open ${p.name}`}
              aria-label={p.name}
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
            className="focusable group flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-2 transition-colors hover:bg-white/10"
            title={`Open ${p.name}`}
          >
            {p.logo ? (
              <img src={p.logo} alt={p.name} className="h-8 w-8 rounded" />
            ) : (
              <span className="h-8 w-8 rounded bg-white/5" />
            )}
            <span className="text-sm font-semibold">{p.name}</span>
            <ExternalLink size={14} className="text-muted group-hover:text-accent" />
          </a>
        );
      })}
    </div>
  );
}

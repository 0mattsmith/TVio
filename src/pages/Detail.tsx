import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate, Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Play, Plus, Check, ArrowLeft, Star, Layers, Heart, Film } from "lucide-react";
import { getDetail, getCollection } from "../services/catalog";
import type { MediaType } from "../services/types";
import { Button } from "../components/Button";
import { PosterCard } from "../components/PosterCard";
import { SeasonBrowser } from "../components/SeasonBrowser";
import { TrailerModal } from "../components/TrailerModal";
import { useAppStore } from "../store/useAppStore";
import { usePlay } from "../hooks/usePlay";
import { defaultSeason } from "../services/nextEpisode";
import { useIsTV } from "../hooks/useDeviceProfile";
import { useTrailer } from "../hooks/useTrailer";

export function Detail() {
  const { type, id } = useParams<{ type: MediaType; id: string }>();
  const [searchParams] = useSearchParams();
  // Opening a specific season poster (from a series' season grid) deep-links here.
  const seasonParam = searchParams.get("season");
  const initialSeason = seasonParam ? Number(seasonParam) : undefined;
  const navigate = useNavigate();
  const play = usePlay();
  const mediaType = (type || "movie") as MediaType;
  const isTV = useIsTV();
  const numId = Number(id);

  const { data, isLoading } = useQuery({
    queryKey: ["detail", mediaType, numId],
    queryFn: () => getDetail(mediaType, numId),
  });

  const inList = useAppStore((s) => s.inWatchlist(numId));
  const toggle = useAppStore((s) => s.toggleWatchlist);
  const toggleCollection = useAppStore((s) => s.toggleCollection);
  const followingCollection = useAppStore((s) => (data?.collectionId ? s.inCollections(data.collectionId) : false));

  const collectionQ = useQuery({
    queryKey: ["collection", data?.collectionId],
    queryFn: () => getCollection(data!.collectionId!),
    enabled: mediaType === "movie" && !!data?.collectionId,
  });

  // Picks a video that's been confirmed to actually play, or reports "none" so
  // the section can be hidden. Sits above the early return — hooks can't be
  // called conditionally.
  const trailer = useTrailer(data?.videos);
  const [showTrailer, setShowTrailer] = useState(false);

  // On a TV, open on the Play button rather than the Back button (which is
  // top-left and would otherwise be the first thing the D-pad lands on).
  const playRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isTV || !data) return;
    const raf = requestAnimationFrame(() => playRef.current?.querySelector<HTMLElement>("button")?.focus());
    return () => cancelAnimationFrame(raf);
  }, [isTV, data]);

  if (isLoading || !data) return <div className="skeleton h-screen w-full" />;

  return (
    <div className="animate-fade-in">
      {/* Backdrop hero */}
      <div className="relative h-[60vh] min-h-[380px] w-full">
        {data.backdrop && <img src={data.backdrop} alt={data.title} className="h-full w-full object-cover" />}
        <div className="absolute inset-0 hero-fade" />
        <div className="absolute inset-0 hero-fade-left" />
        <button
          data-back
          onClick={() => navigate(-1)}
          className="focusable absolute left-4 top-20 flex items-center gap-2 rounded-full bg-black/50 px-4 py-2 text-sm font-semibold backdrop-blur sm:left-8"
        >
          <ArrowLeft size={16} /> Back
        </button>
      </div>

      {/* On TV the sections are reordered with flex `order` rather than by
          moving the JSX: Play/Watchlist, then episodes or the film series, then
          a smaller trailer, then cast, with Ways to Watch last. Spatial
          navigation reads geometry, so visual order is focus order — no
          separate tab-index bookkeeping needed. */}
      <div className={`relative z-10 -mt-40 px-4 sm:px-8 ${isTV ? "flex flex-col" : ""}`}>
        <div className="flex flex-col gap-6 md:flex-row">
          {data.poster && (
            <img src={data.poster} alt={data.title} className="hidden w-60 shrink-0 rounded-xl shadow-card md:block" />
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

            <div ref={playRef} className="mt-6 flex flex-wrap gap-3">
              <Button
                onClick={() => {
                  // A series must play with an episode ref, or finishing it never
                  // ticks as watched. Resume the in-progress episode, else S(first)E1.
                  if (mediaType === "tv") {
                    const p = useAppStore.getState().progress.find((x) => x.id === data.id);
                    play(data, { season: p?.season ?? defaultSeason(data.seasonsList), episode: p?.episode ?? 1 });
                  } else {
                    play(data);
                  }
                }}
              >
                <Play size={18} fill="currentColor" /> Play
              </Button>
              <Button variant="secondary" onClick={() => toggle(data)}>
                {inList ? <Check size={18} /> : <Plus size={18} />} {inList ? "In Watchlist" : "Watchlist"}
              </Button>
              {trailer.status === "ready" && (
                <Button variant="secondary" onClick={() => setShowTrailer(true)}>
                  <Film size={18} /> Watch Trailer
                </Button>
              )}
            </div>

          </div>
        </div>

        {/* Episodes (TV) */}
        {mediaType === "tv" && data.seasonsList && data.seasonsList.length > 0 && (
          <div className="order-1">
            <SeasonBrowser series={data} seasons={data.seasonsList} initialSeason={initialSeason} />
          </div>
        )}

        {/* Part of a collection (Film) */}
        {mediaType === "movie" && data.collectionId && (collectionQ.data?.length ?? 0) > 0 && (
          <section className="order-1 mt-10">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <button
                onClick={() => navigate(`/collection/${data.collectionId}`)}
                className="focusable flex items-center gap-2 rounded text-xl font-bold hover:text-accent"
              >
                <Layers size={18} className="text-accent" />
                {data.collectionName || "Collection"}
                <span className="text-sm font-normal text-muted">
                  · {collectionQ.data!.length} films in release order
                </span>
              </button>
              <button
                onClick={() =>
                  toggleCollection({
                    id: data.collectionId!,
                    name: data.collectionName || "Collection",
                    poster: collectionQ.data?.[0]?.poster ?? null,
                  })
                }
                className={`focusable flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-bold ${
                  followingCollection ? "bg-surface-2 text-accent" : "bg-accent text-black"
                }`}
              >
                <Heart size={15} fill={followingCollection ? "currentColor" : "none"} />
                {followingCollection ? "In Favourites" : "Add series"}
              </button>
            </div>
            <div className="no-scrollbar focus-scroller flex gap-2.5 overflow-x-auto">
              {collectionQ.data!.map((m) => (
                <PosterCard key={m.id} item={m} />
              ))}
            </div>
          </section>
        )}

        {/* Cast */}
        {data.cast.length > 0 && (
          <section className="order-3 mb-16 mt-10">
            <h2 className="mb-3 text-xl font-bold">Cast</h2>
            <div className="no-scrollbar focus-scroller flex gap-4 overflow-x-auto">
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

      {showTrailer && trailer.status === "ready" && (
        <TrailerModal video={trailer.video} onClose={() => setShowTrailer(false)} />
      )}
    </div>
  );
}


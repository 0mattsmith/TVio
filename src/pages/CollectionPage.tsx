import { useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Heart, Layers, Play } from "lucide-react";
import { getCollectionDetail } from "../services/catalog";
import { PosterCard } from "../components/PosterCard";
import { Button } from "../components/Button";
import { useAppStore } from "../store/useAppStore";
import { usePlay } from "../hooks/usePlay";
import { useIsTV } from "../hooks/useDeviceProfile";

/** A film series (Star Wars, Halloween, Scream…) listed in release order. */
export function CollectionPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const play = usePlay();
  const collectionId = Number(id);

  const { data, isLoading } = useQuery({
    queryKey: ["collection-detail", collectionId],
    queryFn: () => getCollectionDetail(collectionId),
  });

  const following = useAppStore((s) => s.inCollections(collectionId));
  const toggleCollection = useAppStore((s) => s.toggleCollection);

  // On a TV, land on the first film rather than the Back button when the page
  // opens — the films are the point of a series page.
  const isTV = useIsTV();
  const filmsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isTV || !data) return;
    const raf = requestAnimationFrame(() => filmsRef.current?.querySelector<HTMLElement>(".focusable")?.focus());
    return () => cancelAnimationFrame(raf);
  }, [isTV, data]);

  if (isLoading || !data) return <div className="skeleton h-screen w-full" />;

  return (
    <div className="animate-fade-in">
      {/* Backdrop */}
      <div className="relative h-[46vh] min-h-[300px] w-full">
        {data.backdrop && <img src={data.backdrop} alt={data.name} className="h-full w-full object-cover" />}
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

      <div className="relative z-10 -mt-32 px-4 sm:px-8">
        <div className="flex flex-col gap-6 md:flex-row">
          {data.poster && (
            <img src={data.poster} alt={data.name} className="hidden w-44 shrink-0 rounded-xl shadow-card md:block" />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-accent">
              <Layers size={14} /> Film series
            </div>
            <h1 className="mt-1 text-4xl font-black tracking-tight sm:text-5xl">{data.name}</h1>
            <p className="mt-2 text-sm text-muted">
              {data.parts.length} films · in release order
            </p>
            {data.overview && <p className="mt-4 max-w-3xl text-white/85">{data.overview}</p>}

            <div className="mt-6 flex flex-wrap gap-3">
              {data.parts[0] && (
                <Button onClick={() => play(data.parts[0])}>
                  <Play size={18} fill="currentColor" /> Play first film
                </Button>
              )}
              <Button
                variant={following ? "secondary" : "ghost"}
                onClick={() =>
                  toggleCollection({ id: data.id, name: data.name, poster: data.poster })
                }
              >
                <Heart size={18} fill={following ? "currentColor" : "none"} />
                {following ? "In Favourites" : "Add to Favourites"}
              </Button>
            </div>
          </div>
        </div>

        {/* Films, numbered in release order */}
        <section className="mb-16 mt-10">
          <h2 className="mb-3 text-xl font-bold">All films</h2>
          <div ref={filmsRef} className="flex flex-wrap gap-2.5">
            {data.parts.map((film, i) => (
              <div key={film.id} className="relative">
                <span className="absolute -left-1 -top-1 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-xs font-black text-black">
                  {i + 1}
                </span>
                <PosterCard item={film} />
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

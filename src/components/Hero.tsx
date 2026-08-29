import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Play, Info, Plus, Check, Film } from "lucide-react";
import type { MediaItem } from "../services/types";
import { getDetail } from "../services/catalog";
import { useAppStore } from "../store/useAppStore";
import { usePlay } from "../hooks/usePlay";
import { useTrailer } from "../hooks/useTrailer";
import { TrailerModal } from "./TrailerModal";
import { Button } from "./Button";

export function Hero({ item }: { item?: MediaItem }) {
  const navigate = useNavigate();
  const play = usePlay();
  const inList = useAppStore((s) => (item ? s.inWatchlist(item.id) : false));
  const toggle = useAppStore((s) => s.toggleWatchlist);
  const [showTrailer, setShowTrailer] = useState(false);

  // The hero item is a catalogue entry (no videos); fetch its detail to know if
  // a trailer exists. Same query key as the Detail page, so it's a cache hit.
  const detailQ = useQuery({
    queryKey: ["detail", item?.type, item?.id],
    queryFn: () => getDetail(item!.type, item!.id),
    enabled: !!item,
  });
  const trailer = useTrailer(detailQ.data?.videos);

  if (!item) return <div className="skeleton h-[56vh] max-h-[620px] min-h-[380px] w-full" />;

  return (
    <div className="relative h-[62vh] max-h-[680px] min-h-[420px] w-full">
      {item.backdrop && (
        <img src={item.backdrop} alt={item.title} className="h-full w-full object-cover" />
      )}
      <div className="absolute inset-0 hero-fade" />
      <div className="absolute inset-0 hero-fade-left" />

      <div className="absolute bottom-0 left-0 max-w-2xl p-4 pb-12 sm:p-8 sm:pb-14">
        <h1 className="mb-3 text-4xl font-black leading-none tracking-tight drop-shadow-lg sm:text-6xl">
          {item.title}
        </h1>
        <div className="mb-3 flex items-center gap-3 text-sm font-semibold text-muted">
          <span className="text-accent">★ {item.rating || "—"}</span>
          <span>{item.year}</span>
          <span className="rounded border border-white/25 px-1.5 text-xs uppercase">
            {item.type === "tv" ? "Series" : "Film"}
          </span>
        </div>
        <p className="mb-6 line-clamp-3 max-w-xl text-sm text-white/85 sm:text-base">{item.overview}</p>
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => play(item)}>
            <Play size={18} fill="currentColor" /> Play
          </Button>
          {trailer.status === "ready" && (
            <Button variant="ghost" onClick={() => setShowTrailer(true)}>
              <Film size={18} /> Watch Trailer
            </Button>
          )}
          <Button variant="ghost" onClick={() => navigate(`/title/${item.type}/${item.id}`)}>
            <Info size={18} /> More Info
          </Button>
          <Button variant="ghost" onClick={() => toggle(item)} aria-label="Watchlist">
            {inList ? <Check size={18} /> : <Plus size={18} />}
          </Button>
        </div>
      </div>

      {showTrailer && trailer.status === "ready" && (
        <TrailerModal video={trailer.video} onClose={() => setShowTrailer(false)} />
      )}
    </div>
  );
}

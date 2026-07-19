import { useNavigate } from "react-router-dom";
import { Play, Info, Plus, Check } from "lucide-react";
import type { MediaItem } from "../services/types";
import { useAppStore } from "../store/useAppStore";
import { usePlay } from "../hooks/usePlay";
import { Button } from "./Button";

export function Hero({ item }: { item?: MediaItem }) {
  const navigate = useNavigate();
  const play = usePlay();
  const inList = useAppStore((s) => (item ? s.inWatchlist(item.id) : false));
  const toggle = useAppStore((s) => s.toggleWatchlist);

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
          <Button variant="ghost" onClick={() => navigate(`/title/${item.type}/${item.id}`)}>
            <Info size={18} /> More Info
          </Button>
          <Button variant="ghost" onClick={() => toggle(item)} aria-label="Watchlist">
            {inList ? <Check size={18} /> : <Plus size={18} />}
          </Button>
        </div>
      </div>
    </div>
  );
}

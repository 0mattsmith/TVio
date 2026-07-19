import { useEffect } from "react";
import { X } from "lucide-react";
import { SERVICES, OTHER_SERVICE, ALL_SERVICE_KEYS } from "../services/services";
import { useAppStore } from "../store/useAppStore";
import { Chip } from "./Chip";
import { Button } from "./Button";

// Focused filter overlay used on TV (and available anywhere) so the browse
// screen shows a single "Filters" entry instead of two chip strips — far fewer
// D-pad focus targets. Services + genre live together in a contained panel.
export function FilterPanel({
  open,
  onClose,
  genres,
  genre,
  onGenre,
}: {
  open: boolean;
  onClose: () => void;
  genres: { id: number; name: string }[];
  genre?: number;
  onGenre: (id?: number) => void;
}) {
  const enabled = useAppStore((s) => s.enabledServices);
  const toggle = useAppStore((s) => s.toggleService);
  const setAll = useAppStore((s) => s.setAllServices);
  const services = [...SERVICES, OTHER_SERVICE];
  const allOn = ALL_SERVICE_KEYS.every((k) => enabled.includes(k));

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="animate-fade-in flex h-full w-full max-w-md flex-col border-l border-white/10 bg-surface p-6 shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-2xl font-black tracking-tight">Filters</h2>
          <button onClick={onClose} className="focusable rounded-full p-1 text-muted hover:text-white" aria-label="Close filters">
            <X size={24} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <section className="mb-8">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted">Streaming services</h3>
              <button onClick={() => setAll(!allOn)} className="focusable text-xs font-semibold text-accent hover:underline">
                {allOn ? "Clear all" : "Select all"}
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {services.map((s) => (
                <Chip key={s.key} label={s.name} color={s.color} active={enabled.includes(s.key)} onClick={() => toggle(s.key)} />
              ))}
            </div>
          </section>

          <section>
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted">Genre</h3>
            <div className="flex flex-wrap gap-2">
              <Chip label="All genres" active={genre === undefined} onClick={() => onGenre(undefined)} />
              {genres.map((g) => (
                <Chip key={g.id} label={g.name} active={genre === g.id} onClick={() => onGenre(g.id)} />
              ))}
            </div>
          </section>
        </div>

        <Button className="mt-6 w-full" onClick={onClose}>Done</Button>
      </div>
    </div>
  );
}

import { SERVICES, OTHER_SERVICE } from "../services/services";
import { useAppStore } from "../store/useAppStore";
import { Chip } from "./Chip";

// Multi-select service chips. All on by default; user can disable any.
// Drives which "Popular/Trending/New on <service>" rows render.
export function ServiceFilter() {
  const enabled = useAppStore((s) => s.enabledServices);
  const toggle = useAppStore((s) => s.toggleService);
  const setAll = useAppStore((s) => s.setAllServices);
  const all = [...SERVICES, OTHER_SERVICE];
  const allOn = all.every((s) => enabled.includes(s.key));

  return (
    <div className="no-scrollbar focus-scroller flex items-center gap-2 overflow-x-auto px-4 sm:px-8">
      <Chip label={allOn ? "All" : "Select all"} active={allOn} onClick={() => setAll(!allOn)} />
      <div className="mx-1 h-5 w-px shrink-0 bg-white/15" />
      {all.map((svc) => (
        <Chip
          key={svc.key}
          label={svc.name}
          color={svc.color}
          active={enabled.includes(svc.key)}
          onClick={() => toggle(svc.key)}
        />
      ))}
    </div>
  );
}

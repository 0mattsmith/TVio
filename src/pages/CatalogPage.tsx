import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { SlidersHorizontal } from "lucide-react";
import { Hero } from "../components/Hero";
import { Row } from "../components/Row";
import { Chip } from "../components/Chip";
import { ServiceFilter } from "../components/ServiceFilter";
import { FilterPanel } from "../components/FilterPanel";
import { DemoBanner } from "../components/DemoBanner";
import { SERVICES, ALL_SERVICE_KEYS } from "../services/services";
import { trendingRow, serviceRow, getGenres } from "../services/catalog";
import type { MediaType } from "../services/types";
import { useAppStore } from "../store/useAppStore";
import { useIsTV } from "../hooks/useDeviceProfile";

// One row = one service + one kind. Kept as its own component so each query
// is independent and lazy.
function ServiceRow({
  type, providerId, serviceName, kind, genre,
}: {
  type: MediaType; providerId: number; serviceName: string; kind: "popular" | "trending" | "new"; genre?: number;
}) {
  const label = kind === "popular" ? "Popular on" : kind === "trending" ? "Trending on" : "New to";
  const q = useQuery({
    queryKey: ["catalog", type, providerId, kind, genre ?? 0],
    queryFn: () => serviceRow(type, providerId, kind, genre),
  });
  return <Row title={`${label} ${serviceName}`} items={q.data} loading={q.isLoading} />;
}

export function CatalogPage({ type }: { type: MediaType }) {
  const enabled = useAppStore((s) => s.enabledServices);
  const [genre, setGenre] = useState<number | undefined>(undefined);
  const isTV = useIsTV();
  const [filtersOpen, setFiltersOpen] = useState(false);

  const genresQ = useQuery({ queryKey: ["genres", type], queryFn: () => getGenres(type) });
  const heroQ = useQuery({ queryKey: ["catalog-hero", type], queryFn: () => trendingRow(type) });

  const activeServices = useMemo(
    () => SERVICES.filter((s) => enabled.includes(s.key)),
    [enabled]
  );

  const allServicesOn = ALL_SERVICE_KEYS.every((k) => enabled.includes(k));
  const genreName = genre === undefined ? "All genres" : genresQ.data?.find((g) => g.id === genre)?.name ?? "Genre";
  const servicesLabel = allServicesOn ? "All services" : `${enabled.length}/${ALL_SERVICE_KEYS.length} services`;

  return (
    <div className="animate-fade-in">
      <DemoBanner />
      <Hero item={heroQ.data?.[0]} />

      <div className="relative z-10 -mt-14">
        {isTV ? (
          // TV: collapse both filters into one focus target to cut D-pad stops.
          <div className="flex items-center gap-3 px-4 pb-3 sm:px-8">
            <button
              onClick={() => setFiltersOpen(true)}
              className="focusable flex items-center gap-2 rounded-full border border-white/15 bg-surface-2 px-5 py-2.5 text-sm font-semibold hover:border-white/40"
            >
              <SlidersHorizontal size={16} /> Filters
            </button>
            <span className="truncate text-sm text-muted">{servicesLabel} · {genreName}</span>
          </div>
        ) : (
          <>
            {/* Service filter (multi-select) */}
            <ServiceFilter />

            {/* Genre filter (Netflix-style) */}
            <div className="no-scrollbar flex items-center gap-2 overflow-x-auto px-4 pb-3 sm:px-8">
              <Chip label="All genres" active={genre === undefined} onClick={() => setGenre(undefined)} />
              {(genresQ.data || []).map((g) => (
                <Chip key={g.id} label={g.name} active={genre === g.id} onClick={() => setGenre(g.id)} />
              ))}
            </div>
          </>
        )}

        <div className="mt-2">
          {activeServices.length === 0 && (
            <p className="px-4 py-10 text-center text-sm text-muted sm:px-8">
              No services selected. {isTV ? "Open Filters" : "Enable a service above"} to see rows.
            </p>
          )}
          {activeServices.map((svc) => (
            <div key={svc.key}>
              <ServiceRow type={type} providerId={svc.providerId} serviceName={svc.name} kind="popular" genre={genre} />
              <ServiceRow type={type} providerId={svc.providerId} serviceName={svc.name} kind="trending" genre={genre} />
              <ServiceRow type={type} providerId={svc.providerId} serviceName={svc.name} kind="new" genre={genre} />
            </div>
          ))}
        </div>
      </div>

      <FilterPanel
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        genres={genresQ.data || []}
        genre={genre}
        onGenre={setGenre}
      />
    </div>
  );
}

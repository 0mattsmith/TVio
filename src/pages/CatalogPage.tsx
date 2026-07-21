import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { SlidersHorizontal } from "lucide-react";
import { Hero } from "../components/Hero";
import { Row } from "../components/Row";
import { Chip } from "../components/Chip";
import { ServiceFilter } from "../components/ServiceFilter";
import { FilterPanel } from "../components/FilterPanel";
import { DemoBanner } from "../components/DemoBanner";
import { SERVICES, ALL_SERVICE_KEYS } from "../services/services";
import { trendingRow, serviceRow, getGenres, companiesRow } from "../services/catalog";
import { serviceLayoutRows, serviceBrands, type BrandTile } from "../services/serviceLayouts";
import { BrandStrip } from "../components/BrandStrip";
import { LayoutRow } from "../components/LayoutRow";
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

  // Exactly one real service selected. "Other" is a catch-all bucket rather than
  // a brand — it has no layout of its own and never renders rows here, so
  // whether it's ticked has no bearing on this.
  const soleService = activeServices.length === 1 ? activeServices[0] : undefined;

  const [brand, setBrand] = useState<BrandTile | undefined>(undefined);
  const brands = soleService ? serviceBrands(soleService) : [];

  const layoutRows = useMemo(
    () =>
      // Genres may still be loading; drop the genre-based rows for now rather
      // than withholding the whole layout and flashing the generic one.
      soleService && genre === undefined
        ? serviceLayoutRows(soleService, type, genresQ.data ?? [])
        : null,
    [soleService, genre, genresQ.data, type]
  );

  // Selecting a different service shouldn't leave a stale brand filter behind.
  useEffect(() => setBrand(undefined), [soleService?.key, type]);

  // Visible confirmation of which layout is in play. Without it, "one service
  // selected but generic rows" is indistinguishable from "the build doesn't
  // have this feature yet", which cost us several rounds of guesswork.
  const layoutLabel = layoutRows
    ? `${soleService!.name} categories`
    : soleService
      ? `${soleService!.name} categories — clear the genre filter to see them`
      : null;

  const allServicesOn = ALL_SERVICE_KEYS.every((k) => enabled.includes(k));
  const genreName = genre === undefined ? "All genres" : genresQ.data?.find((g) => g.id === genre)?.name ?? "Genre";
  const servicesLabel = allServicesOn ? "All services" : `${enabled.length}/${ALL_SERVICE_KEYS.length} services`;

  return (
    <div className="animate-fade-in">
      <DemoBanner />
      <Hero item={heroQ.data?.[0]} />

      {/* The filters ride up over the hero's fade. The overlap has to stay
          smaller than the hero's bottom padding or it eats the Play buttons —
          mobile's padding is smaller, so the overlap is too. */}
      <div className="relative z-10 -mt-4 sm:-mt-14">
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

        {layoutLabel && (
          <div className="px-4 pb-3 sm:px-8">
            <span
              className={`inline-block rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider ${
                layoutRows ? "bg-accent-soft text-accent" : "bg-surface-2 text-muted"
              }`}
            >
              {layoutLabel}
            </span>
          </div>
        )}

        <div className="mt-2">
          {activeServices.length === 0 && (
            <p className="px-4 py-10 text-center text-sm text-muted sm:px-8">
              No services selected. {isTV ? "Open Filters" : "Enable a service above"} to see rows.
            </p>
          )}

          {/* One service on its own → borrow that service's own layout. With a
              genre filter applied the tailored rows would fight it, so the
              neutral rows take over again. */}
          {layoutRows ? (
            <>
              {brands.length > 0 && (
                <BrandStrip
                  brands={brands}
                  active={brand?.key}
                  onPick={setBrand}
                />
              )}
              {brand ? (
                <LayoutRow
                  row={{
                    key: `brand:${type}:${brand.key}:${soleService!.key}`,
                    title: brand.name,
                    load: () => companiesRow(type, soleService!.providerId, brand.companies),
                  }}
                />
              ) : (
                layoutRows.map((row) => <LayoutRow key={row.key} row={row} />)
              )}
            </>
          ) : (
            activeServices.map((svc) => (
              <div key={svc.key}>
                <ServiceRow type={type} providerId={svc.providerId} serviceName={svc.name} kind="popular" genre={genre} />
                <ServiceRow type={type} providerId={svc.providerId} serviceName={svc.name} kind="trending" genre={genre} />
                <ServiceRow type={type} providerId={svc.providerId} serviceName={svc.name} kind="new" genre={genre} />
              </div>
            ))
          )}
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

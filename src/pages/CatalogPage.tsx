import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { SlidersHorizontal } from "lucide-react";
import { Hero } from "../components/Hero";
import { Row } from "../components/Row";
import { Chip } from "../components/Chip";
import { Dropdown } from "../components/Dropdown";
import { ServiceFilter } from "../components/ServiceFilter";
import { FilterPanel } from "../components/FilterPanel";
import { DemoBanner } from "../components/DemoBanner";
import { SERVICES, OTHER_SERVICE, ALL_SERVICE_KEYS } from "../services/services";
import { trendingRow, serviceRow, getGenres } from "../services/catalog";
import { serviceLayoutRows, serviceBrands, brandRowKey, brandItemsLoader, type BrandTile } from "../services/serviceLayouts";
import { BrandStrip } from "../components/BrandStrip";
import { LayoutRow } from "../components/LayoutRow";
import { PosterGrid } from "../components/PosterGrid";
import { SeasonGrid } from "../components/SeasonGrid";
import { BrandLayout } from "../components/BrandLayout";
import type { MediaType } from "../services/types";
import { useAppStore } from "../store/useAppStore";
import { useIsTV, useDeviceProfile } from "../hooks/useDeviceProfile";

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


/** Everything under one brand, as a grid. Reuses the strip's cached query. */
function BrandGrid({
  brand,
  type,
  providerId,
}: {
  brand: BrandTile;
  type: MediaType;
  providerId: number;
}) {
  const q = useQuery({
    queryKey: brandRowKey(type, providerId, brand),
    queryFn: brandItemsLoader(type, providerId, brand)!,
  });
  return <PosterGrid title={brand.name} items={q.data} loading={q.isLoading} />;
}

export function CatalogPage({ type }: { type: MediaType }) {
  const enabled = useAppStore((s) => s.enabledServices);
  const toggleService = useAppStore((s) => s.toggleService);
  const setAllServices = useAppStore((s) => s.setAllServices);
  const setActiveBrand = useAppStore((s) => s.setActiveBrand);
  const [genre, setGenre] = useState<number | undefined>(undefined);
  const isTV = useIsTV();
  const isMobile = useDeviceProfile() === "mobile";
  const [filtersOpen, setFiltersOpen] = useState(false);

  const genresQ = useQuery({ queryKey: ["genres", type], queryFn: () => getGenres(type) });

  const activeServices = useMemo(
    () => SERVICES.filter((s) => enabled.includes(s.key)),
    [enabled]
  );

  // Exactly one real service selected. "Other" is a catch-all bucket rather than
  // a brand — it has no layout of its own and never renders rows here, so
  // whether it's ticked has no bearing on this.
  const soleService = activeServices.length === 1 ? activeServices[0] : undefined;

  // Feature that service's own titles when it's the only one selected —
  // otherwise the banner above a Disney+ page was whatever was trending
  // generally, which rather undercuts the effect.
  const heroQ = useQuery({
    queryKey: ["catalog-hero", type, soleService?.key ?? "all"],
    queryFn: () =>
      soleService ? serviceRow(type, soleService.providerId, "trending") : trendingRow(type),
  });

  const [brand, setBrand] = useState<BrandTile | undefined>(undefined);
  const brands = soleService ? serviceBrands(soleService, type) : [];

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

  // Surface the open sub-brand (e.g. WWE) to the navbar, and clear it on the way
  // out so the badge doesn't linger on other pages.
  useEffect(() => {
    setActiveBrand(brand ? { key: brand.key, name: brand.name } : null);
    return () => setActiveBrand(null);
  }, [brand, setActiveBrand]);

  // On TV, land on the top suggestion when arriving at a catalog page. Without
  // this, focus lingered on wherever it was on the previous screen and the
  // browser restored the scroll position, so the first D-pad press grabbed a
  // poster halfway down the page instead of the hero.
  //
  // But NOT while a panel is open: toggling a service in the Filters sidebar
  // refetches the hero, and this effect would then rip focus out of the sidebar
  // back to the top — so it stayed put only if a spatial scope is on screen.
  useEffect(() => {
    if (!isTV || document.querySelector("[data-spatial-scope]")) return;
    window.scrollTo(0, 0);
    if (!heroQ.data?.[0]) return;
    const raf = requestAnimationFrame(() => {
      if (document.querySelector("[data-spatial-scope]")) return;
      document.querySelector<HTMLElement>("main .focusable")?.focus({ preventScroll: false });
    });
    return () => cancelAnimationFrame(raf);
  }, [isTV, type, heroQ.data]);

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
          mobile's padding is smaller, so the overlap is too. On TV the hero
          (and its Play row) sits lower, so pull up far less or the single
          Filters button collides with the Play button. */}
      <div className={`relative z-10 -mt-4 ${isTV ? "sm:-mt-4" : "sm:-mt-14"}`}>
        {isTV ? (
          // TV: collapse both filters into one focus target to cut D-pad stops.
          <div className="flex items-center gap-3 px-4 pb-3 pt-2 sm:px-8">
            <button
              onClick={() => setFiltersOpen(true)}
              className="focusable flex items-center gap-2 rounded-full border border-white/15 bg-surface-2 px-5 py-2.5 text-sm font-semibold hover:border-white/40"
            >
              <SlidersHorizontal size={16} /> Filters
            </button>
            <span className="truncate text-sm text-muted">{servicesLabel} · {genreName}</span>
          </div>
        ) : isMobile ? (
          // Small screens: collapse both chip strips into dropdowns so the page
          // isn't buried under filters before you reach any posters.
          <div className="space-y-2 px-4 pb-2 pt-1 sm:px-8">
            <Dropdown ariaLabel="Streaming services" summary={servicesLabel}>
              <div className="flex flex-wrap gap-2">
                <Chip label={allServicesOn ? "All" : "Select all"} active={allServicesOn} onClick={() => setAllServices(!allServicesOn)} />
                {[...SERVICES, OTHER_SERVICE].map((s) => (
                  <Chip key={s.key} label={s.name} color={s.color} active={enabled.includes(s.key)} onClick={() => toggleService(s.key)} />
                ))}
              </div>
            </Dropdown>
            <Dropdown ariaLabel="Genre" summary={genreName}>
              <div className="flex flex-wrap gap-2">
                <Chip label="All genres" active={genre === undefined} onClick={() => setGenre(undefined)} />
                {(genresQ.data || []).map((g) => (
                  <Chip key={g.id} label={g.name} active={genre === g.id} onClick={() => setGenre(g.id)} />
                ))}
              </div>
            </Dropdown>
          </div>
        ) : (
          <>
            {/* Service filter (multi-select) */}
            <ServiceFilter />

            {/* Genre filter (Netflix-style) */}
            <div className="no-scrollbar focus-scroller flex items-center gap-2 overflow-x-auto px-4 sm:px-8">
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
                  type={type}
                  providerId={soleService!.providerId}
                  active={brand?.key}
                  onPick={setBrand}
                />
              )}
              {brand ? (
                // Once a brand is picked the user has narrowed to one collection
                // and wants all of it, so show a grid rather than making them
                // drag sideways through a single row. Series tiles show their
                // season posters; collections/studios show their films.
                brand.layout ? (
                  <BrandLayout key={brand.key} layout={brand.layout} />
                ) : brand.seriesId != null ? (
                  <SeasonGrid key={brand.key} seriesId={brand.seriesId} title={brand.name} />
                ) : (
                  <BrandGrid key={brand.key} brand={brand} type={type} providerId={soleService!.providerId} />
                )
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

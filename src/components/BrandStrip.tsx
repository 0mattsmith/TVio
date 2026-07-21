import { useQuery } from "@tanstack/react-query";
import { brandRowKey, type BrandTile } from "../services/serviceLayouts";
import { companiesRow } from "../services/catalog";
import type { MediaType } from "../services/types";

const TMDB_IMG = "https://image.tmdb.org/t/p/w300";

/**
 * A service's sub-brand tiles — Disney+'s Disney / Pixar / Marvel / Star Wars /
 * National Geographic row.
 *
 * Logos come from TMDB's company artwork, the same image API already used for
 * provider icons, so nothing is hotlinked from the services themselves.
 *
 * Selected brings a brand to life; deselected mutes it. The per-brand treatment
 * lives in serviceLayouts.BRAND_STYLES: logos carrying their own colour (Marvel,
 * Nat Geo) sit on the dark tile and are adjusted with filters, while flat dark
 * wordmarks sit on a plate that takes on the brand's colour when picked.
 */
export function BrandStrip({
  brands,
  type,
  providerId,
  active,
  onPick,
}: {
  brands: BrandTile[];
  type: MediaType;
  providerId: number;
  active?: string;
  onPick: (brand?: BrandTile) => void;
}) {
  return (
    <div className="no-scrollbar mb-6 flex gap-3 overflow-x-auto px-4 sm:px-8">
      {brands.map((brand) => (
        <BrandButton
          key={brand.key}
          brand={brand}
          type={type}
          providerId={providerId}
          selected={active === brand.key}
          onPick={onPick}
        />
      ))}
    </div>
  );
}

function BrandButton({
  brand,
  type,
  providerId,
  selected,
  onPick,
}: {
  brand: BrandTile;
  type: MediaType;
  providerId: number;
  selected: boolean;
  onPick: (brand?: BrandTile) => void;
}) {
  // Shares its cache entry with the grid shown once the brand is picked, so
  // this costs nothing extra on selection.
  const q = useQuery({
    queryKey: brandRowKey(type, providerId, brand),
    queryFn: () => companiesRow(type, providerId, brand.companies),
  });

  // Hide a brand with nothing behind it. Walt Disney Pictures has plenty of
  // films and no series, so on the TV Series tab its tile led to an empty page.
  if (!q.isLoading && (q.data?.length ?? 0) === 0) return null;

  const style = brand.style ?? {};
  const url = `${TMDB_IMG}${brand.logoPath}`;
  const tile = selected ? style.tileActive ?? style.tileIdle : style.tileIdle;

  return (
    <button
      onClick={() => onPick(selected ? undefined : brand)}
      aria-label={brand.name}
      aria-pressed={selected}
      style={tile ? { background: tile } : undefined}
      className={`focusable flex h-24 w-40 shrink-0 items-center justify-center rounded-lg border p-5 transition-colors duration-200 ${
        tile ? "" : "bg-gradient-to-b from-surface-2 to-surface"
      } ${selected ? "border-accent" : "border-white/15 hover:border-white/40"}`}
    >
      <img
        src={url}
        alt={brand.name}
        loading="lazy"
        className="max-h-full max-w-full object-contain transition-[filter] duration-200"
        style={{ filter: (selected ? style.filterActive : style.filterIdle) || undefined }}
      />
    </button>
  );
}

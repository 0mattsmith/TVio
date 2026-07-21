import { useQuery } from "@tanstack/react-query";
import { brandRowKey, type BrandTile } from "../services/serviceLayouts";
import { companiesRow } from "../services/catalog";
import type { MediaType } from "../services/types";

const TMDB_IMG = "https://image.tmdb.org/t/p/w300";

/**
 * The tile treatment, modelled on Disney+'s own brand row.
 *
 * One deep blue plate for every tile, and each logo shown in its natural
 * on-dark form — white wordmarks, Marvel's red block, Nat Geo's gold square.
 * Nothing is muted or recoloured: earlier attempts to desaturate at rest and
 * restore colour on selection were the source of every legibility problem,
 * because the artwork is a mix of dark wordmarks and coloured blocks that no
 * single filter suits. Selection is shown by the border, not the artwork.
 */
const PLATE = "linear-gradient(180deg,#1e457f,#0d2549)";
/** Dark wordmarks are knocked out to white so they show on the blue. */
const KNOCKOUT = "brightness(0) invert(1)";

/**
 * A service's sub-brand tiles — Disney+'s Disney / Pixar / Marvel / Star Wars /
 * National Geographic row.
 *
 * Logos come from TMDB's company artwork, the same image API already used for
 * provider icons, so nothing is hotlinked from the services themselves.
 *
 * See PLATE above for the treatment and why it's uniform.
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

  return (
    <button
      onClick={() => onPick(selected ? undefined : brand)}
      aria-label={brand.name}
      aria-pressed={selected}
      style={{ background: PLATE }}
      className={`focusable flex h-24 w-40 shrink-0 items-center justify-center rounded-lg border p-6 transition duration-200 ${
        selected
          ? "border-accent ring-2 ring-accent/50"
          : "border-white/20 hover:border-white/50 hover:brightness-110"
      }`}
    >
      <img
        src={`${TMDB_IMG}${brand.logoPath}`}
        alt={brand.name}
        loading="lazy"
        className="max-h-full max-w-full object-contain"
        style={{ filter: brand.darkArtwork ? KNOCKOUT : undefined }}
      />
    </button>
  );
}

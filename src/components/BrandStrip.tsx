import type { BrandTile } from "../services/serviceLayouts";

/**
 * A service's sub-brand tiles — Disney+'s Disney / Pixar / Marvel / Star Wars /
 * National Geographic row.
 *
 * Logos come from TMDB's company artwork, the same image API already used for
 * provider icons, so nothing is hotlinked from the services themselves. They're
 * knocked out to white so a row of differently-coloured logos reads evenly on
 * the dark background.
 */
export function BrandStrip({
  brands,
  active,
  onPick,
}: {
  brands: BrandTile[];
  active?: string;
  onPick: (brand?: BrandTile) => void;
}) {
  return (
    <div className="no-scrollbar mb-6 flex gap-3 overflow-x-auto px-4 sm:px-8">
      {brands.map((brand) => (
        <button
          key={brand.key}
          onClick={() => onPick(active === brand.key ? undefined : brand)}
          aria-label={brand.name}
          aria-pressed={active === brand.key}
          className={`focusable flex h-24 w-40 shrink-0 items-center justify-center rounded-lg border bg-gradient-to-b from-surface-2 to-surface p-5 transition ${
            active === brand.key ? "border-accent" : "border-white/15 hover:border-white/40"
          }`}
        >
          <img
            src={`https://image.tmdb.org/t/p/w300${brand.logoPath}`}
            alt={brand.name}
            loading="lazy"
            className="max-h-full max-w-full object-contain brightness-0 invert"
          />
        </button>
      ))}
    </div>
  );
}

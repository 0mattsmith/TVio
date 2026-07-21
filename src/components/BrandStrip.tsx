import type { BrandTile } from "../services/serviceLayouts";

/**
 * A service's sub-brand tiles — Disney+'s Disney / Pixar / Marvel / Star Wars /
 * National Geographic row.
 *
 * Logos come from TMDB's company artwork, the same image API already used for
 * provider icons, so nothing is hotlinked from the services themselves.
 *
 * Selected shows the logo in its real colours; deselected desaturates it. The
 * artwork falls into two kinds and they need opposite handling: coloured blocks
 * (Marvel's red, Nat Geo's yellow) sit straight on the dark tile, while dark
 * wordmarks (Disney, Pixar, Lucasfilm) would vanish there and get a light plate
 * behind them instead. Forcing everything to white — the previous approach —
 * turned Marvel's logo into a blank rectangle.
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
      {brands.map((brand) => {
        const selected = active === brand.key;
        const plate = brand.darkArtwork
          ? selected
            ? "bg-white"
            : "bg-white/60"
          : "bg-gradient-to-b from-surface-2 to-surface";

        return (
          <button
            key={brand.key}
            onClick={() => onPick(selected ? undefined : brand)}
            aria-label={brand.name}
            aria-pressed={selected}
            className={`focusable flex h-24 w-40 shrink-0 items-center justify-center rounded-lg border p-5 transition ${plate} ${
              selected ? "border-accent" : "border-white/15 hover:border-white/40"
            }`}
          >
            <img
              src={`https://image.tmdb.org/t/p/w300${brand.logoPath}`}
              alt={brand.name}
              loading="lazy"
              className={`max-h-full max-w-full object-contain transition ${
                selected ? "" : "opacity-80 grayscale"
              }`}
            />
          </button>
        );
      })}
    </div>
  );
}

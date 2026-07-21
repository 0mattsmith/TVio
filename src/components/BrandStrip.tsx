import type { BrandTile } from "../services/serviceLayouts";

const TMDB_IMG = "https://image.tmdb.org/t/p/w300";

/**
 * A service's sub-brand tiles — Disney+'s Disney / Pixar / Marvel / Star Wars /
 * National Geographic row.
 *
 * Logos come from TMDB's company artwork, the same image API already used for
 * provider icons, so nothing is hotlinked from the services themselves.
 *
 * Selected shows a brand in its own colours; deselected drops to grey. How that
 * is achieved differs by artwork, which is why the treatment lives in
 * serviceLayouts.BRAND_STYLES rather than here: flat wordmarks are painted
 * through a CSS mask so they can be tinted freely, while logos that already
 * carry colour stay as images and are adjusted with filters.
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
        const style = brand.style ?? {};
        const url = `${TMDB_IMG}${brand.logoPath}`;

        const tile = selected ? style.tileActive ?? style.tileIdle : style.tileIdle;

        return (
          <button
            key={brand.key}
            onClick={() => onPick(selected ? undefined : brand)}
            aria-label={brand.name}
            aria-pressed={selected}
            style={tile ? { background: tile } : undefined}
            className={`focusable flex h-24 w-40 shrink-0 items-center justify-center rounded-lg border p-5 transition-colors duration-200 ${
              tile ? "" : "bg-gradient-to-b from-surface-2 to-surface"
            } ${selected ? "border-accent" : "border-white/15 hover:border-white/40"}`}
          >
            {style.mono ? (
              // Painted through a mask: the PNG supplies the shape, the
              // background supplies the colour. Lets a flat black wordmark be
              // grey at rest and gold (or Disney blue) when picked.
              <div
                aria-hidden
                className="h-full w-full transition-[background] duration-200"
                style={{
                  background: (selected ? style.fillActive : style.fillIdle) ?? "#ffffff",
                  WebkitMaskImage: `url("${url}")`,
                  maskImage: `url("${url}")`,
                  WebkitMaskRepeat: "no-repeat",
                  maskRepeat: "no-repeat",
                  WebkitMaskPosition: "center",
                  maskPosition: "center",
                  WebkitMaskSize: "contain",
                  maskSize: "contain",
                }}
              />
            ) : (
              <img
                src={url}
                alt={brand.name}
                loading="lazy"
                className="max-h-full max-w-full object-contain transition-[filter] duration-200"
                style={{ filter: (selected ? style.filterActive : style.filterIdle) || undefined }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

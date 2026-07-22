import { useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { brandRowKey, brandItemsLoader, type BrandTile } from "../services/serviceLayouts";
import type { MediaItem, MediaType } from "../services/types";

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
    <div className="no-scrollbar focus-scroller mb-6 flex gap-3 overflow-x-auto px-4 sm:px-8">
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
  // Company/collection tiles carry a MediaItem[] loader, shared with the grid
  // shown once the brand is picked (so selection costs nothing extra) and used
  // to hide empties. Series tiles have no such loader — they're always
  // populated — so their query is disabled and the emptiness check skipped.
  const loader = brandItemsLoader(type, providerId, brand);
  const q = useQuery({
    queryKey: brandRowKey(type, providerId, brand),
    queryFn: loader ?? (() => Promise.resolve<MediaItem[]>([])),
    enabled: Boolean(loader),
  });

  // Hide a brand with nothing behind it. Walt Disney Pictures has plenty of
  // films and no series, so on the TV Series tab its tile led to an empty page.
  if (loader && !q.isLoading && (q.data?.length ?? 0) === 0) return null;

  return (
    <button
      onClick={() => onPick(selected ? undefined : brand)}
      aria-label={brand.name}
      aria-pressed={selected}
      style={{ background: PLATE }}
      className={`focusable relative flex h-24 w-40 shrink-0 items-center justify-center rounded-lg border p-6 transition duration-200 ${
        selected
          ? "border-accent ring-2 ring-accent/60"
          : "border-white/20 hover:border-white/50 hover:brightness-110"
      }`}
    >
      {brand.logoPath ? (
        <img
          src={`${TMDB_IMG}${brand.logoPath}`}
          alt={brand.name}
          loading="lazy"
          className={`max-h-full max-w-full object-contain transition-opacity ${selected ? "" : "opacity-95"}`}
          style={{ filter: brand.darkArtwork ? KNOCKOUT : undefined }}
        />
      ) : (
        // Collection/series tiles have no studio logo — set the name in type.
        <span className="text-center text-base font-extrabold uppercase leading-tight tracking-wide text-white">
          {brand.name}
        </span>
      )}
      {/* Clear-but-subtle "this one's on" marker. Click the tile again to clear
          it — the badge (and accent border) is the only cue that it's active,
          so it stays inside the tile bounds (the strip clips vertical overflow). */}
      {selected && (
        <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-black shadow ring-2 ring-[#0d2549]">
          <Check size={12} strokeWidth={3} />
        </span>
      )}
    </button>
  );
}

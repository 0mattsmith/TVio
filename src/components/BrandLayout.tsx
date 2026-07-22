import { useQuery } from "@tanstack/react-query";
import { Row } from "./Row";
import { SeasonGrid } from "./SeasonGrid";
import { discoverRow } from "../services/catalog";
import type { BrandRowSpec } from "../services/serviceLayouts";

function DiscoverRow({
  rowKey,
  title,
  spec,
}: {
  rowKey: string;
  title: string;
  spec: NonNullable<BrandRowSpec["discover"]>;
}) {
  const q = useQuery({
    queryKey: ["brand-discover", rowKey, spec.mediaType],
    queryFn: () => discoverRow(spec.mediaType, spec),
  });
  return <Row title={title} items={q.data} loading={q.isLoading} />;
}

/**
 * A layout tile's own home — a stack of rows rather than a single grid. Used by
 * the WWE tile: flagship shows as season strips, events as films, plus docs and
 * classics. Each row is an independent, lazily-cached query.
 */
export function BrandLayout({ layout }: { layout: BrandRowSpec[] }) {
  return (
    <>
      {layout.map((row) =>
        row.seriesSeasons != null ? (
          <SeasonGrid key={row.key} seriesId={row.seriesSeasons} title={row.title} variant="row" />
        ) : row.discover ? (
          <DiscoverRow key={row.key} rowKey={row.key} title={row.title} spec={row.discover} />
        ) : null
      )}
    </>
  );
}

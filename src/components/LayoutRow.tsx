import { useQuery } from "@tanstack/react-query";
import { Row } from "./Row";
import type { ResolvedRow } from "../services/serviceLayouts";

/** One row from a service's own layout. Each fetches independently and lazily. */
export function LayoutRow({ row }: { row: ResolvedRow }) {
  const q = useQuery({ queryKey: ["layout-row", row.key], queryFn: row.load });
  return <Row title={row.title} items={q.data} loading={q.isLoading} />;
}

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search as SearchIcon } from "lucide-react";
import { searchAll } from "../services/catalog";
import { PosterCard } from "../components/PosterCard";

export function SearchPage() {
  const [q, setQ] = useState("");
  const { data, isFetching } = useQuery({
    queryKey: ["search", q],
    queryFn: () => searchAll(q),
    enabled: q.trim().length > 1,
  });

  return (
    <div className="animate-fade-in px-4 pt-24 sm:px-8">
      <div className="mx-auto flex max-w-2xl items-center gap-3 rounded-xl border border-white/10 bg-surface-2 px-4 py-3">
        <SearchIcon className="text-muted" size={20} />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search movies, TV series, people…"
          className="w-full bg-transparent text-lg text-white outline-none placeholder:text-muted"
        />
      </div>

      {isFetching && <p className="mt-8 text-center text-sm text-muted">Searching…</p>}

      <div className="mx-auto mt-8 flex max-w-6xl flex-wrap justify-center gap-2.5 pb-16">
        {(data || []).map((m) => (
          <PosterCard key={`${m.type}-${m.id}`} item={m} />
        ))}
        {q.trim().length > 1 && !isFetching && (data || []).length === 0 && (
          <p className="text-sm text-muted">No results.</p>
        )}
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search as SearchIcon, X, Clock, TrendingUp } from "lucide-react";
import { searchAll, trendingRow } from "../services/catalog";
import { PosterCard } from "../components/PosterCard";
import { useAppStore } from "../store/useAppStore";

export function SearchPage() {
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const searchHistory = useAppStore((s) => s.searchHistory);
  const addSearch = useAppStore((s) => s.addSearch);
  const removeSearch = useAppStore((s) => s.removeSearch);
  const clearSearchHistory = useAppStore((s) => s.clearSearchHistory);

  const { data, isFetching } = useQuery({
    queryKey: ["search", q],
    queryFn: () => searchAll(q),
    enabled: q.trim().length > 1,
  });

  // Suggestions for the empty state — a mix of what's trending across film + TV.
  const trendMovies = useQuery({ queryKey: ["trending", "movie"], queryFn: () => trendingRow("movie") });
  const trendTv = useQuery({ queryKey: ["trending", "tv"], queryFn: () => trendingRow("tv") });
  const trending = (() => {
    const seen = new Set<string>();
    const out = [];
    const a = trendMovies.data ?? [];
    const b = trendTv.data ?? [];
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      for (const m of [a[i], b[i]]) {
        if (!m) continue;
        const k = `${m.type}-${m.id}`;
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(m);
      }
    }
    return out.slice(0, 18);
  })();

  // Focus the box on arrival. Essential on a TV: without it the D-pad has
  // nothing selected and the field, though reachable, isn't obviously the
  // starting point. (The TV text-entry guard keeps it highlighted-but-inert
  // until OK is pressed, which is the intended "ready to type" state.)
  useEffect(() => {
    const t = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(t);
  }, []);

  // Remember a search once it actually returns something and the user pauses —
  // avoids Enter (which on TV means "edit this field", not "submit").
  useEffect(() => {
    if (q.trim().length <= 1 || (data?.length ?? 0) === 0) return;
    const t = setTimeout(() => addSearch(q), 1400);
    return () => clearTimeout(t);
  }, [q, data, addSearch]);

  const empty = q.trim().length <= 1;

  return (
    <div className="animate-fade-in px-4 pt-24 sm:px-8">
      <div className="mx-auto flex max-w-2xl items-center gap-3 rounded-xl border border-white/10 bg-surface-2 px-4 py-3 transition-colors focus-within:border-accent">
        <SearchIcon className="text-muted" size={20} />
        <input
          ref={inputRef}
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search movies, TV series, people…"
          className="focusable w-full bg-transparent text-lg text-white outline-none placeholder:text-muted"
        />
        {q && (
          <button onClick={() => { setQ(""); inputRef.current?.focus(); }} className="focusable rounded-full p-1 text-muted hover:text-white" aria-label="Clear search">
            <X size={18} />
          </button>
        )}
      </div>

      {isFetching && <p className="mt-8 text-center text-sm text-muted">Searching…</p>}

      {empty ? (
        <div className="mx-auto mt-8 max-w-6xl pb-16">
          {searchHistory.length > 0 && (
            <section className="mb-8">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-muted">
                  <Clock size={15} /> Recent searches
                </h2>
                <button onClick={clearSearchHistory} className="focusable text-xs font-semibold text-accent hover:underline">
                  Clear all
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {searchHistory.map((term) => (
                  <span key={term} className="flex items-center overflow-hidden rounded-full border border-white/15 bg-surface-2">
                    <button onClick={() => setQ(term)} className="focusable py-1.5 pl-3.5 pr-2 text-sm font-semibold text-white hover:text-accent">
                      {term}
                    </button>
                    <button onClick={() => removeSearch(term)} className="focusable py-1.5 pr-2.5 text-muted hover:text-white" aria-label={`Remove ${term}`}>
                      <X size={14} />
                    </button>
                  </span>
                ))}
              </div>
            </section>
          )}

          <section>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-muted">
              <TrendingUp size={15} /> Trending now
            </h2>
            {trending.length > 0 ? (
              <div className="flex flex-wrap justify-center gap-2.5 sm:justify-start">
                {trending.map((m) => (
                  <PosterCard key={`${m.type}-${m.id}`} item={m} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted">Loading suggestions…</p>
            )}
          </section>
        </div>
      ) : (
        <div className="mx-auto mt-8 flex max-w-6xl flex-wrap justify-center gap-2.5 pb-16">
          {(data || []).map((m) => (
            <PosterCard key={`${m.type}-${m.id}`} item={m} />
          ))}
          {q.trim().length > 1 && !isFetching && (data || []).length === 0 && (
            <p className="text-sm text-muted">No results.</p>
          )}
        </div>
      )}
    </div>
  );
}

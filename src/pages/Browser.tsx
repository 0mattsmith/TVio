import { useState } from "react";
import { Globe, Search, Star, Plus, X, Trash2, History as HistoryIcon, ArrowUpRight } from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import { openBrowser, toUrl, nativeBrowserAvailable } from "../services/tvioBrowser";

// Content-neutral starting points, shown until the user builds up their own bookmarks.
const QUICK_LINKS = [
  { title: "DuckDuckGo", url: "https://duckduckgo.com" },
  { title: "Wikipedia", url: "https://www.wikipedia.org" },
  { title: "YouTube", url: "https://www.youtube.com" },
  { title: "BBC News", url: "https://www.bbc.com/news" },
];

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function favicon(url: string): string {
  return `https://icons.duckduckgo.com/ip3/${hostOf(url)}.ico`;
}

/** A favicon + label tile that opens a URL. */
function LinkTile({ title, url, onOpen, onRemove }: { title: string; url: string; onOpen: () => void; onRemove?: () => void }) {
  return (
    <div className="group/tile relative">
      <button
        onClick={onOpen}
        className="focusable flex h-full w-full flex-col items-center gap-2 rounded-xl border border-white/10 bg-surface-2 p-4 text-center transition-transform hover:scale-[1.03]"
      >
        <img
          src={favicon(url)}
          alt=""
          className="h-10 w-10 rounded"
          onError={(e) => (e.currentTarget.style.visibility = "hidden")}
        />
        <span className="line-clamp-2 text-xs font-semibold">{title}</span>
        <span className="line-clamp-1 text-[10px] text-muted">{hostOf(url)}</span>
      </button>
      {onRemove && (
        <button
          onClick={onRemove}
          aria-label={`Remove ${title}`}
          className="focusable absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-surface text-muted opacity-0 shadow ring-1 ring-white/15 transition-opacity focus:opacity-100 focus:text-red-500 group-hover/tile:opacity-100"
        >
          <X size={13} />
        </button>
      )}
    </div>
  );
}

export function Browser() {
  const bookmarks = useAppStore((s) => s.bookmarks);
  const addBookmark = useAppStore((s) => s.addBookmark);
  const removeBookmark = useAppStore((s) => s.removeBookmark);
  const history = useAppStore((s) => s.browserHistory);
  const addHistory = useAppStore((s) => s.addHistory);
  const clearHistory = useAppStore((s) => s.clearHistory);

  const [addr, setAddr] = useState("");
  const isNative = nativeBrowserAvailable();

  const go = (raw: string) => {
    const url = toUrl(raw);
    if (!url) return;
    addHistory({ title: hostOf(url), url });
    void openBrowser(url);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    go(addr);
  };

  return (
    <div className="animate-fade-in px-4 pb-16 pt-24 sm:px-8">
      <div className="mb-5 flex items-center gap-3">
        <Globe className="text-accent" />
        <h1 className="text-3xl font-black tracking-tight">Browser</h1>
      </div>

      {/* Address / search bar */}
      <form onSubmit={submit} className="mb-2 flex items-center gap-2">
        <div className="flex flex-1 items-center gap-2 rounded-xl border border-white/10 bg-surface-2 px-4 py-3 focus-within:border-accent focus-within:shadow-[0_0_0_2px_#14b8a6,0_0_24px_rgba(20,184,166,0.35)]">
          <Search size={18} className="shrink-0 text-muted" />
          <input
            value={addr}
            onChange={(e) => setAddr(e.target.value)}
            placeholder="Search or enter a web address"
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted"
          />
        </div>
        <button type="submit" className="focusable rounded-xl bg-accent px-5 py-3 text-sm font-bold text-black">
          Go
        </button>
        <button
          type="button"
          onClick={() => addr.trim() && addBookmark({ title: hostOf(toUrl(addr)), url: toUrl(addr) })}
          disabled={!addr.trim()}
          aria-label="Bookmark this address"
          className="focusable rounded-xl border border-white/15 bg-surface-2 px-4 py-3 text-sm font-semibold disabled:opacity-40"
        >
          <Star size={16} />
        </button>
      </form>
      <p className="mb-8 text-xs text-muted">
        {isNative
          ? "Opens in TVio's TV browser — press the remote's Play button on any video to watch it in our player."
          : "On this build, links open in your system browser. The full in-app browser is on the Android / TV app."}
      </p>

      {/* Quick links */}
      <section className="mb-8">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted">Quick links</h2>
        <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-6">
          {QUICK_LINKS.map((q) => (
            <LinkTile key={q.url} title={q.title} url={q.url} onOpen={() => go(q.url)} />
          ))}
        </div>
      </section>

      {/* Bookmarks */}
      <section className="mb-8">
        <div className="mb-3 flex items-center gap-2">
          <Star size={15} className="text-accent" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted">Bookmarks</h2>
        </div>
        {bookmarks.length === 0 ? (
          <div className="flex items-center gap-2 rounded-xl border border-dashed border-white/15 bg-surface-2/50 px-4 py-5 text-sm text-muted">
            <Plus size={15} /> Search for a site above and tap the star to save it here.
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-6">
            {bookmarks.map((b) => (
              <LinkTile key={b.id} title={b.title} url={b.url} onOpen={() => go(b.url)} onRemove={() => removeBookmark(b.id)} />
            ))}
          </div>
        )}
      </section>

      {/* Recent history */}
      {history.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <HistoryIcon size={15} className="text-accent" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-muted">Recent</h2>
            </div>
            <button onClick={clearHistory} className="focusable flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold text-muted hover:text-white">
              <Trash2 size={13} /> Clear
            </button>
          </div>
          <div className="space-y-1.5">
            {history.slice(0, 20).map((h) => (
              <button
                key={`${h.url}-${h.at}`}
                onClick={() => go(h.url)}
                className="focusable flex w-full items-center gap-3 rounded-lg bg-surface-2 px-3 py-2 text-left hover:bg-white/10"
              >
                <img src={favicon(h.url)} alt="" className="h-5 w-5 shrink-0 rounded" onError={(e) => (e.currentTarget.style.visibility = "hidden")} />
                <span className="min-w-0 flex-1 truncate text-sm">{h.title}</span>
                <span className="hidden truncate text-xs text-muted sm:block">{hostOf(h.url)}</span>
                <ArrowUpRight size={14} className="shrink-0 text-muted" />
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

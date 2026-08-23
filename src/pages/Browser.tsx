import { useState } from "react";
import { Globe, Search, Star, Plus, Trash2, Pencil, Check } from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import { openBrowser, toUrl, nativeBrowserAvailable } from "../services/tvioBrowser";

// Content-neutral starting points, shown alongside the user's own bookmarks.
const QUICK_LINKS = [
  { title: "DuckDuckGo", url: "https://duckduckgo.com" },
  { title: "Wikipedia", url: "https://www.wikipedia.org" },
  { title: "YouTube", url: "https://www.youtube.com" },
  { title: "BBC News", url: "https://www.bbc.com/news" },
  { title: "Reddit", url: "https://www.reddit.com" },
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

/**
 * A speed-dial tile. The whole tile is the single focus target (so a remote
 * lands on it, not on a tiny secondary button), and its action switches with
 * the mode: open the site, or — in a bookmarks Edit pass — remove it.
 */
function Tile({ title, url, remove, onClick }: { title: string; url: string; remove?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`focusable flex w-36 shrink-0 flex-col items-center gap-2 rounded-2xl border p-4 text-center transition-transform hover:scale-[1.03] sm:w-40 ${
        remove ? "border-red-500/40 bg-red-500/10" : "border-white/10 bg-surface-2"
      }`}
    >
      <div className="relative flex h-12 w-12 items-center justify-center rounded-xl bg-surface">
        <img src={favicon(url)} alt="" className="h-9 w-9 rounded" onError={(e) => (e.currentTarget.style.visibility = "hidden")} />
        {remove && (
          <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/55">
            <Trash2 size={18} className="text-red-300" />
          </div>
        )}
      </div>
      <span className="line-clamp-1 w-full text-xs font-bold">{title}</span>
      <span className="line-clamp-1 w-full text-[10px] text-muted">{hostOf(url)}</span>
    </button>
  );
}

/** One horizontal, remote-friendly row of tiles (mirrors the app's content rows). */
function TileRow({ children }: { children: React.ReactNode }) {
  return <div className="no-scrollbar focus-scroller flex gap-3 overflow-x-auto px-4 sm:px-8">{children}</div>;
}

function SectionHeader({ icon, title, action }: { icon: React.ReactNode; title: string; action?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between px-4 sm:px-8">
      <div className="flex items-center gap-2">
        <span className="text-accent">{icon}</span>
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted">{title}</h2>
      </div>
      {action}
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
  const [editing, setEditing] = useState(false);
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
    <div className="animate-fade-in pb-16 pt-24">
      {/* Hero header + big central search — BrowseHere-style, TVio-branded. */}
      <div className="mb-8 flex flex-col items-center px-4 text-center sm:px-8">
        <div className="mb-4 flex items-center gap-2.5">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent-soft">
            <Globe className="text-accent" size={24} />
          </div>
          <h1 className="text-3xl font-black tracking-tight">
            TV<span className="text-accent">io</span> Browser
          </h1>
        </div>

        <form onSubmit={submit} className="flex w-full max-w-2xl items-center gap-2">
          <div className="flex flex-1 items-center gap-2.5 rounded-2xl border border-white/10 bg-surface-2 px-5 py-3.5 focus-within:border-accent focus-within:shadow-[0_0_0_2px_#14b8a6,0_0_28px_rgba(20,184,166,0.35)]">
            <Search size={20} className="shrink-0 text-muted" />
            <input
              value={addr}
              onChange={(e) => setAddr(e.target.value)}
              placeholder="Search the web or enter an address"
              inputMode="url"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              className="w-full bg-transparent text-base outline-none placeholder:text-muted"
            />
          </div>
          <button type="submit" className="focusable rounded-2xl bg-accent px-6 py-3.5 text-sm font-bold text-black">
            Go
          </button>
          <button
            type="button"
            onClick={() => addr.trim() && addBookmark({ title: hostOf(toUrl(addr)), url: toUrl(addr) })}
            disabled={!addr.trim()}
            aria-label="Bookmark this address"
            className="focusable rounded-2xl border border-white/15 bg-surface-2 px-4 py-3.5 disabled:opacity-40"
          >
            <Star size={18} />
          </button>
        </form>
        <p className="mt-3 max-w-2xl text-xs text-muted">
          {isNative
            ? "Opens in TVio's TV browser — a video is offered to our player automatically, or press the remote's Play key."
            : "On this build, links open in your system browser. The full in-app browser is on the Android / TV app."}
        </p>
      </div>

      {/* Bookmarks */}
      <section className="mb-8">
        <SectionHeader
          icon={<Star size={15} />}
          title="Bookmarks"
          action={
            bookmarks.length > 0 ? (
              <button
                onClick={() => setEditing((v) => !v)}
                className="focusable flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold text-muted hover:text-white"
              >
                {editing ? <><Check size={13} /> Done</> : <><Pencil size={13} /> Edit</>}
              </button>
            ) : undefined
          }
        />
        {bookmarks.length === 0 ? (
          <div className="mx-4 flex items-center gap-2 rounded-2xl border border-dashed border-white/15 bg-surface-2/50 px-4 py-5 text-sm text-muted sm:mx-8">
            <Plus size={15} /> Search for a site above and tap the star to pin it here.
          </div>
        ) : (
          <TileRow>
            {bookmarks.map((b) => (
              <Tile
                key={b.id}
                title={editing ? "Remove" : b.title}
                url={b.url}
                remove={editing}
                onClick={() => (editing ? removeBookmark(b.id) : go(b.url))}
              />
            ))}
          </TileRow>
        )}
      </section>

      {/* Quick links */}
      <section className="mb-8">
        <SectionHeader icon={<Globe size={15} />} title="Quick links" />
        <TileRow>
          {QUICK_LINKS.map((q) => (
            <Tile key={q.url} title={q.title} url={q.url} onClick={() => go(q.url)} />
          ))}
        </TileRow>
      </section>

      {/* Recent */}
      {history.length > 0 && (
        <section>
          <SectionHeader
            icon={<Search size={15} />}
            title="Recent"
            action={
              <button onClick={clearHistory} className="focusable flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold text-muted hover:text-white">
                <Trash2 size={13} /> Clear
              </button>
            }
          />
          <TileRow>
            {history.slice(0, 20).map((h) => (
              <Tile key={`${h.url}-${h.at}`} title={h.title} url={h.url} onClick={() => go(h.url)} />
            ))}
          </TileRow>
        </section>
      )}
    </div>
  );
}

// Bridge to the native TV web browser (android-src/TvioBrowserActivity.java via
// the TvioBrowser Capacitor plugin). On Android it opens a full-screen WebView
// with ad/tracker blocking and a "Play in TVio" hand-off to the native player.
//
// On web/desktop there is no in-app browser — external sites can't be framed
// (X-Frame-Options / CSP), and there's no native player to hand a video to — so
// links open out in the system browser instead.

interface TvioBrowserPlugin {
  open(opts: { url: string; isolate?: boolean; hideChrome?: boolean; name?: string; hide?: string }): Promise<void>;
  pickFile(): Promise<{ url?: string; name?: string }>;
  pickElements(opts: { url: string }): Promise<{ selectors?: string[] }>;
}

interface CapacitorGlobal {
  getPlatform?: () => string;
  isPluginAvailable?: (name: string) => boolean;
  Plugins?: { TvioBrowser?: TvioBrowserPlugin };
}

function cap(): CapacitorGlobal | undefined {
  return (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
}

/** True only when the native browser plugin is really present (Android build). */
export function nativeBrowserAvailable(): boolean {
  const c = cap();
  if (!c?.getPlatform || c.getPlatform() !== "android") return false;
  return c.isPluginAvailable ? c.isPluginAvailable("TvioBrowser") : false;
}

/**
 * Turn whatever the user typed into a URL: an address (or bare domain) becomes
 * an https:// link; anything else becomes a DuckDuckGo search — privacy-first,
 * and it renders cleanly on a TV.
 */
export function toUrl(input: string): string {
  const q = input.trim();
  if (!q) return "";
  // Already an absolute address or a local resource — leave it untouched, so a
  // local file is never turned into an https:// address or a web search.
  if (/^(https?|file|content|data):/i.test(q)) return q;
  // A local filesystem path → open it as a file:// URL:
  //   Windows drive path (C:\… or C:/…), or a POSIX path to an .html/.htm file.
  if (/^[a-zA-Z]:[\\/]/.test(q)) return "file:///" + q.replace(/\\/g, "/");
  if (/^\//.test(q) && /\.html?($|[?#])/i.test(q)) return "file://" + q;
  // A domain-like token (has a dot, no spaces) is treated as a site.
  if (/^[^\s]+\.[^\s]{2,}(\/.*)?$/.test(q)) return `https://${q}`;
  return `https://duckduckgo.com/?q=${encodeURIComponent(q)}`;
}

/**
 * Open a URL: full-screen native WebView on Android, a new tab elsewhere.
 * `isolate` strips the page down to just its media player (native only).
 */
export async function openBrowser(
  rawUrl: string,
  opts?: { isolate?: boolean; hideChrome?: boolean; name?: string; hiddenSelectors?: string[] }
): Promise<void> {
  const url = toUrl(rawUrl);
  if (!url) return;
  const plugin = cap()?.Plugins?.TvioBrowser;
  if (plugin) {
    await plugin.open({
      url,
      isolate: opts?.isolate,
      hideChrome: opts?.hideChrome,
      name: opts?.name,
      hide: opts?.hiddenSelectors?.length ? opts.hiddenSelectors.join("\n") : undefined,
    });
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

/**
 * Native "customise" flow: opens the page and lets the user tick page elements
 * to remove, returning the chosen CSS selectors. Empty if unavailable/cancelled.
 */
export async function pickElements(rawUrl: string): Promise<string[]> {
  const url = toUrl(rawUrl);
  const plugin = cap()?.Plugins?.TvioBrowser;
  if (!url || !plugin?.pickElements) return [];
  try {
    const r = await plugin.pickElements({ url });
    return Array.isArray(r?.selectors) ? r.selectors : [];
  } catch {
    return [];
  }
}

/** "south-park.html" → "South Park": drop the extension, split on -/_, Title Case. */
export function prettyTitle(filename: string): string {
  const base = filename.replace(/\.[a-z0-9]+$/i, "");
  const words = base.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim().split(" ");
  return words.map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join(" ") || "Local page";
}

/**
 * Native document picker for a local .html file (Android). Returns the picked
 * file's content:// URI (with a persisted read grant) and a tidied display name,
 * or null if unavailable or cancelled — so a local page can be a web channel.
 */
export async function pickLocalHtml(): Promise<{ url: string; name: string } | null> {
  const plugin = cap()?.Plugins?.TvioBrowser;
  if (!plugin?.pickFile) return null;
  try {
    const r = await plugin.pickFile();
    return r?.url ? { url: r.url, name: prettyTitle(r.name || "Local page") } : null;
  } catch {
    return null;
  }
}

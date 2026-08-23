// Bridge to the native TV web browser (android-src/TvioBrowserActivity.java via
// the TvioBrowser Capacitor plugin). On Android it opens a full-screen WebView
// with ad/tracker blocking and a "Play in TVio" hand-off to the native player.
//
// On web/desktop there is no in-app browser — external sites can't be framed
// (X-Frame-Options / CSP), and there's no native player to hand a video to — so
// links open out in the system browser instead.

interface TvioBrowserPlugin {
  open(opts: { url: string }): Promise<void>;
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
  if (/^https?:\/\//i.test(q)) return q;
  // A domain-like token (has a dot, no spaces) is treated as a site.
  if (/^[^\s]+\.[^\s]{2,}(\/.*)?$/.test(q)) return `https://${q}`;
  return `https://duckduckgo.com/?q=${encodeURIComponent(q)}`;
}

/** Open a URL: full-screen native WebView on Android, a new tab elsewhere. */
export async function openBrowser(rawUrl: string): Promise<void> {
  const url = toUrl(rawUrl);
  if (!url) return;
  const plugin = cap()?.Plugins?.TvioBrowser;
  if (plugin) await plugin.open({ url });
  else window.open(url, "_blank", "noopener,noreferrer");
}

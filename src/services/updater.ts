// Automatic updates.
//
// Windows (Tauri): fully silent — the updater plugin checks a signed latest.json
// published with each GitHub Release, downloads in the background, installs, and
// relaunches. No user interaction.
//
// Android / Android TV (Capacitor): Android does NOT permit a sideloaded app to
// install an APK silently — the OS always shows its own install confirmation.
// So the best possible is: check GitHub Releases in the background, and offer a
// one-tap update. (See BUILD.md for the fully-hands-off alternative: Obtainium.)
//
// Web / PWA: handled by the service worker; nothing to do here.

const RELEASES_API = "https://api.github.com/repos/0mattsmith/TVio/releases/latest";

export interface UpdateInfo {
  version: string;
  notes?: string;
  /** Android only: the APK to download. */
  apkUrl?: string;
}

function isTauri(): boolean {
  const w = window as unknown as { __TAURI__?: unknown; __TAURI_INTERNALS__?: unknown };
  return Boolean(w.__TAURI__ || w.__TAURI_INTERNALS__);
}

function isCapacitor(): boolean {
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return Boolean(cap && (cap.isNativePlatform ? cap.isNativePlatform() : true));
}

/** Semver-ish compare: returns true when `remote` is newer than `local`. */
function isNewer(remote: string, local: string): boolean {
  const norm = (v: string) => v.replace(/^v/, "").split(/[.-]/).map((n) => parseInt(n, 10) || 0);
  const a = norm(remote);
  const b = norm(local);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] || 0) > (b[i] || 0)) return true;
    if ((a[i] || 0) < (b[i] || 0)) return false;
  }
  return false;
}

/**
 * Windows: download + install + relaunch, silently. Resolves false if there was
 * nothing to do. Safe to call on every launch.
 */
async function runTauriUpdate(): Promise<boolean> {
  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    const update = await check();
    if (!update) return false;
    await update.downloadAndInstall();
    const { relaunch } = await import("@tauri-apps/plugin-process");
    await relaunch();
    return true;
  } catch {
    return false; // offline, unsigned build, or no endpoint — never block startup
  }
}

/** Android: look for a newer release and return its APK (install needs a tap). */
async function checkAndroidUpdate(currentVersion: string): Promise<UpdateInfo | null> {
  try {
    const res = await fetch(RELEASES_API, { headers: { accept: "application/vnd.github+json" } });
    if (!res.ok) return null;
    const rel = await res.json();
    const tag: string = rel.tag_name || "";
    if (!tag || !isNewer(tag, currentVersion)) return null;

    // Prefer the TV build on a TV, otherwise the mobile APK.
    const assets: { name: string; browser_download_url: string }[] = rel.assets || [];
    const wantTv = /tv/i.test(navigator.userAgent);
    const pick =
      assets.find((a) => (wantTv ? /androidtv/i.test(a.name) : /mobile/i.test(a.name)) && a.name.endsWith(".apk")) ||
      assets.find((a) => a.name.endsWith(".apk"));
    if (!pick) return null;

    return { version: tag, notes: rel.body, apkUrl: pick.browser_download_url };
  } catch {
    return null;
  }
}

/**
 * Call once at startup. On Windows this may silently update and relaunch; on
 * Android it resolves with an UpdateInfo the UI can offer as a one-tap update.
 */
export async function autoUpdate(currentVersion: string): Promise<UpdateInfo | null> {
  if (isTauri()) {
    await runTauriUpdate();
    return null; // either it relaunched, or there was nothing to do
  }
  if (isCapacitor()) return checkAndroidUpdate(currentVersion);
  return null; // web/PWA updates via the service worker
}

// --- Android install path ----------------------------------------------------

interface ApkUpdaterPlugin {
  canInstall: () => Promise<{ allowed: boolean }>;
  openInstallSettings: () => Promise<void>;
  downloadAndInstall: (opts: { url: string }) => Promise<void>;
  addListener: (event: string, cb: (data: { progress: number }) => void) => Promise<{ remove: () => void }>;
}

function apkUpdater(): ApkUpdaterPlugin | null {
  const cap = (window as unknown as { Capacitor?: { Plugins?: Record<string, unknown> } }).Capacitor;
  return (cap?.Plugins?.ApkUpdater as ApkUpdaterPlugin) ?? null;
}

/**
 * Downloads the APK in the background, then hands it to Android's installer.
 * Android shows its one-time "install unknown apps" toggle (if not yet granted)
 * followed by its install confirmation — silent installs aren't permitted for
 * sideloaded apps. Falls back to opening the download in a browser.
 */
export async function installApk(url: string, onProgress?: (pct: number) => void): Promise<void> {
  const plugin = apkUpdater();
  if (!plugin) {
    window.open(url, "_blank");
    return;
  }

  let sub: { remove: () => void } | undefined;
  try {
    if (onProgress) {
      sub = await plugin.addListener("downloadProgress", (d) => onProgress(d.progress));
    }
    // Ask for the install permission up front so the download isn't wasted.
    const { allowed } = await plugin.canInstall();
    if (!allowed) await plugin.openInstallSettings();
    await plugin.downloadAndInstall({ url });
  } catch {
    window.open(url, "_blank"); // last resort
  } finally {
    sub?.remove();
  }
}

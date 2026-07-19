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

/** Android: hand the APK to the system installer (shows Android's own prompt). */
export function installApk(url: string) {
  window.open(url, "_blank");
}

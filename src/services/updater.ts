// Automatic updates.
//
// Windows (Tauri): checked at LAUNCH, before the app renders. If an update
// exists it downloads on a small branded splash and relaunches straight into
// the new version — the user never sees a prompt, and never gets interrupted
// mid-session. Fails open: any error or a slow network just launches the app.
//
// Android / Android TV (Capacitor): Android forbids silent installs for
// sideloaded apps, so we download in the background and offer a one-tap install.
//
// Web / PWA: handled by the service worker.

const REPO = "0mattsmith/TVio";
const RELEASES_API = `https://api.github.com/repos/${REPO}/releases`;

export interface UpdateInfo {
  version: string;
  notes?: string;
  /** Android only: the APK to download. */
  apkUrl?: string;
}

export function isTauri(): boolean {
  const w = window as unknown as { __TAURI__?: unknown; __TAURI_INTERNALS__?: unknown };
  return Boolean(w.__TAURI__ || w.__TAURI_INTERNALS__);
}

export function isCapacitor(): boolean {
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return Boolean(cap && (cap.isNativePlatform ? cap.isNativePlatform() : true));
}

/** Which update mechanism this build actually uses. */
export type UpdateChannel = "desktop" | "android" | "web";

export function updateChannel(): UpdateChannel {
  if (isTauri()) return "desktop";
  if (isCapacitor()) return "android";
  return "web";
}

/** Semver-ish compare: true when `remote` is newer than `local`. */
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

// --- Desktop (Tauri) ---------------------------------------------------------

export interface DesktopUpdate {
  version: string;
  notes?: string;
  /** The plugin's Update handle. */
  handle: unknown;
}

/**
 * Looks for a desktop update, throwing if the check itself fails.
 *
 * Use this behind a button, where the user is waiting for an answer and
 * "couldn't reach the update server" is a useful one. A silently swallowed
 * failure here is indistinguishable from "you're up to date", which is how an
 * app can sit on an old version for weeks without a single clue why.
 */
export async function checkDesktopUpdateStrict(): Promise<DesktopUpdate | null> {
  if (!isTauri()) return null;
  const { check } = await import("@tauri-apps/plugin-updater");
  const update = await check();
  if (!update) return null;
  return { version: update.version, notes: update.body, handle: update };
}

/** Same, but never throws — for the launch gate, which must not block startup. */
export async function checkDesktopUpdate(): Promise<DesktopUpdate | null> {
  try {
    return await checkDesktopUpdateStrict();
  } catch {
    return null; // offline, signature mismatch, no endpoint — just launch
  }
}

type DownloadEvent = { event: string; data?: { contentLength?: number; chunkLength?: number } };

/** Turns the plugin's chunk events into a 0-100 percentage. */
function progressReporter(onProgress?: (pct: number) => void) {
  let total = 0;
  let received = 0;
  return (e: DownloadEvent) => {
    if (e.event === "Started") {
      total = e.data?.contentLength ?? 0;
    } else if (e.event === "Progress") {
      received += e.data?.chunkLength ?? 0;
      if (total > 0) onProgress?.(Math.min(99, Math.round((received * 100) / total)));
    } else if (e.event === "Finished") {
      onProgress?.(100);
    }
  };
}

/** Downloads + installs the update, reporting progress, then relaunches. */
export async function runDesktopUpdate(update: DesktopUpdate, onProgress?: (pct: number) => void): Promise<void> {
  const handle = update.handle as {
    downloadAndInstall: (cb: (e: DownloadEvent) => void) => Promise<void>;
  };
  await handle.downloadAndInstall(progressReporter(onProgress));

  const { relaunch } = await import("@tauri-apps/plugin-process");
  await relaunch();
}

/**
 * Fetches the update but stops short of installing it, so the user picks the
 * moment. That matters on Windows: the installer force-exits the app, so an
 * install the user didn't ask for looks exactly like a crash.
 */
export async function downloadDesktopUpdate(update: DesktopUpdate, onProgress?: (pct: number) => void): Promise<void> {
  const handle = update.handle as { download: (cb: (e: DownloadEvent) => void) => Promise<void> };
  await handle.download(progressReporter(onProgress));
}

/**
 * Installs an already-downloaded update. Silent, because the updater is
 * configured with installMode "quiet".
 *
 * Deliberately does NOT relaunch. Windows force-exits the app during install,
 * and the installer restarts it itself; calling relaunch() here races that and
 * can restart a half-written binary, which starts up to an empty black window.
 * At launch time the process is already gone before relaunch() could run, which
 * is why the same pairing is safe there and not here.
 */
export async function installDesktopUpdate(update: DesktopUpdate): Promise<void> {
  const handle = update.handle as { install: () => Promise<void> };
  await handle.install();
}

// --- Android (Capacitor) -----------------------------------------------------

/** Looks for a newer release and returns its APK (install still needs a tap). */
export async function checkAndroidUpdate(currentVersion: string): Promise<UpdateInfo | null> {
  if (!isCapacitor()) return null;
  try {
    const res = await fetch(`${RELEASES_API}/latest`, { headers: { accept: "application/vnd.github+json" } });
    if (!res.ok) return null;
    const rel = await res.json();
    const tag: string = rel.tag_name || "";
    if (!tag || !isNewer(tag, currentVersion)) return null;

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

/** Downloads the APK, then hands it to Android's installer (which prompts). */
export async function installApk(url: string, onProgress?: (pct: number) => void): Promise<void> {
  const plugin = apkUpdater();
  if (!plugin) {
    window.open(url, "_blank");
    return;
  }
  let sub: { remove: () => void } | undefined;
  try {
    if (onProgress) sub = await plugin.addListener("downloadProgress", (d) => onProgress(d.progress));
    const { allowed } = await plugin.canInstall();
    if (!allowed) await plugin.openInstallSettings();
    await plugin.downloadAndInstall({ url });
  } catch {
    window.open(url, "_blank");
  } finally {
    sub?.remove();
  }
}

// --- Release notes ("What's New") --------------------------------------------

/** Fetches the release notes for a version tag. Empty string if unavailable. */
export async function fetchReleaseNotes(version: string): Promise<string> {
  try {
    const tag = version.startsWith("v") ? version : `v${version}`;
    const res = await fetch(`${RELEASES_API}/tags/${tag}`, { headers: { accept: "application/vnd.github+json" } });
    if (!res.ok) return "";
    const rel = await res.json();
    return (rel.body as string) || "";
  } catch {
    return "";
  }
}

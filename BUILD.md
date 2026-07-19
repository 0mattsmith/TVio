# TVio — builds & releases

TVio ships four ways from one codebase:

| Edition | Build | How it's produced |
| --- | --- | --- |
| **TVio Lite** (web / PWA) | GitHub Pages | `deploy-pages.yml` on every push to `main` |
| **TVio** for Windows | Tauri `.msi` / `.exe` | `release.yml` on a `v*` tag |
| **TVio** for Android (phone) | Capacitor `.apk` | `release.yml` on a `v*` tag |
| **TVio** for Android TV | Capacitor `.apk` (leanback) | `release.yml` on a `v*` tag |

The Windows/Android builds report themselves as full **TVio** (all-format playback, companion receiver); the web build brands as **TVio Lite** automatically.

---

## One-time setup

### 1. Repo secrets (Settings → Secrets and variables → Actions)
Add the same `VITE_*` values from your `.env.local` so the deployed apps aren't stuck in demo mode:

```
VITE_TMDB_KEY, VITE_TMDB_TOKEN, VITE_TMDB_REGION, VITE_OMDB_KEY,
VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID, VITE_FIREBASE_APP_ID
```

### 1b. (Recommended) Zero-config data via a TMDB proxy
Anything `VITE_*` is compiled into the client bundle, so a baked-in `VITE_TMDB_KEY` is extractable from the deployed JS. To keep the key private *and* give users a no-setup experience, put it behind the included Cloudflare Worker (`proxy/tmdb-worker.js`, free tier):

1. Cloudflare dashboard → **Workers & Pages → Create → Worker**, paste `proxy/tmdb-worker.js`, Deploy.
2. Worker → **Settings → Variables and Secrets** → add secret `TMDB_KEY` = your TMDB v3 key.
3. GitHub → repo **Settings → Secrets and variables → Actions** → add
   `VITE_TMDB_PROXY = https://<your-worker>.workers.dev/tmdb`
4. **Remove `VITE_TMDB_KEY`** from the GitHub secrets — otherwise the key is still embedded in the bundle.

The app then sends no key from the browser at all, and the first-run "add your TMDB key" step is skipped for everyone. Verify: Settings shows **● Connected (built-in)** and network calls go to `workers.dev` with no `api_key` parameter.

### 2. Enable GitHub Pages
Settings → Pages → **Source: GitHub Actions**. The site publishes at `https://<user>.github.io/TVio/`.

### 2b. Automatic updates

**Windows — fully silent.** Tauri's updater checks a signed `latest.json` attached to each GitHub Release, downloads in the background, installs and relaunches, with no prompts. Set it up once:

```bash
npx @tauri-apps/cli signer generate -w ~/.tauri/tvio.key
```

- Paste the **public** key into `src-tauri/tauri.conf.json` → `plugins.updater.pubkey`.
- Add the **private** key + its password as GitHub secrets:
  `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.

Without these the app still builds — it just won't self-update.

**Android / Android TV — one tap, not silent.** Android does *not* allow a sideloaded app to install an APK silently; the OS always shows its own install confirmation. TVio therefore checks GitHub Releases in the background and shows a small "Update available → Update now" prompt. For genuinely hands-off updates, install the APK via **[Obtainium](https://github.com/ImranR98/Obtainium)** pointed at this repo — it tracks Releases and updates automatically.

### 3. Desktop app icons + installer artwork
CI generates both the app icon and the branded installer graphics on every release. To make builds fully reproducible (or to hand-craft the art), generate once locally and commit the results:

```bash
npm install --no-save sharp
npm run gen:installer                        # build/icon-1024.png + src-tauri/installer/*.bmp
npx @tauri-apps/cli icon build/icon-1024.png # writes src-tauri/icons/*
git add src-tauri/icons src-tauri/installer && git commit -m "add app icons + installer art"
```

The installer uses these (all branded dark + teal, matching the app):

| Asset | Size | Where it shows |
| --- | --- | --- |
| `icons/icon.ico` | — | Installer exe, Start menu, taskbar, Add/Remove Programs |
| `installer/header.bmp` | 150×57 | NSIS wizard header strip |
| `installer/sidebar.bmp` | 164×314 | NSIS welcome + finish pages |
| `installer/banner.bmp` | 493×58 | MSI top banner |
| `installer/dialog.bmp` | 493×312 | MSI welcome background |

Swap any BMP for your own artwork at the same dimensions — NSIS/WiX require BMP specifically.

---

## Cutting a release

```powershell
./run.ps1 "release notes here" -Tag v0.1.0
```

That commits, pushes `main` (→ redeploys TVio Lite to Pages), then pushes tag `v0.1.0`, which triggers `release.yml`:

1. **Windows** — `tauri-action` builds the `.msi` + `.exe` and creates the GitHub Release.
2. **Android** — scaffolds the Capacitor project in CI, builds the phone APK, injects the leanback manifest (`scripts/android-tv-manifest.mjs`) and builds the TV APK, then attaches both to the same Release.

Find everything under the repo's **Releases** tab.

> APKs are **debug-signed** (installable for testing / sideloading). For Play Store / production signing, add a keystore as base64 secrets and wire a signing config into the Gradle build — see the Capacitor Android signing docs.

---

## Local development

```bash
npm install
cp .env.example .env.local   # add your keys
npm run dev                  # TVio Lite in the browser

# Desktop (needs Rust + the Tauri prerequisites for your OS)
npm run tauri dev
npm run tauri build

# Android (needs Android Studio / SDK + JDK 17)
npm run build && npx cap add android && npx cap sync android
cd android && ./gradlew assembleDebug
```

---

## Native capability hook

`src/platform/capabilities.ts#hasNativePlayback()` returns true inside Tauri (`window.__TAURI__`, enabled via `withGlobalTauri`) and Capacitor (`window.Capacitor`). That single check drives: **Lite vs full branding**, showing MKV/HEVC/torrent sources, and bypassing the browser "unsupported format" gate. The native players (libVLC/mpv in Tauri, ExoPlayer/media3 in Capacitor) and the companion receiver (`__TVIO_PLAYON__`, `__TVIO_REMOTE__`) are the remaining native-side pieces to implement inside the wrappers.

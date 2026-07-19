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

### 2. Enable GitHub Pages
Settings → Pages → **Source: GitHub Actions**. The site publishes at `https://<user>.github.io/TVio/`.

### 3. Desktop app icons (needed once for the Windows build)
The workflow tries to auto-generate icons from `public/icon.svg` via `sharp`. If the Windows job fails on icons, generate them locally once and commit them:

```bash
npx @tauri-apps/cli icon <a 1024x1024 png>   # writes src-tauri/icons/*
git add src-tauri/icons && git commit -m "add app icons"
```

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

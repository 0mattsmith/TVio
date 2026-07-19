# TVio

A Netflix-styled, Stremio-compatible media discovery app for **Web / PWA**, **Windows**, **Android**, and **Android TV**. Teal-on-black UI, TMDB-powered metadata, Stremio addon support, and a companion mobile remote + "Play On" (planned).

See **[ARCHITECTURE.md](./ARCHITECTURE.md)** for the full technical plan.

## Quick start

```bash
npm install
cp .env.example .env.local   # then paste your TMDB key into .env.local
npm run dev                  # http://localhost:5173
```

Without a TMDB key the app runs in **demo mode** (placeholder posters) so you can browse the whole UI immediately. Add `VITE_TMDB_KEY` to `.env.local` for live posters, cast, trailers, and where-to-watch data.

```bash
npm run build      # production bundle in dist/ (deploy to GitHub Pages)
npm run preview    # preview the production build
npm run typecheck  # tsc --noEmit
```

## What's built so far

- **Sign-in + QR pair screen** matching the design (email/password + device-pairing code & QR).
- **Navbar** — centered search / Home / TV Series / Movies, with settings + switch-user on the right.
- **Home** — Continue Watching, Watchlist, and "Because You Watched…" rows.
- **Movies & TV Series** tabs — strictly typed, with multi-select streaming-service filters (all on by default, incl. "Other"), genre filters, and per-service *Popular / Trending / New* rows.
- **Detail page** — hero, synopsis, genres, "Ways to Watch" (providers + rent/buy), YouTube trailer, and clickable cast → filmographies.
- **Player** — sleek custom controls with seek, volume, subtitles toggle, fullscreen; writes progress to Continue Watching.
- **Settings** — account, service toggles, and a Stremio-compatible **addon manager** (install by manifest URL).
- **PWA** — installable, offline app-shell service worker.

## Next phases

Firebase auth/sync wiring, Tauri (Windows) + Capacitor (Android / Android TV) wrappers, real addon `stream` resolution, and IPTV + EPG / TV Guide. Structure leaves room for all of these — see ARCHITECTURE.md §8.

## Deploying to GitHub Pages

The build uses relative asset paths (`base: "./"`) and a **hash router**, so it works from any repo subpath with no server config. Push `dist/` (or use a Pages action) and it just works.

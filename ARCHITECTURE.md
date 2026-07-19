# TVio — Architecture & Technical Plan

A Netflix-styled, Stremio-compatible media discovery app for **Web (PWA / GitHub Pages)**, **Windows**, **Android**, and **Android TV** — with a companion mobile remote and "Play On" casting.

> Design language: teal/cyan accent (`#14b8a6`) on near-black (`#0a0a0a`), rounded cards, bold white headings. See the sign-in screenshot for the reference look.

---

## 1. Platform strategy — one codebase, thin wrappers

The whole product is a single **React + TypeScript + Vite** app. Every platform is a wrapper around the same web build, which maximises code reuse and lets us ship the web target immediately.

| Target | Wrapper | Output |
| --- | --- | --- |
| Web / PWA | Vite build + service worker + manifest | GitHub Pages, installable on desktop + iOS "Add to Home Screen" |
| Windows | **Tauri** (Rust shell, tiny binary, uses OS webview) | `.msi` / `.exe` |
| Android phone | **Capacitor** | `.apk` (mobile layout + remote + Play On) |
| Android TV | **Capacitor** + TV manifest (leanback, D-pad focus) | `.apk` (10-foot layout) |

Why this split: Tauri gives a lightweight native Windows app without bundling Chromium; Capacitor gives real Android/Android-TV APKs from the same web bundle while exposing native APIs (network discovery, storage, cast). A `platform` service abstracts the differences (`isTV`, `hasDPad`, `canCast`, etc.) so components adapt at runtime.

### Responsive / 10-foot considerations
- Layout driven by a `useDeviceProfile()` hook → `web | mobile | tv`.
- **TV**: larger type, spatial (D-pad) focus navigation via `focusManager`, no hover states, bigger hit targets.
- **Mobile**: bottom tab bar instead of top navbar, plus the Remote and Play On features.
- **Desktop/web**: the centered top navbar from the brief.

---

## 2. Tech stack

- **UI**: React 18 + TypeScript, Vite, React Router (hash router for GitHub Pages compatibility).
- **Styling**: Tailwind CSS with a custom design-token theme (below). No component library — bespoke Netflix-style components.
- **State/data**: TanStack Query for API caching + Zustand for local UI state (watchlist, filters, playback session).
- **Auth + sync**: **Firebase** (Auth + Firestore). Anonymous → email/password → device-pair upgrade path.
- **Metadata**: **TMDB** (primary). See §4.
- **Addons**: Stremio-compatible addon protocol (manifest + resource endpoints). See §5.
- **Casting / remote**: local WebSocket + mDNS-style discovery (Capacitor plugin on native, fallback to Firebase relay for pairing over the internet).

---

## 3. Design tokens

```
--bg            #0a0a0a   near-black page
--surface       #141414   cards / navbar
--surface-2     #1f1f1f   inputs, raised
--accent        #14b8a6   teal (primary, "io", buttons, focus)
--accent-hover  #0d9488
--accent-soft   rgba(20,184,166,0.12)
--text          #f5f5f5
--text-muted    #9ca3af
--danger        #ef4444
radius          xl (cards), lg (inputs/buttons)
font            Inter / system-ui; headings 800 weight, tight tracking
```

Focus ring (critical for TV): 2px `--accent` outline + subtle scale — the same visual affordance as Netflix's selected poster.

---

## 4. Free APIs

| Need | API | Notes |
| --- | --- | --- |
| Metadata, posters, cast, genres, search, recommendations | **TMDB v3** | Primary. Key via `VITE_TMDB_KEY`. |
| Where-to-watch / streaming availability by service | **TMDB `/watch/providers`** (JustWatch-powered) | Region-aware (Netflix, Disney+, Hulu, Paramount+, etc.). Drives the service filters + "Popular on X" rows. |
| Trailers | TMDB `/videos` → YouTube embed | Falls back gracefully if none. |
| Cast → filmography (clickable actors) | TMDB `/person/{id}/combined_credits` | |
| Ratings extras (optional) | **OMDb** (`VITE_OMDB_KEY`, optional) | IMDb/RT scores. Optional enrichment. |
| IMDb IDs for addon compatibility | TMDB `/external_ids` | Stremio addons key off IMDb IDs. |

All API access is funnelled through `src/services/tmdb.ts` so keys, region, and caching live in one place. **Never commit keys** — they go in `.env.local` (git-ignored). `.env.example` documents them.

---

## 5. Stremio-compatible addon system

TVio is a superset of Stremio: it works fully with **no addons** (legit "where to watch" + buy links from TMDB providers), and gains extra sources when addons are installed.

- **Manifest**: fetch `<addon-url>/manifest.json` → `{ id, name, resources, types, catalogs, idPrefixes }`.
- **Resources**: `catalog`, `meta`, `stream`, `subtitles` — requested as `<addon-url>/<resource>/<type>/<id>.json`, matching Stremio's protocol so existing community addons work.
- **Addon manager** (`src/addons/`): install by URL, persist to Firestore per-user, merge each addon's `stream` results into the detail page's "Ways to watch" section. The manifest decides what a given addon contributes (e.g. a Plex addon adds Plex sources).
- Default (no-addon) sources come from a built-in "providers" pseudo-addon so the UI path is uniform.

---

## 6. Firebase data model

```
users/{uid}
  profile: { displayName, avatar, region }
  settings: { enabledServices[], theme, subtitleLang }
watchlist/{uid}/items/{tmdbId}   → { type, addedAt, poster }
progress/{uid}/items/{tmdbId}    → { type, positionSec, durationSec, updatedAt }  // Continue Watching
addons/{uid}/installed/{addonId} → { manifestUrl, name, enabled }
pairings/{code}                  → { uid, createdAt, claimedBy }  // QR / device pair + Play On
```

**Auth flows**
1. Email/password sign-in (screenshot left card).
2. **Device pair / QR** (right card): TV shows a 4-digit code + QR encoding a pairing URL; phone (already signed in) claims the code → TV upgrades from anonymous to the user's account via the `pairings` doc. Same channel powers **Play On** (phone tells TV what to play).

---

## 7. App structure (navbar & tabs, per brief)

- **Navbar** (web/desktop): centered → 🔍 search, **Home** (default), **TV Series**, **Movies**; right-aligned → ⚙ settings (icon only), 👤 switch-user.
- **Home**: `Continue Watching…` → `Watchlist` → `Because You've Watched…` (recs seeded from watchlist + progress).
- **TV Series** tab: series only. **Movies** tab: movies only.
- Both filterable by **service** (multi-select chips, all on by default, includes "Other") and by **genre** (Netflix-style). Enabled services generate `Popular on / Trending on / New to <service>` rows.
- **Detail page**: hero, trailer, synopsis, clickable cast → filmography, "Ways to watch" (providers + buy + addon streams).
- **Player**: clean custom controls, optional subtitles. Placeholder now; real playback via addon streams later.

---

## 8. Future room (later phases)

- **IPTV + EPG / TV Guide**: reserve a top-level `Live` route and an `epg` service interface now; grid EPG + mini-EPG overlay while watching a channel.
- **Downloads / offline**, **multiple profiles**, **Chromecast/DIAL** beyond the in-house Play On.

---

## 9. Folder layout

```
src/
  main.tsx, App.tsx, router.tsx
  theme/            tokens, tailwind preset
  components/       Navbar, PosterCard, Row, Hero, Logo, Chip, Button…
  pages/            SignIn, Home, Movies, Series, Detail, Person, Player, Settings
  services/         tmdb.ts, firebase.ts, providers.ts, pairing.ts
  addons/           manager.ts, types.ts
  store/            useUser, useWatchlist, useFilters (Zustand)
  hooks/            useDeviceProfile, useFocusNav
  platform/         index.ts (web) + capacitor/tauri shims
public/             manifest.webmanifest, icons, service worker
```

This session scaffolds the web PWA foundation: tokens, components, sign-in + QR screen, and the Home/Movies/Series shell wired to TMDB. Wrappers (Tauri/Capacitor) and the addon/player/EPG layers build on top without restructuring.

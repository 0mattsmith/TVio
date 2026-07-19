import { create } from "zustand";
import { persist } from "zustand/middleware";
import { signOut as fbSignOut } from "firebase/auth";
import { ALL_SERVICE_KEYS } from "../services/services";
import { auth, firebaseEnabled } from "../services/firebase";
import { configureTmdb } from "../services/tmdb";
import type { MediaItem } from "../services/types";

interface ProgressEntry extends MediaItem {
  positionSec: number;
  durationSec: number;
  updatedAt: number;
}

export interface Addon {
  id: string;
  name: string;
  url: string;
  kind: "builtin" | "addon" | "plex" | "nas";
  enabled: boolean;
}

const BUILTIN_ADDON: Addon = {
  id: "providers",
  name: "TVio Providers (built-in)",
  url: "internal://providers",
  kind: "builtin",
  enabled: true,
};

export type OnPlayBehavior = "menu" | "best";
export type PlatformOverride = "auto" | "tv" | "mobile" | "web";

export interface IptvSource {
  id: string;
  name: string;
  url: string;
}

interface AppState {
  // Auth (local stub until Firebase is configured)
  user: { email: string; name: string } | null;
  signIn: (email: string) => void;
  signOut: () => void;

  // Service filters (all on by default, per brief)
  enabledServices: string[];
  toggleService: (key: string) => void;
  setAllServices: (on: boolean) => void;

  // Watchlist
  watchlist: MediaItem[];
  inWatchlist: (id: number) => boolean;
  toggleWatchlist: (item: MediaItem) => void;
  // Fires when an item is ADDED (locally or, once Firebase sync lands, from
  // another same-account device) so the big-screen app can surface a toast.
  lastWatchlistAdd: { item: MediaItem; at: number } | null;
  clearWatchlistAdd: () => void;

  // Continue watching
  progress: ProgressEntry[];
  setProgress: (item: MediaItem, positionSec: number, durationSec: number) => void;

  // Sources / addons (Plex, NAS, Stremio addons)
  addons: Addon[];
  addAddon: (url: string, kind?: Addon["kind"], name?: string) => void;
  removeAddon: (id: string) => void;
  toggleAddon: (id: string) => void;

  // Playback preferences
  showOfficialSources: boolean; // show the "official" streaming services under Ways to Watch
  setShowOfficialSources: (v: boolean) => void;
  onPlayBehavior: OnPlayBehavior; // "menu" = Quick Watch sheet, "best" = play best source instantly
  setOnPlayBehavior: (v: OnPlayBehavior) => void;
  compactProviders: boolean; // show service logos only (no labels)
  setCompactProviders: (v: boolean) => void;
  platformOverride: PlatformOverride; // force a device layout (default auto-detect)
  setPlatformOverride: (v: PlatformOverride) => void;

  // User-supplied TMDB key/region (so web/PWA users can add their own in-app)
  tmdbKey: string;
  setTmdbKey: (v: string) => void;
  tmdbRegion: string;
  setTmdbRegion: (v: string) => void;

  // Live TV / IPTV (opt-in)
  iptvEnabled: boolean;
  setIptvEnabled: (v: boolean) => void;
  iptvPlaylists: IptvSource[]; // M3U/M3U8 playlists
  iptvEpgUrls: IptvSource[]; // XMLTV EPG sources
  addIptvPlaylist: (name: string, url: string) => void;
  removeIptvPlaylist: (id: string) => void;
  addIptvEpg: (name: string, url: string) => void;
  removeIptvEpg: (id: string) => void;

  // Quick Watch sheet (not persisted)
  quickWatchItem: MediaItem | null;
  quickWatchEpisode: { season: number; episode: number } | null;
  openQuickWatch: (item: MediaItem, episode?: { season: number; episode: number }) => void;
  closeQuickWatch: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      user: null,
      signIn: (email) => set({ user: { email, name: email.split("@")[0] || "You" } }),
      signOut: () => {
        if (firebaseEnabled && auth) fbSignOut(auth).catch(() => {});
        set({ user: null });
      },

      enabledServices: [...ALL_SERVICE_KEYS],
      toggleService: (key) =>
        set((s) => ({
          enabledServices: s.enabledServices.includes(key)
            ? s.enabledServices.filter((k) => k !== key)
            : [...s.enabledServices, key],
        })),
      setAllServices: (on) => set({ enabledServices: on ? [...ALL_SERVICE_KEYS] : [] }),

      watchlist: [],
      inWatchlist: (id) => get().watchlist.some((w) => w.id === id),
      toggleWatchlist: (item) =>
        set((s) => {
          const exists = s.watchlist.some((w) => w.id === item.id);
          return {
            watchlist: exists ? s.watchlist.filter((w) => w.id !== item.id) : [{ ...item }, ...s.watchlist],
            lastWatchlistAdd: exists ? s.lastWatchlistAdd : { item, at: Date.now() },
          };
        }),
      lastWatchlistAdd: null,
      clearWatchlistAdd: () => set({ lastWatchlistAdd: null }),

      progress: [],
      setProgress: (item, positionSec, durationSec) =>
        set((s) => ({
          progress: [
            { ...item, positionSec, durationSec, updatedAt: Date.now() },
            ...s.progress.filter((p) => p.id !== item.id),
          ].slice(0, 20),
        })),

      addons: [BUILTIN_ADDON],
      addAddon: (url, kind = "addon", name) =>
        set((s) => {
          const resolved =
            name?.trim() ||
            (kind === "plex" ? "Plex" : kind === "nas" ? "NAS / Local" :
              url.replace(/^https?:\/\//, "").split("/")[0] || "Addon");
          return { addons: [...s.addons, { id: crypto.randomUUID(), name: resolved, url, kind, enabled: true }] };
        }),
      removeAddon: (id) => set((s) => ({ addons: s.addons.filter((a) => a.id !== id) })),
      toggleAddon: (id) =>
        set((s) => ({ addons: s.addons.map((a) => (a.id === id ? { ...a, enabled: !a.enabled } : a)) })),

      showOfficialSources: true,
      setShowOfficialSources: (v) => set({ showOfficialSources: v }),
      onPlayBehavior: "menu",
      setOnPlayBehavior: (v) => set({ onPlayBehavior: v }),
      compactProviders: false,
      setCompactProviders: (v) => set({ compactProviders: v }),
      platformOverride: "auto",
      setPlatformOverride: (v) => set({ platformOverride: v }),

      tmdbKey: "",
      setTmdbKey: (v) => set({ tmdbKey: v.trim() }),
      tmdbRegion: "",
      setTmdbRegion: (v) => set({ tmdbRegion: v.trim() }),

      iptvEnabled: false,
      setIptvEnabled: (v) => set({ iptvEnabled: v }),
      iptvPlaylists: [],
      iptvEpgUrls: [],
      addIptvPlaylist: (name, url) =>
        set((s) => ({ iptvPlaylists: [...s.iptvPlaylists, { id: crypto.randomUUID(), name: name.trim() || "Playlist", url: url.trim() }] })),
      removeIptvPlaylist: (id) => set((s) => ({ iptvPlaylists: s.iptvPlaylists.filter((p) => p.id !== id) })),
      addIptvEpg: (name, url) =>
        set((s) => ({ iptvEpgUrls: [...s.iptvEpgUrls, { id: crypto.randomUUID(), name: name.trim() || "EPG", url: url.trim() }] })),
      removeIptvEpg: (id) => set((s) => ({ iptvEpgUrls: s.iptvEpgUrls.filter((u) => u.id !== id) })),

      quickWatchItem: null,
      quickWatchEpisode: null,
      openQuickWatch: (item, episode) => set({ quickWatchItem: item, quickWatchEpisode: episode ?? null }),
      closeQuickWatch: () => set({ quickWatchItem: null, quickWatchEpisode: null }),
    }),
    {
      name: "tvio-store",
      // Don't persist transient UI (the Quick Watch sheet).
      partialize: (s) => ({
        user: s.user,
        enabledServices: s.enabledServices,
        watchlist: s.watchlist,
        progress: s.progress,
        addons: s.addons,
        showOfficialSources: s.showOfficialSources,
        onPlayBehavior: s.onPlayBehavior,
        compactProviders: s.compactProviders,
        platformOverride: s.platformOverride,
        tmdbKey: s.tmdbKey,
        tmdbRegion: s.tmdbRegion,
        iptvEnabled: s.iptvEnabled,
        iptvPlaylists: s.iptvPlaylists,
        iptvEpgUrls: s.iptvEpgUrls,
      }),
    }
  )
);

// Personal, in-app-playable sources (everything except the built-in providers pseudo-addon).
export const selectPersonalSources = (s: AppState) => s.addons.filter((a) => a.kind !== "builtin" && a.enabled);

// Apply the persisted TMDB key/region to the API client at startup, and whenever
// the user changes them in Settings.
configureTmdb({ key: useAppStore.getState().tmdbKey, region: useAppStore.getState().tmdbRegion });
useAppStore.subscribe((s, p) => {
  if (s.tmdbKey !== p.tmdbKey || s.tmdbRegion !== p.tmdbRegion) {
    configureTmdb({ key: s.tmdbKey, region: s.tmdbRegion });
  }
});

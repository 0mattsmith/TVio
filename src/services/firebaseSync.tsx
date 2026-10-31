import { useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, onSnapshot, setDoc } from "firebase/firestore";
import { auth, db, firebaseEnabled } from "./firebase";
import { useAppStore } from "../store/useAppStore";
import type { Addon, Profile, ProgressEntry, FavCollection } from "../store/useAppStore";
import type { MediaItem, WatchedItem } from "./types";
import type { TorboxPin } from "./torbox";

// While applying a remote snapshot we must not echo it back up to Firestore.
let applyingRemote = false;

// A per-launch id stamped on every write, so a device can tell its own echo
// (Firestore replays local writes) from a genuine change made on another device
// — only the latter drives the "added to your watchlist" toast.
const SESSION = Math.random().toString(36).slice(2);

function unionById(primary: MediaItem[], extra: MediaItem[]): MediaItem[] {
  const ids = new Set(primary.map((p) => p.id));
  return [...primary, ...extra.filter((e) => !ids.has(e.id))];
}

function unionCollections(primary: FavCollection[], extra: FavCollection[]): FavCollection[] {
  const ids = new Set(primary.map((p) => p.id));
  return [...primary, ...extra.filter((e) => !ids.has(e.id))];
}

// Watched entries are keyed by id (+ season, for any legacy per-season rows).
function unionWatched(primary: WatchedItem[], extra: WatchedItem[]): WatchedItem[] {
  const key = (w: WatchedItem) => `${w.id}:${(w as { season?: number }).season ?? ""}`;
  const seen = new Set(primary.map(key));
  return [...primary, ...extra.filter((e) => !seen.has(key(e)))];
}

const unionKeys = (a: string[], b: string[]): string[] => [...new Set([...a, ...b])];

/**
 * Pulls the sources saved on the account right now (rather than waiting for the
 * live listener). Handy on Android TV, where typing an AIOStreams key with a
 * remote is miserable — add it on your phone, then hit Sync on the TV.
 * Existing sources are matched by URL so syncing twice can't duplicate them.
 */
export async function pullAccountSources(): Promise<{ added: number; error?: string }> {
  if (!firebaseEnabled || !auth || !db) {
    return { added: 0, error: "Account sync isn't configured on this build." };
  }
  const user = auth.currentUser;
  if (!user) return { added: 0, error: "Sign in first to sync from your account." };

  try {
    const snap = await getDoc(doc(db, "users", user.uid));
    const remote = (snap.data()?.addons as Addon[] | undefined) ?? [];
    if (remote.length === 0) {
      return { added: 0, error: "No saved sources on your account yet — add one on your phone first." };
    }
    const current = useAppStore.getState().addons;
    const known = new Set(current.map((a) => a.url));
    const toAdd = remote.filter((a) => !known.has(a.url));
    if (toAdd.length > 0) useAppStore.setState({ addons: [...current, ...toAdd] });
    return { added: toAdd.length };
  } catch {
    return { added: 0, error: "Couldn't reach your account. Check the connection and try again." };
  }
}

// Mounts once. When Firebase is configured, keeps auth state and the user's
// watchlist + progress in sync with Firestore (users/{uid}). A remote watchlist
// addition (e.g. from a phone on the same account) drives the big-screen toast.
export function FirebaseSync() {
  useEffect(() => {
    if (!firebaseEnabled || !auth || !db) return;
    const a = auth;
    const database = db;

    let unsubDoc = () => {};
    let prevWatchIds = new Set<number>();
    let ready = false;

    const unsubAuth = onAuthStateChanged(a, (fbUser) => {
      unsubDoc();
      ready = false;
      if (!fbUser) {
        useAppStore.setState({ user: null });
        return;
      }
      useAppStore.setState({
        user: { email: fbUser.email || "", name: fbUser.displayName || fbUser.email?.split("@")[0] || "You" },
      });

      const ref = doc(database, "users", fbUser.uid);
      unsubDoc = onSnapshot(ref, (snap) => {
        const data = snap.data();
        const remoteWatch: MediaItem[] = (data?.watchlist as MediaItem[]) || [];

        // Account-level settings that should travel across devices.
        type Bucket = {
          watchlist: MediaItem[];
          progress: ProgressEntry[];
          collections?: FavCollection[];
          watched?: WatchedItem[];
          watchedEpisodes?: string[];
        };
        const account: {
          tmdbKey?: string;
          tmdbRegion?: string;
          torboxKey?: string;
          addons?: Addon[];
          profiles?: Profile[];
          profileData?: Record<string, Bucket>;
        } = {};
        if (Array.isArray(data?.profiles)) account.profiles = data.profiles as Profile[];
        if (data?.profileData && typeof data.profileData === "object") {
          account.profileData = data.profileData as Record<string, Bucket>;
        }
        if (typeof data?.tmdbKey === "string") account.tmdbKey = data.tmdbKey;
        if (typeof data?.tmdbRegion === "string") account.tmdbRegion = data.tmdbRegion;
        if (typeof data?.torboxKey === "string") account.torboxKey = data.torboxKey;
        if (Array.isArray(data?.addons)) {
          // Remote holds only account-synced sources. Keep this device's
          // built-in + device-only sources and append the synced ones.
          const remote = data.addons as Addon[];
          const localKeep = useAppStore.getState().addons.filter((a) => a.kind === "builtin" || a.sync === false);
          const seen = new Set(localKeep.map((a) => a.id));
          account.addons = [...localKeep, ...remote.filter((a) => !seen.has(a.id))];
        }

        // Prefer THIS device's active profile bucket over the doc's top-level
        // list (which belongs to whichever device wrote last).
        const localActiveId = useAppStore.getState().activeProfileId;
        const bucket = localActiveId ? account.profileData?.[localActiveId] : undefined;
        const activeWatch: MediaItem[] = bucket?.watchlist ?? remoteWatch;
        const activeProgress = bucket?.progress ?? data?.progress ?? useAppStore.getState().progress;
        const remoteCollections: FavCollection[] =
          bucket?.collections ?? (data?.collections as FavCollection[] | undefined) ?? [];
        const remoteWatched: WatchedItem[] =
          bucket?.watched ?? (data?.watched as WatchedItem[] | undefined) ?? [];
        const remoteWatchedEps: string[] =
          bucket?.watchedEpisodes ?? (data?.watchedEpisodes as string[] | undefined) ?? [];
        const remotePins: Record<string, TorboxPin | TorboxPin[]> =
          (data?.pinnedSources && typeof data.pinnedSources === "object"
            ? (data.pinnedSources as Record<string, TorboxPin | TorboxPin[]>)
            : {});

        applyingRemote = true;
        if (!ready) {
          // First load / sign-in: MERGE local (offline) items with remote so a
          // list built on this device isn't wiped by another device's. No toast.
          const merged = unionById(activeWatch, useAppStore.getState().watchlist);
          const mergedCollections = unionCollections(remoteCollections, useAppStore.getState().collections);
          const mergedWatched = unionWatched(remoteWatched, useAppStore.getState().watched);
          const mergedWatchedEps = unionKeys(remoteWatchedEps, useAppStore.getState().watchedEpisodes);
          prevWatchIds = new Set(merged.map((w) => w.id));
          useAppStore.setState({
            watchlist: merged,
            progress: activeProgress,
            collections: mergedCollections,
            watched: mergedWatched,
            watchedEpisodes: mergedWatchedEps,
            // Pins are a personal library mapping — union remote with local.
            pinnedSources: { ...remotePins, ...useAppStore.getState().pinnedSources },
            ...account,
          });
          ready = true;
        } else {
          // Only a write from ANOTHER device toasts — never this device's own
          // echo (adding on the TV itself shouldn't pop its own notification).
          const remoteWriter = !!data?.writerSession && data.writerSession !== SESSION;
          const added = remoteWriter ? activeWatch.find((w) => !prevWatchIds.has(w.id)) : undefined;
          prevWatchIds = new Set(activeWatch.map((w) => w.id));
          useAppStore.setState({
            watchlist: activeWatch,
            progress: activeProgress,
            collections: remoteCollections,
            watched: remoteWatched,
            watchedEpisodes: remoteWatchedEps,
            pinnedSources: remotePins,
            ...account,
            ...(added ? { lastWatchlistAdd: { item: added, at: Date.now() } } : {}),
          });
        }
        applyingRemote = false;
      });
    });

    // Push local watchlist/progress changes up (debounced), skipping echoes.
    let timer: ReturnType<typeof setTimeout>;
    const unsubStore = useAppStore.subscribe((s, prev) => {
      if (applyingRemote) return;
      const changed =
        s.watchlist !== prev.watchlist ||
        s.progress !== prev.progress ||
        s.collections !== prev.collections ||
        s.watched !== prev.watched ||
        s.watchedEpisodes !== prev.watchedEpisodes ||
        s.pinnedSources !== prev.pinnedSources ||
        s.tmdbKey !== prev.tmdbKey ||
        s.tmdbRegion !== prev.tmdbRegion ||
        s.torboxKey !== prev.torboxKey ||
        s.addons !== prev.addons ||
        s.profiles !== prev.profiles ||
        s.profileData !== prev.profileData;
      if (!changed) return;
      const u = a.currentUser;
      if (!u) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        setDoc(
          doc(database, "users", u.uid),
          {
            watchlist: s.watchlist,
            progress: s.progress,
            collections: s.collections,
            watched: s.watched,
            watchedEpisodes: s.watchedEpisodes,
            pinnedSources: s.pinnedSources,
            tmdbKey: s.tmdbKey,
            tmdbRegion: s.tmdbRegion,
            torboxKey: s.torboxKey,
            profiles: s.profiles,
            // Fold the active profile's live data into the per-profile buckets.
            profileData: s.activeProfileId
              ? {
                  ...s.profileData,
                  [s.activeProfileId]: {
                    watchlist: s.watchlist,
                    progress: s.progress,
                    collections: s.collections,
                    watched: s.watched,
                    watchedEpisodes: s.watchedEpisodes,
                  },
                }
              : s.profileData,
            // Only sources the user opted to save to the account (default on).
            addons: s.addons.filter((a) => a.sync !== false && a.kind !== "builtin"),
            // Stamp the writer so our own echo doesn't self-toast (see SESSION).
            writerSession: SESSION,
          },
          { merge: true }
        ).catch(() => {});
      }, 800);
    });

    return () => {
      unsubAuth();
      unsubDoc();
      unsubStore();
      clearTimeout(timer);
    };
  }, []);

  return null;
}

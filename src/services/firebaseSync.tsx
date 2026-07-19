import { useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { auth, db, firebaseEnabled } from "./firebase";
import { useAppStore } from "../store/useAppStore";
import type { Addon } from "../store/useAppStore";
import type { MediaItem } from "./types";

// While applying a remote snapshot we must not echo it back up to Firestore.
let applyingRemote = false;

function unionById(primary: MediaItem[], extra: MediaItem[]): MediaItem[] {
  const ids = new Set(primary.map((p) => p.id));
  return [...primary, ...extra.filter((e) => !ids.has(e.id))];
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
        const account: { tmdbKey?: string; tmdbRegion?: string; addons?: Addon[] } = {};
        if (typeof data?.tmdbKey === "string") account.tmdbKey = data.tmdbKey;
        if (typeof data?.tmdbRegion === "string") account.tmdbRegion = data.tmdbRegion;
        if (Array.isArray(data?.addons)) {
          // Remote holds only account-synced sources. Keep this device's
          // built-in + device-only sources and append the synced ones.
          const remote = data.addons as Addon[];
          const localKeep = useAppStore.getState().addons.filter((a) => a.kind === "builtin" || a.sync === false);
          const seen = new Set(localKeep.map((a) => a.id));
          account.addons = [...localKeep, ...remote.filter((a) => !seen.has(a.id))];
        }

        applyingRemote = true;
        if (!ready) {
          // First load: merge local (offline) items with remote, no toast.
          const merged = unionById(remoteWatch, useAppStore.getState().watchlist);
          prevWatchIds = new Set(merged.map((w) => w.id));
          useAppStore.setState({ watchlist: merged, progress: data?.progress || useAppStore.getState().progress, ...account });
          ready = true;
        } else {
          const added = remoteWatch.find((w) => !prevWatchIds.has(w.id));
          prevWatchIds = new Set(remoteWatch.map((w) => w.id));
          useAppStore.setState({
            watchlist: remoteWatch,
            progress: data?.progress || useAppStore.getState().progress,
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
        s.tmdbKey !== prev.tmdbKey ||
        s.tmdbRegion !== prev.tmdbRegion ||
        s.addons !== prev.addons;
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
            tmdbKey: s.tmdbKey,
            tmdbRegion: s.tmdbRegion,
            // Only sources the user opted to save to the account (default on).
            addons: s.addons.filter((a) => a.sync !== false && a.kind !== "builtin"),
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

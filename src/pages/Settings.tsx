import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { LogOut, Puzzle, MonitorPlay, Trash2, Server, ListVideo, Zap, Plus, Tv, Smartphone, Monitor, Sparkles, Radio, CalendarClock, Lock, Users, Pencil, RefreshCw } from "lucide-react";
import { SERVICES, OTHER_SERVICE } from "../services/services";
import { hasTmdbKey, currentRegion, usingBuiltInKey } from "../services/tmdb";
import { firebaseEnabled } from "../services/firebase";
import { pullAccountSources } from "../services/firebaseSync";
import { useAppStore, buildAiostreamsUrl, PROFILE_AVATARS } from "../store/useAppStore";
import type { Addon, PlatformOverride } from "../store/useAppStore";
import { AvatarPicker } from "../components/AvatarPicker";
import { useDeviceProfile } from "../hooks/useDeviceProfile";
import { fetchManifest } from "../addons/manager";
import { Button } from "../components/Button";
import { Chip } from "../components/Chip";

function Toggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onClick}
      className={`focusable relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? "bg-accent" : "bg-surface-2"}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}

const SOURCE_ICON: Record<Addon["kind"], typeof Puzzle> = {
  builtin: ListVideo, addon: Puzzle, aiostreams: Puzzle,
  plex: MonitorPlay, jellyfin: MonitorPlay, emby: MonitorPlay, nas: Server,
};

export function Settings() {
  const navigate = useNavigate();
  const {
    user, signOut, enabledServices, toggleService,
    addons, addAddon, removeAddon, toggleAddon,
    showOfficialSources, setShowOfficialSources,
    onPlayBehavior, setOnPlayBehavior,
    compactProviders, setCompactProviders,
    platformOverride, setPlatformOverride,
    iptvEnabled, setIptvEnabled,
    iptvPlaylists, iptvEpgUrls, addIptvPlaylist, removeIptvPlaylist, addIptvEpg, removeIptvEpg,
    tmdbKey, setTmdbKey, tmdbRegion, setTmdbRegion,
    profiles, activeProfileId, addProfile, updateProfile, removeProfile, profileData, watchlist,
  } = useAppStore();
  const activeProfile = profiles.find((p) => p.id === activeProfileId);
  const isMasterProfile = activeProfile?.isMaster ?? false;
  const isTV = useDeviceProfile() === "tv";
  const queryClient = useQueryClient();
  const [keyInput, setKeyInput] = useState(tmdbKey);
  const [regionInput, setRegionInput] = useState(tmdbRegion);
  const [saved, setSaved] = useState(false);
  const saveTmdb = () => {
    // Persist + apply the key to the TMDB client, then refetch everything with
    // it. No page reload (that broke under the service worker on Pages).
    setTmdbKey(keyInput);
    setTmdbRegion(regionInput);
    queryClient.invalidateQueries();
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  // Profile management (Master only)
  const [newProfileName, setNewProfileName] = useState("");
  const [newProfileAvatar, setNewProfileAvatar] = useState(PROFILE_AVATARS[0]);
  const [editingProfile, setEditingProfile] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editAvatar, setEditAvatar] = useState(PROFILE_AVATARS[0]);
  const createProfile = () => {
    if (!newProfileName.trim()) return;
    addProfile(newProfileName, newProfileAvatar);
    setNewProfileName("");
    setNewProfileAvatar(PROFILE_AVATARS[Math.floor(Math.random() * PROFILE_AVATARS.length)]);
  };
  const saveProfileEdit = () => {
    if (editingProfile && editName.trim()) updateProfile(editingProfile, { name: editName, avatar: editAvatar });
    setEditingProfile(null);
  };

  const [aioKey, setAioKey] = useState("");
  const [aioSave, setAioSave] = useState(true);
  const [installing, setInstalling] = useState(false);
  // TV: pull sources saved on the account instead of typing the key on a remote.
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");
  const syncFromAccount = async () => {
    setSyncing(true);
    setSyncMsg("");
    const res = await pullAccountSources();
    setSyncMsg(
      res.error ?? (res.added > 0 ? `Synced ${res.added} source${res.added > 1 ? "s" : ""} from your account.` : "Already up to date.")
    );
    setSyncing(false);
  };
  const [plName, setPlName] = useState("");
  const [plUrl, setPlUrl] = useState("");
  const [epgName, setEpgName] = useState("");
  const [epgUrl, setEpgUrl] = useState("");
  const hasAiostreams = addons.some((a) => a.kind === "aiostreams");
  const installAiostreams = async () => {
    const k = aioKey.trim();
    if (!k || installing) return;
    setInstalling(true);
    const manifestUrl = buildAiostreamsUrl(k);
    try {
      await fetchManifest(manifestUrl); // best-effort validation
    } catch {
      /* unreachable (offline/CORS) — still add */
    } finally {
      addAddon(manifestUrl, "aiostreams", "AIOStreams", firebaseEnabled ? aioSave : false);
      setInstalling(false);
      setAioKey("");
    }
  };

  return (
    <div className="animate-fade-in mx-auto max-w-3xl px-4 pt-24 pb-16 sm:px-8">
      <h1 className="text-3xl font-black tracking-tight">Settings</h1>

      {/* Account */}
      <section className="mt-8 rounded-xl border border-white/5 bg-surface p-6">
        <h2 className="text-lg font-bold">Account</h2>
        <p className="mt-1 text-sm text-muted">{user ? user.email : "Not signed in"}</p>
        <div className="mt-4 flex gap-3">
          <Button variant="secondary" onClick={() => navigate("/profiles")}>
            <Users size={16} /> Switch profile
          </Button>
          {user && (
            <Button variant="ghost" onClick={() => { signOut(); navigate("/signin"); }}>
              <LogOut size={16} /> Sign out
            </Button>
          )}
        </div>
      </section>

      {/* Playback */}
      <section className="mt-6 rounded-xl border border-white/5 bg-surface p-6">
        <h2 className="text-lg font-bold">Playback</h2>

        <div className="mt-4 flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-semibold">Show official streaming options</div>
            <div className="text-xs text-muted">
              Show services like Netflix & Disney+ under “Ways to Watch”. Turn off to focus on your own sources (Plex, NAS, addons).
            </div>
          </div>
          <Toggle on={showOfficialSources} onClick={() => setShowOfficialSources(!showOfficialSources)} label="Show official streaming options" />
        </div>

        <div className="mt-4 flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-semibold">Show service icons only</div>
            <div className="text-xs text-muted">
              Display streaming services as logos without labels in Quick Watch and on info pages.
              {isTV && " On this TV, this is the only place to change it — the in-player toggle is hidden to reduce remote navigation."}
            </div>
          </div>
          <Toggle on={compactProviders} onClick={() => setCompactProviders(!compactProviders)} label="Show service icons only" />
        </div>

        {/* Device layout */}
        <div className="mt-5">
          <div className="text-sm font-semibold">Device layout</div>
          <div className="mb-2 text-xs text-muted">
            Auto-detects TV, mobile or desktop. Override to preview another layout (TV hides extra on-screen controls for D-pad remotes).
          </div>
          <div className="flex flex-wrap gap-2">
            {([
              { key: "auto", label: "Auto", Icon: Sparkles },
              { key: "web", label: "Desktop", Icon: Monitor },
              { key: "mobile", label: "Mobile", Icon: Smartphone },
              { key: "tv", label: "TV", Icon: Tv },
            ] as { key: PlatformOverride; label: string; Icon: typeof Tv }[]).map(({ key, label, Icon }) => (
              <button
                key={key}
                onClick={() => setPlatformOverride(key)}
                className={`focusable flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold ${
                  platformOverride === key ? "border-accent bg-accent-soft text-accent" : "border-white/10 bg-surface-2 text-muted hover:text-white"
                }`}
              >
                <Icon size={16} /> {label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5">
          <div className="text-sm font-semibold">When I press Play</div>
          <div className="mb-2 text-xs text-muted">Choose what the Play button does.</div>
          <div className="flex gap-2">
            <button
              onClick={() => setOnPlayBehavior("menu")}
              className={`focusable flex flex-1 items-center gap-2 rounded-lg border px-4 py-3 text-left ${onPlayBehavior === "menu" ? "border-accent bg-accent-soft" : "border-white/10 bg-surface-2"}`}
            >
              <ListVideo size={18} className="text-accent" />
              <div>
                <div className="text-sm font-semibold">Quick Watch menu</div>
                <div className="text-xs text-muted">Pick a source</div>
              </div>
            </button>
            <button
              onClick={() => setOnPlayBehavior("best")}
              className={`focusable flex flex-1 items-center gap-2 rounded-lg border px-4 py-3 text-left ${onPlayBehavior === "best" ? "border-accent bg-accent-soft" : "border-white/10 bg-surface-2"}`}
            >
              <Zap size={18} className="text-accent" />
              <div>
                <div className="text-sm font-semibold">Play best source</div>
                <div className="text-xs text-muted">Start instantly</div>
              </div>
            </button>
          </div>
        </div>
      </section>

      {/* Services */}
      <section className="mt-6 rounded-xl border border-white/5 bg-surface p-6">
        <h2 className="text-lg font-bold">Streaming services</h2>
        <p className="mt-1 text-sm text-muted">
          Enabled services appear as filters and drive the Popular / Trending / New rows.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {[...SERVICES, OTHER_SERVICE].map((s) => (
            <Chip key={s.key} label={s.name} color={s.color} active={enabledServices.includes(s.key)} onClick={() => toggleService(s.key)} />
          ))}
        </div>
      </section>

      {isMasterProfile ? (
      <>
      {/* Profiles (Master only) */}
      <section className="mt-6 rounded-xl border border-white/5 bg-surface p-6">
        <h2 className="flex items-center gap-2 text-lg font-bold"><Users size={18} /> Profiles</h2>
        <p className="mt-1 text-sm text-muted">
          Each profile keeps its own watchlist and continue-watching. Only the Master profile can add or remove them.
        </p>

        <ul className="mt-4 space-y-2">
          {profiles.map((p) => (
            <li key={p.id} className="rounded-lg bg-surface-2 px-4 py-3">
              {editingProfile === p.id ? (
                <div className="space-y-3">
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && saveProfileEdit()}
                    className="focusable w-full rounded-lg border border-white/10 bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
                  />
                  <AvatarPicker value={editAvatar} onChange={setEditAvatar} size="sm" />
                  <div className="flex gap-2">
                    <Button onClick={saveProfileEdit} disabled={!editName.trim()}>Save</Button>
                    <Button variant="ghost" onClick={() => setEditingProfile(null)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface text-xl">{p.avatar}</span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold">{p.name}</span>
                        {p.isMaster && <span className="rounded bg-accent-soft px-1.5 py-0.5 text-[10px] font-bold text-accent">MASTER</span>}
                        {p.id === activeProfileId && <span className="text-[10px] text-muted">· active</span>}
                      </div>
                      <div className="text-xs text-muted">
                        {/* the active profile's list is live in the store, not yet parked */}
                        {(p.id === activeProfileId ? watchlist.length : profileData[p.id]?.watchlist?.length ?? 0)} in watchlist
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      onClick={() => { setEditingProfile(p.id); setEditName(p.name); setEditAvatar(p.avatar); }}
                      className="focusable text-muted hover:text-white"
                      aria-label={`Edit ${p.name}`}
                    >
                      <Pencil size={16} />
                    </button>
                    {!p.isMaster && (
                      <button
                        onClick={() => removeProfile(p.id)}
                        className="focusable text-muted hover:text-red-400"
                        aria-label={`Remove ${p.name}`}
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>

        {profiles.length < 5 ? (
          <div className="mt-4 rounded-lg border border-dashed border-white/15 p-4">
            <div className="mb-2 text-sm font-semibold">Add a profile</div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
              <input
                value={newProfileName}
                onChange={(e) => setNewProfileName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && createProfile()}
                placeholder="Name"
                className="focusable rounded-lg border border-white/10 bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-accent sm:w-48"
              />
              <div className="flex-1"><AvatarPicker value={newProfileAvatar} onChange={setNewProfileAvatar} size="sm" /></div>
              <Button onClick={createProfile} disabled={!newProfileName.trim()}><Plus size={16} /> Add</Button>
            </div>
          </div>
        ) : (
          <p className="mt-3 text-xs text-muted">Maximum of 5 profiles reached.</p>
        )}
      </section>

      {/* Sources */}
      <section className="mt-6 rounded-xl border border-white/5 bg-surface p-6">
        <h2 className="flex items-center gap-2 text-lg font-bold"><Puzzle size={18} /> Your sources</h2>
        <p className="mt-1 text-sm text-muted">
          Add your own ways to watch — they appear in Quick Watch above the official options.
        </p>

        {/* AIOStreams */}
        <div className="mt-4">
          <div className="mb-1.5 text-sm font-semibold">AIOStreams</div>
          <div className="flex gap-2">
            <input
              value={aioKey}
              onChange={(e) => setAioKey(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && installAiostreams()}
              placeholder="Paste your AIOStreams key (the part between /stremio/ and /manifest.json)"
              className="focusable min-w-0 flex-1 rounded-lg border border-white/10 bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-accent"
            />
            <Button onClick={installAiostreams} disabled={installing || hasAiostreams}>
              <Plus size={16} /> {installing ? "Adding…" : "Add"}
            </Button>
            {/* On TV, pull the key from the account rather than typing it on a remote. */}
            {isTV && (
              <Button variant="secondary" onClick={syncFromAccount} disabled={syncing}>
                <RefreshCw size={16} className={syncing ? "animate-spin" : ""} /> {syncing ? "Syncing…" : "Sync"}
              </Button>
            )}
          </div>
          {isTV && syncMsg && <p className="mt-1.5 text-xs text-accent">{syncMsg}</p>}
          {firebaseEnabled && !hasAiostreams && (
            <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs text-muted">
              <input
                type="checkbox"
                checked={aioSave}
                onChange={(e) => setAioSave(e.target.checked)}
                className="h-4 w-4 accent-accent"
              />
              Save this to my TVio account (sync across devices). Uncheck to keep it only on this device.
            </label>
          )}
          <p className="mt-1.5 text-xs text-muted">
            {hasAiostreams
              ? "AIOStreams connected. Remove it below to change the key."
              : "From your AIOStreams config URL, copy just the id/config segment — TVio builds the rest."}
          </p>
        </div>

        {/* Media servers / local */}
        <div className="mt-5">
          <div className="mb-1.5 text-sm font-semibold">Media servers &amp; local</div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => addAddon("plex://local", "plex")}><MonitorPlay size={16} /> Plex</Button>
            <Button variant="secondary" onClick={() => addAddon("jellyfin://local", "jellyfin")}><MonitorPlay size={16} /> Jellyfin</Button>
            <Button variant="secondary" onClick={() => addAddon("emby://local", "emby")}><MonitorPlay size={16} /> Emby</Button>
            <Button variant="secondary" onClick={() => addAddon("nas://local", "nas")}><Server size={16} /> NAS / Local</Button>
          </div>
        </div>

        <ul className="mt-4 space-y-2">
          {addons.map((a) => {
            const Icon = SOURCE_ICON[a.kind];
            return (
              <li key={a.id} className="flex items-center justify-between gap-3 rounded-lg bg-surface-2 px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <Icon size={18} className="shrink-0 text-accent" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{a.name}</span>
                      {firebaseEnabled && a.kind !== "builtin" && !a.sync && (
                        <span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-muted">Device only</span>
                      )}
                    </div>
                    <div className="break-all text-xs text-muted">{a.url}</div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  {a.kind !== "builtin" && (
                    <Toggle on={a.enabled} onClick={() => toggleAddon(a.id)} label={`Enable ${a.name}`} />
                  )}
                  {a.kind !== "builtin" && (
                    <button onClick={() => removeAddon(a.id)} className="focusable text-muted hover:text-red-400" aria-label="Remove">
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Live TV / IPTV */}
      <section className="mt-6 rounded-xl border border-white/5 bg-surface p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold"><Radio size={18} /> Live TV (IPTV)</h2>
            <p className="mt-1 text-sm text-muted">
              Add M3U playlists and XMLTV EPG guides to unlock the Live TV tab with a full TV guide.
            </p>
          </div>
          <Toggle on={iptvEnabled} onClick={() => setIptvEnabled(!iptvEnabled)} label="Enable Live TV" />
        </div>

        {iptvEnabled && (
          <div className="mt-6 space-y-6">
            {/* Playlists */}
            <div>
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold"><ListVideo size={16} className="text-accent" /> M3U Playlists</div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input value={plName} onChange={(e) => setPlName(e.target.value)} placeholder="Name" className="focusable rounded-lg border border-white/10 bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-accent sm:w-40" />
                <input value={plUrl} onChange={(e) => setPlUrl(e.target.value)} placeholder="https://…/playlist.m3u" className="focusable min-w-0 flex-1 rounded-lg border border-white/10 bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-accent" />
                <Button onClick={() => { if (plUrl.trim()) { addIptvPlaylist(plName, plUrl); setPlName(""); setPlUrl(""); } }}><Plus size={16} /> Add</Button>
              </div>
              <ul className="mt-3 space-y-2">
                {iptvPlaylists.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 rounded-lg bg-surface-2 px-4 py-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold">{p.name}</div>
                      <div className="break-all text-xs text-muted">{p.url}</div>
                    </div>
                    <button onClick={() => removeIptvPlaylist(p.id)} className="focusable shrink-0 text-muted hover:text-red-400" aria-label="Remove"><Trash2 size={16} /></button>
                  </li>
                ))}
                {iptvPlaylists.length === 0 && <li className="text-xs text-muted">No playlists added yet.</li>}
              </ul>
            </div>

            {/* EPG */}
            <div>
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold"><CalendarClock size={16} className="text-accent" /> EPG guides (XMLTV)</div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input value={epgName} onChange={(e) => setEpgName(e.target.value)} placeholder="Name" className="focusable rounded-lg border border-white/10 bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-accent sm:w-40" />
                <input value={epgUrl} onChange={(e) => setEpgUrl(e.target.value)} placeholder="https://…/epg.xml  (.xml or .xml.gz)" className="focusable min-w-0 flex-1 rounded-lg border border-white/10 bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-accent" />
                <Button onClick={() => { if (epgUrl.trim()) { addIptvEpg(epgName, epgUrl); setEpgName(""); setEpgUrl(""); } }}><Plus size={16} /> Add</Button>
              </div>
              <ul className="mt-3 space-y-2">
                {iptvEpgUrls.map((u) => (
                  <li key={u.id} className="flex items-center justify-between gap-3 rounded-lg bg-surface-2 px-4 py-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold">{u.name}</div>
                      <div className="break-all text-xs text-muted">{u.url}</div>
                    </div>
                    <button onClick={() => removeIptvEpg(u.id)} className="focusable shrink-0 text-muted hover:text-red-400" aria-label="Remove"><Trash2 size={16} /></button>
                  </li>
                ))}
                {iptvEpgUrls.length === 0 && <li className="text-xs text-muted">No EPG sources added yet.</li>}
              </ul>
            </div>

            <p className="text-xs text-muted">
              Note: some IPTV/EPG servers block browser (CORS) requests. If a source won't load in the web app it will still work in the Android / desktop builds.
            </p>
          </div>
        )}
      </section>

      {/* Data & API */}
      <section className="mt-6 rounded-xl border border-white/5 bg-surface p-6">
        <h2 className="text-lg font-bold">Data &amp; API</h2>
        <p className="mt-1 text-sm text-muted">
          {usingBuiltInKey()
            ? "TVio ships with a built-in TMDB connection — nothing to set up. You can add your own key below if you'd rather use your own quota."
            : "TVio uses TMDB for posters, cast, trailers and where-to-watch. Add your own free key to switch off demo mode — it's stored only on this device."}
        </p>

        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted">TMDB API key</span>
            <input
              type="password"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="Paste your TMDB API key (v3)"
              className="focusable w-full rounded-lg border border-white/10 bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-accent"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted">Region (optional)</span>
            <input
              value={regionInput}
              onChange={(e) => setRegionInput(e.target.value.toUpperCase().slice(0, 2))}
              placeholder="US"
              className="focusable w-28 rounded-lg border border-white/10 bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-accent"
            />
          </label>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={saveTmdb} disabled={keyInput === tmdbKey && regionInput === tmdbRegion}>
              Save
            </Button>
            <span className="text-xs">
              {hasTmdbKey() ? (
                <span className="text-accent">● Connected{usingBuiltInKey() && !tmdbKey ? " (built-in)" : ""}</span>
              ) : (
                <span className="text-yellow-400">● Demo mode</span>
              )}
              {" · "}Region {currentRegion()}
              {saved && <span className="ml-2 text-accent">Saved ✓</span>}
            </span>
          </div>

          <p className="text-xs text-muted">
            Get a free key at{" "}
            <a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noopener noreferrer" className="text-accent underline">themoviedb.org</a>.
          </p>
        </div>
      </section>
      </>
      ) : (
        <section className="mt-6 rounded-xl border border-white/5 bg-surface p-6">
          <h2 className="flex items-center gap-2 text-lg font-bold text-muted">
            <Lock size={18} /> Sources, Live TV &amp; API
          </h2>
          <p className="mt-1 text-sm text-muted">
            Only the <span className="font-semibold text-white">Master</span> profile can change sources, Live TV and API
            settings. Switch to the Master profile to edit them.
          </p>
          <Button variant="secondary" className="mt-4" onClick={() => navigate("/profiles")}>
            <Users size={16} /> Switch profile
          </Button>
        </section>
      )}
    </div>
  );
}

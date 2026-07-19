import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut, Puzzle, MonitorPlay, Trash2, Server, ListVideo, Zap, Plus, Tv, Smartphone, Monitor, Sparkles, Radio, CalendarClock } from "lucide-react";
import { SERVICES, OTHER_SERVICE } from "../services/services";
import { hasTmdbKey, REGION } from "../services/tmdb";
import { useAppStore } from "../store/useAppStore";
import type { Addon, PlatformOverride } from "../store/useAppStore";
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
  builtin: ListVideo, addon: Puzzle, plex: MonitorPlay, nas: Server,
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
  } = useAppStore();
  const isTV = useDeviceProfile() === "tv";

  const [url, setUrl] = useState("");
  const [installing, setInstalling] = useState(false);
  const [plName, setPlName] = useState("");
  const [plUrl, setPlUrl] = useState("");
  const [epgName, setEpgName] = useState("");
  const [epgUrl, setEpgUrl] = useState("");
  const install = async () => {
    const u = url.trim();
    if (!u || installing) return;
    setInstalling(true);
    try {
      // Fetch the manifest to validate and pick up the addon's real name.
      const manifest = await fetchManifest(u);
      addAddon(u, "addon", manifest?.name);
    } catch {
      addAddon(u, "addon"); // unreachable manifest (offline/CORS) — still add by URL
    } finally {
      setInstalling(false);
      setUrl("");
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
          <Button variant="secondary" onClick={() => navigate("/signin")}>
            <MonitorPlay size={16} /> Switch user
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

      {/* Sources & Addons */}
      <section className="mt-6 rounded-xl border border-white/5 bg-surface p-6">
        <h2 className="flex items-center gap-2 text-lg font-bold"><Puzzle size={18} /> Your sources & addons</h2>
        <p className="mt-1 text-sm text-muted">
          Connect your own ways to watch. These appear in Quick Watch above the official options.
        </p>

        {/* Quick connect */}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => addAddon("plex://local", "plex")}>
            <MonitorPlay size={16} /> Connect Plex
          </Button>
          <Button variant="secondary" onClick={() => addAddon("nas://local", "nas")}>
            <Server size={16} /> Add NAS / Local
          </Button>
        </div>

        {/* Install by manifest URL */}
        <div className="mt-4 flex gap-2">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && install()}
            placeholder="https://addon.example.com/manifest.json  (e.g. AIOStreams)"
            className="focusable min-w-0 flex-1 rounded-lg border border-white/10 bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-accent"
          />
          <Button onClick={install} disabled={installing}><Plus size={16} /> {installing ? "Installing…" : "Install"}</Button>
        </div>

        <ul className="mt-4 space-y-2">
          {addons.map((a) => {
            const Icon = SOURCE_ICON[a.kind];
            return (
              <li key={a.id} className="flex items-center justify-between gap-3 rounded-lg bg-surface-2 px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <Icon size={18} className="shrink-0 text-accent" />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">{a.name}</div>
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

      {/* Status */}
      <section className="mt-6 rounded-xl border border-white/5 bg-surface p-6 text-sm text-muted">
        <h2 className="mb-2 text-lg font-bold text-white">Data</h2>
        <p>TMDB key: {hasTmdbKey ? <span className="text-accent">connected</span> : <span className="text-yellow-400">not set (demo mode)</span>}</p>
        <p>Region: {REGION}</p>
        <p className="mt-2 text-xs">IPTV / EPG live-TV support is planned for a later phase.</p>
      </section>
    </div>
  );
}

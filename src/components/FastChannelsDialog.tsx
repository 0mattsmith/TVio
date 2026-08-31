import { useEffect, useRef, useState } from "react";
import { X, Check, Server, Zap, Plus, ChevronLeft } from "lucide-react";
import { Button } from "./Button";
import { useAppStore } from "../store/useAppStore";
import { useOverlayBack } from "../hooks/useOverlayBack";
import { FAST_PRESETS, fastPresetName, fastChannelsFeed, type FastPreset } from "../services/fastChannels";

/**
 * Expandable, focus-locked FAST channels panel — like the service filter: a dark,
 * blurred backdrop, focus trapped inside, Back folds it away. Toggle a region's
 * playlist + guide; the FastChannels server is set from a small in-panel view
 * (a single scope, so focus stays put) rather than a loose text field.
 */
export function FastChannelsDialog({ onClose }: { onClose: () => void }) {
  const iptvPlaylists = useAppStore((s) => s.iptvPlaylists);
  const iptvEpgUrls = useAppStore((s) => s.iptvEpgUrls);
  const addIptvPlaylist = useAppStore((s) => s.addIptvPlaylist);
  const removeIptvPlaylist = useAppStore((s) => s.removeIptvPlaylist);
  const addIptvEpg = useAppStore((s) => s.addIptvEpg);
  const removeIptvEpg = useAppStore((s) => s.removeIptvEpg);
  const [view, setView] = useState<"list" | "server">("list");
  const [serverUrl, setServerUrl] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  // Back folds the panel — unless we're on the server view, where it steps back.
  const back = () => (view === "server" ? setView("list") : onClose());
  useOverlayBack(true, back);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        back();
      }
    };
    window.addEventListener("keydown", onKey, true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = prev;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  // Focus the first control whenever the view changes.
  useEffect(() => {
    const raf = requestAnimationFrame(() =>
      rootRef.current?.querySelector<HTMLElement>("input, button.focusable")?.focus()
    );
    return () => cancelAnimationFrame(raf);
  }, [view]);

  const fastOn = (p: FastPreset) => iptvPlaylists.some((x) => x.url === p.m3u);
  const toggle = (p: FastPreset) => {
    if (fastOn(p)) {
      iptvPlaylists.filter((x) => x.url === p.m3u).forEach((x) => removeIptvPlaylist(x.id));
      iptvEpgUrls.filter((x) => x.url === p.epg).forEach((x) => removeIptvEpg(x.id));
    } else {
      addIptvPlaylist(fastPresetName(p), p.m3u);
      addIptvEpg(fastPresetName(p), p.epg);
    }
  };

  // The submitted FastChannels base URL, recovered from its feed playlist.
  const serverPlaylist = iptvPlaylists.find((x) => /\/feeds\/[^/]+\/m3u$/.test(x.url));
  const serverBase = serverPlaylist ? serverPlaylist.url.replace(/\/feeds\/[^/]+\/m3u$/, "") : "";

  const openServer = () => {
    setServerUrl(serverBase);
    setView("server");
  };
  const saveServer = () => {
    if (!serverUrl.trim()) return;
    // Replace any existing FastChannels feed with the new one.
    iptvPlaylists.filter((x) => /\/feeds\/[^/]+\/m3u$/.test(x.url)).forEach((x) => removeIptvPlaylist(x.id));
    iptvEpgUrls.filter((x) => /\/feeds\/[^/]+\/epg\.xml$/.test(x.url)).forEach((x) => removeIptvEpg(x.id));
    const { m3u, epg } = fastChannelsFeed(serverUrl);
    addIptvPlaylist("FastChannels", m3u);
    addIptvEpg("FastChannels", epg);
    setView("list");
  };

  return (
    <div
      data-spatial-scope
      onClick={onClose}
      className="fixed inset-0 z-[75] flex justify-end bg-black/75 backdrop-blur-md"
    >
      <div
        ref={rootRef}
        onClick={(e) => e.stopPropagation()}
        className="animate-fade-in flex h-full w-full max-w-md flex-col border-l border-white/10 bg-surface p-6 shadow-card"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-xl font-black tracking-tight">
            <Zap size={20} className="text-accent" /> FAST channels
          </h2>
          <button onClick={onClose} className="focusable rounded-full p-1 text-muted hover:text-white" aria-label="Close">
            <X size={24} />
          </button>
        </div>

        {view === "list" ? (
          <>
            <p className="mb-4 text-xs text-muted">
              Free ad-supported channels (Pluto TV, Samsung TV Plus, Plex). Toggle a region's playlist &amp; guide, then press Back to close.
            </p>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
              {FAST_PRESETS.map((p) => {
                const on = fastOn(p);
                return (
                  <button
                    key={p.key}
                    onClick={() => toggle(p)}
                    aria-pressed={on}
                    className="focusable flex w-full items-center gap-3 rounded-lg border border-white/10 bg-surface-2 px-3 py-2.5 text-left"
                  >
                    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${on ? "border-accent bg-accent text-black" : "border-white/30"}`}>
                      {on && <Check size={14} strokeWidth={3} />}
                    </span>
                    <span className="text-sm font-semibold">{fastPresetName(p)}</span>
                  </button>
                );
              })}

              {/* FastChannels server — unselectable label + a step-in view to set it. */}
              <div className="mt-4 rounded-lg border border-white/10 bg-surface-2 p-3">
                <div className="mb-1 flex items-center gap-2 text-xs font-semibold"><Server size={14} className="text-accent" /> FastChannels server</div>
                <p className="mb-2 text-[11px] text-muted">Running FastChannels (Docker)? Add its address to load your own always-fresh lineup.</p>
                <button
                  onClick={openServer}
                  className="focusable flex w-full items-center justify-between gap-2 rounded-lg border border-white/10 bg-surface px-3 py-2.5 text-left"
                >
                  <span className={`truncate text-sm ${serverBase ? "font-semibold" : "text-muted"}`}>
                    {serverBase || "http://192.168.1.50:5523"}
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-accent">{serverBase ? "Change" : "Add"}</span>
                </button>
              </div>
            </div>
            <Button className="mt-4 w-full" onClick={onClose}>Done</Button>
          </>
        ) : (
          <>
            <button onClick={() => setView("list")} className="focusable mb-4 inline-flex items-center gap-1 self-start rounded-md px-1 text-sm font-semibold text-muted hover:text-white">
              <ChevronLeft size={16} /> Back
            </button>
            <div className="flex items-center gap-2 text-sm font-semibold"><Server size={16} className="text-accent" /> FastChannels server</div>
            <p className="mt-1 text-xs text-muted">Paste the base address of your FastChannels server. TVio loads its default feed and guide.</p>
            <input
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              placeholder="http://192.168.1.50:5523"
              className="focusable mt-3 w-full rounded-lg border border-white/10 bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-accent"
            />
            <div className="mt-4 flex gap-2.5">
              <Button className="flex-1" onClick={saveServer}><Plus size={16} /> Add server</Button>
              <Button variant="ghost" onClick={() => setView("list")}>Cancel</Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

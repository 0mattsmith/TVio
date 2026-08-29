import { useEffect, useRef, useState } from "react";
import { Plus, FolderOpen, X, Check, SlidersHorizontal } from "lucide-react";
import { Button } from "./Button";
import { useOverlayBack } from "../hooks/useOverlayBack";
import { pickLocalHtml, pickElements, nativeBrowserAvailable } from "../services/tvioBrowser";
import type { LiveChannel } from "../store/useAppStore";

function CheckRow({ on, onToggle, title, desc }: { on: boolean; onToggle: () => void; title: string; desc: string }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      className="focusable flex w-full items-start gap-2.5 rounded-lg border border-white/10 bg-surface-2 px-3 py-2.5 text-left"
    >
      <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border ${on ? "border-accent bg-accent text-black" : "border-white/30"}`}>
        {on && <Check size={14} strokeWidth={3} />}
      </span>
      <span className="min-w-0">
        <span className="text-sm font-semibold">{title}</span>
        <span className="block text-[11px] text-muted">{desc}</span>
      </span>
    </button>
  );
}

/**
 * Add or edit a Live TV "web channel" from a focus-locked dialog (data-spatial-
 * scope), like the add-profile popup — so a stray D-pad press can't wander off
 * into Settings.
 */
export function AddWebChannelDialog({
  initial,
  onClose,
  onSave,
}: {
  initial?: LiveChannel;
  onClose: () => void;
  onSave: (v: { name: string; url: string; isolate: boolean; hideChrome: boolean; hiddenSelectors: string[] }) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [url, setUrl] = useState(initial?.url ?? "");
  const [isolate, setIsolate] = useState(!!initial?.isolate);
  const [hideChrome, setHideChrome] = useState(!!initial?.hideChrome);
  const [hiddenSelectors, setHiddenSelectors] = useState<string[]>(initial?.hiddenSelectors ?? []);
  const [picking, setPicking] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useOverlayBack(true, onClose);

  useEffect(() => {
    const raf = requestAnimationFrame(() => rootRef.current?.querySelector<HTMLInputElement>("input")?.focus());
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Backspace") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [onClose]);

  const submit = () => {
    if (!url.trim()) return;
    onSave({ name, url, isolate, hideChrome, hiddenSelectors });
    onClose();
  };

  const customise = async () => {
    if (!url.trim() || picking) return;
    setPicking(true);
    try {
      const sel = await pickElements(url);
      if (sel.length) setHiddenSelectors(sel);
    } finally {
      setPicking(false);
    }
  };

  return (
    <div
      data-spatial-scope
      onClick={onClose}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm"
    >
      <div
        ref={rootRef}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-white/10 bg-surface p-6 shadow-card"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">{initial ? "Edit web channel" : "Add a web channel"}</h2>
            <p className="mt-1 text-sm text-muted">A website link, or a local .html page. It opens in the TVio browser.</p>
          </div>
          <button onClick={onClose} className="focusable rounded-full p-1 text-muted hover:text-white" aria-label="Close">
            <X size={22} />
          </button>
        </div>

        <div className="mt-5 space-y-2.5">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
            className="focusable w-full rounded-lg border border-white/10 bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-accent"
          />
          <div className="flex gap-2">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…  or a local .html file"
              className="focusable min-w-0 flex-1 rounded-lg border border-white/10 bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-accent"
            />
            {nativeBrowserAvailable() && (
              <Button
                variant="secondary"
                onClick={async () => {
                  const r = await pickLocalHtml();
                  if (r) { setUrl(r.url); if (!name.trim()) setName(r.name); }
                }}
              >
                <FolderOpen size={16} /> Browse
              </Button>
            )}
          </div>

          <CheckRow
            on={isolate}
            onToggle={() => setIsolate((v) => !v)}
            title="Player only"
            desc="If the page has a single media player, hide everything else and fit it to the screen."
          />
          <CheckRow
            on={hideChrome}
            onToggle={() => setHideChrome((v) => !v)}
            title="Hide banners & navbars"
            desc="Strip menus, headers and cookie bars but keep the rest of the page."
          />

          {nativeBrowserAvailable() && (
            <button
              type="button"
              onClick={customise}
              disabled={!url.trim() || picking}
              className="focusable flex w-full items-start gap-2.5 rounded-lg border border-white/10 bg-surface-2 px-3 py-2.5 text-left disabled:opacity-40"
            >
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-accent">
                <SlidersHorizontal size={16} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="text-sm font-semibold">Customise…</span>
                <span className="block text-[11px] text-muted">
                  {picking
                    ? "Loading the page — tick anything to hide."
                    : hiddenSelectors.length
                      ? `${hiddenSelectors.length} element${hiddenSelectors.length === 1 ? "" : "s"} hidden. Tap to change.`
                      : "Open the page and pick elements to remove."}
                </span>
              </span>
            </button>
          )}
        </div>

        <div className="mt-6 flex gap-2.5">
          <Button className="flex-1" onClick={submit}><Plus size={16} /> {initial ? "Save" : "Add channel"}</Button>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}

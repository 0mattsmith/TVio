import { useEffect, useRef, useState } from "react";
import { Plus, FolderOpen, X } from "lucide-react";
import { Button } from "./Button";
import { useOverlayBack } from "../hooks/useOverlayBack";
import { pickLocalHtml, nativeBrowserAvailable } from "../services/tvioBrowser";

/**
 * Add a Live TV "web channel" from a contained dialog — focus is locked inside
 * it (data-spatial-scope) so a stray D-pad press can't wander off into Settings,
 * mirroring the add-profile popup.
 */
export function AddWebChannelDialog({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (name: string, url: string) => void;
}) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useOverlayBack(true, onClose);

  useEffect(() => {
    const raf = requestAnimationFrame(() => rootRef.current?.querySelector<HTMLInputElement>("input")?.focus());
    // Capture, so Back closes the dialog before the global handler sends focus off.
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
    onAdd(name, url);
    onClose();
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
            <h2 className="text-lg font-bold">Add a web channel</h2>
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
          <p className="text-[11px] text-muted">A local file picked with Browse stays a local file — no https:// is added to it.</p>
        </div>

        <div className="mt-6 flex gap-2.5">
          <Button className="flex-1" onClick={submit}><Plus size={16} /> Add channel</Button>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}

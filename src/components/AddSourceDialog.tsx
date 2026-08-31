import { useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "./Button";
import { useOverlayBack } from "../hooks/useOverlayBack";

/**
 * A tiny focus-locked "add a source" dialog (Name + URL, or URL only) — dark,
 * blurred backdrop, focus trapped to the two fields, Back/Escape closes. Used
 * for M3U playlists, EPG guides and the FastChannels server, so the fields
 * aren't loose D-pad focus targets on the Settings page.
 */
export function AddSourceDialog({
  title,
  subtitle,
  withName = true,
  nameLabel = "Name",
  urlPlaceholder,
  initialName = "",
  initialUrl = "",
  saveLabel = "Add",
  onClose,
  onSave,
}: {
  title: string;
  subtitle?: string;
  withName?: boolean;
  nameLabel?: string;
  urlPlaceholder: string;
  initialName?: string;
  initialUrl?: string;
  saveLabel?: string;
  onClose: () => void;
  onSave: (v: { name: string; url: string }) => void;
}) {
  const [name, setName] = useState(initialName);
  const [url, setUrl] = useState(initialUrl);
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
    onSave({ name: name.trim(), url: url.trim() });
    onClose();
  };

  return (
    <div
      data-spatial-scope
      onClick={onClose}
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-6 backdrop-blur-md"
    >
      <div
        ref={rootRef}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-white/10 bg-surface p-6 shadow-card"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">{title}</h2>
            {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="focusable rounded-full p-1 text-muted hover:text-white" aria-label="Close">
            <X size={22} />
          </button>
        </div>

        <div className="mt-5 space-y-2.5">
          {withName && (
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={nameLabel}
              className="focusable w-full rounded-lg border border-white/10 bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-accent"
            />
          )}
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={urlPlaceholder}
            className="focusable w-full rounded-lg border border-white/10 bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-accent"
          />
        </div>

        <div className="mt-6 flex gap-2.5">
          <Button className="flex-1" onClick={submit}><Plus size={16} /> {saveLabel}</Button>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}

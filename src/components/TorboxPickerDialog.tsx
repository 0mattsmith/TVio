import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X, FileVideo } from "lucide-react";
import { listLibrary, type TorboxFile } from "../services/torbox";
import { useOverlayBack } from "../hooks/useOverlayBack";
import { humanSize } from "../addons/manager";

/**
 * Browse your own TorBox library and pick the file to pin. Focus-locked, dark
 * blurred backdrop, Back closes — same pattern as the other overlays.
 */
export function TorboxPickerDialog({
  onClose,
  onPick,
}: {
  onClose: () => void;
  onPick: (file: TorboxFile) => void;
}) {
  const [q, setQ] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useOverlayBack(true, onClose);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["torbox-library"],
    queryFn: listLibrary,
    staleTime: 60_000,
    retry: 0,
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Backspace") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const raf = requestAnimationFrame(() => rootRef.current?.querySelector<HTMLElement>("input")?.focus());
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = prev;
      cancelAnimationFrame(raf);
    };
  }, [onClose]);

  const ql = q.trim().toLowerCase();
  const files = (data || []).filter((f) => !ql || `${f.item} ${f.name}`.toLowerCase().includes(ql));

  return (
    <div
      data-spatial-scope
      onClick={onClose}
      className="fixed inset-0 z-[85] flex justify-end bg-black/75 backdrop-blur-md"
    >
      <div
        ref={rootRef}
        onClick={(e) => e.stopPropagation()}
        className="animate-fade-in flex h-full w-full max-w-md flex-col border-l border-white/10 bg-surface p-6 shadow-card"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xl font-black tracking-tight">Link a TorBox file</h2>
          <button onClick={onClose} className="focusable rounded-full p-1 text-muted hover:text-white" aria-label="Close">
            <X size={24} />
          </button>
        </div>
        <p className="mb-3 text-xs text-muted">
          Pick the owned file this should always play. It's saved as a shortcut — no more searching.
        </p>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search your library…"
          className="focusable mb-3 w-full rounded-lg border border-white/10 bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-accent"
        />
        <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto">
          {isLoading ? (
            Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-12 rounded-lg" />)
          ) : isError ? (
            <p className="rounded-lg bg-surface-2/50 px-3 py-2 text-xs text-muted">
              Couldn't reach TorBox. Check your API key in Settings.
            </p>
          ) : files.length === 0 ? (
            <p className="rounded-lg bg-surface-2/50 px-3 py-2 text-xs text-muted">
              {data && data.length ? "No files match your search." : "No video files found in your TorBox library."}
            </p>
          ) : (
            files.map((f) => (
              <button
                key={`${f.type}-${f.id}-${f.fileId}`}
                onClick={() => { onPick(f); onClose(); }}
                className="focusable flex w-full items-center gap-3 rounded-lg bg-surface-2 px-3 py-2.5 text-left hover:bg-white/10"
              >
                <FileVideo size={16} className="shrink-0 text-accent" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{f.name}</div>
                  <div className="truncate text-[11px] text-muted">
                    {[f.item, humanSize(f.size)].filter(Boolean).join("  ·  ")}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

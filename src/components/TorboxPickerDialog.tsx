import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X, FileVideo, Link2Off } from "lucide-react";
import { listLibrary, type TorboxFile } from "../services/torbox";
import { useOverlayBack } from "../hooks/useOverlayBack";
import { humanSize } from "../addons/manager";

/** First plausible year in a filename, for grouping (keeps the list small). */
const yearOf = (name: string): string => name.match(/\b(19\d\d|20\d\d)\b/)?.[1] ?? "";

/**
 * Browse your own TorBox library and pick the file to pin. Focus-locked, dark
 * blurred backdrop, Back closes. The list is pre-filtered to files that look
 * like they belong to this show (toggle to see everything) and split by year so
 * a big library doesn't lag — defaulting to the episode's own year.
 */
export function TorboxPickerDialog({
  onClose,
  onPick,
  onUnlink,
  filterTokens,
  defaultYear,
}: {
  onClose: () => void;
  onPick: (file: TorboxFile) => void;
  onUnlink?: () => void;
  /** Show words (e.g. ["raw"]) — the list defaults to files containing one. */
  filterTokens?: string[];
  /** Year to open on (the episode's year). */
  defaultYear?: string;
}) {
  const [q, setQ] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [yearSel, setYearSel] = useState<string>(defaultYear || "all");
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

  const tokens = (filterTokens || []).map((t) => t.toLowerCase()).filter(Boolean);
  const hasFilter = tokens.length > 0;
  const matchesTokens = (f: TorboxFile) =>
    !hasFilter || tokens.some((t) => f.name.toLowerCase().includes(t) || f.item.toLowerCase().includes(t));

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const base = useMemo(() => (data || []).filter((f) => showAll || matchesTokens(f)), [data, showAll, tokens.join(",")]);
  const years = useMemo(
    () => Array.from(new Set(base.map((f) => yearOf(f.name)).filter(Boolean))).sort((a, b) => b.localeCompare(a)),
    [base]
  );
  // If the episode's year isn't present in the (filtered) library, fall back to All.
  useEffect(() => {
    if (yearSel !== "all" && years.length && !years.includes(yearSel)) setYearSel("all");
  }, [years, yearSel]);

  const ql = q.trim().toLowerCase();
  const files = base.filter(
    (f) =>
      (yearSel === "all" || yearOf(f.name) === yearSel) &&
      (!ql || `${f.item} ${f.name}`.toLowerCase().includes(ql))
  );

  const chip = (on: boolean) =>
    `focusable shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${on ? "bg-accent text-black" : "bg-surface-2 text-muted hover:text-white"}`;

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
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-xl font-black tracking-tight">Link a TorBox file</h2>
          <div className="flex items-center gap-1.5">
            {onUnlink && (
              <button
                onClick={() => { onUnlink(); onClose(); }}
                className="focusable flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-red-400 hover:text-red-300"
              >
                <Link2Off size={14} /> Unlink
              </button>
            )}
            <button onClick={onClose} className="focusable rounded-full p-1 text-muted hover:text-white" aria-label="Close">
              <X size={24} />
            </button>
          </div>
        </div>
        <p className="mb-3 text-xs text-muted">Pick the owned file this should always play — saved as a shortcut, no more searching.</p>

        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search your library…"
          className="focusable mb-2 w-full rounded-lg border border-white/10 bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-accent"
        />

        {/* Year filter + show-all toggle keep the initial list small and relevant. */}
        <div className="mb-2 flex items-center gap-2">
          <div className="no-scrollbar flex flex-1 items-center gap-1.5 overflow-x-auto">
            <button onClick={() => setYearSel("all")} className={chip(yearSel === "all")}>All years</button>
            {years.map((y) => (
              <button key={y} onClick={() => setYearSel(y)} className={chip(yearSel === y)}>{y}</button>
            ))}
          </div>
          {hasFilter && (
            <button
              onClick={() => setShowAll((v) => !v)}
              className="focusable shrink-0 rounded-full border border-white/10 px-2.5 py-1 text-[11px] font-semibold text-muted hover:text-white"
            >
              {showAll ? "Only this show" : "Show all"}
            </button>
          )}
        </div>

        <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto">
          {isLoading ? (
            Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-12 rounded-lg" />)
          ) : isError ? (
            <p className="rounded-lg bg-surface-2/50 px-3 py-2 text-xs text-muted">Couldn't reach TorBox. Check your API key in Settings.</p>
          ) : files.length === 0 ? (
            <p className="rounded-lg bg-surface-2/50 px-3 py-2 text-xs text-muted">
              {(data || []).length === 0
                ? "No video files found in your TorBox library."
                : hasFilter && !showAll
                  ? "Nothing here for this show/year — try “Show all” or another year."
                  : "No files match."}
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
                  <div className="truncate text-[11px] text-muted">{[f.item, humanSize(f.size)].filter(Boolean).join("  ·  ")}</div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

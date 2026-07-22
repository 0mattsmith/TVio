import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

/**
 * A disclosure "dropdown box": a summary button that expands a bordered panel
 * directly beneath it, in normal flow.
 *
 * Deliberately in-flow rather than a floating popover — on the TV the whole app
 * is zoomed and driven by a D-pad, and an absolutely-positioned popover is easy
 * to clip or lose focus into. Expanding in place keeps every option a plain
 * focusable element the spatial-nav can reach, and Back behaves normally.
 */
export function Dropdown({
  summary,
  children,
  ariaLabel,
  defaultOpen = false,
}: {
  summary: ReactNode;
  /** A render function receives a `close` callback (handy for single-select). */
  children: ReactNode | ((close: () => void) => ReactNode);
  ariaLabel?: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((v) => !v)}
        className="focusable flex w-full items-center justify-between gap-3 rounded-lg border border-white/10 bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-accent"
      >
        <span className="min-w-0 truncate text-left">{summary}</span>
        <ChevronDown size={16} className={`shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="mt-2 rounded-xl border border-white/10 bg-black/20 p-3">
          {typeof children === "function" ? children(() => setOpen(false)) : children}
        </div>
      )}
    </div>
  );
}

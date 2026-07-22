import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { useOverlayBack } from "../hooks/useOverlayBack";

/**
 * A disclosure "dropdown box": a summary button that expands a bordered panel
 * directly beneath it, in normal flow.
 *
 * Deliberately in-flow rather than a floating popover — on the TV the whole app
 * is zoomed and driven by a D-pad, and an absolutely-positioned popover is easy
 * to clip or lose focus into. Expanding in place keeps every option a plain
 * focusable element the spatial-nav can reach.
 *
 * While open it marks itself a spatial-nav scope (so the D-pad stays among the
 * options) and registers with Back, so the hardware/keyboard Back button closes
 * the panel rather than leaving the page.
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
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  const close = () => setOpen(false);

  // Hardware/keyboard Back closes the panel instead of leaving the page.
  useOverlayBack(open, close);

  useEffect(() => {
    if (!open) {
      // Closing: hand focus back to the trigger so the selection stays visible.
      if (wasOpen.current) triggerRef.current?.focus();
      wasOpen.current = false;
      return;
    }
    wasOpen.current = true;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    };
    window.addEventListener("keydown", onKey);
    // Drop focus onto the first option so the D-pad lands inside the panel.
    const raf = requestAnimationFrame(() =>
      panelRef.current?.querySelector<HTMLElement>(".focusable, a[href], button")?.focus()
    );
    return () => {
      window.removeEventListener("keydown", onKey);
      cancelAnimationFrame(raf);
    };
  }, [open]);

  return (
    <div>
      <button
        ref={triggerRef}
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
        <div ref={panelRef} data-spatial-scope className="mt-2 rounded-xl border border-white/10 bg-black/20 p-3">
          {typeof children === "function" ? children(close) : children}
        </div>
      )}
    </div>
  );
}

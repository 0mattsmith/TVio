import { useEffect, useRef, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { Radio, ChevronDown, Tv2, Globe } from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import { useOverlayBack } from "../hooks/useOverlayBack";
import { openBrowser } from "../services/tvioBrowser";

const linkCls = (active: boolean) =>
  `focusable flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold transition-colors sm:px-4 ${
    active ? "bg-accent-soft text-accent" : "text-white/85 hover:text-white"
  }`;

/**
 * The Live TV entry in the navbar. With more than one destination (the IPTV TV
 * guide plus any user-added web channels) it drops a submenu; with one it goes
 * straight there; with none it points at the Live TV page, which prompts setup.
 */
export function LiveTvMenu() {
  const navigate = useNavigate();
  const iptvEnabled = useAppStore((s) => s.iptvEnabled);
  const liveChannels = useAppStore((s) => s.liveChannels);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useOverlayBack(open, () => setOpen(false));

  // Focus the first item on open (TV), and close on Escape / Back before the
  // global handler can fling focus back to the navbar.
  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => menuRef.current?.querySelector<HTMLButtonElement>("button")?.focus());
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Backspace") {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  const dests = [
    ...(iptvEnabled ? [{ key: "guide", label: "TV Guide", icon: <Tv2 size={16} className="text-accent" />, run: () => navigate("/live") }] : []),
    ...liveChannels.map((c) => ({ key: c.id, label: c.name, icon: <Globe size={16} className="text-accent" />, run: () => void openBrowser(c.url) })),
  ];

  const label = (
    <>
      <Radio size={17} className="sm:hidden" />
      <span className="hidden sm:inline">Live TV</span>
      <span className="sr-only sm:hidden">Live TV</span>
    </>
  );

  if (dests.length === 0) {
    return (
      <NavLink to="/live" className={({ isActive }) => linkCls(isActive)}>
        {label}
      </NavLink>
    );
  }

  if (dests.length === 1) {
    return (
      <button onClick={dests[0].run} className={linkCls(false)} aria-label="Live TV">
        {label}
      </button>
    );
  }

  return (
    <div className="relative">
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label="Live TV" className={linkCls(open)}>
        <Radio size={17} className="sm:hidden" />
        <span className="hidden items-center gap-1 sm:flex">Live TV <ChevronDown size={14} /></span>
        <span className="sr-only sm:hidden">Live TV</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            data-spatial-scope
            ref={menuRef}
            className="animate-fade-in absolute left-1/2 top-full z-50 mt-2 w-60 max-w-[80vw] -translate-x-1/2 overflow-hidden rounded-xl border border-white/10 bg-surface p-1.5 shadow-card"
          >
            {dests.map((d) => (
              <button
                key={d.key}
                onClick={() => { setOpen(false); d.run(); }}
                className="focusable flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-semibold hover:bg-white/10"
              >
                {d.icon}
                <span className="truncate">{d.label}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

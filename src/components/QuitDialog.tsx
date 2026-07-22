import { useEffect, useRef, useState } from "react";
import { Button } from "./Button";
import { registerBackInterceptor, quitApp } from "../platform/backButton";

/**
 * "Quit TVio?" confirmation.
 *
 * On a top-level tab the navbar is the top of navigation, so Back from it means
 * "leave the app". Rather than dropping out on a single stray press, the native
 * Back handler fires a `tvio:confirm-quit` event and this asks first. Back while
 * it's open means "no" (a registered Back interceptor closes it).
 */
export function QuitDialog() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onAsk = () => setOpen(true);
    window.addEventListener("tvio:confirm-quit", onAsk);
    return () => window.removeEventListener("tvio:confirm-quit", onAsk);
  }, []);

  useEffect(() => {
    if (!open) return;
    const unreg = registerBackInterceptor(() => {
      setOpen(false);
      return true;
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    // Default focus on "Stay", so an accidental OK never quits.
    const raf = requestAnimationFrame(() => rootRef.current?.querySelector<HTMLElement>("button")?.focus());
    return () => {
      unreg();
      window.removeEventListener("keydown", onKey);
      cancelAnimationFrame(raf);
    };
  }, [open]);

  if (!open) return null;

  return (
    <div data-spatial-scope className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div ref={rootRef} className="w-full max-w-sm rounded-2xl border border-white/10 bg-surface p-6 text-center shadow-card">
        <h2 className="text-xl font-black tracking-tight">Quit TVio?</h2>
        <p className="mt-2 text-sm text-muted">You can jump right back in any time.</p>
        <div className="mt-6 flex justify-center gap-3">
          <Button variant="secondary" onClick={() => setOpen(false)}>Stay</Button>
          <Button onClick={() => quitApp()}>Quit</Button>
        </div>
      </div>
    </div>
  );
}

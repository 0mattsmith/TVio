import { isNativeShell } from "../platform/capabilities";

export function Logo({ lite, className = "" }: { lite?: boolean; className?: string }) {
  // The limited web / PWA / GitHub Pages build brands as "TVio Lite"; the native
  // Windows / Android / Android TV builds are just "TVio". (Branding follows the
  // shell, not playback capability — those are separate concerns.)
  const showLite = lite ?? !isNativeShell();
  return (
    <span className={`inline-flex items-center gap-2 select-none ${className}`}>
      <span className="text-2xl font-black tracking-tight">
        <span className="text-white">TV</span>
        <span className="text-accent">io</span>
      </span>
      {showLite && (
        <span className="rounded-md border border-accent/60 bg-accent-soft px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-accent">
          Lite
        </span>
      )}
    </span>
  );
}

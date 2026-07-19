export function Chip({
  label,
  active,
  color,
  onClick,
}: {
  label: string;
  active: boolean;
  color?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`focusable flex items-center gap-2 whitespace-nowrap rounded-full border px-4 py-1.5 text-sm font-semibold transition-all ${
        active
          ? "border-accent bg-accent text-black"
          : "border-white/15 bg-surface-2 text-muted hover:border-white/40 hover:text-white"
      }`}
    >
      {color && (
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
      )}
      {label}
    </button>
  );
}

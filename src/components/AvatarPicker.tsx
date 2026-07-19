import { PROFILE_AVATARS } from "../store/useAppStore";

export function AvatarPicker({
  value,
  onChange,
  size = "md",
}: {
  value: string;
  onChange: (v: string) => void;
  size?: "sm" | "md";
}) {
  const tile = size === "sm" ? "h-9 w-9 text-xl" : "h-11 w-11 text-2xl";
  return (
    <div className="flex flex-wrap gap-2">
      {PROFILE_AVATARS.map((a) => (
        <button
          key={a}
          type="button"
          onClick={() => onChange(a)}
          className={`focusable flex items-center justify-center rounded-lg transition-colors ${tile} ${
            value === a ? "bg-accent-soft ring-2 ring-accent" : "bg-surface-2 hover:bg-white/10"
          }`}
        >
          {a}
        </button>
      ))}
    </div>
  );
}

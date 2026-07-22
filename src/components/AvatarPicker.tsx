import { PROFILE_AVATARS } from "../store/useAppStore";
import { Dropdown } from "./Dropdown";

export function AvatarPicker({
  value,
  onChange,
  size = "md",
  dropdown = false,
}: {
  value: string;
  onChange: (v: string) => void;
  size?: "sm" | "md";
  /** Collapse the grid behind a dropdown (used in Settings to save space). */
  dropdown?: boolean;
}) {
  const tile = size === "sm" ? "h-9 w-9 text-xl" : "h-11 w-11 text-2xl";

  const tileButton = (a: string, onPick: () => void) => (
    <button
      key={a}
      type="button"
      onClick={onPick}
      className={`focusable flex items-center justify-center rounded-lg transition-colors ${tile} ${
        value === a ? "bg-accent-soft ring-2 ring-accent" : "bg-surface-2 hover:bg-white/10"
      }`}
    >
      {a}
    </button>
  );

  if (dropdown) {
    return (
      <Dropdown
        ariaLabel="Choose an avatar"
        summary={
          <span className="flex items-center gap-2">
            <span className="text-lg">{value}</span>
            <span className="text-muted">Choose avatar</span>
          </span>
        }
      >
        {(close) => (
          <div className="grid grid-cols-6 gap-2 sm:grid-cols-8">
            {PROFILE_AVATARS.map((a) => tileButton(a, () => { onChange(a); close(); }))}
          </div>
        )}
      </Dropdown>
    );
  }

  return <div className="flex flex-wrap gap-2">{PROFILE_AVATARS.map((a) => tileButton(a, () => onChange(a)))}</div>;
}

import { useSyncExternalStore } from "react";
import { detectPlatform, type DeviceProfile } from "../platform";
import { useAppStore } from "../store/useAppStore";

// Re-evaluate the auto-detected profile on resize / orientation change.
function subscribe(cb: () => void) {
  window.addEventListener("resize", cb);
  return () => window.removeEventListener("resize", cb);
}

// Resolved device profile: a manual override from Settings wins, otherwise we
// auto-detect (native global → UA → screen size).
export function useDeviceProfile(): DeviceProfile {
  const override = useAppStore((s) => s.platformOverride);
  const auto = useSyncExternalStore(subscribe, detectPlatform, () => "web" as DeviceProfile);
  return override === "auto" ? auto : override;
}

export function useIsTV(): boolean {
  return useDeviceProfile() === "tv";
}

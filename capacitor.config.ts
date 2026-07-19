import type { CapacitorConfig } from "@capacitor/cli";

// The Android phone + Android TV APKs wrap the same web build. The native
// runtime is detected in-app via the injected `window.Capacitor` global, which
// unlocks all-format playback and the companion receiver.
const config: CapacitorConfig = {
  appId: "app.tvio.mobile",
  appName: "TVio",
  webDir: "dist",
  server: {
    androidScheme: "https",
  },
  android: {
    // Debug APK for testers; wire release signing via CI secrets (see BUILD.md).
    buildOptions: {},
  },
};

export default config;

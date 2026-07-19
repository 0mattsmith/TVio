import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("./package.json", "utf8")) as { version: string };

// base: "./" keeps asset paths relative so the same build works on GitHub Pages
// (any repo subpath), in Tauri, and inside Capacitor's file:// webview.
export default defineConfig({
  plugins: [react()],
  base: "./",
  define: {
    // Used by the auto-updater to compare against the latest GitHub Release.
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: { outDir: "dist", sourcemap: false },
});

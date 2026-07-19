/**
 * Stamps the device profile into the Capacitor web assets.
 *
 * The phone and TV APKs are built from the same dist/, and Android TV's WebView
 * user agent usually looks exactly like a phone's — no "TV" anywhere in it — so
 * runtime sniffing silently falls through to the desktop layout. Deciding at
 * build time is the only reliable signal we have.
 *
 * Run after `npx cap sync android` and before each Gradle build:
 *   node scripts/inject-platform.mjs mobile   # then assemble the phone APK
 *   node scripts/inject-platform.mjs tv       # then assemble the TV APK
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const profile = process.argv[2];
if (!["tv", "mobile", "web"].includes(profile)) {
  console.error("Usage: node scripts/inject-platform.mjs <tv|mobile|web>");
  process.exit(1);
}

const INDEX = "android/app/src/main/assets/public/index.html";
if (!existsSync(INDEX)) {
  console.error(`Web assets not found at ${INDEX} — run 'npx cap sync android' first.`);
  process.exit(1);
}

// Idempotent: replace a previous stamp rather than stacking them up, so the TV
// pass cleanly overwrites the phone pass.
const EXISTING = /[ \t]*<script id="tvio-platform">[\s\S]*?<\/script>\n?/;
const tag = `<script id="tvio-platform">window.__TVIO_PLATFORM__=${JSON.stringify(profile)};</script>`;

let html = readFileSync(INDEX, "utf8");
html = EXISTING.test(html) ? html.replace(EXISTING, `    ${tag}\n`) : html.replace(/<head>/i, `<head>\n    ${tag}`);

if (!html.includes("__TVIO_PLATFORM__")) {
  console.error("Couldn't find a <head> to inject into — the profile would be wrong at runtime.");
  process.exit(1);
}

writeFileSync(INDEX, html);
console.log(`✓ __TVIO_PLATFORM__ = "${profile}"`);

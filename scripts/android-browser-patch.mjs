/**
 * Wires the native TV web browser into the generated Android project.
 *
 * CI regenerates android/ every build, so — like the ExoPlayer patch — this runs
 * afterwards and does three things:
 *   1. copies TvioBrowser.java + TvioBrowserActivity.java into the app package
 *   2. registers the TvioBrowser plugin in MainActivity
 *   3. declares TvioBrowserActivity in the manifest
 *
 * No extra Gradle deps: it's a plain WebView. Must run AFTER
 * android-updater-patch.mjs (which writes MainActivity) and alongside the
 * ExoPlayer patch (the browser hands videos to TvioPlayerActivity).
 */
import { readFileSync, writeFileSync, existsSync, copyFileSync } from "node:fs";

const PKG = "app.tvio.mobile";
const PKG_DIR = `android/app/src/main/java/${PKG.replace(/\./g, "/")}`;
const MANIFEST = "android/app/src/main/AndroidManifest.xml";
const MAIN_ACTIVITY = `${PKG_DIR}/MainActivity.java`;

if (!existsSync("android/app/src/main")) {
  console.error("No Android project — run 'npx cap add android' first.");
  process.exit(1);
}

// 1) Native sources ----------------------------------------------------------
copyFileSync("android-src/TvioBrowser.java", `${PKG_DIR}/TvioBrowser.java`);
copyFileSync("android-src/TvioBrowserActivity.java", `${PKG_DIR}/TvioBrowserActivity.java`);
console.log("✓ TvioBrowser + TvioBrowserActivity copied");

// 2) Register the plugin -----------------------------------------------------
if (existsSync(MAIN_ACTIVITY)) {
  let main = readFileSync(MAIN_ACTIVITY, "utf8");
  if (!main.includes("registerPlugin(TvioBrowser.class)")) {
    // Sit alongside the ExoPlayer registration the previous patch wrote.
    main = main.replace(
      /(registerPlugin\(NativePlayer\.class\);)/,
      `$1\n        registerPlugin(TvioBrowser.class);`
    );
    // Fallback if the ExoPlayer patch layout ever changes.
    if (!main.includes("registerPlugin(TvioBrowser.class)")) {
      main = main.replace(
        /(super\.onCreate\(savedInstanceState\);)/,
        `registerPlugin(TvioBrowser.class);\n        $1`
      );
    }
    writeFileSync(MAIN_ACTIVITY, main);
    console.log("✓ TvioBrowser registered in MainActivity");
  } else {
    console.log("• TvioBrowser already registered");
  }
} else {
  console.error(`No ${MAIN_ACTIVITY} — run android-updater-patch.mjs first.`);
  process.exit(1);
}

// 3) Declare the activity ----------------------------------------------------
let manifest = readFileSync(MANIFEST, "utf8");
if (!manifest.includes("TvioBrowserActivity")) {
  const activity =
    `        <activity\n` +
    `            android:name=".TvioBrowserActivity"\n` +
    `            android:exported="false"\n` +
    `            android:configChanges="orientation|screenSize|screenLayout|keyboardHidden"\n` +
    `            android:theme="@android:style/Theme.Black.NoTitleBar" />`;
  // Right after the opening <application …> tag.
  manifest = manifest.replace(/(<application\b[^>]*>)/, `$1\n${activity}`);
  writeFileSync(MANIFEST, manifest);
  console.log("✓ TvioBrowserActivity declared in the manifest");
} else {
  console.log("• TvioBrowserActivity already declared");
}

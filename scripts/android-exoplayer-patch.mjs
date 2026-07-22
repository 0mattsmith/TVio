/**
 * Wires the native ExoPlayer into the generated Android project.
 *
 * CI regenerates android/ every build, so — like the updater patch — this runs
 * afterwards and does four things:
 *   1. copies NativePlayer.java + TvioPlayerActivity.java into the app package
 *   2. adds the Media3 dependencies to app/build.gradle
 *   3. registers the NativePlayer plugin in MainActivity
 *   4. declares TvioPlayerActivity in the manifest
 *
 * Must run AFTER android-updater-patch.mjs, which writes MainActivity.
 */
import { readFileSync, writeFileSync, existsSync, copyFileSync } from "node:fs";

const PKG = "app.tvio.mobile";
const PKG_DIR = `android/app/src/main/java/${PKG.replace(/\./g, "/")}`;
const GRADLE = "android/app/build.gradle";
const MANIFEST = "android/app/src/main/AndroidManifest.xml";
const MAIN_ACTIVITY = `${PKG_DIR}/MainActivity.java`;

const MEDIA3 = "1.4.1";

if (!existsSync("android/app/src/main")) {
  console.error("No Android project — run 'npx cap add android' first.");
  process.exit(1);
}

// 1) Native sources ----------------------------------------------------------
copyFileSync("android-src/NativePlayer.java", `${PKG_DIR}/NativePlayer.java`);
copyFileSync("android-src/TvioPlayerActivity.java", `${PKG_DIR}/TvioPlayerActivity.java`);
console.log("✓ NativePlayer + TvioPlayerActivity copied");

// 2) Media3 dependencies -----------------------------------------------------
let gradle = readFileSync(GRADLE, "utf8");
if (!gradle.includes("androidx.media3:media3-exoplayer")) {
  const deps = [
    `    implementation "androidx.media3:media3-exoplayer:${MEDIA3}"`,
    `    implementation "androidx.media3:media3-exoplayer-hls:${MEDIA3}"`,
    `    implementation "androidx.media3:media3-exoplayer-dash:${MEDIA3}"`,
    `    implementation "androidx.media3:media3-ui:${MEDIA3}"`,
  ].join("\n");
  // Insert at the top of the (last) dependencies block.
  gradle = gradle.replace(/dependencies\s*\{/, (m) => `${m}\n${deps}`);
  writeFileSync(GRADLE, gradle);
  console.log(`✓ Media3 ${MEDIA3} dependencies added`);
} else {
  console.log("• Media3 dependencies already present");
}

// 3) Register the plugin -----------------------------------------------------
if (existsSync(MAIN_ACTIVITY)) {
  let main = readFileSync(MAIN_ACTIVITY, "utf8");
  if (!main.includes("registerPlugin(NativePlayer.class)")) {
    // Sit alongside the updater registration the previous patch wrote.
    main = main.replace(
      /(registerPlugin\(ApkUpdater\.class\);)/,
      `$1\n        registerPlugin(NativePlayer.class);`
    );
    // Fallback if the updater patch layout ever changes.
    if (!main.includes("registerPlugin(NativePlayer.class)")) {
      main = main.replace(
        /(super\.onCreate\(savedInstanceState\);)/,
        `registerPlugin(NativePlayer.class);\n        $1`
      );
    }
    writeFileSync(MAIN_ACTIVITY, main);
    console.log("✓ NativePlayer registered in MainActivity");
  } else {
    console.log("• NativePlayer already registered");
  }
} else {
  console.error(`No ${MAIN_ACTIVITY} — run android-updater-patch.mjs first.`);
  process.exit(1);
}

// 4) Declare the activity ----------------------------------------------------
let manifest = readFileSync(MANIFEST, "utf8");
if (!manifest.includes("TvioPlayerActivity")) {
  const activity =
    `        <activity\n` +
    `            android:name=".TvioPlayerActivity"\n` +
    `            android:exported="false"\n` +
    `            android:configChanges="orientation|screenSize|screenLayout|keyboardHidden"\n` +
    `            android:theme="@android:style/Theme.Black.NoTitleBar.Fullscreen" />`;
  // Right after the opening <application …> tag.
  manifest = manifest.replace(/(<application\b[^>]*>)/, `$1\n${activity}`);
  writeFileSync(MANIFEST, manifest);
  console.log("✓ TvioPlayerActivity declared in the manifest");
} else {
  console.log("• TvioPlayerActivity already declared");
}

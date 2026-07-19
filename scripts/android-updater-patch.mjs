/**
 * Injects the sideloaded-APK self-updater into the Capacitor Android project
 * (which CI regenerates on every build, so this runs after `npx cap add android`).
 *
 * It does four things:
 *   1. copies android-src/ApkUpdater.java into the app package
 *   2. adds the REQUEST_INSTALL_PACKAGES permission to the manifest
 *   3. makes sure FileProvider exposes the app's external-files dir
 *   4. registers the plugin in MainActivity
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from "node:fs";

const PKG = "app.tvio.mobile"; // must match appId in capacitor.config.ts
const PKG_DIR = `android/app/src/main/java/${PKG.replace(/\./g, "/")}`;
const MANIFEST = "android/app/src/main/AndroidManifest.xml";
const FILE_PATHS = "android/app/src/main/res/xml/file_paths.xml";
const MAIN_ACTIVITY = `${PKG_DIR}/MainActivity.java`;

if (!existsSync(MANIFEST)) {
  console.error(`No Android project found (${MANIFEST}). Run 'npx cap add android' first.`);
  process.exit(1);
}

// 1) Plugin source ------------------------------------------------------------
mkdirSync(PKG_DIR, { recursive: true });
copyFileSync("android-src/ApkUpdater.java", `${PKG_DIR}/ApkUpdater.java`);
console.log("✓ ApkUpdater.java copied into the app package");

// 2) Permissions --------------------------------------------------------------
// CAMERA is for QR sign-in. The barcode plugin merges its own declaration, but
// stating it here removes a variable when the camera fails to open, and lets the
// TV build declare the hardware as optional (Android TVs have no camera, and a
// required camera feature would hide the app from the Play Store on TV).
let manifest = readFileSync(MANIFEST, "utf8");
const PERMISSIONS = [
  `<uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />`,
  `<uses-permission android:name="android.permission.CAMERA" />`,
  `<uses-feature android:name="android.hardware.camera" android:required="false" />`,
];

let added = 0;
for (const line of PERMISSIONS) {
  const marker = line.match(/android:name="([^"]+)"/)[1];
  if (manifest.includes(marker)) continue;
  manifest = manifest.replace(/(<manifest[^>]*>)/, `$1\n    ${line}`);
  added++;
}
if (added) {
  writeFileSync(MANIFEST, manifest);
  console.log(`✓ ${added} permission/feature declaration(s) added`);
} else {
  console.log("• permissions already present");
}

// 3) FileProvider path for the downloaded APK ---------------------------------
// Capacitor ships a FileProvider with authority ${applicationId}.fileprovider;
// it just needs to cover getExternalFilesDir(), where we save the APK.
if (existsSync(FILE_PATHS)) {
  let paths = readFileSync(FILE_PATHS, "utf8");
  if (!paths.includes("external-files-path")) {
    paths = paths.replace(/(<paths[^>]*>)/, `$1\n    <external-files-path name="tvio_updates" path="." />`);
    writeFileSync(FILE_PATHS, paths);
    console.log("✓ external-files-path added to file_paths.xml");
  } else {
    console.log("• external-files-path already present");
  }
} else {
  mkdirSync("android/app/src/main/res/xml", { recursive: true });
  writeFileSync(
    FILE_PATHS,
    `<?xml version="1.0" encoding="utf-8"?>
<paths xmlns:android="http://schemas.android.com/apk/res/android">
    <external-files-path name="tvio_updates" path="." />
</paths>
`
  );
  console.log("✓ file_paths.xml created");
}

// 4) Register the plugin ------------------------------------------------------
writeFileSync(
  MAIN_ACTIVITY,
  `package ${PKG};

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ApkUpdater.class);
        super.onCreate(savedInstanceState);
    }
}
`
);
console.log("✓ ApkUpdater registered in MainActivity");

// 5) Version ------------------------------------------------------------------
// Capacitor hardcodes versionName "1.0" and versionCode 1, so every APK we've
// ever built looks identical — to Android, to the updater's version check, and
// to anyone trying to work out which build is actually installed. Derive both
// from package.json, which sync-version.mjs has already aligned to the tag.
const GRADLE = "android/app/build.gradle";
if (existsSync(GRADLE)) {
  const { version } = JSON.parse(readFileSync("package.json", "utf8"));
  const [maj = 0, min = 0, pat = 0] = version.split(".").map((n) => parseInt(n, 10) || 0);
  const code = maj * 10000 + min * 100 + pat;

  let gradle = readFileSync(GRADLE, "utf8");
  gradle = gradle
    .replace(/versionCode\s+\d+/, `versionCode ${code}`)
    .replace(/versionName\s+"[^"]*"/, `versionName "${version}"`);
  writeFileSync(GRADLE, gradle);
  console.log(`✓ Android versionName ${version} / versionCode ${code}`);
} else {
  console.log("• build.gradle not found — version left unchanged");
}

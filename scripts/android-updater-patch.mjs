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

// 2) Install permission -------------------------------------------------------
let manifest = readFileSync(MANIFEST, "utf8");
if (!manifest.includes("REQUEST_INSTALL_PACKAGES")) {
  manifest = manifest.replace(
    /(<manifest[^>]*>)/,
    `$1\n    <uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />`
  );
  writeFileSync(MANIFEST, manifest);
  console.log("✓ REQUEST_INSTALL_PACKAGES added");
} else {
  console.log("• REQUEST_INSTALL_PACKAGES already present");
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

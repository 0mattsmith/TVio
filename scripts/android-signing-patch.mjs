/**
 * Adds a release signing config to the generated Android project, so every
 * build is signed with the SAME key.
 *
 * Why it matters: CI regenerates the project each run, and a debug build is
 * signed with a throwaway keystore. Android refuses to install an APK over an
 * app signed by a different key, which is exactly why every update so far has
 * needed a full uninstall. A stable release key makes updates install over the
 * top — including via the in-app updater.
 *
 * No-op unless ANDROID_KEYSTORE_PATH points at a real file, so forks and PRs
 * without the secret fall back to a debug build rather than failing.
 *
 * The keystore password / alias are read from the environment by Gradle at
 * build time, so no secret is written into a file in the repo.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const GRADLE = "android/app/build.gradle";
const keystore = process.env.ANDROID_KEYSTORE_PATH;

if (!keystore || !existsSync(keystore)) {
  console.log("No keystore configured — leaving the build unsigned (debug).");
  process.exit(0);
}
if (!existsSync(GRADLE)) {
  console.error(`No ${GRADLE} — run 'npx cap add android' first.`);
  process.exit(1);
}

let gradle = readFileSync(GRADLE, "utf8");

if (gradle.includes("signingConfigs {")) {
  console.log("• signing config already present");
  process.exit(0);
}

// Gradle reads the actual secrets from the environment at build time.
const signingConfigs = `
    signingConfigs {
        release {
            storeFile file(System.getenv("ANDROID_KEYSTORE_PATH"))
            storePassword System.getenv("ANDROID_KEYSTORE_PASSWORD")
            keyAlias System.getenv("ANDROID_KEY_ALIAS")
            keyPassword System.getenv("ANDROID_KEY_PASSWORD")
        }
    }`;

// 1) Insert signingConfigs right after the opening of the android { } block.
gradle = gradle.replace(/android\s*\{/, (m) => `${m}\n${signingConfigs}`);

// 2) Point the release build type at it. Capacitor's template always has a
//    buildTypes { release { … } } block; add the line at the top of it.
gradle = gradle.replace(
  /(buildTypes\s*\{\s*release\s*\{)/,
  `$1\n            signingConfig signingConfigs.release`
);

if (!gradle.includes("signingConfig signingConfigs.release")) {
  console.error("Couldn't find buildTypes.release to attach the signing config.");
  process.exit(1);
}

writeFileSync(GRADLE, gradle);
console.log("✓ release signing config injected");
